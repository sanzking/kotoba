import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "kotoba.db"
SEED_PATH = ROOT / "data" / "kotoba_seed.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    term TEXT NOT NULL,
    reading TEXT DEFAULT '',
    meaning TEXT NOT NULL,
    example_jp TEXT DEFAULT '',
    example_id TEXT DEFAULT '',
    tags TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS progress (
    word_id INTEGER PRIMARY KEY,
    seen_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    mastery INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT,
    FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_words_level ON words(level);
CREATE INDEX IF NOT EXISTS idx_words_term ON words(term);
CREATE INDEX IF NOT EXISTS idx_words_meaning ON words(meaning);
"""

def seed() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        count = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        if count:
            return
        data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        conn.executemany(
            "INSERT INTO words(level, term, reading, meaning) VALUES(?, ?, ?, ?)",
            [(x["level"], x["term"], x.get("reading", ""), x["meaning"]) for x in data],
        )
        conn.commit()

if __name__ == "__main__":
    seed()
    print(f"Seeded database: {DB_PATH}")
