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
- Country-based company discovery, with curated examples available when the public directory is unavailable
- Company workspaces with no saved nodes or routes are automatically populated with a demo network labeled synthetic in the workspace and simulation results
- The bundled global demo network includes illustrative city/country labels and explicit synthetic-data provenance for readiness checks; no operational values are presented as verified
- Synthetic demo networks receive stable company-specific example values; these are still synthetic estimates, not real company operating data
- Synthetic demo networks use country-specific example city labels for suppliers, ports, and warehouses; map positions remain schematic until verified facility coordinates are provided
- Partially configured workspaces are preserved and never mixed with generated demo data
- Facility closures that do not match the selected network are rejected with the available locations listed
- Excel workbooks can be downloaded from the built-in template and previewed/validated before import; invalid workbooks do not change workspace data
- Workspaces show completeness checks for location, capacity, and source references, plus data-update freshness when timestamps are available; legacy records without timestamps are reported as unknown
- The dashboard can run and compare 2–4 disruption scenarios sequentially against the selected workspace, showing route cost/delay, stockout exposure, emergency inventory, and a transparent lowest-impact heuristic
- An operational data readiness checklist validates active supplier-to-customer connectivity, route endpoints, inventory/demand inputs, capacity/cost coverage, and source traceability before enabling simulation; warnings do not claim data accuracy
- The Data Quality Action Center turns record-level gaps into direct location/route edit actions; edits preserve each record's existing provenance label and source references can be added without implying verification
- The company dashboard includes an end-to-end stage flow with saved route directions, selectable location details, route metrics, and company workflow context; synthetic records remain visibly labeled and no missing links are inferred
- A company-scoped control tower persists mitigation actions from simulations with scenario context, modeled impact snapshots, owners, due dates, progress status, and actual outcome notes after completion; completed actions can compare recorded cost, delay, stockout, and emergency-inventory results against their modeled estimates, and an explicitly labeled illustrative sample can be loaded to try the workflow
- Successful natural-language simulations are saved as company-scoped history in the database with the scenario and network snapshot; the dashboard can reopen the latest ten runs across browser sessions and clear history for the selected company
- Account sessions persist across browser restarts until the user signs out; the dashboard restores the session and saved company history, and signing out revokes that session on the backend. On shared devices, sign out when finished
- Password recovery is a local-development-only flow: it returns a single-use reset token that expires after 30 minutes, changes the password, and revokes all active sessions. No recovery email is sent; reset endpoints are disabled unless the backend environment is development, dev, or test
- Company workspaces can be shared using single-use invite links that expire after seven days. Owners manage invitations and members; Editors can change the network, run simulations, and manage mitigation actions; Viewers have read-only workspace and history access. Membership, network, simulation, and mitigation-action changes appear in the workspace activity feed
- The dashboard includes account-scoped in-app notifications for teammate activity, assigned mitigation actions, and due-soon reminders. Notifications poll while the dashboard is open; due reminders are generated when notifications are fetched, and dismissed alerts stay dismissed
- Supplier scorecards store user-reported on-time delivery, average lead time, defect rate, and capacity utilization by reporting date, with source references and notes. CSV and Excel supplier reports can be previewed and validated before valid rows are imported. The supplier portfolio compares each latest report with the prior report, supports search, date-window and status filters, and CSV export; missing reports are explicit and reports older than 90 days are marked outdated. Workspace-scoped trend charts can be filtered by supplier and date range; they flag two consecutive adverse report-to-report changes and can start a Control Tower review action. Values are user-provided and not independently verified; the portfolio does not assign grades
- Supplier risk monitoring lets workspace owners and editors set company-specific thresholds for delivery, lead time, defects, and capacity. Alerts are evaluated against the latest recorded supplier reports, notify workspace teammates when thresholds are breached, and can be turned into Control Tower review actions; no external benchmarks or unreported data are assumed
- Simulation results show scenario-based risk alerts for route availability, modeled stockout and safety-stock exposure, and elevated cost or delay; alerts are labeled as estimates and can be turned into Control Tower actions
- Scenario parsing matches facility names and route endpoint names against the selected company network; unknown or ambiguous targets are not silently guessed
- Custom workspaces capture the company base city/country and open a guided supplier-to-customer network setup for adding real suppliers, plants, ports, warehouses, customers, and routes; demo networks are not automatically inserted into these workspaces
- Custom company profiles capture the business type and current end-to-end workflow; PDF, DOCX, and XLSX reference documents can be stored on the local backend (10 MB each), downloaded or deleted, and are not parsed or sent to external services
- A global Supply Chain Agent answers app and supply-chain questions with the local Ollama model, uses the selected workspace as context, recovers readable plain-text or truncated JSON model replies while discarding invalid optional drafts, supports on-device Whisper voice transcription, and offers node/route drafts that must be reviewed and saved by the user
- Synthetic demo workspaces do not show a company-document upload panel; the bundled Demo Global Supply Chain is ready for interactive walkthroughs without attaching documents

## Run

```powershell
cd SupplyChain-Twin-AI\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:3b
python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
uvicorn app.main:app --reload --port 8001
```

The assistant defaults to the compact `qwen2.5:0.5b` model to reduce local CPU and memory use; requests use a 2048-token context and a concise output limit, while the simulation parser continues to use `qwen2.5:3b`. The smaller assistant model uses less memory but may be less reliable on complex questions. To prioritize assistant answer quality over speed and memory, set `OLLAMA_MODEL=qwen2.5:3b` in the backend `.env`. The first answer can take longer while Ollama loads the selected model, especially on CPU-only systems; after a request, Ollama keeps it loaded for up to 5 minutes to speed up follow-up questions without holding memory indefinitely.

The Whisper command downloads the open-source speech model once into the local model cache. Runtime voice transcription uses the cached model in offline-only mode; microphone recordings are sent to the local backend and are not sent to Ollama or an external speech service.

Open:

- API docs: http://127.0.0.1:8001/docs
- Health: http://127.0.0.1:8001/health

## Private pilot deployment

The deployment target is Vercel for the Next.js frontend and Render for the
FastAPI backend, managed PostgreSQL, and persistent company-document storage.
The repository includes a Render Blueprint in `render.yaml`; review current
provider plan pricing before creating resources, because the backend, database,
and persistent disk may incur charges. No resources have been provisioned by
this repository.

1. Push this repository to a private Git provider repository. Do not commit
   `.env` files or local databases.
2. In Render, create a Blueprint from the repository using `render.yaml`.
   During setup, set `CORS_ORIGINS` to a JSON array containing the exact HTTPS
   Vercel frontend origin, such as `["https://your-app.vercel.app"]`. The
   blueprint generates `SECRET_KEY` and configures a managed PostgreSQL
   database plus persistent storage for uploaded company documents.
3. In Vercel, import the repository and set the project root directory to
   `frontend`. Set `NEXT_PUBLIC_API_URL` to the HTTPS URL of the Render API
   service, then deploy. The frontend URL is public configuration, not a
   secret. If the Vercel domain changes, update Render's `CORS_ORIGINS`.
4. Verify `/health`, register a pilot user, and test login, workspace creation,
   simulation, supplier reports, and document upload/download. Configure and
   test database backups and restore before storing real company data.

The hosted AI assistant is not included in this pilot configuration: it expects
Ollama and the local machine's Ollama service cannot be reached from Render.
Core deterministic simulation still works; AI-assisted chat and explanations
require a privately reachable model service and deliberate secure configuration.
Password-reset endpoints are intentionally disabled outside development, so a
production recovery process must be designed before onboarding real users.
This is pilot deployment preparation, not a claim that the app is
production-certified.

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
