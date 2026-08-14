import os
import requests
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GEMINI_API_KEY")

if not key or key == "PASTE_YOUR_API_KEY_HERE":
    print("No valid API key found in .env")
else:
    print(f"Checking access for API Key starting with: {key[:5]}...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    response = requests.get(url)
    
    if response.status_code == 200:
        models = response.json().get("models", [])
        print("\nSuccessfully connected! Here are the models your key has access to:")
        for m in models:
            print(f" - {m.get('name')}")
    else:
        print(f"\nFailed to connect to Google API.")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
