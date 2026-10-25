from copy import deepcopy

import networkx as nx

from app.models import (
    NetworkDefinition,
    SimulationRequest,
    SimulationResult,
)

from app.simulation.graph_engine import (
    build_graph,
    calculate_best_route,
)

from app.simulation.inventory_engine import (
    calculate_inventory_impact,
)


def _apply_fuel_shock(
    graph: nx.DiGraph,
    increase_percent: float,
) -> None:

    if increase_percent <= 0:
        return

    multiplier = increase_percent / 100.0

    for _, _, edge in graph.edges(data=True):

        dependency = float(
            edge.get(
                "fuel_dependency",
                1.0,
            )
        )

        base_cost = float(
            edge["cost"]
        )

        edge["cost"] = (
            base_cost
            * (
                1
                + multiplier
                * dependency
            )
        )


def _apply_closures(
    graph: nx.DiGraph,
    request: SimulationRequest,
) -> None:

    for node_id in request.closed_nodes:

        if graph.has_node(node_id):
            graph.remove_node(node_id)

    for route_key in request.closed_routes:

        if "->" not in route_key:
            continue

        source, destination = (
            route_key.split(
                "->",
                1,
            )
        )

        source = source.strip()
        destination = destination.strip()

        if graph.has_edge(
            source,
            destination,
        ):
            graph.remove_edge(
                source,
                destination,
            )


def _calculate_replenishment_arrival_days(
    graph: nx.DiGraph,
    route: list[str],
    demand_node_ids: list[str],
) -> dict[str, float]:

    """
    Calculate cumulative travel time from the
    source to each demand-bearing node on the
    selected alternative route.
    """

    arrivals = {}

    cumulative_days = 0.0

    if not route:
        return arrivals

    if route[0] in demand_node_ids:
        arrivals[route[0]] = 0.0

    for source, destination in zip(
        route,
        route[1:],
    ):

        edge = graph.get_edge_data(
            source,
            destination,
        )

        if edge is None:
            continue

        cumulative_days += float(
            edge.get(
                "lead_time_days",
                0,
            )
        )

        if destination in demand_node_ids:
            arrivals[destination] = (
                cumulative_days
            )

    return arrivals


