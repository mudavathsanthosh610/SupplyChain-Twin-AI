import re

from fastapi import (

    Depends,

    FastAPI,

    HTTPException,

)
from fastapi.responses import RedirectResponse

from app.config import settings
from app.auth import (
    get_current_user,
    log_workspace_activity,
    require_company_read_access,
    require_company_write_access,
)
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from sqlalchemy.orm import Session



from app.agent.ollama_parser import (

    parse_supply_chain_scenario,

)



from app.agent.result_explainer import (

    explain_simulation_result,

)



from app.db.session import get_db



from app.db_models.entities import (

    Company,
    SupplyRoute,
    SupplyNode,

    Scenario,
    SimulationRun,
    User,
)



from app.models import (

    NetworkDefinition,

    SimulationRequest,

)



from app.routers import (
    assistant,
    companies,
    collaboration,
    control_tower,
    network,
    notifications,
    public_directory,
    supplier_risk,
    supplier_performance,
    simulation_history,
    auth,

)



from app.sample_data import SAMPLE_NETWORK



from app.simulation.disruption_engine import (

    simulate,

)





app = FastAPI(

    title="SupplyChain Twin AI",

    version="0.4.2",

    description=(

        "AI-powered deterministic supply-chain "

        "digital twin using Ollama, FastAPI, "

        "NetworkX and database-backed networks."

    ),

)





# -------------------------------------------------

# CORS

# -------------------------------------------------



app.add_middleware(

    CORSMiddleware,
    allow_origins=settings.cors_origins,

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)





# -------------------------------------------------

# Production CRUD APIs

# -------------------------------------------------



app.include_router(
    auth.router
)

app.include_router(
    collaboration.router
)

app.include_router(
    notifications.router
)

app.include_router(
    companies.router
)

app.include_router(
    assistant.router
)

app.include_router(
    control_tower.router
)

app.include_router(
    simulation_history.router
)



app.include_router(
    network.router

)

app.include_router(
    supplier_performance.router
)

app.include_router(
    supplier_risk.router
)


app.include_router(

    public_directory.router

)





class NaturalLanguageScenario(BaseModel):

    message: str

    company_id: int = 1





# -------------------------------------------------
# DATABASE -> NETWORK DEFINITION
# -------------------------------------------------


def simulation_node_type(node_type: str) -> str:
    normalized_type = node_type.strip().upper()

    if normalized_type == "PLANT":
        return "factory"
    if normalized_type in {"WAREHOUSE", "DISTRIBUTION_CENTER"}:
        return "warehouse"

    return normalized_type.lower()


def load_company_network(

    db: Session,

    company_id: int,

    allow_empty: bool = False,

) -> NetworkDefinition:



    company = db.get(

        Company,

        company_id,

    )



    if company is None:

        raise HTTPException(

            status_code=404,

            detail=(

                f"Company/workspace "

                f"{company_id} not found."

            ),

        )



    db_nodes = (

        db.query(SupplyNode)

        .filter(

            SupplyNode.company_id

            == company_id,

            SupplyNode.active.is_(True),

        )

        .order_by(

            SupplyNode.id

        )

        .all()

    )



    if not db_nodes:

        if allow_empty:

            return NetworkDefinition(nodes=[], routes=[])

        raise HTTPException(

            status_code=400,

            detail=(

                "The selected company's network has no active supply-chain nodes. "

                "Add or import nodes before running this scenario."

            ),

        )



    db_routes = (

        db.query(SupplyRoute)

        .filter(

            SupplyRoute.company_id

            == company_id,

            SupplyRoute.active.is_(True),

        )

        .order_by(

            SupplyRoute.id

        )

        .all()

    )



    node_id_to_code = {

        node.id: node.code

        for node in db_nodes

    }



    nodes = []



    for node in db_nodes:



        nodes.append(

            {

                "id":
                    node.code,



                "name":

                    node.name,



                "type":
                    simulation_node_type(
                        node.node_type
                    ),



                "capacity":

                    (

                        node.capacity

                        if node.capacity

                        is not None

                        else 0

                    ),



                "inventory":

                    node.current_inventory,



                "daily_demand":

                    node.daily_demand,



                "safety_stock":

                    node.safety_stock,

            }

        )



    routes = []



    for route in db_routes:



        source_code = (

            node_id_to_code.get(

                route.source_node_id

            )

        )



        destination_code = (

            node_id_to_code.get(

                route.destination_node_id

            )

        )



        if (

            source_code is None

            or destination_code is None

        ):

            continue



        routes.append(

            {

                "source":

                    source_code,



                "destination":

                    destination_code,



                "transport_mode":

                    route.transport_mode,



                "cost":

                    route.base_cost,



                "lead_time_days":

                    route.lead_time_days,



                "capacity":

                    route.capacity,



                "fuel_dependency":

                    route.fuel_dependency,

            }

        )



    return NetworkDefinition.model_validate(

        {

            "nodes": nodes,

            "routes": routes,

        }

    )


