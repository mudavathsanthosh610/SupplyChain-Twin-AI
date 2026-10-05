# SupplyChain Twin AI

Starter backend for a conversational supply-chain digital twin.

## Current features

- FastAPI backend
- NetworkX directed supply-chain graph
- Baseline route calculation
- Node closure simulation
- Route closure simulation
- Fuel cost shock simulation
- Alternative-route recalculation
- Cost / delay / bottleneck impact
- Simple risk classification

## Run

```powershell
cd SupplyChain-Twin-AI\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

- API docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

## First sample simulation

Use `POST /simulate/sample` with:

```json
{
  "closed_nodes": ["ROT"],
  "closed_routes": [],
  "fuel_cost_increase_percent": 30,
  "source": "SH_SUP",
  "destination": "BER"
}
```

## Next phases

1. PostgreSQL persistence
2. Free local LLM scenario parser through Ollama
3. Next.js + React Flow dashboard
4. Flutter mobile app
5. APK build
