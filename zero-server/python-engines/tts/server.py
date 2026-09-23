import os
import io
import wave
import traceback
import numpy as np
from fastapi import FastAPI, Response, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Optional
import tempfile
import threading
import requests
import tarfile
import uvicorn

# TTS Engines
from piper import PiperVoice, SynthesisConfig
import sherpa_onnx

# Hezar AI
try:
    from hezar.models import Model
    from hezar.preprocessors import Preprocessor
    HEZAR_AVAILABLE = True
except ImportError:
    HEZAR_AVAILABLE = False

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = r"e:\FA"
VOCODER_PATH = os.path.join(MODELS_DIR, "hifigan_v2.onnx")

AVAILABLE_MODELS = {
    "vits-piper-fa_IR-amir-medium": {
        "engine": "piper",
        "name": "Amir (Piper VITS)",
        "files": {
            "fa_IR-amir-medium.onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx",
            "fa_IR-amir-medium.onnx.json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx.json"
        }
    },
    "vits-piper-fa_IR-gyro-medium": {
        "engine": "piper",
        "name": "Gyro (Piper VITS)",
        "files": {
            "fa_IR-gyro-medium.onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx",
            "fa_IR-gyro-medium.onnx.json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx.json"
        }
    },
    "vits-piper-fa_IR-farid-medium": {
        "engine": "piper",
        "name": "Farid (Piper VITS)",
        "files": {
            "fa_IR-farid-medium.onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/farid/medium/fa_IR-farid-medium.onnx",
            "fa_IR-farid-medium.onnx.json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/farid/medium/fa_IR-farid-medium.onnx.json"
        }
    },
    "matcha-tts-fa_en-khadijah": {
        "engine": "sherpa",
        "name": "Khadijah (Matcha TTS)",
        "archive": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/matcha-tts-fa_en-khadijah.tar.bz2"
    },
    "matcha-tts-fa_en-musa": {
        "engine": "sherpa",
        "name": "Musa (Matcha TTS)",
        "archive": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/matcha-tts-fa_en-musa.tar.bz2"
    }
}

# Global dict to hold loaded models
loaded_models = {}
download_progress = {}


def init_models():
    if not os.path.exists(MODELS_DIR):
        print(f"Directory {MODELS_DIR} not found.")
        return

    for item in os.listdir(MODELS_DIR):
        item_path = os.path.join(MODELS_DIR, item)
        if not os.path.isdir(item_path):
            continue
            
        try:
            if item.startswith("vits-piper-"):
                model_file = None
                for f in os.listdir(item_path):
                    if f.endswith(".onnx"):
                        model_file = os.path.join(item_path, f)
                        break
                if model_file:
                    print(f"Loading Piper model: {item}")
                    voice = PiperVoice.load(model_file)
                    loaded_models[item] = {"engine": "piper", "voice": voice}
                    
            elif item.startswith("matcha-tts-"):
                model_file = os.path.join(item_path, "model.onnx")
                tokens_file = os.path.join(item_path, "tokens.txt")
                data_dir = os.path.join(item_path, "espeak-ng-data")
                
                if os.path.exists(model_file) and os.path.exists(tokens_file) and os.path.exists(VOCODER_PATH):
                    print(f"Loading Sherpa Matcha model: {item}")
                    config = sherpa_onnx.OfflineTtsConfig(
                        model=sherpa_onnx.OfflineTtsModelConfig(
                            matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
                                acoustic_model=model_file,
                                vocoder=VOCODER_PATH,
                                tokens=tokens_file,
                                data_dir=data_dir,
                            ),
                        ),
                    )
                    tts = sherpa_onnx.OfflineTts(config)
                    loaded_models[item] = {"engine": "sherpa", "voice": tts}
                else:
                    print(f"Skipping {item}: Missing required files or vocoder.")
        except Exception as e:
            print(f"Error loading {item}: {e}")
            traceback.print_exc()

@app.on_event("startup")
async def startup_event():
    print("Initializing models...")
    init_models()
    print(f"Loaded {len(loaded_models)} models: {list(loaded_models.keys())}")

@app.get("/api/models")
async def get_models():
    return {"models": list(loaded_models.keys())}