def simulate(
    network: NetworkDefinition,
    request: SimulationRequest,
) -> SimulationResult:

    # ---------------------------------------------
    # 1. BASELINE NETWORK VALIDATION & GRAPH
    # ---------------------------------------------

    if not network.nodes:
        raise ValueError(
            "The selected company's network has no supply-chain nodes configured yet. "
            "Add or import nodes before running this scenario."
        )

    if not network.routes:
        raise ValueError(
            "The selected company's network does not have any connected routes. "
            "Add or connect routes before running this scenario."
        )

    baseline_graph = build_graph(
        network
    )

    if not baseline_graph.has_node(request.source):
        raise ValueError(
            f"The selected company's network does not contain source node '{request.source}'. "
            "Please configure or connect the source node before running this scenario."
        )

    if not baseline_graph.has_node(request.destination):
        raise ValueError(
            f"The selected company's network does not contain destination node '{request.destination}'. "
            "Please configure or connect the destination node before running this scenario."
        )

    if not nx.has_path(baseline_graph, request.source, request.destination):
        raise ValueError(
            "The selected company's network does not contain a valid connected source and destination. "
            "Add or connect the required nodes before running this scenario."
        )

    baseline = calculate_best_route(
        baseline_graph,
        request.source,
        request.destination,
        weight="cost",
    )

    # ---------------------------------------------
    # 2. DISRUPTED NETWORK
    # ---------------------------------------------

    disrupted_graph = deepcopy(
        baseline_graph
    )

    _apply_closures(
        disrupted_graph,
        request,
    )

    _apply_fuel_shock(
        disrupted_graph,
        request
        .fuel_cost_increase_percent,
    )

    # ---------------------------------------------
    # 3. DEMAND-BEARING NODES
    # ---------------------------------------------

    demand_node_ids = [
        node.id
        for node in network.nodes
        if node.daily_demand > 0
    ]

    notes = []

    # ---------------------------------------------
    # 4. FIND ALTERNATIVE ROUTE
    # ---------------------------------------------

    try:

        disrupted = calculate_best_route(
            disrupted_graph,
            request.source,
            request.destination,
            weight="cost",
        )

        # -----------------------------------------
        # REPLENISHMENT ARRIVAL TIMES
        # -----------------------------------------

        replenishment_arrivals = (
            _calculate_replenishment_arrival_days(
                disrupted_graph,
                disrupted.route,
                demand_node_ids,
            )
        )

        affected_demand_nodes = [
            node_id
            for node_id in demand_node_ids
            if node_id in disrupted.route
        ]

        # -----------------------------------------
        # INVENTORY IMPACT
        # -----------------------------------------

        inventory_impact = (
            calculate_inventory_impact(
                network=network,
                disruption_days=(
                    request
                    .closure_duration_days
                ),
                affected_node_ids=(
                    affected_demand_nodes
                ),
                replenishment_arrival_days=(
                    replenishment_arrivals
                ),
            )
        )

        # -----------------------------------------
        # COST IMPACT
        # -----------------------------------------

        cost_change = (
            (
                disrupted.total_cost
                - baseline.total_cost
            )
            / baseline.total_cost
            * 100
            if baseline.total_cost > 0
            else 0
        )

        # -----------------------------------------
        # DELAY IMPACT
        # -----------------------------------------

        delay_change = (
            disrupted.lead_time_days
            - baseline.lead_time_days
        )

        # -----------------------------------------
        # ROUTE RISK
        # -----------------------------------------

        if (
            cost_change >= 30
            or delay_change >= 7
        ):
            risk_level = "HIGH"

        elif (
            cost_change >= 15
            or delay_change >= 3
        ):
            risk_level = "MEDIUM"

        else:
            risk_level = "LOW"

        # -----------------------------------------
        # INVENTORY RISK
        # -----------------------------------------

        inventory_risks = [
            item["inventory_risk"]
            for item in inventory_impact
        ]

        if "HIGH" in inventory_risks:
            risk_level = "HIGH"

        elif (
            "MEDIUM" in inventory_risks
            and risk_level == "LOW"
        ):
            risk_level = "MEDIUM"

        # -----------------------------------------
        # NOTES
        # -----------------------------------------

        if request.closed_nodes:

            notes.append(
                "Closed nodes: "
                + ", ".join(
                    request.closed_nodes
                )
            )

        if (
            request
            .closure_duration_days
            > 0
        ):

            notes.append(
                "Disruption duration: "
                f"{request.closure_duration_days} days"
            )

        if (
            request
            .fuel_cost_increase_percent
            > 0
        ):

            notes.append(
                "Fuel-related route costs "
                f"increased by "
                f"{request.fuel_cost_increase_percent}% "
                "according to each route's "
                "fuel dependency."
            )

        if (
            disrupted.route
            != baseline.route
        ):

            notes.append(
                "The optimal route changed "
                "because of the disruption."
            )

        if any(
            item["stockout_expected"]
            for item in inventory_impact
        ):

            notes.append(
                "At least one downstream "
                "location may run out of "
                "inventory before alternative "
                "replenishment arrives."
            )

        return SimulationResult(
            baseline=baseline,
            disrupted=disrupted,
            cost_change_percent=round(
                cost_change,
                2,
            ),
            delay_change_days=round(
                delay_change,
                2,
            ),
            risk_level=risk_level,
            inventory_impact=(
                inventory_impact
            ),
            notes=notes,
        )

    # ---------------------------------------------
    # 5. NO ALTERNATIVE ROUTE
    # ---------------------------------------------

    except (
        nx.NetworkXNoPath,
        nx.NodeNotFound,
    ):

        baseline_demand_nodes = [
            node_id
            for node_id in demand_node_ids
            if node_id in baseline.route
        ]

        inventory_impact = (
            calculate_inventory_impact(
                network=network,
                disruption_days=(
                    request
                    .closure_duration_days
                ),
                affected_node_ids=(
                    baseline_demand_nodes
                ),
                replenishment_arrival_days={},
            )
        )

        notes.append(
            "No feasible route remains "
            "after applying the disruption."
        )

        if (
            request
            .closure_duration_days
            > 0
        ):

            notes.append(
                "Disruption duration: "
                f"{request.closure_duration_days} days"
            )

        return SimulationResult(
            baseline=baseline,
            disrupted=None,
            cost_change_percent=None,
            delay_change_days=None,
            risk_level="CRITICAL",
            inventory_impact=(
                inventory_impact
            ),
            notes=notes,
        )
