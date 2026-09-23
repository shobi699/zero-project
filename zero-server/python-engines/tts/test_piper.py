import io
import wave
import traceback
from piper import PiperVoice

model_path = r"e:\FA\matcha-tts-fa_en-khadijah\model.onnx"
try:
    print("Loading model...")
    voice = PiperVoice.load(model_path)
    print("Model loaded successfully.")
    
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        voice.synthesize_wav("سلام من شبیر هستم", wav_file)
    print("Synthesis successful!")
except Exception as e:
    print("Error occurred:")
    traceback.print_exc()
