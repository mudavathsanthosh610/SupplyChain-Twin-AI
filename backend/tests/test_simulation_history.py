from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db_models.entities import (
    Company,
    Scenario,
    SimulationRun,
    SupplyNode,
    SupplyRoute,
    User,
    UserSession,
)
from app.db.session import get_db
from app.main import app
from app.auth import create_access_token


@pytest.fixture
def client_and_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with session_factory() as db:
        user = User(
            email="history-tests@example.test",
            display_name="History Tests",
            password_hash="not-used",
        )
        db.add(user)
        db.commit()
        user_id = user.id
        user_session = UserSession(id=str(uuid4()), user_id=user_id)
        db.add(user_session)
        db.commit()
        session_id = user_session.id

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.headers["Authorization"] = (
            f"Bearer {create_access_token(user_id, session_id)}"
        )
        yield client, session_factory, user_id
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_natural_simulation_is_persisted_and_history_is_company_scoped(
    client_and_session, monkeypatch
):
    client, session_factory, user_id = client_and_session
    with session_factory() as db:
        company = Company(name="History Test Company", owner_id=user_id)
        other_company = Company(name="Other History Company", owner_id=user_id)
        db.add_all([company, other_company])
        db.flush()
        db.add_all(
            [
                SupplyNode(
                    company_id=company.id,
                    code="SUP",
                    name="Supplier",
                    node_type="SUPPLIER",
                    capacity=1000,
                    current_inventory=1000,
                ),
                SupplyNode(
                    company_id=company.id,
                    code="CUS",
                    name="Customer",
                    node_type="CUSTOMER",
                    capacity=1000,
                    current_inventory=100,
                    daily_demand=10,
                ),
            ]
        )
        db.flush()
        supplier = (
            db.query(SupplyNode)
            .filter_by(company_id=company.id, code="SUP")
            .one()
        )
        customer = (
            db.query(SupplyNode)
            .filter_by(company_id=company.id, code="CUS")
            .one()
        )
        db.add(
            SupplyRoute(
                company_id=company.id,
                source_node_id=supplier.id,
                destination_node_id=customer.id,
                transport_mode="road",
                base_cost=100,
                lead_time_days=2,
                capacity=500,
                fuel_dependency=0.5,
            )
        )
        db.commit()
        company_id = company.id
        other_company_id = other_company.id

    monkeypatch.setattr(
        "app.main.parse_supply_chain_scenario",
        lambda *args, **kwargs: {
            "closed_nodes": [],
            "closed_routes": [],
            "closure_duration_days": 0,
            "fuel_cost_increase_percent": 10,
            "source": "SUP",
            "destination": "CUS",
        },
    )
    monkeypatch.setattr(
        "app.main.explain_simulation_result",
        lambda **kwargs: {
            "executive_summary": "Test result",
            "route_impact": "Test route impact",
            "inventory_impact": "Test inventory impact",
            "risk_explanation": "Test risk",
            "recommended_actions": [],
        },
    )

    response = client.post(
        "/simulate/natural",
        json={"company_id": company_id, "message": "Increase fuel costs by 10%"},
    )
    assert response.status_code == 200, response.text
    simulation_response = response.json()
    assert isinstance(simulation_response["history_id"], int)
    assert simulation_response["history_created_at"]
    assert simulation_response["simulation"]["baseline"]["route"] == ["SUP", "CUS"]

    history_response = client.get(
        f"/companies/{company_id}/simulation-history"
    )
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 1
    assert history[0]["id"] == simulation_response["history_id"]
    assert history[0]["message"] == "Increase fuel costs by 10%"
    assert history[0]["result"]["simulation"] == simulation_response["simulation"]
    assert [
        node["id"] for node in history[0]["result"]["network_snapshot"]["nodes"]
    ] == ["SUP", "CUS"]

    with session_factory() as db:
        scenario_without_run = Scenario(
            company_id=company_id,
            name="Unfinished scenario",
            user_message="Not simulation history",
            parsed_scenario={},
        )
        other_scenario = Scenario(
            company_id=other_company_id,
            name="Other company run",
            user_message="Other company run",
            parsed_scenario={},
        )
        db.add_all([scenario_without_run, other_scenario])
        db.flush()
        db.add(
            SimulationRun(
                scenario_id=other_scenario.id,
                result_payload={"user_message": "Other company run"},
            )
        )
        db.commit()

    clear_response = client.delete(
        f"/companies/{company_id}/simulation-history"
    )
    assert clear_response.status_code == 204
    assert client.get(
        f"/companies/{company_id}/simulation-history"
    ).json() == []
    other_history = client.get(
        f"/companies/{other_company_id}/simulation-history"
    )
    assert other_history.status_code == 200
    assert [entry["message"] for entry in other_history.json()] == [
        "Other company run"
    ]


def test_simulation_history_requires_an_existing_company(client_and_session):
    client, _, _ = client_and_session
    assert client.get("/companies/999/simulation-history").status_code == 404
    assert client.delete("/companies/999/simulation-history").status_code == 404


def test_api_root_redirects_to_documentation(client_and_session):
    client, _, _ = client_and_session
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"