def match_scenario_network_targets(
    message: str,
    company_network: NetworkDefinition,
) -> tuple[list[str], list[str]]:
    normalized_message = re.sub(r"[^a-z0-9]+", " ", message.casefold()).strip()
    generic_location_terms = {
        "center",
        "customer",
        "distribution",
        "factory",
        "facility",
        "hub",
        "location",
        "plant",
        "port",
        "site",
        "supplier",
        "warehouse",
    }

    def phrase_position(phrase: str) -> int | None:
        normalized_phrase = re.sub(r"[^a-z0-9]+", " ", phrase.casefold()).strip()
        if not normalized_phrase:
            return None
        match = re.search(
            rf"(?<![a-z0-9]){re.escape(normalized_phrase)}(?![a-z0-9])",
            normalized_message,
        )
        return match.start() if match else None

    node_positions: dict[str, int] = {}
    token_nodes: dict[str, set[str]] = {}
    node_tokens: dict[str, set[str]] = {}

    for node in company_network.nodes:
        node_id = node.id
        position = phrase_position(node_id)
        if position is not None:
            node_positions[node_id] = position

        normalized_name = re.sub(
            r"[^a-z0-9]+", " ", node.name.casefold()
        ).strip()
        position = phrase_position(normalized_name)
        if position is not None:
            node_positions[node_id] = min(
                position, node_positions.get(node_id, position)
            )

        meaningful_tokens = {
            token
            for token in re.findall(r"[a-z0-9]+", normalized_name)
            if token not in generic_location_terms and len(token) > 2
        }
        node_tokens[node_id] = meaningful_tokens
        for token in meaningful_tokens:
            token_nodes.setdefault(token, set()).add(node_id)

    for token, node_ids in token_nodes.items():
        if len(node_ids) != 1:
            continue
        position = phrase_position(token)
        if position is None:
            continue
        node_id = next(iter(node_ids))
        node_positions[node_id] = min(
            position, node_positions.get(node_id, position)
        )

    route_intent = bool(
        re.search(
            r"\b(route|routes|lane|lanes|link|links|connection|connections|corridor|between)\b",
            normalized_message,
        )
        or re.search(r"\bfrom\b.+\bto\b", normalized_message)
    )
    if route_intent:
        matching_routes = [
            route
            for route in company_network.routes
            if route.source in node_positions
            and route.destination in node_positions
            and node_positions[route.source] < node_positions[route.destination]
        ]
        if len(matching_routes) == 1:
            route = matching_routes[0]
            return [], [f"{route.source}->{route.destination}"]
        return [], []

    return sorted(node_positions, key=node_positions.get), []


