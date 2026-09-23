import sherpa_onnx
import traceback

try:
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
                acoustic_model=r"e:\FA\matcha-tts-fa_en-khadijah\model.onnx",
                vocoder="",
                tokens=r"e:\FA\matcha-tts-fa_en-khadijah\tokens.txt",
                data_dir=r"e:\FA\matcha-tts-fa_en-khadijah\espeak-ng-data",
            ),
        ),
    )
    tts = sherpa_onnx.OfflineTts(config)
    print("Matcha model loaded successfully!")
    
    audio = tts.generate("سلام من خدیجه هستم")
    print("Synthesis successful!")
    print(f"Sample rate: {audio.sample_rate}, Samples length: {len(audio.samples)}")
except Exception as e:
    print("Error occurred:")
    traceback.print_exc()
