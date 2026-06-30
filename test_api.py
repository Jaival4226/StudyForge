# test_api.py

import google.generativeai as genai

# Hardcode the key just for this test to rule out Django settings issues
API_KEY = "AQ.Ab8RN6KQgrAoMkA7yrfJDGNSSFqN7mgkqVqscNhIAZN8zKUcww" 
genai.configure(api_key=API_KEY)

print("Knocking on Google's door...")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ Found Supported Model: {m.name}")
except Exception as e:
    print(f"❌ API Error: {e}")