def adapt_scenario_to_company(
    parsed: dict,
    message: str,
    company_network: NetworkDefinition,
) -> dict:
    if not company_network.nodes:
        raise HTTPException(
            status_code=400,
            detail=(
                "The selected company's network has no supply-chain nodes configured yet. "
                "Add or import nodes before running this scenario."
            ),
        )
    if not company_network.routes:
        raise HTTPException(
            status_code=400,
            detail=(
                "The selected company's network has no routes configured yet. "
                "Add or import routes before running this scenario."
            ),
        )

    adapted = dict(parsed)

    node_ids = {
        node.id
        for node in company_network.nodes
    }

    lower_message = message.lower()
    valid_closed_nodes = [
        node_id
        for node_id in adapted.get("closed_nodes", [])
        if node_id in node_ids
    ]

    detected_closed_nodes = []

    closure_words = (
        "close",
        "closed",
        "closure",
        "shut",
        "shutdown",
        "unavailable",
        "block",
        "blocked",
        "disrupt",
        "disrupted",
        "strike",
        "halt",
        "down",
        "offline",
        "damage",
        "damaged",
    )

    has_closure_intent = any(
        re.search(rf"\b{re.escape(word)}\b", lower_message)
        for word in closure_words
    )

    if has_closure_intent:
        matched_nodes, matched_routes = match_scenario_network_targets(
            message, company_network
        )
        detected_closed_nodes.extend(matched_nodes)
    else:
        matched_routes = []

    adapted["closed_nodes"] = list(
        dict.fromkeys(
            valid_closed_nodes + detected_closed_nodes
        )
    )

    valid_route_keys = {
        f"{route.source}->{route.destination}"
        for route in company_network.routes
    }

    adapted["closed_routes"] = [
        route_key
        for route_key in adapted.get("closed_routes", [])
        if route_key in valid_route_keys
    ]
    adapted["closed_routes"] = list(
        dict.fromkeys(adapted["closed_routes"] + matched_routes)
    )

    if (
        has_closure_intent
        and not adapted["closed_nodes"]
        and not adapted["closed_routes"]
    ):
        available_locations = ", ".join(
            f"{node.id} ({node.name})"
            for node in company_network.nodes
        )
        available_routes = ", ".join(
            f"{route.source} -> {route.destination}"
            for route in company_network.routes
        )
        raise HTTPException(
            status_code=422,
            detail=(
                "The requested facility or route does not match this company's network. "
                f"Available locations: {available_locations}. "
                f"Available routes: {available_routes}."
            ),
        )

    # Resolve source and destination
    import networkx as nx
    from app.simulation.graph_engine import build_graph

    graph = build_graph(company_network)

    source = adapted.get("source")
    destination = adapted.get("destination")

    suppliers = [
        node.id
        for node in company_network.nodes
        if node.type == "supplier"
    ]
    customers = [
        node.id
        for node in company_network.nodes
        if node.type == "customer"
    ]

    # Verify if provided source & destination form a valid connected path
    connected = False
    if source in node_ids and destination in node_ids and source != destination:
        if nx.has_path(graph, source, destination):
            connected = True

    if not connected:
        # Search for any valid supplier -> customer path
        src_candidates = suppliers if suppliers else list(node_ids)
        dst_candidates = customers if customers else list(reversed(list(node_ids)))

        for s in src_candidates:
            for d in dst_candidates:
                if s != d and nx.has_path(graph, s, d):
                    source = s
                    destination = d
                    connected = True
                    break
            if connected:
                break

    if not connected:
        source = suppliers[0] if suppliers else company_network.nodes[0].id
        destination = customers[0] if customers else company_network.nodes[-1].id

    adapted["source"] = source
    adapted["destination"] = destination

    adapted.setdefault("closure_duration_days", 0)
    adapted.setdefault("fuel_cost_increase_percent", 0)

    return adapted



# -------------------------------------------------

# HEALTH

# -------------------------------------------------

@app.get("/", include_in_schema=False)
def api_root():
    return RedirectResponse(url="/docs")


@app.get("/health")

def health():

    return {

        "status": "ok",

        "ai_model": "qwen2.5:3b",
        "assistant_model": settings.ollama_model,

        "database_networks": True,

        "version": "0.4.2",

    }





# -------------------------------------------------

# OLD SAMPLE NETWORK

# Kept for compatibility/testing

# -------------------------------------------------



@app.get("/network/sample")

def get_sample_network():

    return SAMPLE_NETWORK





@app.post("/simulate/sample")

def simulate_sample(

    request: SimulationRequest,

):

    return simulate(

        SAMPLE_NETWORK,

        request,

    )





# -------------------------------------------------

# CUSTOM NETWORK BODY

# Existing endpoint kept

# -------------------------------------------------



@app.post("/simulate")

def simulate_custom(

    network: NetworkDefinition,

    request: SimulationRequest,

):

    return simulate(

        network,

        request,

    )





# -------------------------------------------------

# DATABASE NETWORK VIEW

# -------------------------------------------------



@app.get(

    "/network/company/{company_id}"

)

def get_company_network(

    company_id: int,
    current_user: User = Depends(get_current_user),

    db: Session = Depends(

        get_db

    ),

):
    require_company_read_access(company_id, current_user, db)

    network_definition = (

        load_company_network(

            db,

            company_id,

        )

    )



    return {

        "company_id":

            company_id,



        "network":

            network_definition,

    }





