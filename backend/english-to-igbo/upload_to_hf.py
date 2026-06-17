import os
from huggingface_hub import HfApi, whoami
from dotenv import load_dotenv

load_dotenv("/Users/test/repos/kenneth/.env")
hf_token = os.getenv("HF_TOKEN")

if not hf_token:
    print("HF_TOKEN not found in .env")
    exit(1)

api = HfApi(token=hf_token)
user_info = whoami(token=hf_token)
username = user_info["name"]

repo_id = f"{username}/english-to-igbo-marian"
print(f"Creating repository {repo_id}...")
api.create_repo(repo_id=repo_id, exist_ok=True, repo_type="model", private=False)

print("Uploading model files...")
api.upload_folder(
    folder_path="/Users/test/repos/kenneth/backend/english-to-igbo/english_mt_finetuned",
    repo_id=repo_id,
    repo_type="model",
    ignore_patterns=["checkpoint-*", ".DS_Store", "optimizer.pt"]
)
print(f"Model successfully uploaded to https://huggingface.co/{repo_id}")
