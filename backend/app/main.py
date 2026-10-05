from fastapi import (

    Depends,

    FastAPI,

    HTTPException,

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

    SupplyNode,

    SupplyRoute,

)



from app.models import (

    NetworkDefinition,

    SimulationRequest,

)



from app.routers import (

    companies,

    network,

    public_directory,

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

    allow_origins=[

        "http://localhost:3000",

        "http://127.0.0.1:3000",

    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)





# -------------------------------------------------

# Production CRUD APIs

# -------------------------------------------------



app.include_router(

    companies.router

)



app.include_router(

    network.router

)


app.include_router(

    public_directory.router

)





class NaturalLanguageScenario(BaseModel):

    message: str



    # Existing frontend does not send company_id yet.

    # Default demo company = 1.

    company_id: int = 1





# -------------------------------------------------

# DATABASE -> NETWORK DEFINITION

# -------------------------------------------------



def load_company_network(

    db: Session,

    company_id: int,

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

        raise HTTPException(

            status_code=400,

            detail=(

                "This company has no "

                "active supply-chain nodes."

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

                    (

                        "factory"

                        if (

                            node.node_type

                            .strip()

                            .upper()

                            == "PLANT"

                        )

                        else (

                            node.node_type

                            .strip()

                            .lower()

                        )

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







def adapt_scenario_to_company(
    parsed: dict,
    message: str,
    company_network: NetworkDefinition,
) -> dict:
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
    )

    if any(word in lower_message for word in closure_words):
        for node in company_network.nodes:
            if (
                node.id.lower() in lower_message
                or node.name.lower() in lower_message
            ):
                detected_closed_nodes.append(node.id)

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

    source = adapted.get("source")
    destination = adapted.get("destination")

    if source not in node_ids:
        suppliers = [
            node.id
            for node in company_network.nodes
            if node.type == "supplier"
        ]
        source = (
            suppliers[0]
            if suppliers
            else company_network.nodes[0].id
        )

    if destination not in node_ids:
        customers = [
            node.id
            for node in company_network.nodes
            if node.type == "customer"
        ]
        destination = (
            customers[0]
            if customers
            else company_network.nodes[-1].id
        )

    adapted["source"] = source
    adapted["destination"] = destination

    adapted.setdefault("closure_duration_days", 0)
    adapted.setdefault("fuel_cost_increase_percent", 0)

    return adapted



# -------------------------------------------------

# HEALTH

# -------------------------------------------------



@app.get("/health")

def health():

    return {

        "status": "ok",

        "ai_model": "qwen2.5:3b",

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

    db: Session = Depends(

        get_db

    ),

):

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

    db: Session = Depends(

        get_db

    ),

):

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

    db: Session = Depends(

        get_db

    ),

):



    try:



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

                request.message

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



        return {

            "company_id":

                request.company_id,



            "user_message":

                request.message,



            "parsed_scenario":

                simulation_request

                .model_dump(),



            "simulation":

                simulation_result,



            "ai_explanation":

                ai_explanation,

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