# Kotoba Pro — JLPT N5/N4 Learning Web App

Aplikasi web belajar kosakata Jepang berbasis deck Anki kamu. Stack:

- Backend: Python FastAPI + SQLite
- Frontend: HTML/CSS/JS modern tanpa build step
- Reverse proxy: Nginx
- Deployment: Docker Compose atau manual Python

## Fitur

- Dashboard statistik belajar
- Flashcard mode Jepang → Indonesia
- Quiz pilihan ganda
- Review list N5/N4
- Search kotoba
- Progress tersimpan di SQLite
- Endpoint API dokumentasi otomatis di `/docs`

## Cara Jalan Cepat — Docker

```bash
cd kotoba_pro_app
docker compose up --build
```

Buka:

```text
http://localhost:8080
```

## Cara Jalan Manual

```bash
cd kotoba_pro_app
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/seed_db.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Buka:

```text
http://localhost:8000
```

## Struktur Data

Database ada di:

```text
data/kotoba.db
```

Total seeded dari deck:

- N5: 893 kartu
- N4: 838 kartu
- Total: 1731 kartu

## Production dengan Nginx

File contoh Nginx tersedia di:

```text
deploy/nginx/default.conf
```

Docker Compose sudah otomatis menjalankan FastAPI + Nginx.
