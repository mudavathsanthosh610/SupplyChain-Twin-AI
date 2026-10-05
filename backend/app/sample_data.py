from app.models import (
    NetworkDefinition,
    SupplyNode,
    SupplyRoute,
)


SAMPLE_NETWORK = NetworkDefinition(
    nodes=[
        SupplyNode(
            id="SH_SUP",
            name="Shanghai Supplier",
            type="supplier",
            capacity=1000,
            inventory=12000,
            daily_demand=0,
            safety_stock=2000,
        ),

        SupplyNode(
            id="SH_PORT",
            name="Shanghai Port",
            type="port",
            capacity=900,
            inventory=7000,
            daily_demand=0,
            safety_stock=1000,
        ),

        SupplyNode(
            id="ROT",
            name="Rotterdam Port",
            type="port",
            capacity=800,
            inventory=4000,
            daily_demand=0,
            safety_stock=800,
        ),

        SupplyNode(
            id="ANT",
            name="Antwerp Port",
            type="port",
            capacity=700,
            inventory=3500,
            daily_demand=0,
            safety_stock=700,
        ),

        SupplyNode(
            id="HAM",
            name="Hamburg Port",
            type="port",
            capacity=650,
            inventory=3200,
            daily_demand=0,
            safety_stock=650,
        ),

        SupplyNode(
            id="FRA_WH",
            name="Frankfurt Warehouse",
            type="warehouse",
            capacity=750,
            inventory=5000,
            daily_demand=400,
            safety_stock=1200,
        ),

        SupplyNode(
            id="BER",
            name="Berlin Customer",
            type="customer",
            capacity=500,
            inventory=1000,
            daily_demand=350,
            safety_stock=500,
        ),
    ],

    routes=[
        SupplyRoute(
            source="SH_SUP",
            destination="SH_PORT",
            transport_mode="truck",
            cost=1500,
            lead_time_days=2,
            capacity=700,
            fuel_dependency=1.0,
        ),

        SupplyRoute(
            source="SH_PORT",
            destination="ROT",
            transport_mode="sea",
            cost=9000,
            lead_time_days=14,
            capacity=600,
            fuel_dependency=0.7,
        ),

        SupplyRoute(
            source="ROT",
            destination="FRA_WH",
            transport_mode="rail",
            cost=5000,
            lead_time_days=3,
            capacity=500,
            fuel_dependency=0.4,
        ),

        SupplyRoute(
            source="SH_PORT",
            destination="ANT",
            transport_mode="sea",
            cost=9800,
            lead_time_days=15,
            capacity=520,
            fuel_dependency=0.7,
        ),

        SupplyRoute(
            source="ANT",
            destination="FRA_WH",
            transport_mode="road",
            cost=6200,
            lead_time_days=4,
            capacity=430,
            fuel_dependency=1.0,
        ),

        SupplyRoute(
            source="SH_PORT",
            destination="HAM",
            transport_mode="sea",
            cost=10200,
            lead_time_days=16,
            capacity=500,
            fuel_dependency=0.7,
        ),

        SupplyRoute(
            source="HAM",
            destination="FRA_WH",
            transport_mode="rail",
            cost=5600,
            lead_time_days=4,
            capacity=410,
            fuel_dependency=0.4,
        ),

        SupplyRoute(
            source="FRA_WH",
            destination="BER",
            transport_mode="road",
            cost=2900,
            lead_time_days=2,
            capacity=450,
            fuel_dependency=1.0,
        ),
    ],
)
