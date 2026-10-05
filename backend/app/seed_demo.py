from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.db_models.entities import Company, SupplyNode, SupplyRoute


def seed():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(Company).filter(Company.name == "Demo Global Supply Chain").first()
        if existing:
            print("Demo company already exists.")
            return

        company = Company(
            name="Demo Global Supply Chain",
            description="Synthetic demo workspace shipped with SupplyChain Twin AI.",
            is_demo=True,
        )
        db.add(company)
        db.flush()

        node_specs = [
            ("SH_SUP", "Shanghai Supplier", "SUPPLIER", 700, 0, 0, 0),
            ("SH_PORT", "Shanghai Port", "PORT", 700, 0, 0, 0),
            ("ROT", "Rotterdam Port", "PORT", 600, 0, 0, 0),
            ("ANT", "Antwerp Port", "PORT", 520, 0, 0, 0),
            ("HAM", "Hamburg Port", "PORT", 500, 0, 0, 0),
            ("FRA_WH", "Frankfurt Warehouse", "WAREHOUSE", 750, 5000, 400, 1200),
            ("BER", "Berlin Customer", "CUSTOMER", 500, 1000, 350, 500),
        ]

        nodes = {}
        for code, name, node_type, capacity, inventory, demand, safety in node_specs:
            node = SupplyNode(
                company_id=company.id,
                code=code,
                name=name,
                node_type=node_type,
                capacity=capacity,
                current_inventory=inventory,
                daily_demand=demand,
                safety_stock=safety,
            )
            db.add(node)
            db.flush()
            nodes[code] = node

        route_specs = [
            ("SH_SUP", "SH_PORT", "truck", 1500, 2, 700, 1.0),
            ("SH_PORT", "ROT", "sea", 9000, 14, 600, 0.7),
            ("ROT", "FRA_WH", "rail", 5000, 3, 500, 0.4),
            ("SH_PORT", "ANT", "sea", 9800, 15, 520, 0.7),
            ("ANT", "FRA_WH", "road", 6200, 4, 430, 1.0),
            ("SH_PORT", "HAM", "sea", 10200, 16, 500, 0.7),
            ("HAM", "FRA_WH", "rail", 5600, 4, 410, 0.4),
            ("FRA_WH", "BER", "road", 2900, 2, 450, 1.0),
        ]

        for source, destination, mode, cost, lead, capacity, fuel in route_specs:
            db.add(
                SupplyRoute(
                    company_id=company.id,
                    source_node_id=nodes[source].id,
                    destination_node_id=nodes[destination].id,
                    transport_mode=mode,
                    base_cost=cost,
                    lead_time_days=lead,
                    capacity=capacity,
                    fuel_dependency=fuel,
                )
            )

        db.commit()
        print("Demo supply chain seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
