import os
import argparse
import requests

HF_ENDPOINT = "whisper-large-v3-igbo-v2-ehp"
HF_NAMESPACE = "Cherryland120"
RAILWAY_SERVICES = [
    "a9fbb3bb-97b5-4b26-a255-38a16a4d6d8c", # faithful-fascination
    "45c4c736-3a5b-4aca-9e33-5e7cf143c497", # fearless-manifestation
    "992b55f2-65a6-4c30-aead-08bc600082ab", # artistic-wonder
    "a2e66a54-b59d-49f5-9016-4dc9e21afc9d"  # kenneth
]

def manage_hf(action):
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("HF_TOKEN not set, skipping Hugging Face.")
        return

    url = f"https://api.endpoints.huggingface.cloud/v2/endpoint/{HF_NAMESPACE}/{HF_ENDPOINT}"
    headers = {"Authorization": f"Bearer {hf_token}"}
    
    endpoint_action = "resume" if action == "wake" else "pause"
    print(f"Sending {endpoint_action} command to Hugging Face Endpoint: {HF_ENDPOINT}...")
    
    res = requests.post(f"{url}/{endpoint_action}", headers=headers)
    if res.status_code in [200, 202]:
        print(f"✅ Hugging Face {endpoint_action} successful.")
    else:
        print(f"❌ Hugging Face Error {res.status_code}: {res.text}")

def manage_railway(action):
    railway_token = os.environ.get("RAILWAY_TOKEN")
    if not railway_token:
        print("RAILWAY_TOKEN not set, skipping Railway.")
        return

    headers = {
        "Authorization": f"Bearer {railway_token}",
        "Content-Type": "application/json"
    }
    
    # 1. Fetch Project ID from the first service
    print("Fetching Railway environment details...")
    query = """
    query {
      service(id: "%s") {
        projectId
      }
    }
    """ % RAILWAY_SERVICES[0]
    
    res = requests.post("https://backboard.railway.app/graphql/v2", json={"query": query}, headers=headers).json()
    if 'errors' in res:
        print(f"❌ Railway Error fetching service: {res['errors']}")
        return
        
    project_id = res['data']['service']['projectId']
    
    # 2. Fetch Environments for the project
    env_query = """
    query {
      project(id: "%s") {
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
    """ % project_id
    
    res = requests.post("https://backboard.railway.app/graphql/v2", json={"query": env_query}, headers=headers).json()
    envs = res['data']['project']['environments']['edges']
    
    # Default to first environment, but prefer "production" if it exists
    env_id = envs[0]['node']['id']
    for e in envs:
        if e['node']['name'].lower() == "production":
            env_id = e['node']['id']
            break
            
    print(f"Using Environment ID: {env_id}")
    
    # 3. Sleep / Wake instances
    is_sleep = True if action == "sleep" else False
    print(f"Setting sleepApplication to {is_sleep} for all services...")
    
    mutation = """
    mutation serviceInstanceUpdate($environmentId: String!, $serviceId: String!, $sleepApplication: Boolean) {
      serviceInstanceUpdate(
        environmentId: $environmentId,
        serviceId: $serviceId,
        input: {
          sleepApplication: $sleepApplication
        }
      )
    }
    """
    
    import time
    for sid in RAILWAY_SERVICES:
        variables = {
            "environmentId": env_id,
            "serviceId": sid,
            "sleepApplication": is_sleep
        }
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                res = requests.post("https://backboard.railway.app/graphql/v2", json={"query": mutation, "variables": variables}, headers=headers)
                
                # Railway's load balancer sometimes returns 502/503 text instead of JSON on transient errors
                if res.status_code in [502, 503] or "upstream connect error" in res.text:
                    raise Exception(f"Transient Railway API error: {res.text}")
                    
                if res.status_code == 200 and 'errors' not in res.json():
                    print(f"✅ Set sleepApplication={is_sleep} for {sid}.")
                    break
                else:
                    print(f"❌ Failed to scale {sid}: {res.text}")
                    break
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"⚠️ Network error for {sid}: {str(e)}. Retrying in 2 seconds...")
                    time.sleep(2)
                else:
                    print(f"❌ Failed to scale {sid} after {max_retries} attempts: {str(e)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=["wake", "sleep"], required=True)
    args = parser.parse_args()

    print(f"=== Starting Infrastructure {args.action.upper()} ===")
    manage_hf(args.action)
    print("---------------------------------------------------")
    manage_railway(args.action)
    print("=== Done ===")