@app.get("/api/tts")
async def synthesize(text: str, model: str, speed: float = 1.0, volume: float = 1.0, tone: Optional[str] = "normal"):
    if model not in loaded_models:
        raise HTTPException(status_code=404, detail="Model not found")
        
    model_info = loaded_models[model]
    engine = model_info["engine"]
    voice = model_info["voice"]
    
    wav_buffer = io.BytesIO()
    
    try:
        if engine == "piper":
            # length_scale controls speed (lower = faster)
            # We map UI speed (e.g. 1.5 is faster) to length_scale (1/speed)
            length_scale = 1.0 / speed if speed > 0 else 1.0
            
            # Apply tone overrides if used
            if tone == "angry":
                length_scale = 0.8
                volume = 1.3
            elif tone == "sad":
                length_scale = 1.2
                volume = 0.9

            config = SynthesisConfig(length_scale=length_scale, volume=volume)
                
            with wave.open(wav_buffer, "wb") as wav_file:
                voice.synthesize_wav(text, wav_file, syn_config=config)
                
        elif engine == "sherpa":
            # Apply tone overrides
            actual_speed = speed
            actual_volume = volume
            
            if tone == "angry":
                actual_speed = 1.25
                actual_volume = 1.3
            elif tone == "sad":
                actual_speed = 0.85
                actual_volume = 0.9
                
            audio = voice.generate(text, speed=actual_speed)
            
            with wave.open(wav_buffer, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2) # 16-bit
                wav_file.setframerate(audio.sample_rate)
                
                samples_int16 = (np.array(audio.samples) * 32767).astype(np.int16)
                
                # Apply volume scaling
                if actual_volume != 1.0:
                    samples_int16 = np.clip(samples_int16 * actual_volume, -32768, 32767).astype(np.int16)
                    
                wav_file.writeframes(samples_int16.tobytes())
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
                
    return Response(
        content=wav_buffer.getvalue(), 
        media_type="audio/wav"
    )

# Lazy-loaded XTTS model
xtts_model = None

@app.post("/api/clone")
async def clone_voice(
    text: str = Form(...),
    ref_audio: UploadFile = File(...)
):
    global xtts_model
    try:
        from TTS.api import TTS
        import torch
    except ImportError:
        raise HTTPException(status_code=500, detail="کتابخانه TTS یا PyTorch نصب نشده است. لطفاً منتظر بمانید تا نصب تمام شود.")

    if xtts_model is None:
        print("Loading XTTS-v2 model (This may take a while and download weights...)")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        # Using multi-lingual XTTS-v2 which supports Arabic/Persian/etc
        xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        print("XTTS-v2 model loaded successfully!")

    # Save the uploaded reference audio to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await ref_audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    wav_buffer = io.BytesIO()
    try:
        # Generate speech using voice cloning
        # XTTS-v2 requires language code. Farsi is 'ar' (Arabic) or sometimes supported as 'fa' if finetuned.
        # Actually XTTS-v2 supports Arabic 'ar' which is close, let's use 'ar' if 'fa' fails, but standard XTTS supports 'ar' for Persian script.
        # Wait, XTTS-v2 doesn't officially list 'fa' (Farsi). It lists 'ar' (Arabic). Persian text might need to be processed or just passed as 'ar'.
        # We will use language="ar" as it handles Persian letters reasonably well, or try "fa" if supported.
        xtts_model.tts_to_file(
            text=text,
            speaker_wav=tmp_path,
            language="ar",
            file_path=tmp_path + "_out.wav"
        )
        
        with open(tmp_path + "_out.wav", "rb") as f:
            wav_buffer.write(f.read())
            
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"خطا در شبیه‌سازی: {str(e)}")
    finally:
        # Cleanup
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if os.path.exists(tmp_path + "_out.wav"):
            os.remove(tmp_path + "_out.wav")

    return Response(
        content=wav_buffer.getvalue(), 
        media_type="audio/wav"
    )

# --- HEZAR ENDPOINTS ---
hezar_models_cache = {}

def get_hezar_model(model_name: str):
    if not HEZAR_AVAILABLE:
        raise HTTPException(status_code=500, detail="Hezar library is not installed.")
    
    if model_name not in hezar_models_cache:
        print(f"Loading Hezar model {model_name}...")
        try:
            model = Model.load(model_name)
            hezar_models_cache[model_name] = model
            print(f"Hezar model {model_name} loaded.")
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to load Hezar model {model_name}: {e}")
            
    return hezar_models_cache[model_name]

