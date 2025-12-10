import asyncio
import os
import tempfile
import uuid
from datetime import datetime
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import openai

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable is required.")

openai.api_key = OPENAI_API_KEY

app = FastAPI(title="Whisper Transcriber")

# Allow all origins for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/ping")
async def ping():
    return {"status": "ok"}


async def transcribe_file(path: str) -> str:
    def _run():
        with open(path, "rb") as audio_file:
            resp = openai.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )
            return resp.text

    try:
        # offload to thread so FastAPI event loop is not blocked
        return await asyncio.to_thread(_run)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}") from exc


def bullet_count_for_text(text: str) -> int:
    # Roughly scale bullets with transcript length; clamp to a reasonable range
    words = max(1, len(text.split()))
    estimated = max(5, min(18, words // 120 + 5))
    return estimated


async def summarize_text(text: str, bullet_count: int) -> str:
    prompt = (
        "You are an assistant that writes concise bullet summaries.\n"
        f"Summarize the following transcript in {bullet_count} bullet points.\n"
        "Keep bullets brief and focused on key points.\n\n"
        f"Transcript:\n{text}"
    )

    def _run():
        resp = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return resp.choices[0].message.content

    try:
        return await asyncio.to_thread(_run)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Summary failed: {exc}") from exc


def categorize(filename: str, summary: str) -> str:
    name_lower = filename.lower()
    if "interview" in name_lower:
        return "Interviews"
    if "meeting" in name_lower:
        return "Meetings"
    if "call" in name_lower:
        return "Calls"
    if "podcast" in name_lower:
        return "Podcasts"
    # fallback based on length
    return "General"


stored_items: Dict[str, Dict] = {}


@app.get("/files")
async def list_files():
    # Return newest first
    return {"items": sorted(stored_items.values(), key=lambda x: x["uploaded_at"], reverse=True)}


@app.get("/files/{item_id}")
async def get_file(item_id: str):
    item = stored_items.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    results = []

    for file in files:
        if not file.filename:
            continue

        # Save to a temporary file so OpenAI can read it
        suffix = os.path.splitext(file.filename)[-1] or ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            try:
                content = await file.read()
                tmp.write(content)
            except Exception as exc:
                raise HTTPException(status_code=500, detail="Failed to save upload.") from exc

        try:
            transcription = await transcribe_file(temp_path)
            bullets = bullet_count_for_text(transcription)
            summary = await summarize_text(transcription, bullets)
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

        item_id = str(uuid.uuid4())
        category = categorize(file.filename, summary)
        record = {
            "id": item_id,
            "filename": file.filename,
            "message": "Transcribed successfully.",
            "transcription": transcription,
            "summary": summary,
            "category": category,
            "uploaded_at": datetime.utcnow().isoformat(),
        }
        stored_items[item_id] = record
        results.append(record)

    if not results:
        raise HTTPException(status_code=400, detail="No valid files uploaded.")

    return {"items": results}
