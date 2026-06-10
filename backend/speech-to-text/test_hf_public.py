import requests

API_URL = "https://api-inference.huggingface.co/models/Cherryland120/whisper-large-v3-igbo-bucket"

with open("dummy.wav", "wb") as f:
    f.write(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00")

with open("dummy.wav", "rb") as f:
    data = f.read()

try:
    response = requests.post(API_URL, data=data)
    print("STATUS CODE:", response.status_code)
    print("RESPONSE:", response.text)
except Exception as e:
    print("ERROR:", e)
