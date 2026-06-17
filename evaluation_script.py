import os
import time
import httpx
import asyncio
import jiwer
from sacrebleu.metrics import BLEU
from pathlib import Path
import csv
import argparse

# The ground truth for our 10 audio files
# The file name is the Igbo ground truth, the value is the English translation.
GROUND_TRUTH = {
    "Abụ m Kenneth..mp3": {"igbo": "Abụ m Kenneth.", "english": "I am Kenneth."},
    "Abụ m onye buru ibu mgbe m dị obere..mp3": {"igbo": "Abụ m onye buru ibu mgbe m dị obere.", "english": "I used to be fat when I was little."},
    "Aha m bụ Pedro..mp3": {"igbo": "Aha m bụ Pedro.", "english": "I named him Pedro."},
    "Ahụrụ m nna m na nne m n'anya..mp3": {"igbo": "Ahụrụ m nna m na nne m n'anya.", "english": "I love my father and mother."},
    "Mama zụtara m ụgbọala taa..mp3": {"igbo": "Mama zụtara m ụgbọala taa.", "english": "Mommy bought me a car today."},
    "Ndị mụrụ m zụtara m ihe dị oke ọnụ..mp3": {"igbo": "Ndị mụrụ m zụtara m ihe dị oke ọnụ.", "english": "My parents buy me expensive things."},
    "Nwanne m nwanyị na-azụkwara m ihe.mp3": {"igbo": "Nwanne m nwanyị na-azụkwara m ihe.", "english": "My sister buys things for me too."},
    "Ọ zụtara m nkịta..mp3": {"igbo": "Ọ zụtara m nkịta.", "english": "She bought a dog for me."},
    "Papa zụtara m ụgbọelu ụnyaahụ..mp3": {"igbo": "Papa zụtara m ụgbọelu ụnyaahụ.", "english": "Daddy bought me an aeroplane yesterday."},
    "Ụmụnne m na-akpasu iwe..mp3": {"igbo": "Ụmụnne m na-akpasu iwe.", "english": "My siblings are annoying."}
}

async def evaluate_stt(client, url, audio_path):
    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
        data = {"engine": "custom"}
        start_time = time.time()
        try:
            response = await client.post(f"{url}/api/transcribe", files=files, data=data, timeout=300.0)
            latency = time.time() - start_time
            if response.status_code == 200:
                return response.json().get("text", ""), latency
            return "", latency
        except Exception as e:
            print(f"STT Error on {os.path.basename(audio_path)}: {e}")
            return "", time.time() - start_time

async def evaluate_translation(client, url, text):
    data = {"text": text, "engine": "custom"}
    start_time = time.time()
    try:
        response = await client.post(f"{url}/api/translate", json=data, timeout=300.0)
        latency = time.time() - start_time
        if response.status_code == 200:
            return response.json().get("translated_text", ""), latency
        return "", latency
    except Exception as e:
        print(f"Translation Error on '{text}': {e}")
        return "", time.time() - start_time

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stt-url", required=True, help="Speech to Text backend URL")
    parser.add_argument("--tt-url", required=True, help="Text to Text backend URL")
    args = parser.parse_args()

    test_dir = Path("igbo_tests")
    if not test_dir.exists():
        print("Directory igbo_tests not found.")
        return

    results = []
    bleu = BLEU()
    
    async with httpx.AsyncClient() as client:
        for audio_file in test_dir.glob("*.mp3"):
            filename = audio_file.name
            if filename not in GROUND_TRUTH:
                continue
                
            gt = GROUND_TRUTH[filename]
            
            print(f"Evaluating: {filename} ...", flush=True)
            
            # STT
            pred_igbo, stt_latency = await evaluate_stt(client, args.stt_url, audio_file)
            
            # Calculate CER
            cer = jiwer.cer(gt["igbo"], pred_igbo) if pred_igbo else 1.0
            
            # Translation
            pred_eng, tt_latency = await evaluate_translation(client, args.tt_url, pred_igbo)
            
            # Calculate BLEU (0-100)
            bleu_score = bleu.sentence_score(pred_eng, [gt["english"]]).score if pred_eng else 0.0
            
            results.append({
                "Filename": filename,
                "Ground Truth Igbo": gt["igbo"],
                "Predicted Igbo": pred_igbo,
                "CER": cer,
                "STT Latency (s)": stt_latency,
                "Ground Truth English": gt["english"],
                "Predicted English": pred_eng,
                "BLEU Score": bleu_score,
                "TT Latency (s)": tt_latency
            })

    # Summary
    avg_cer = sum(r["CER"] for r in results) / len(results)
    avg_bleu = sum(r["BLEU Score"] for r in results) / len(results)
    avg_stt_lat = sum(r["STT Latency (s)"] for r in results) / len(results)
    avg_tt_lat = sum(r["TT Latency (s)"] for r in results) / len(results)
    
    print("\n" + "="*50)
    print("FINAL BENCHMARK REPORT")
    print("="*50)
    print(f"Total Files Tested: {len(results)}")
    print(f"Average CER (Speech-to-Text Error): {avg_cer*100:.2f}%")
    print(f"Average BLEU (Translation Quality): {avg_bleu:.2f}/100")
    print(f"Average STT Latency: {avg_stt_lat:.2f}s")
    print(f"Average TT Latency:  {avg_tt_lat:.2f}s")
    
    # Write CSV
    with open("benchmark_report.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
        
    print("Detailed report saved to benchmark_report.csv")

if __name__ == "__main__":
    asyncio.run(main())
