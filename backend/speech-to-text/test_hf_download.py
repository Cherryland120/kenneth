from transformers import AutoProcessor
print("Starting download test...")
try:
    processor = AutoProcessor.from_pretrained("Cherryland120/whisper-large-v3-igbo-bucket")
    print("Download test successful!")
except Exception as e:
    print("ERROR:", e)