# -------------------------------------------------

# DATABASE DETERMINISTIC SIMULATION

# -------------------------------------------------



@app.post(

    "/simulate/company/{company_id}"

)

def simulate_company(

    company_id: int,

    request: SimulationRequest,
    current_user: User = Depends(get_current_user),

    db: Session = Depends(

        get_db

    ),

):
    require_company_write_access(company_id, current_user, db)

    network_definition = (

        load_company_network(

            db,

            company_id,

        )

    )



    return simulate(

        network_definition,

        request,

    )





# -------------------------------------------------

# NATURAL LANGUAGE + DATABASE

# -------------------------------------------------



@app.post("/simulate/natural")

def simulate_natural(

    request: NaturalLanguageScenario,
    current_user: User = Depends(get_current_user),

    db: Session = Depends(

        get_db

    ),

):



    try:
        require_company_write_access(request.company_id, current_user, db)



        # -----------------------------------------

        # 1. Load selected company network

        # -----------------------------------------



        company_network = (

            load_company_network(

                db,

                request.company_id,

            )

        )



        # -----------------------------------------

        # 2. AI parses natural language

        # -----------------------------------------



        parsed = (

            parse_supply_chain_scenario(
                request.message,
                available_nodes=[
                    node.model_dump()
                    for node in company_network.nodes
                ],
                available_routes=[
                    route.model_dump()
                    for route in company_network.routes
                ],
            )

        )



        # -----------------------------------------

        # 3. Validate parsed scenario

        # -----------------------------------------



        adapted = adapt_scenario_to_company(
            parsed=parsed,
            message=request.message,
            company_network=company_network,
        )

        simulation_request = (
            SimulationRequest.model_validate(
                adapted
            )
        )



        # -----------------------------------------

        # 4. Deterministic DB-backed simulation

        # -----------------------------------------



        simulation_result = simulate(

            company_network,

            simulation_request,

        )

        source_types = [
            data_source_type
            for (data_source_type,) in (
                db.query(SupplyNode.data_source_type)
                .filter(
                    SupplyNode.company_id == request.company_id,
                    SupplyNode.active.is_(True),
                )
                .all()
            )
        ] + [
            data_source_type
            for (data_source_type,) in (
                db.query(SupplyRoute.data_source_type)
                .filter(
                    SupplyRoute.company_id == request.company_id,
                    SupplyRoute.active.is_(True),
                )
                .all()
            )
        ]
        if any(
            source_type
            and (
                "DEMO" in source_type.upper()
                or "SYNTHETIC" in source_type.upper()
            )
            for source_type in source_types
        ):
            simulation_result.notes.append(
                "This workspace contains DEMO / SYNTHETIC operational data; results are examples, not verified company data."
            )



        # -----------------------------------------

        # 5. AI explains verified results

        # -----------------------------------------



        ai_explanation = (

            explain_simulation_result(

                user_message=(

                    request.message

                ),



                parsed_scenario=(

                    simulation_request

                    .model_dump()

                ),



                simulation_result=(

                    simulation_result

                ),

            )

        )



        # -----------------------------------------

        # 6. Final response

        # -----------------------------------------



        result_payload = {
            "company_id": request.company_id,
            "user_message": request.message,
            "parsed_scenario": simulation_request.model_dump(mode="json"),
            "network_snapshot": company_network.model_dump(mode="json"),
            "simulation": simulation_result.model_dump(mode="json"),
            "ai_explanation": ai_explanation,
        }
        scenario = Scenario(
            company_id=request.company_id,
            name=request.message[:200],
            user_message=request.message,
            parsed_scenario=simulation_request.model_dump(mode="json"),
        )
        db.add(scenario)
        db.flush()

        run = SimulationRun(
            scenario_id=scenario.id,
            status="COMPLETED",
            result_payload=result_payload,
        )
        db.add(run)
        log_workspace_activity(
            db,
            request.company_id,
            current_user,
            "simulation_run",
            f"Ran scenario: {request.message[:450]}",
        )
        db.commit()
        db.refresh(run)

        return {
            **result_payload,
            "history_id": run.id,
            "history_created_at": run.created_at,
        }



    except HTTPException:

        raise



    except Exception as error:



        raise HTTPException(

            status_code=500,

            detail=(

                "AI simulation failed: "

                f"{error}"

            ),

        )