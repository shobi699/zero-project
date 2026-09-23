import sys
import os
import urllib.request
import subprocess
import shutil

def print_progress(msg):
    print(f"PROGRESS:{msg}", flush=True)

if len(sys.argv) < 4:
    print("Usage: python auto_convert.py <repo_id> <output_file> <cache_dir>")
    sys.exit(1)

repo_id = sys.argv[1]
output_file = sys.argv[2]
cache_dir = sys.argv[3]

os.makedirs(cache_dir, exist_ok=True)

if os.path.isdir(repo_id):
    print_progress("Using local directory for model files...")
    model_path = repo_id
else:
    print_progress(f"Installing huggingface_hub if missing...")
    subprocess.run([sys.executable, "-m", "pip", "install", "huggingface_hub"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from huggingface_hub import snapshot_download
    print_progress("Downloading model files from HuggingFace (this may take a while)...")
    model_path = snapshot_download(repo_id=repo_id, cache_dir=cache_dir)
    
print_progress(f"Model files located at {model_path}")

convert_script = os.path.join(cache_dir, "convert-pt-to-ggml.py")
if not os.path.exists(convert_script):
    print_progress("Downloading whisper.cpp conversion script...")
    urllib.request.urlretrieve("https://raw.githubusercontent.com/ggerganov/whisper.cpp/master/models/convert-pt-to-ggml.py", convert_script)

print_progress("Running conversion script...")
# convert-pt-to-ggml.py dir_model --out-dir dir_out
cmd = [sys.executable, convert_script, model_path, "--out-dir", cache_dir]
process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)

for line in process.stdout:
    print_progress(line.strip())

process.wait()
if process.returncode != 0:
    print("ERROR: Conversion failed.")
    sys.exit(1)

# Find the generated ggml file. It's usually named ggml-model.bin or similar.
ggml_file = None
for f in os.listdir(cache_dir):
    if f.startswith("ggml-") and f.endswith(".bin"):
        ggml_file = os.path.join(cache_dir, f)
        break

if ggml_file and os.path.exists(ggml_file):
    print_progress(f"Moving {ggml_file} to {output_file}")
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    shutil.move(ggml_file, output_file)
    print_progress("Conversion complete.")
else:
    print("ERROR: Could not find generated ggml file.")
    sys.exit(1)
