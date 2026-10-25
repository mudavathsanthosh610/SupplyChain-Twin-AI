import pytest
from fastapi import HTTPException

from app.main import adapt_scenario_to_company
from app.models import NetworkDefinition


@pytest.fixture
def demo_network():
    return NetworkDefinition.model_validate(
        {
            "nodes": [
                {
                    "id": "SH_SUP",
                    "name": "Shanghai Supplier",
                    "type": "supplier",
                    "capacity": 1000,
                },
                {
                    "id": "SH_PORT",
                    "name": "Shanghai Port",
                    "type": "port",
                    "capacity": 900,
                },
                {
                    "id": "ROT",
                    "name": "Rotterdam Port",
                    "type": "port",
                    "capacity": 800,
                },
                {
                    "id": "FRA_WH",
                    "name": "Frankfurt Warehouse",
                    "type": "warehouse",
                    "capacity": 750,
                },
                {
                    "id": "BER",
                    "name": "Berlin Customer",
                    "type": "customer",
                    "capacity": 500,
                },
            ],
            "routes": [
                {
                    "source": "SH_SUP",
                    "destination": "SH_PORT",
                    "cost": 100,
                    "lead_time_days": 2,
                    "capacity": 500,
                },
                {
                    "source": "ROT",
                    "destination": "FRA_WH",
                    "cost": 200,
                    "lead_time_days": 3,
                    "capacity": 400,
                },
                {
                    "source": "FRA_WH",
                    "destination": "BER",
                    "cost": 100,
                    "lead_time_days": 1,
                    "capacity": 300,
                },
            ],
        }
    )


@pytest.fixture
def empty_scenario():
    return {
        "closed_nodes": [],
        "closed_routes": [],
        "closure_duration_days": 3,
        "fuel_cost_increase_percent": 0,
        "source": "SH_SUP",
        "destination": "BER",
    }


@pytest.mark.parametrize(
    ("message", "expected_node"),
    [
        ("Close Rotterdam Port for 3 days", "ROT"),
        ("Shut down the port in Rotterdam for 3 days", "ROT"),
        ("Disrupt the Frankfurt warehouse", "FRA_WH"),
    ],
)
def test_matches_facilities_from_common_name_variants(
    demo_network, empty_scenario, message, expected_node
):
    adapted = adapt_scenario_to_company(
        empty_scenario, message, demo_network
    )
    assert adapted["closed_nodes"] == [expected_node]
    assert adapted["closed_routes"] == []


def test_matches_route_by_endpoint_city_names(
    demo_network, empty_scenario
):
    adapted = adapt_scenario_to_company(
        empty_scenario,
        "Close the route from Rotterdam to Frankfurt for 3 days",
        demo_network,
    )
    assert adapted["closed_routes"] == ["ROT->FRA_WH"]
    assert adapted["closed_nodes"] == []


def test_unknown_target_still_returns_available_network_details(
    demo_network, empty_scenario
):
    with pytest.raises(HTTPException) as error:
        adapt_scenario_to_company(
            empty_scenario,
            "Close the Mumbai port for 3 days",
            demo_network,
        )

    assert error.value.status_code == 422
    assert "Available locations:" in error.value.detail
    assert "Rotterdam Port" in error.value.detail
