import onnx

model = onnx.load(r"e:\FA\matcha-tts-fa_en-khadijah\model.onnx", load_external_data=False)
print("Metadata props:")
for prop in model.metadata_props:
    print(f"  {prop.key}: {prop.value}")

print("\nInputs:")
for input in model.graph.input:
    print(f"  {input.name}")
