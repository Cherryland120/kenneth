from huggingface_hub import InferenceClient

client = InferenceClient()

with open("dummy.wav", "rb") as f:
    audio = f.read()

try:
    response = client.automatic_speech_recognition(audio, model="Cherryland120/whisper-large-v3-igbo-bucket")
    print(response)
except Exception as e:
    print("ERROR:", e)
