from typing import Dict, List, Optional

from app.models import NetworkDefinition


def calculate_inventory_impact(
    network: NetworkDefinition,
    disruption_days: int,
    affected_node_ids: List[str],
    replenishment_arrival_days: Optional[
        Dict[str, float]
    ] = None,
) -> list[dict]:

    """
    Calculate deterministic inventory exposure.

    If an alternative replenishment arrival time is known,
    inventory is evaluated until that shipment reaches
    the demand-bearing node.

    AI does not calculate these values.
    """

    impacts = []

    if disruption_days <= 0:
        return impacts

    replenishment_arrival_days = (
        replenishment_arrival_days or {}
    )

    for node in network.nodes:

        if node.id not in affected_node_ids:
            continue

        if node.daily_demand <= 0:
            continue

        # -----------------------------------------
        # BASIC INVENTORY VALUES
        # -----------------------------------------

        days_of_inventory = (
            node.inventory
            / node.daily_demand
        )

        usable_before_safety_stock = max(
            node.inventory
            - node.safety_stock,
            0,
        )

        days_until_safety_stock = (
            usable_before_safety_stock
            / node.daily_demand
        )

        # -----------------------------------------
        # DEMAND DURING CLOSURE PERIOD
        # -----------------------------------------

        demand_during_disruption = (
            node.daily_demand
            * disruption_days
        )

        # -----------------------------------------
        # ALTERNATIVE REPLENISHMENT ARRIVAL
        # -----------------------------------------

        arrival_days = (
            replenishment_arrival_days.get(
                node.id
            )
        )

        # If we know when replacement supply arrives,
        # inventory exposure continues until arrival.
        # Otherwise use the disruption duration.
        evaluation_days = (
            arrival_days
            if arrival_days is not None
            else float(disruption_days)
        )

        # -----------------------------------------
        # PROJECTED INVENTORY
        # -----------------------------------------

        demand_until_replenishment = (
            node.daily_demand
            * evaluation_days
        )

        projected_inventory = (
            node.inventory
            - demand_until_replenishment
        )

        projected_shortage = max(
            -projected_inventory,
            0,
        )

        # -----------------------------------------
        # SHORTAGE BEFORE REPLENISHMENT
        # -----------------------------------------

        if arrival_days is not None:

            shortage_days_before_replenishment = max(
                arrival_days
                - days_of_inventory,
                0,
            )

            emergency_inventory_required = (
                shortage_days_before_replenishment
                * node.daily_demand
            )

        else:

            shortage_days_before_replenishment = 0
            emergency_inventory_required = 0

        # -----------------------------------------
        # RISK
        # -----------------------------------------

        safety_stock_breached = (
            projected_inventory
            < node.safety_stock
        )

        stockout_expected = (
            projected_inventory < 0
        )

        if stockout_expected:
            risk_level = "HIGH"

        elif safety_stock_breached:
            risk_level = "MEDIUM"

        else:
            risk_level = "LOW"

        # -----------------------------------------
        # RESULT
        # -----------------------------------------

        impacts.append(
            {
                "node_id":
                    node.id,

                "node_name":
                    node.name,

                "starting_inventory":
                    round(
                        node.inventory,
                        2,
                    ),

                "daily_demand":
                    round(
                        node.daily_demand,
                        2,
                    ),

                "safety_stock":
                    round(
                        node.safety_stock,
                        2,
                    ),

                "disruption_days":
                    disruption_days,

                "demand_during_disruption":
                    round(
                        demand_during_disruption,
                        2,
                    ),

                "days_of_inventory":
                    round(
                        days_of_inventory,
                        2,
                    ),

                "days_until_safety_stock":
                    round(
                        days_until_safety_stock,
                        2,
                    ),

                "projected_inventory":
                    round(
                        projected_inventory,
                        2,
                    ),

                "projected_shortage":
                    round(
                        projected_shortage,
                        2,
                    ),

                "replenishment_arrival_days": (
                    round(
                        arrival_days,
                        2,
                    )
                    if arrival_days
                    is not None
                    else None
                ),

                "shortage_days_before_replenishment":
                    round(
                        shortage_days_before_replenishment,
                        2,
                    ),

                "emergency_inventory_required":
                    round(
                        emergency_inventory_required,
                        2,
                    ),

                "safety_stock_breached":
                    safety_stock_breached,

                "stockout_expected":
                    stockout_expected,

                "inventory_risk":
                    risk_level,
            }
        )

    return impacts
