import traceback
from huggingface_hub import InferenceClient

client = InferenceClient()

with open("dummy.wav", "rb") as f:
    audio = f.read()

try:
    response = client.automatic_speech_recognition(audio, model="abasseyfresh/whisper-large-v3-igbo")
    print(response)
except Exception as e:
    traceback.print_exc()
