import networkx as nx
from sqlalchemy.orm import Session

from app.db_models.entities import SupplyNode, SupplyRoute


def build_company_graph(db: Session, company_id: int) -> nx.DiGraph:
    graph = nx.DiGraph()

    nodes = (
        db.query(SupplyNode)
        .filter(
            SupplyNode.company_id == company_id,
            SupplyNode.active.is_(True),
        )
        .all()
    )

    for node in nodes:
        graph.add_node(
            node.code,
            id=node.id,
            name=node.name,
            node_type=node.node_type,
            capacity=node.capacity,
            inventory=node.current_inventory,
            daily_demand=node.daily_demand,
            safety_stock=node.safety_stock,
        )

    routes = (
        db.query(SupplyRoute)
        .filter(
            SupplyRoute.company_id == company_id,
            SupplyRoute.active.is_(True),
        )
        .all()
    )

    node_id_to_code = {node.id: node.code for node in nodes}

    for route in routes:
        if route.source_node_id not in node_id_to_code or route.destination_node_id not in node_id_to_code:
            continue

        graph.add_edge(
            node_id_to_code[route.source_node_id],
            node_id_to_code[route.destination_node_id],
            transport_mode=route.transport_mode,
            base_cost=route.base_cost,
            lead_time_days=route.lead_time_days,
            capacity=route.capacity,
            fuel_dependency=route.fuel_dependency,
        )

    return graph
