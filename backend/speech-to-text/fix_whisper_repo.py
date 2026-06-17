"""
fix_whisper_repo.py
────────────────────────────────────────────────────────────────────
Copies the missing preprocessor / tokenizer config files from the
base model (openai/whisper-large-v3) into your fine-tuned repo
(Cherryland120/whisper-large-v3-igbo-v2) so the HF Inference
Endpoint can start successfully.

Files copied:
  - preprocessor_config.json   ← required by AutoFeatureExtractor
  - tokenizer_config.json      ← required by AutoTokenizer
  - vocab.json                 ← Whisper vocabulary
  - special_tokens_map.json    ← <pad>, <eos>, etc.
  - merges.txt                 ← BPE merge rules (if present)
  - added_tokens.json          ← extra tokens (if present)

Usage:
    python fix_whisper_repo.py

Requires:
    pip install huggingface_hub
    HF_TOKEN env var set (or edit the TOKEN line below)
"""

import os
from huggingface_hub import HfApi, hf_hub_download

# ── Config ────────────────────────────────────────────────────────────────────
BASE_MODEL   = "openai/whisper-large-v3"
TARGET_REPO  = "Cherryland120/whisper-large-v3-igbo-v2"
TOKEN        = os.getenv("HF_TOKEN", "")

FILES_TO_COPY = [
    "preprocessor_config.json",
    "tokenizer_config.json",
    "vocab.json",
    "special_tokens_map.json",
    "merges.txt",           # may not exist — script will skip gracefully
    "added_tokens.json",    # may not exist — script will skip gracefully
]
# ─────────────────────────────────────────────────────────────────────────────

if not TOKEN:
    raise ValueError("HF_TOKEN environment variable is not set. Export it first:\n  export HF_TOKEN=hf_...")

api = HfApi(token=TOKEN)

print(f"Copying config files from {BASE_MODEL} → {TARGET_REPO}\n")

copied = []
skipped = []

for filename in FILES_TO_COPY:
    try:
        # Download from base model
        local_path = hf_hub_download(
            repo_id=BASE_MODEL,
            filename=filename,
            token=TOKEN,
        )
        # Upload to target repo
        api.upload_file(
            path_or_fileobj=local_path,
            path_in_repo=filename,
            repo_id=TARGET_REPO,
            repo_type="model",
            commit_message=f"fix: add {filename} from base model for inference endpoint",
        )
        print(f"  ✅ Uploaded {filename}")
        copied.append(filename)
    except Exception as e:
        msg = str(e)
        if "404" in msg or "not found" in msg.lower() or "Entry Not Found" in msg:
            print(f"  ⏭️  Skipped {filename} (not in base model repo)")
        else:
            print(f"  ❌ Failed  {filename}: {msg}")
        skipped.append(filename)

print(f"\nDone. Copied {len(copied)} file(s), skipped {len(skipped)}.")
print(f"\nNext step: redeploy your HF Inference Endpoint for {TARGET_REPO}.")
