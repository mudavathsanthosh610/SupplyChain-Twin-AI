import json
import urllib.request

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen2.5:3b"


def parse_supply_chain_scenario(user_message: str) -> dict:
    prompt = f"""
You are a supply-chain scenario parser.

Convert the user's request into JSON ONLY.

Available node IDs:

ROT = Rotterdam Port
ANT = Antwerp Port
HAM = Hamburg Port
SH_SUP = Shanghai Supplier
SH_PORT = Shanghai Port
FRA_WH = Frankfurt Warehouse
BER = Berlin Customer

Return exactly this structure:

{{
  "closed_nodes": [],
  "closed_routes": [],
  "closure_duration_days": 0,
  "fuel_cost_increase_percent": 0,
  "source": "SH_SUP",
  "destination": "BER"
}}

Rules:
- If Rotterdam is closed, use "ROT".
- If Antwerp is closed, use "ANT".
- If Hamburg is closed, use "HAM".
- Convert closure duration into number of days.
- Example: "two weeks" = 14 days.
- Example: "3 days" = 3 days.
- Put percentage as a number only.
- Do not include markdown.
- Do not explain anything.
- Return valid JSON only.

User request:
{user_message}
"""

    payload = json.dumps(
        {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={
            "Content-Type": "application/json"
        },
        method="POST",
    )

    with urllib.request.urlopen(request) as response:
        result = json.loads(
            response.read().decode("utf-8")
        )

    parsed = json.loads(
        result["response"]
    )

    return parsed
