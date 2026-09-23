import sherpa_onnx
import wave
import io
import traceback

try:
    print("Initializing Sherpa-ONNX model...")
    # Test Khadijah matcha model
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=r"e:\FA\matcha-tts-fa_en-khadijah\model.onnx",
                tokens=r"e:\FA\matcha-tts-fa_en-khadijah\tokens.txt",
                data_dir=r"e:\FA\matcha-tts-fa_en-khadijah\espeak-ng-data",
            ),
        ),
    )
    
    tts = sherpa_onnx.OfflineTts(config)
    print("Model loaded successfully.")
    
    audio = tts.generate("سلام من خدیجه هستم")
    print("Synthesis successful!")
    print(f"Sample rate: {audio.sample_rate}, Samples length: {len(audio.samples)}")
except Exception as e:
    print("Error occurred:")
    traceback.print_exc()