@app.post("/api/stt")
async def stt_hezar(
    audio: UploadFile = File(...)
):
    """ Speech to text using Hezar Whisper """
    # Save the audio file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        model = get_hezar_model("hezarai/whisper-small-fa")
        # Hezar predict takes file path or list of paths
        result = model.predict(tmp_path)
        # Result is typically a list of dicts, e.g. [{'text': '...'}]
        if isinstance(result, list) and len(result) > 0:
            text = result[0].get("text", str(result[0])) if isinstance(result[0], dict) else str(result[0])
        else:
            text = str(result)
            
        return {"text": text}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.get("/api/translate")
async def translate_hezar(
    text: str,
    direction: str = "fa2en"
):
    """ Translation using Hezar """
    model_name = "hezarai/t5-base-fa2en" if direction == "fa2en" else "hezarai/t5-base-en2fa"
    try:
        model = get_hezar_model(model_name)
        result = model.predict([text])
        if isinstance(result, list) and len(result) > 0:
            translated = result[0].get("text", str(result[0])) if isinstance(result[0], dict) else str(result[0])
        else:
            translated = str(result)
        return {"translation": translated}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
# -----------------------

def download_model_task(model_id):
    info = AVAILABLE_MODELS.get(model_id)
    if not info:
        return
        
    download_progress[model_id] = {"status": "downloading", "progress": 0, "error": None}
    
    try:
        os.makedirs(MODELS_DIR, exist_ok=True)
        if info["engine"] == "piper":
            model_dir = os.path.join(MODELS_DIR, model_id)
            os.makedirs(model_dir, exist_ok=True)
            files = info["files"]
            total_files = len(files)
            for i, (filename, url) in enumerate(files.items()):
                filepath = os.path.join(model_dir, filename)
                resp = requests.get(url, stream=True, timeout=30)
                resp.raise_for_status()
                total_size = int(resp.headers.get('content-length', 0))
                downloaded = 0
                with open(filepath, 'wb') as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                overall_percent = (i * 100 + percent) / total_files
                                download_progress[model_id]["progress"] = round(overall_percent)
                                
        elif info["engine"] == "sherpa":
            url = info["archive"]
            archive_path = os.path.join(MODELS_DIR, f"{model_id}.tar.bz2")
            resp = requests.get(url, stream=True, timeout=30)
            resp.raise_for_status()
            total_size = int(resp.headers.get('content-length', 0))
            downloaded = 0
            with open(archive_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = (downloaded / total_size) * 100
                            download_progress[model_id]["progress"] = round(percent * 0.9)
                            
            download_progress[model_id]["progress"] = 90
            download_progress[model_id]["status"] = "extracting"
            
            with tarfile.open(archive_path, "r:bz2") as tar:
                tar.extractall(path=MODELS_DIR)
                
            if os.path.exists(archive_path):
                os.remove(archive_path)
            
        download_progress[model_id]["progress"] = 100
        download_progress[model_id]["status"] = "done"
        
        # Load the new model dynamically
        init_models()
        
    except Exception as e:
        download_progress[model_id]["status"] = "error"
        download_progress[model_id]["error"] = str(e)


@app.get("/api/settings/models")
async def get_settings_models():
    res = []
    for m_id, m_info in AVAILABLE_MODELS.items():
        is_downloaded = m_id in loaded_models
        status = "downloaded" if is_downloaded else "missing"
        progress_info = download_progress.get(m_id, None)
        
        if progress_info and progress_info["status"] in ["downloading", "extracting"]:
            status = progress_info["status"]
            
        res.append({
            "id": m_id,
            "name": m_info["name"],
            "engine": m_info["engine"],
            "status": status,
            "progress": progress_info["progress"] if progress_info else 0,
            "error": progress_info["error"] if progress_info else None
        })
    return {"models": res}


@app.post("/api/settings/download")
async def download_model(model_id: str = Form(...)):
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=404, detail="Model not found in predefined list.")
        
    if model_id in loaded_models:
        return {"message": "Model already downloaded."}
        
    status = download_progress.get(model_id, {}).get("status")
    if status in ["downloading", "extracting"]:
        return {"message": "Download already in progress."}
        
    thread = threading.Thread(target=download_model_task, args=(model_id,))
    thread.start()
    return {"message": "Download started."}


app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("Starting Server...")
    print("Open this link in your browser: http://localhost:8000")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
