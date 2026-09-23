"""
Faster-Whisper STT Server for Zero
Provides high-quality offline speech-to-text via HTTP API.

Usage:
    pip install faster-whisper fastapi uvicorn
    python server.py

API:
    POST /transcribe — accepts WAV audio, returns { "text": "..." }
    GET  /health     — returns { "status": "ok", "model": "...", "device": "..." }
    GET  /models     — returns list of available models
"""

import io
import os
import sys
import json
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Zero Faster-Whisper Server", version="1.0.0")

# Global state
model = None
model_name = None
device = "cpu"
compute_type = "int8"

AVAILABLE_MODELS = [
    {"id": "tiny", "name": "Whisper Tiny", "size_mb": 75, "description": "سریع‌ترین — کیفیت پایه"},
    {"id": "base", "name": "Whisper Base", "size_mb": 142, "description": "تعادل سرعت و دقت"},
    {"id": "small", "name": "Whisper Small", "size_mb": 466, "description": "دقت بالاتر — عالی برای فارسی"},
    {"id": "medium", "name": "Whisper Medium", "size_mb": 1500, "description": "دقت عالی — نیاز به رم 4GB+"},
    {"id": "large-v3", "name": "Whisper Large V3", "size_mb": 3100, "description": "بهترین دقت — نیاز به GPU"},
    {"id": "large-v3-turbo", "name": "Whisper Large V3 Turbo", "size_mb": 1500, "description": "سریع + دقت عالی"},
]


def load_model(model_id: str = "base"):
    global model, model_name, device, compute_type
    
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper not installed. Run: pip install faster-whisper")
    
    # Detect GPU
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
    except ImportError:
        pass
    
    print(f"Loading model {model_id} on {device} ({compute_type})...")
    model = WhisperModel(model_id, device=device, compute_type=compute_type)
    model_name = model_id
    print(f"Model {model_id} loaded successfully on {device}")


import threading

is_loading = False

def background_load_model(model_id: str = "base"):
    global is_loading
    if is_loading:
        return
    is_loading = True
    try:
        load_model(model_id)
    except Exception as e:
        print(f"Warning: Could not load default model: {e}")
    finally:
        is_loading = False


@app.on_event("startup")
async def startup():
    # Load default model in background thread so HTTP server starts instantly
    threading.Thread(target=background_load_model, args=("base",), daemon=True).start()


@app.get("/health")
async def health():
    return {
        "status": "ok" if model else ("loading" if is_loading else "ready"),
        "model": model_name,
        "device": device,
        "compute_type": compute_type,
    }


@app.get("/models")
async def list_models():
    return {"models": AVAILABLE_MODELS, "current": model_name}


@app.post("/load_model")
async def load_model_endpoint(model_id: str):
    try:
        load_model(model_id)
        return {"status": "ok", "model": model_id, "device": device}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = "fa",
):
    if not model:
        raise HTTPException(status_code=503, detail="No model loaded")
    
    # Read uploaded audio
    audio_bytes = await file.read()
    
    # Write to temp WAV file (faster-whisper needs a file path)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    
    try:
        # Transcribe
        segments, info = model.transcribe(
            tmp_path,
            language=language if language != "auto" else None,
            beam_size=5,
            vad_filter=True,
        )
        
        # Collect text
        text = " ".join([segment.text for segment in segments])
        
        return {
            "text": text.strip(),
            "language": info.language,
            "duration": info.duration,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"Starting Faster-Whisper server on port {port}...")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
