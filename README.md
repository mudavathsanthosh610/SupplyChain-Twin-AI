# SupplyChain Twin AI

**SupplyChain Twin AI** is a full-stack supply-chain decision-support MVP. Teams can map a supplier-to-customer network, explore disruption scenarios, review estimated route and inventory effects, monitor reported supplier performance, and organize mitigation work in a shared workspace.

The application combines an interactive digital-twin-style network with a **deterministic Python simulation engine** and an **optional local AI agent**. The AI helps users ask questions and interpret results; the simulation engine calculates the numerical outcomes.

> **Project status:** Source code and deployment configuration are public. The application has not yet been deployed as a public production service. The configured Render resources and Vercel project still need to be provisioned and verified.

## Contents

- [Project at a glance](#project-at-a-glance)
- [End-to-end workflow](#end-to-end-workflow)
- [Product capabilities](#product-capabilities)
- [What the AI agent does](#what-the-ai-agent-does)
- [Architecture and technology](#architecture-and-technology)
- [Run locally](#run-locally)
- [Test and build](#test-and-build)
- [API and example scenario](#api-and-example-scenario)
- [Deployment preparation](#deployment-preparation)
- [Data, privacy, and limitations](#data-privacy-and-limitations)
- [Repository layout](#repository-layout)

## Project at a glance

| | |
| --- | --- |
| **Purpose** | Help teams explore supply-network disruptions and coordinate a response |
| **Users** | Supply-chain planners, operations teams, and project demonstrators |
| **Frontend** | Next.js, React, TypeScript |
| **Backend** | FastAPI, Python, SQLAlchemy |
| **Network and simulation** | NetworkX directed graphs and deterministic scenario calculations |
| **Local AI** | Ollama for chat, scenario parsing, and result explanations |
| **Local voice** | faster-whisper for offline transcription |
| **Database** | SQLite for local development; PostgreSQL support prepared for hosting |

### Three-step explanation

1. **Map:** Build or select a workspace and represent suppliers, facilities, customers, inventory, and transport routes.
2. **Simulate:** Describe a disruption, such as a facility closure or a fuel-price shock, and compare possible scenarios.
3. **Review and respond:** Examine modeled route, delay, cost, and inventory impacts; discuss the results with the assistant; and track human-selected mitigation actions.

## End-to-end workflow

### 1. Start with a workspace

Sign in and choose an existing workspace, discover example companies by country, create a custom company, or open the bundled global demo. A custom company can include its home city and country, business type, and a short description of its current end-to-end workflow.

The demo is for learning and walkthroughs. Its example facilities, routes, and operational values are synthetic—not verified company data. A custom company starts without an automatically inserted demo network, so users can build its network from their own information.

### 2. Build and check the network

Represent the supply chain as **nodes** connected by directed **routes**:

- Nodes can represent suppliers, plants, ports, warehouses, distribution centers, and customers.
- Routes capture connections and operational attributes such as transport mode, cost, capacity, lead time, and fuel dependency.
- Inventory, demand, safety stock, location, and source references can be added where applicable.

Use the network map, guided setup flow, data-readiness checklist, and Data Quality Action Center to review connectivity and record-level gaps. Excel network workbooks can be downloaded as a template, previewed, and validated before import; invalid workbook data does not update the workspace. Readiness checks identify missing inputs or broken connections—they do not prove that submitted data is accurate.

### 3. Describe a scenario

Create a scenario in natural language or enter structured inputs. Examples include:

- “Close the Rotterdam port for 14 days.”
- “Increase fuel prices by 30% and compare the result with the baseline.”

The natural-language parser uses the selected workspace context. It validates referenced facilities and routes against that network; it should not silently apply an unknown or ambiguous target.

### 4. Calculate and compare the impacts

The deterministic simulation engine checks that the configured network has a valid connected source and destination, calculates a baseline route, applies the requested closures and fuel shock, and recalculates the available alternative route. It then estimates:

- Route and transportation cost change
- Lead-time change
- Inventory coverage, replenishment timing, and shortage exposure where the required inputs are available
- Scenario risk classification and relevant warnings

Users can compare **2–4 scenarios sequentially** and review a transparent lowest-impact heuristic. These are model outputs based on current workspace inputs, not guaranteed forecasts or a promise that a route or mitigation is operationally available.

### 5. Review, coordinate, and learn

Save successful scenario runs to company-scoped history, revisit recent results, and turn a simulation review into a Control Tower mitigation action. Actions can include scenario context and modeled impact, owner, due date, progress status, and actual outcome notes. When an action is completed, the workspace can compare recorded results with modeled estimates.

Workspace owners can invite teammates with expiring single-use invitation links. Owners manage membership; editors can update the network, run simulations, and manage mitigation actions; viewers have read-only workspace and history access. Workspace activity and account notifications support follow-up.

### 6. Monitor supplier performance

Record supplier scorecards by reporting date using on-time delivery, average lead time, defect rate, and capacity utilization. CSV and Excel reports can be previewed and validated before valid rows are imported. The portfolio offers search, date-window and status filters, supplier trends, comparison with the previous report, CSV export, and configurable thresholds.

Risk alerts are evaluated against recorded reports and the workspace's own thresholds. Missing reports remain explicit; reports older than 90 days are marked outdated. Values are user-reported and not independently verified, and the portfolio does not grade suppliers against external benchmarks.

## Product capabilities

### Supply-network workspaces

- Company-scoped networks, simulation history, supplier records, and mitigation actions
- Visual end-to-end facility and route flow
- Guided custom-company setup and country-based company discovery, with curated examples when the public directory is unavailable
- Synthetic demo networks with explicit provenance labels
- Network completeness and data-readiness checks, source references, and update freshness where timestamps exist
- Excel network template, preview, validation, and import

### Scenario planning

- Facility and route closure scenarios
- Fuel-cost shocks with route fuel-dependency settings
- Alternative-route recalculation and bottleneck visibility
- Route cost and lead-time comparison
- Inventory and shortage exposure estimates when data supports the calculation
- Sequential comparison of 2–4 scenarios and simulation history

### Supplier and mitigation operations

- Dated supplier scorecards and trend views
- CSV/Excel supplier report preview and validated import
- Configurable company-specific supplier risk thresholds and teammate notifications
- CSV portfolio export
- Mitigation actions linked to scenario context, with ownership, due dates, progress, and actual outcome notes

### Workspace collaboration

- Owner, editor, and viewer roles
- Single-use workspace invitations that expire after seven days
- Workspace activity feed and in-app account notifications
- Persistent account sessions until sign-out; signing out revokes the backend session

## What the AI agent does

The **Supply Chain Agent** is an app-wide, conversational assistant. When relevant, it uses the selected workspace's active network as context.

It can:

1. **Answer questions** about the application and supply-chain concepts.
2. **Help structure disruption requests** into scenario inputs, such as closure targets and duration.
3. **Explain simulation output** in plain language and offer suggested mitigation ideas.
4. **Propose optional node or route drafts** for a user to review.
5. **Transcribe voice input locally** with a cached Whisper model when local voice dependencies are installed.

### AI and simulation responsibilities

- The **Python simulation engine** calculates modeled route, cost, delay, inventory, and risk values.
- Ollama may parse a natural-language scenario or explain the simulation result; it is instructed not to recalculate or modify numerical simulation results.
- AI-generated drafts are proposals only. The agent does not automatically save changes; the user reviews and explicitly saves through the app.
- A deterministic rule-based parser can handle supported scenario details when Ollama is unavailable. Its fallback is limited and does not replace careful review.
- Model quality and latency depend on the local machine and selected model. AI responses may be incomplete or incorrect; verify them against the workspace data and simulation output.

### Local model configuration

The backend defaults are defined in `backend/app/config.py`:

- `OLLAMA_MODEL=qwen2.5:0.5b` — compact assistant model for chat and guidance.
- `OLLAMA_PARSER_MODEL=qwen2.5:3b` — scenario parser and simulation-result explanation model.
- `OLLAMA_URL=http://127.0.0.1:11434/api/generate` — local Ollama API endpoint.

Install the relevant Ollama model(s) and start Ollama before using model-backed chat, parsing, or explanations. Smaller models may answer faster but can be less reliable. For local development, set `OLLAMA_MODEL` in `backend/.env` if you want to use a different installed assistant model. Model downloads may be large and use significant disk space and memory.

For voice transcription, install the backend requirements and download/cache the Whisper `base` model once:

```powershell
cd backend
python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
```

Runtime transcription loads the cached model in offline-only mode. The voice recording is submitted to the backend for transcription; the app does not use a hosted speech-recognition provider.

## Architecture and technology

```text
Browser
  Next.js / React / TypeScript
        |
        | HTTP API + bearer-token session
        v
FastAPI backend
  ├── Auth, companies, workspaces, network, collaboration, notifications
  ├── Deterministic NetworkX route/disruption/inventory simulation
  ├── Supplier performance, risk thresholds, simulation history, Control Tower
  └── Optional local Ollama + local Whisper integrations
        |
        ├── SQLite (local) / PostgreSQL (prepared hosting configuration)
        └── Local company-document storage (persistent disk prepared for hosting)
```

- **Frontend:** Next.js 16, React 19, TypeScript, React Flow for network visualization.
- **Backend:** Python 3.12-compatible FastAPI service, Pydantic validation, and SQLAlchemy persistence.
- **Simulation:** NetworkX directed graph routing with separate route, disruption, and inventory calculation modules.
- **AI:** Ollama model endpoint for local language-model tasks; `faster-whisper` for local voice transcription.
- **Reports:** OpenPyXL for Excel import/export workflows; CSV exports for supplier portfolio data.
- **Storage:** SQLite for local use; the Render Blueprint defines PostgreSQL and persistent storage for company documents.

## Run locally

### Prerequisites

- Python 3.12 or compatible Python supported by the backend dependencies
- Node.js and npm
- Ollama for local model-backed assistant, scenario parsing, and explanations (optional for deterministic simulations)
- Enough memory and disk space for the model(s) you choose; local inference can be slow on CPU-only hardware

### 1. Set up and start the backend

From the repository root, open a terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8001
```

On macOS/Linux, activate the environment with `source .venv/bin/activate` instead of the PowerShell activation command.

The backend uses SQLite by default and creates/updates its local database at startup. Keep the backend terminal running. Do not commit `.env`, the database file, or uploaded company documents.

### 2. (Optional) Set up local AI and voice

Install Ollama, start the Ollama service, and download whichever models you intend to use:

```powershell
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:3b
```

The scenario parser and result explainer use the parser model; assistant chat uses the assistant model. If Ollama is unavailable, deterministic simulations and supported rule-based scenario parsing remain available, while model-backed answers and explanations are not.

For local offline voice transcription, run the one-time Whisper model-cache command in [What the AI agent does](#what-the-ai-agent-does). Voice transcription is optional.

### 3. Set up and start the frontend

Open a second terminal at the repository root:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The API base URL defaults to `http://127.0.0.1:8001`; set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if your backend uses a different local address. Restart the Next.js dev server after changing this value.

The FastAPI health endpoint is [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health), and interactive API documentation is at [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs).

### 4. Try the app

Register a local account, sign in, and open the bundled demo or create a custom workspace. Review the selected network and its provenance, then run a scenario. The demo is intended for walkthroughs and uses synthetic data; do not treat it as real operational information.

## Test and build

Run backend tests from `backend` with its virtual environment activated:

```powershell
pytest
```

Build the frontend from `frontend`:

```powershell
npm run build
```

Run the frontend linter with:

```powershell
npm run lint
```

These commands check the project in the current environment; passing tests or a successful build is not a substitute for validating production configuration, data quality, access controls, and backups.

## API and example scenario

The FastAPI service exposes interactive OpenAPI documentation at `/docs`. Important top-level development/demo endpoints include:

- `GET /health` — service health and configured model names.
- `GET /network/sample` — bundled sample supply-chain network.
- `POST /simulate/sample` — run a disruption against the bundled sample.
- `POST /simulate` — run a simulation against a submitted network.
- `POST /simulate/natural` — parse and run a natural-language scenario for a company.

Company, network, supplier, collaboration, notification, history, Control Tower, and assistant APIs are grouped under routers and generally require an authenticated user and appropriate company access. Use `/docs` for the current endpoint schemas.

Example request to `POST /simulate/sample`:

```json
{
  "closed_nodes": ["ROT"],
  "closed_routes": [],
  "closure_duration_days": 14,
  "fuel_cost_increase_percent": 30,
  "source": "SH_SUP",
  "destination": "BER"
}
```

This example closes the sample network's Rotterdam node (`ROT`) and applies a 30% fuel-cost shock. It is illustrative; results depend on the exact bundled sample data and calculation inputs. For a company-specific scenario, configure a connected workspace network and use its actual node IDs.

## Deployment preparation

The repository includes deployment configuration for a **Vercel frontend** and a **Render API, managed PostgreSQL database, and persistent document-storage disk**. See [`render.yaml`](./render.yaml) and the environment templates [`backend/.env.example`](./backend/.env.example) and [`frontend/.env.example`](./frontend/.env.example).

**No Render service, database, public Vercel project, or production app URL has been provisioned yet.** A public GitHub repository is source code, not a running hosted application.

Before deploying:

1. Import this repository into Render as a Blueprint so Render can read `render.yaml`. Review the selected database, API, and persistent-disk plans and their current pricing before provisioning; these resources may incur charges.
2. Configure `CORS_ORIGINS` as a JSON array containing the exact HTTPS Vercel origin, for example `["https://your-app.vercel.app"]`.
3. Import the repository into Vercel and set its root directory to `frontend`. Configure `NEXT_PUBLIC_API_URL` as the deployed Render API's HTTPS origin.
4. Verify the deployed API's `/health` endpoint, then test registration, login, workspace creation, network editing, simulation, supplier imports, and document storage/download.
5. Configure and test PostgreSQL backup and restore before using real company information.

The Render Blueprint generates a production `SECRET_KEY`, connects the managed database, and mounts persistent storage at `/var/data` for company documents. Production settings require a strong secret and exact HTTPS CORS origins. Do not put credentials, private keys, or `.env` values in the repository.

### Important hosted AI limitation

The current Render Blueprint **does not deploy an Ollama model service**. Its configured assistant expects Ollama running locally, and a user's laptop/local Ollama endpoint cannot be reached by the hosted Render API. Deterministic simulations can run independently, but hosted chat, AI scenario parsing, and model-based result explanations require a separately deployed, privately reachable model service and deliberate secure configuration.

This is deployment preparation for a pilot—not a claim that the application is production-certified.

## Data, privacy, and limitations

- **Synthetic demo values are examples.** Demo network labels may be illustrative, and map positions are schematic unless verified facility coordinates are entered.
- **Company data quality matters.** User-entered network and supplier data are not independently verified. Completeness checks do not certify correctness.
- **Model outputs are estimates.** Simulation outcomes depend on configured network, inventory, demand, capacity, route, cost, and timing inputs. AI explanations are advisory and may be wrong.
- **Human review is required.** Validate scenario targets, assumptions, model output, recommended actions, and operational feasibility before acting.
- **Local file storage is not a complete security program.** Company reference documents (PDF, DOCX, XLSX; up to 10 MB each) are stored locally in development, are not parsed or sent to an external service, and still need appropriate access controls, retention, and protection for real sensitive data.
- **Voice transcription is local in the intended configuration.** It requires the local backend and a cached Whisper model; audio is submitted to that backend for transcription.
- **Password recovery is development-only.** Reset-token endpoints are disabled outside development/test; production account recovery must be designed before onboarding real users.
- **Hosted AI is not currently provisioned.** See [Important hosted AI limitation](#important-hosted-ai-limitation).
- **Do not use the MVP as the sole basis for safety-critical, financial, or contractual decisions.**

## Repository layout

```text
.
├── backend/
│   ├── app/
│   │   ├── agent/          # Ollama scenario parser and result explainer
│   │   ├── db/             # Database session and startup setup
│   │   ├── db_models/      # SQLAlchemy entities
│   │   ├── routers/        # API endpoints by feature
│   │   └── simulation/     # Graph, disruption, and inventory calculations
│   ├── tests/              # Backend tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/app/            # Next.js app, pages, and components
│   └── package.json
├── render.yaml             # Render Blueprint for API, PostgreSQL, and storage
└── README.md
```

## Project links

- **Source repository:** [github.com/mudavathsanthosh610/SupplyChain-Twin-AI](https://github.com/mudavathsanthosh610/SupplyChain-Twin-AI)
- **Project overview PDF:** [`SupplyChain_Twin_AI_Project_Overview.pdf`](./SupplyChain_Twin_AI_Project_Overview.pdf)
