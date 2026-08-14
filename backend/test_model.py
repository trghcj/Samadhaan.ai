import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# The API models list might return models your tier isn't allowed to actually generate with.
# Let's brute force test which model ACTUALLY allows generation.
models_to_test = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-1.0-pro",
    "gemini-pro"
]

for model_name in models_to_test:
    try:
        print(f"Testing generation with {model_name}...")
        response = client.models.generate_content(
            model=model_name,
            contents="Say hello"
        )
        print(f"SUCCESS with {model_name}! Response: {response.text}\n")
    except Exception as e:
        print(f"FAILED with {model_name}: {e}\n")
