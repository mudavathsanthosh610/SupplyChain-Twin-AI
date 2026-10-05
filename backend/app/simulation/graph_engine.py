import networkx as nx
from sqlalchemy.orm import Session

from app.models import NetworkDefinition, RouteResult
from app.db_models.entities import SupplyNode, SupplyRoute


def build_graph(network: NetworkDefinition) -> nx.DiGraph:
    """
    Existing prototype graph builder.
    Keeps the current simulation flow working.
    """
    graph = nx.DiGraph()

    for node in network.nodes:
        graph.add_node(
            node.id,
            name=node.name,
            type=node.type,
            capacity=node.capacity,
            inventory=node.inventory,
        )

    for route in network.routes:
        graph.add_edge(
            route.source,
            route.destination,
            cost=route.cost,
            lead_time_days=route.lead_time_days,
            capacity=route.capacity,
            fuel_dependency=route.fuel_dependency,
            transport_mode=route.transport_mode,
        )

    return graph


def build_graph_from_database(
    db: Session,
    company_id: int,
) -> nx.DiGraph:
    """
    Production graph builder.

    Builds the supply-chain graph from database-backed
    nodes and routes belonging to one company/workspace.
    """
    graph = nx.DiGraph()

    nodes = (
        db.query(SupplyNode)
        .filter(
            SupplyNode.company_id == company_id,
            SupplyNode.active.is_(True),
        )
        .all()
    )

    node_id_to_code = {}

    for node in nodes:
        node_id_to_code[node.id] = node.code

        graph.add_node(
            node.code,
            name=node.name,
            type=node.node_type,
            capacity=node.capacity,
            inventory=node.current_inventory,
            daily_demand=node.daily_demand,
            safety_stock=node.safety_stock,
            database_id=node.id,
        )

    routes = (
        db.query(SupplyRoute)
        .filter(
            SupplyRoute.company_id == company_id,
            SupplyRoute.active.is_(True),
        )
        .all()
    )

    for route in routes:
        source_code = node_id_to_code.get(
            route.source_node_id
        )

        destination_code = node_id_to_code.get(
            route.destination_node_id
        )

        if not source_code or not destination_code:
            continue

        graph.add_edge(
            source_code,
            destination_code,
            cost=route.base_cost,
            lead_time_days=route.lead_time_days,
            capacity=route.capacity,
            fuel_dependency=route.fuel_dependency,
            transport_mode=route.transport_mode,
            database_id=route.id,
        )

    return graph


def calculate_best_route(
    graph: nx.DiGraph,
    source: str,
    destination: str,
    weight: str = "cost",
) -> RouteResult:
    path = nx.shortest_path(
        graph,
        source=source,
        target=destination,
        weight=weight,
    )

    total_cost = 0.0
    total_lead = 0.0
    capacities = []

    for i in range(len(path) - 1):
        edge = graph[
            path[i]
        ][
            path[i + 1]
        ]

        total_cost += float(
            edge["cost"]
        )

        total_lead += float(
            edge["lead_time_days"]
        )

        capacities.append(
            float(
                edge["capacity"]
            )
        )

    return RouteResult(
        route=path,
        total_cost=round(
            total_cost,
            2,
        ),
        lead_time_days=round(
            total_lead,
            2,
        ),
        bottleneck_capacity=round(
            min(capacities)
            if capacities
            else 0.0,
            2,
        ),
    )
