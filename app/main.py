from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import random
import re
from typing import Literal

import edge_tts

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .db import get_conn, rows_to_dicts

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DATA_DIR = ROOT / "data"
AUDIO_DIR = DATA_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Kotoba Pro API", version="1.0.0")
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")


def has_kana(text: str | None) -> bool:
    return bool(re.search(r"[ぁ-んァ-ンー]", str(text or "")))

def is_kana_only(text: str | None) -> bool:
    s = str(text or "").strip()
    return bool(s and re.fullmatch(r"[ぁ-んァ-ンー\s・]+", s))

def kana_only(text: str | None) -> str:
    return "".join(re.findall(r"[ぁ-んァ-ンー]+", str(text or "")))

def audio_text_for_word(word: dict) -> str:
    reading = str(word.get("reading") or "").strip()
    term = str(word.get("term") or "").strip()

    if has_kana(reading):
        return reading
    if is_kana_only(term):
        return term
    kana = kana_only(term)
    if kana:
        return kana
    return term or reading

class ReviewPayload(BaseModel):
    word_id: int
    result: Literal["correct", "wrong", "seen"]

@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")

@app.get("/api/stats")
def stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        by_level = rows_to_dicts(conn.execute("SELECT level, COUNT(*) count FROM words GROUP BY level ORDER BY level").fetchall())
        studied = conn.execute("SELECT COUNT(*) FROM progress WHERE seen_count > 0").fetchone()[0]
        mastered = conn.execute("SELECT COUNT(*) FROM progress WHERE mastery >= 5").fetchone()[0]
        correct = conn.execute("SELECT COALESCE(SUM(correct_count), 0) FROM progress").fetchone()[0]
        wrong = conn.execute("SELECT COALESCE(SUM(wrong_count), 0) FROM progress").fetchone()[0]
    accuracy = round((correct / (correct + wrong) * 100), 1) if correct + wrong else 0
    return {"total": total, "by_level": by_level, "studied": studied, "mastered": mastered, "accuracy": accuracy}

@app.get("/api/words")
def words(level: str | None = None, q: str = "", limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    where, params = [], []
    if level and level != "ALL":
        where.append("level = ?")
        params.append(level)
    if q.strip():
        where.append("(term LIKE ? OR reading LIKE ? OR meaning LIKE ?)")
        needle = f"%{q.strip()}%"
        params.extend([needle, needle, needle])
    clause = "WHERE " + " AND ".join(where) if where else ""
    sql = f"""
        SELECT w.*, COALESCE(p.mastery,0) mastery, COALESCE(p.seen_count,0) seen_count
        FROM words w
        LEFT JOIN progress p ON p.word_id = w.id
        {clause}
        ORDER BY w.level, w.id
        LIMIT ? OFFSET ?
    """
    with get_conn() as conn:
        data = rows_to_dicts(conn.execute(sql, [*params, limit, offset]).fetchall())
    return {"items": data, "limit": limit, "offset": offset}

@app.get("/api/study")
def study(level: str = "ALL", limit: int = Query(20, ge=1, le=100)):
    params = []
    clause = ""
    if level != "ALL":
        clause = "WHERE w.level = ?"
        params.append(level)
    sql = f"""
        SELECT w.*, COALESCE(p.mastery,0) mastery, COALESCE(p.seen_count,0) seen_count
        FROM words w
        LEFT JOIN progress p ON p.word_id = w.id
        {clause}
        ORDER BY COALESCE(p.mastery,0) ASC, COALESCE(p.last_seen_at,'') ASC, RANDOM()
        LIMIT ?
    """
    with get_conn() as conn:
        data = rows_to_dicts(conn.execute(sql, [*params, limit]).fetchall())
    return {"items": data}

@app.get("/api/quiz")
def quiz(level: str = "ALL", count: int = Query(10, ge=1, le=50)):
    clause, params = "", []
    if level != "ALL":
        clause = "WHERE level = ?"
        params.append(level)
    with get_conn() as conn:
        pool = rows_to_dicts(conn.execute(f"SELECT * FROM words {clause} ORDER BY RANDOM() LIMIT ?", [*params, count]).fetchall())
        all_meanings = [r["meaning"] for r in conn.execute("SELECT meaning FROM words ORDER BY RANDOM() LIMIT 300").fetchall()]
    questions = []
    for item in pool:
        distractors = [m for m in all_meanings if m != item["meaning"]]
        choices = random.sample(distractors, min(3, len(distractors))) + [item["meaning"]]
        random.shuffle(choices)
        questions.append({"id": item["id"], "level": item["level"], "term": item["term"], "reading": item["reading"], "answer": item["meaning"], "choices": choices})
    return {"items": questions}

@app.post("/api/review")
def review(payload: ReviewPayload):
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO progress(word_id) VALUES(?)", (payload.word_id,))
        if payload.result == "correct":
            conn.execute("""
                UPDATE progress
                SET seen_count = seen_count + 1,
                    correct_count = correct_count + 1,
                    mastery = MIN(mastery + 1, 10),
                    last_seen_at = ?
                WHERE word_id = ?
            """, (now, payload.word_id))
        elif payload.result == "wrong":
            conn.execute("""
                UPDATE progress
                SET seen_count = seen_count + 1,
                    wrong_count = wrong_count + 1,
                    mastery = MAX(mastery - 1, 0),
                    last_seen_at = ?
                WHERE word_id = ?
            """, (now, payload.word_id))
        else:
            conn.execute("UPDATE progress SET seen_count = seen_count + 1, last_seen_at = ? WHERE word_id = ?", (now, payload.word_id))
        conn.commit()
    return {"ok": True}


@app.get("/api/audio/{word_id}")
async def word_audio(word_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()

    if not row:
        return {"ok": False, "error": "Word not found"}

    word = dict(row)
    text = audio_text_for_word(word)
    if not text:
        return {"ok": False, "error": "No text available for audio"}

    audio_path = AUDIO_DIR / f"word_{word_id}.mp3"

    if not audio_path.exists():
        communicate = edge_tts.Communicate(text=text, voice="ja-JP-NanamiNeural", rate="-5%")
        await communicate.save(str(audio_path))

    return {"ok": True, "url": f"/audio/word_{word_id}.mp3", "text": text}

@app.post("/api/reset-progress")
def reset_progress():
    with get_conn() as conn:
        conn.execute("DELETE FROM progress")
        conn.commit()
    return {"ok": True}
