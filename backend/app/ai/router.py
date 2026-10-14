import os
import json
import logging
import asyncio
import urllib.request
import urllib.error
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.auth.deps import get_current_user
from app.database.models import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])

GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or ""
)


def _call_gemini_sync(prompt: str, system_instruction: Optional[str] = None) -> str:
    models = ["gemini-2.5-flash", "gemini-1.5-flash"]
    last_err = None

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
        }
        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.warning("Gemini model %s returned HTTP %d: %s", model, e.code, err_body)
            last_err = err_body
        except Exception as e:
            logger.warning("Gemini model %s call failed: %s", model, e)
            last_err = str(e)

    raise HTTPException(status_code=502, detail=f"AI service error: {last_err or 'No response from model'}")


async def call_gemini(prompt: str, system_instruction: Optional[str] = None) -> str:
    return await asyncio.to_thread(_call_gemini_sync, prompt, system_instruction)


class AnalyzeDocumentRequest(BaseModel):
    document_id: Optional[int] = None
    file_name: str
    file_size: Optional[int] = 0
    file_ext: Optional[str] = ""
    chat_name: Optional[str] = ""
    prompt: Optional[str] = None


class ChatInsightsRequest(BaseModel):
    chat_id: int
    chat_name: str
    sample_files: List[str] = []


class SmartSearchRequest(BaseModel):
    query: str
    chat_id: Optional[int] = None


@router.get("/status")
async def ai_status(user=Depends(get_current_user)):
    return {
        "status": "ready",
        "provider": "Google Gemini",
        "models": ["gemini-2.5-flash", "gemini-1.5-flash"],
        "has_key": bool(GEMINI_API_KEY),
    }


@router.post("/analyze")
async def analyze_document(req: AnalyzeDocumentRequest, user=Depends(get_current_user)):
    size_mb = f"{round(req.file_size / (1024 * 1024), 2)} MB" if req.file_size else "Unknown size"
    sys_prompt = (
        "You are an AI document analysis engine for a Telegram document and file library. "
        "Analyze the document title, extension, size, and source channel to deduce the content, "
        "utility, topic, and category. Respond in pure JSON without markdown backticks."
    )
    user_prompt = f"""Analyze this document:
File Name: {req.file_name}
Extension: {req.file_ext}
Size: {size_mb}
Source Channel: {req.chat_name or 'General Library'}
User Query / Context: {req.prompt or 'General overview'}

Return JSON strictly matching this schema:
{{
  "summary": "1-2 sentence crisp overview of what this file represents",
  "category": "One of: Study Notes / Books, Engineering & Tech, Software / APK, Exam Prep, Media & Audio, Financial & Legal, Document / Spreadsheet, Other",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "use_case": "Primary recommended use for the user"
}}"""

    raw_response = await call_gemini(user_prompt, sys_prompt)
    clean = raw_response.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    if clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    try:
        parsed = json.loads(clean)
        return {"status": "ok", "document": req.file_name, **parsed}
    except Exception:
        return {
            "status": "ok",
            "document": req.file_name,
            "summary": raw_response,
            "category": "Document",
            "key_points": ["Detailed document content available upon download."],
            "tags": [req.file_ext or "file"],
            "use_case": "Direct viewing / reference",
        }


@router.post("/chat-insights")
async def chat_insights(req: ChatInsightsRequest, user=Depends(get_current_user)):
    files_str = "\n".join(f"- {f}" for f in req.sample_files[:30])
    sys_prompt = "You are an AI channel curator and content intelligence system."
    user_prompt = f"""Channel Name: {req.chat_name}
Sample Documents in Channel:
{files_str}

Provide an executive intelligence breakdown in JSON format:
{{
  "channel_theme": "High-level domain/theme of this channel's shared files",
  "primary_topics": ["Topic 1", "Topic 2", "Topic 3"],
  "content_quality_score": "High / Medium / Diverse",
  "recommendation": "Who benefits most from these files and recommended next action"
}}"""

    raw_response = await call_gemini(user_prompt, sys_prompt)
    clean = raw_response.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    if clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    try:
        parsed = json.loads(clean)
        return {"status": "ok", "chat_name": req.chat_name, **parsed}
    except Exception:
        return {"status": "ok", "chat_name": req.chat_name, "raw_insight": raw_response}


@router.post("/search")
async def ai_search(req: SmartSearchRequest, user=Depends(get_current_user)):
    db = await get_db()
    try:
        if req.chat_id:
            rows = await db.fetchall(
                "SELECT id, chat_id, file_name, file_ext, file_size FROM documents WHERE chat_id=? ORDER BY id DESC LIMIT 50",
                req.chat_id,
            )
        else:
            rows = await db.fetchall(
                "SELECT id, chat_id, file_name, file_ext, file_size FROM documents ORDER BY id DESC LIMIT 50"
            )

        if not rows:
            return {"status": "ok", "query": req.query, "matches": [], "explanation": "No documents found to search."}

        doc_list = [f"ID {r['id']}: {r['file_name']} ({r['file_ext']}, {round((r['file_size'] or 0)/1024, 1)} KB)" for r in rows]
        docs_text = "\n".join(doc_list[:35])

        prompt = f"""User search query: "{req.query}"

Available documents:
{docs_text}

Identify the best matching document IDs for the user's intent. Return pure JSON:
{{
  "matched_ids": [integer IDs in order of relevance],
  "reasoning": "Brief 1-sentence reason why these files match the user's need"
}}"""

        raw_response = await call_gemini(prompt)
        clean = raw_response.strip()
        if clean.startswith("```json"):
            clean = clean[7:]
        if clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        parsed = json.loads(clean.strip())

        matched_ids = set(parsed.get("matched_ids", []))
        results = [dict(r) for r in rows if r["id"] in matched_ids]

        return {
            "status": "ok",
            "query": req.query,
            "results": results,
            "reasoning": parsed.get("reasoning", ""),
        }
    except Exception as e:
        logger.error("AI search failed: %s", e)
        return {"status": "error", "message": str(e)}
    finally:
        await db.close()
