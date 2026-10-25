from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db_models.entities import (
    Company,
    PasswordResetToken,
    User,
    UserNotification,
)
from app.config import settings
from app.db.session import get_db
from app.main import app


@pytest.fixture
def auth_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with session_factory() as db:
        legacy = Company(name="Legacy Demo Workspace")
        db.add(legacy)
        db.commit()
        legacy_id = legacy.id

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, session_factory, legacy_id
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def register(client: TestClient, email: str, name: str = "Test User"):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "display_name": name,
            "password": "secure-password-123",
        },
    )


def test_registration_and_login_issue_authenticated_account(auth_client):
    client, _, _ = auth_client
    registered = register(client, "  ALICE@example.test ")
    assert registered.status_code == 201, registered.text
    assert registered.json()["user"]["email"] == "alice@example.test"
    assert registered.json()["token_type"] == "bearer"

    client.headers["Authorization"] = (
        f"Bearer {registered.json()['access_token']}"
    )
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Test User"

    login = client.post(
        "/auth/login",
        json={"email": "alice@example.test", "password": "secure-password-123"},
    )
    assert login.status_code == 200
    assert client.post(
        "/auth/login",
        json={"email": "alice@example.test", "password": "wrong-password"},
    ).status_code == 401
    assert register(client, "alice@example.test").status_code == 409


def test_logout_revokes_only_the_current_persistent_session(auth_client):
    client, _, _ = auth_client
    registered = register(client, "alice@example.test")
    token = registered.json()["access_token"]

    client.headers["Authorization"] = f"Bearer {token}"
    assert client.get("/auth/me").status_code == 200
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401

    login = client.post(
        "/auth/login",
        json={"email": "alice@example.test", "password": "secure-password-123"},
    )
    assert login.status_code == 200
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    assert client.get("/auth/me").status_code == 200

    client.headers["Authorization"] = f"Bearer {token}"
    assert client.get("/auth/me").status_code == 401


def test_password_reset_changes_password_and_revokes_sessions(auth_client):
    client, session_factory, _ = auth_client
    registration = register(client, "alice@example.test").json()
    reset_response = client.post(
        "/auth/forgot-password",
        json={"email": "ALICE@example.test"},
    )

    assert reset_response.status_code == 200, reset_response.text
    reset_data = reset_response.json()
    reset_token = reset_data["reset_token"]
    assert reset_data["expires_in_minutes"] == 30
    with session_factory() as db:
        stored_token = db.query(PasswordResetToken).one()
        assert stored_token.token_hash != reset_token
        assert len(stored_token.token_hash) == 64

    client.headers["Authorization"] = f"Bearer {registration['access_token']}"
    response = client.post(
        "/auth/reset-password",
        json={"token": reset_token, "new_password": "a-new-secure-password"},
    )
    assert response.status_code == 200, response.text
    assert client.get("/auth/me").status_code == 401
    assert client.post(
        "/auth/login",
        json={"email": "alice@example.test", "password": "secure-password-123"},
    ).status_code == 401
    login = client.post(
        "/auth/login",
        json={"email": "alice@example.test", "password": "a-new-secure-password"},
    )
    assert login.status_code == 200, login.text
    assert client.post(
        "/auth/reset-password",
        json={"token": reset_token, "new_password": "another-secure-password"},
    ).status_code == 400


def test_password_reset_tokens_expire_and_unknown_emails_are_generic(auth_client):
    client, session_factory, _ = auth_client
    unknown = client.post(
        "/auth/forgot-password",
        json={"email": "unknown@example.test"},
    )
    assert unknown.status_code == 200
    assert "reset_token" not in unknown.json()

    register(client, "alice@example.test")
    reset_token = client.post(
        "/auth/forgot-password",
        json={"email": "alice@example.test"},
    ).json()["reset_token"]
    with session_factory() as db:
        token_record = db.query(PasswordResetToken).one()
        token_record.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

    expired = client.post(
        "/auth/reset-password",
        json={"token": reset_token, "new_password": "a-new-secure-password"},
    )
    assert expired.status_code == 400


def test_password_reset_endpoints_are_disabled_outside_development(
    auth_client, monkeypatch
):
    client, _, _ = auth_client
    monkeypatch.setattr(settings, "environment", "production")

    request_response = client.post(
        "/auth/forgot-password",
        json={"email": "alice@example.test"},
    )
    reset_response = client.post(
        "/auth/reset-password",
        json={"token": "x" * 43, "new_password": "a-new-secure-password"},
    )
    assert request_response.status_code == 503
    assert reset_response.status_code == 503


def test_workspace_invites_enforce_roles_and_record_collaboration_activity(auth_client):
    client, _, _ = auth_client
    owner = register(client, "owner@example.test").json()
    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    created = client.post(
        "/companies",
        json={"name": "Shared Workspace"},
    )
    assert created.status_code == 200, created.text
    company_id = created.json()["id"]

    invite = client.post(
        f"/companies/{company_id}/invites",
        json={"role": "viewer"},
    )
    assert invite.status_code == 201, invite.text
    assert "token_hash" not in invite.json()

    viewer = register(client, "viewer@example.test").json()
    client.headers["Authorization"] = f"Bearer {viewer['access_token']}"
    accepted = client.post(
        "/invites/accept",
        json={"token": invite.json()["token"]},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json() == {"company_id": company_id, "role": "viewer"}
    assert client.post(
        "/invites/accept",
        json={"token": invite.json()["token"]},
    ).status_code == 404
    assert any(
        company["id"] == company_id and company["role"] == "viewer"
        for company in client.get("/companies").json()
    )
    assert client.get(f"/companies/{company_id}/nodes").status_code == 200
    assert client.post(
        f"/companies/{company_id}/nodes",
        json={"code": "SUP", "name": "Supplier", "node_type": "SUPPLIER"},
    ).status_code == 403
    assert client.post(
        f"/companies/{company_id}/invites",
        json={"role": "editor"},
    ).status_code == 404

    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    role_update = client.patch(
        f"/companies/{company_id}/members/{viewer['user']['id']}",
        json={"role": "editor"},
    )
    assert role_update.status_code == 200
    assert role_update.json()["role"] == "editor"

    client.headers["Authorization"] = f"Bearer {viewer['access_token']}"
    created_node = client.post(
        f"/companies/{company_id}/nodes",
        json={"code": "SUP", "name": "Supplier", "node_type": "SUPPLIER"},
    )
    assert created_node.status_code == 200, created_node.text
    assert client.get(f"/companies/{company_id}/collaboration").json()["activity"]

    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    assert client.delete(
        f"/companies/{company_id}/members/{viewer['user']['id']}"
    ).status_code == 204
    pending_invite = client.post(
        f"/companies/{company_id}/invites",
        json={"role": "editor"},
    )
    assert pending_invite.status_code == 201
    assert client.delete(
        f"/companies/{company_id}/invites/{pending_invite.json()['id']}"
    ).status_code == 204
    client.headers["Authorization"] = f"Bearer {viewer['access_token']}"
    assert client.get(f"/companies/{company_id}/nodes").status_code == 404
    assert client.post(
        "/invites/accept",
        json={"token": pending_invite.json()["token"]},
    ).status_code == 404


def test_action_notifications_and_due_reminders_are_user_scoped(auth_client):
    client, session_factory, _ = auth_client
    owner = register(client, "notification-owner@example.test").json()
    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    company = client.post("/companies", json={"name": "Notification Workspace"}).json()
    company_id = company["id"]
    invite = client.post(
        f"/companies/{company_id}/invites",
        json={"role": "editor"},
    ).json()

    teammate = register(client, "notification-editor@example.test").json()
    client.headers["Authorization"] = f"Bearer {teammate['access_token']}"
    assert client.post(
        "/invites/accept",
        json={"token": invite["token"]},
    ).status_code == 200

    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    created = client.post(
        f"/companies/{company_id}/actions",
        json={
            "scenario_message": "Port disruption",
            "recommendation": "Confirm an alternate port booking",
            "owner": "notification-editor@example.test",
            "due_date": (date.today() + timedelta(days=1)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    action_id = created.json()["id"]

    client.headers["Authorization"] = f"Bearer {teammate['access_token']}"
    first = client.get("/notifications")
    assert first.status_code == 200, first.text
    first_data = first.json()
    assert first_data["unread_count"] == 2
    assert {item["kind"] for item in first_data["notifications"]} == {
        "action_assigned",
        "due_soon",
    }
    assert client.get("/notifications").json()["unread_count"] == 2

    notification_id = first_data["notifications"][0]["id"]
    with session_factory() as db:
        notification = db.get(UserNotification, notification_id)
        assert notification is not None
        assert notification.recipient_id == teammate["user"]["id"]
    read_response = client.patch(f"/notifications/{notification_id}/read")
    assert read_response.status_code == 204, read_response.text
    assert client.get("/notifications").json()["unread_count"] == 1
    assert client.post("/notifications/read-all").status_code == 204
    assert client.get("/notifications").json()["unread_count"] == 0
    assert client.delete(
        f"/notifications/{notification_id}"
    ).status_code == 204
    assert all(
        item["id"] != notification_id
        for item in client.get("/notifications").json()["notifications"]
    )
    with session_factory() as db:
        dismissed = db.get(UserNotification, notification_id)
        assert dismissed is not None
        assert dismissed.dismissed_at is not None

    status_update = client.patch(
        f"/companies/{company_id}/actions/{action_id}",
        json={"status": "IN_PROGRESS"},
    )
    assert status_update.status_code == 200, status_update.text

    client.headers["Authorization"] = f"Bearer {owner['access_token']}"
    owner_notifications = client.get("/notifications").json()["notifications"]
    assert any(item["kind"] == "action_status" for item in owner_notifications)


def test_supplier_performance_is_scoped_and_validated(auth_client):
    client, _, _ = auth_client
    registration = register(client, "supplier-scorecard@example.test").json()
    client.headers["Authorization"] = "Bearer " + registration["access_token"]
    company = client.post(
        "/companies",
        json={"name": "Supplier Scorecard Workspace"},
    ).json()
    company_id = company["id"]
    supplier = client.post(
        f"/companies/{company_id}/nodes",
        json={
            "code": "SUP-01",
            "name": "Northstar Components",
            "node_type": "SUPPLIER",
        },
    )
    assert supplier.status_code == 200, supplier.text
    plant = client.post(
        f"/companies/{company_id}/nodes",
        json={
            "code": "PLANT-01",
            "name": "Assembly Plant",
            "node_type": "PLANT",
        },
    )
    assert plant.status_code == 200, plant.text

    supplier_id = supplier.json()["id"]
    report_date = date.today().isoformat()
    payload = {
        "supplier_node_id": supplier_id,
        "reporting_date": report_date,
        "on_time_delivery_rate": 94.5,
        "average_lead_time_days": 8.2,
        "defect_rate": 1.3,
        "capacity_utilization": 125,
        "source_reference": "monthly-operations-review",
        "notes": "Recorded from the verified monthly report.",
    }
    created = client.post(
        f"/companies/{company_id}/supplier-performance",
        json=payload,
    )
    assert created.status_code == 201, created.text
    assert created.json()["supplier_node_id"] == supplier_id
    assert created.json()["on_time_delivery_rate"] == 94.5
    assert created.json()["capacity_utilization"] == 125
    assert created.json()["source_reference"] == "monthly-operations-review"
    records = client.get(f"/companies/{company_id}/supplier-performance")
    assert records.status_code == 200
    assert [item["id"] for item in records.json()] == [created.json()["id"]]
    filtered_records = client.get(
        f"/companies/{company_id}/supplier-performance",
        params={
            "supplier_node_id": supplier_id,
            "start_date": report_date,
            "end_date": report_date,
            "limit": 1,
        },
    )
    assert filtered_records.status_code == 200, filtered_records.text
    assert [item["id"] for item in filtered_records.json()] == [
        created.json()["id"]
    ]
    invalid_date_range = client.get(
        f"/companies/{company_id}/supplier-performance",
        params={
            "start_date": (date.today() + timedelta(days=1)).isoformat(),
            "end_date": report_date,
        },
    )
    assert invalid_date_range.status_code == 422

    duplicate = client.post(
        f"/companies/{company_id}/supplier-performance",
        json=payload,
    )
    assert duplicate.status_code == 409
    invalid_target = client.post(
        f"/companies/{company_id}/supplier-performance",
        json={
            "supplier_node_id": plant.json()["id"],
            "reporting_date": (date.today() + timedelta(days=1)).isoformat(),
            "defect_rate": 1,
        },
    )
    assert invalid_target.status_code == 404
    missing_metrics = client.post(
        f"/companies/{company_id}/supplier-performance",
        json={
            "supplier_node_id": supplier_id,
            "reporting_date": (date.today() + timedelta(days=1)).isoformat(),
        },
    )
    assert missing_metrics.status_code == 422
    out_of_range = client.post(
        f"/companies/{company_id}/supplier-performance",
        json={
            "supplier_node_id": supplier_id,
            "reporting_date": (date.today() + timedelta(days=1)).isoformat(),
            "on_time_delivery_rate": 101,
        },
    )
    assert out_of_range.status_code == 422
    assert client.get("/companies/999/supplier-performance").status_code == 404


def test_supplier_performance_import_preview_and_commit(auth_client):
    client, _, _ = auth_client
    registration = register(client, "supplier-import@example.test").json()
    client.headers["Authorization"] = "Bearer " + registration["access_token"]
    company = client.post(
        "/companies",
        json={"name": "Supplier Import Workspace"},
    ).json()
    company_id = company["id"]
    supplier = client.post(
        f"/companies/{company_id}/nodes",
        json={
            "code": "SUP-IM-01",
            "name": "Supplier Import Co.",
            "node_type": "SUPPLIER",
        },
    ).json()

    csv_data = (
        "supplier_code,reporting_date,on_time_delivery_rate,average_lead_time_days,defect_rate,capacity_utilization,source_reference,notes\n"
        "SUP-IM-01,2026-01-15,98.2,6.4,1.3,112,ERP snapshot,Strong January performance\n"
        "SUP-IM-01,2026-01-20,96.0,7.1,2.1,120,ERP snapshot,Week 2 follow up\n"
    )
    preview = client.post(
        f"/companies/{company_id}/supplier-performance/import-preview",
        files={"file": ("supplier-import.csv", csv_data, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    preview_data = preview.json()
    assert preview_data["valid_rows"] == 2
    assert preview_data["invalid_rows"] == 0

    imported = client.post(
        f"/companies/{company_id}/supplier-performance/import",
        json={"rows": preview_data["valid_records"]},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported_count"] == 2

    records = client.get(f"/companies/{company_id}/supplier-performance").json()
    assert len(records) == 2
    assert {item["supplier_node_id"] for item in records} == {supplier["id"]}


def test_supplier_risk_thresholds_alerts_and_notifications(auth_client):
    client, _, _ = auth_client
    owner = register(client, "supplier-risk-owner@example.test").json()
    client.headers["Authorization"] = "Bearer " + owner["access_token"]
    company = client.post(
        "/companies",
        json={"name": "Supplier Risk Workspace"},
    ).json()
    company_id = company["id"]
    invite = client.post(
        f"/companies/{company_id}/invites",
        json={"role": "editor"},
    )
    assert invite.status_code == 201, invite.text

    teammate = register(client, "supplier-risk-editor@example.test").json()
    client.headers["Authorization"] = "Bearer " + teammate["access_token"]
    accepted = client.post(
        "/invites/accept",
        json={"token": invite.json()["token"]},
    )
    assert accepted.status_code == 200, accepted.text

    client.headers["Authorization"] = "Bearer " + owner["access_token"]
    supplier = client.post(
        f"/companies/{company_id}/nodes",
        json={
            "code": "RISK-SUP",
            "name": "Risk Test Supplier",
            "node_type": "SUPPLIER",
        },
    )
    assert supplier.status_code == 200, supplier.text
    performance = client.post(
        f"/companies/{company_id}/supplier-performance",
        json={
            "supplier_node_id": supplier.json()["id"],
            "reporting_date": (date.today() - timedelta(days=1)).isoformat(),
            "on_time_delivery_rate": 82,
            "average_lead_time_days": 12,
            "defect_rate": 4,
            "capacity_utilization": 115,
        },
    )
    assert performance.status_code == 201, performance.text

    url = f"/companies/{company_id}/supplier-risk-monitor"
    unconfigured = client.get(url)
    assert unconfigured.status_code == 200, unconfigured.text
    assert unconfigured.json()["alerts"] == []
    thresholds = {
        "min_on_time_delivery_rate": 95,
        "max_average_lead_time_days": 8,
        "max_defect_rate": 2,
        "max_capacity_utilization": 100,
    }
    configured = client.put(url, json=thresholds)
    assert configured.status_code == 200, configured.text
    response = configured.json()
    assert len(response["alerts"]) == 4
    assert {alert["metric"] for alert in response["alerts"]} == {
        "on_time_delivery_rate",
        "average_lead_time_days",
        "defect_rate",
        "capacity_utilization",
    }

    duplicate_save = client.put(url, json=thresholds)
    assert duplicate_save.status_code == 200, duplicate_save.text

    follow_up_report = client.post(
        f"/companies/{company_id}/supplier-performance",
        json={
            "supplier_node_id": supplier.json()["id"],
            "reporting_date": date.today().isoformat(),
            "on_time_delivery_rate": 75,
            "average_lead_time_days": 13,
            "defect_rate": 5,
            "capacity_utilization": 120,
        },
    )
    assert follow_up_report.status_code == 201, follow_up_report.text
    latest_alerts = client.get(url).json()["alerts"]
    assert latest_alerts
    assert {
        alert["performance_record_id"] for alert in latest_alerts
    } == {follow_up_report.json()["id"]}

    client.headers["Authorization"] = "Bearer " + teammate["access_token"]
    teammate_notifications = client.get("/notifications")
    assert teammate_notifications.status_code == 200, teammate_notifications.text
    risk_notifications = [
        notification
        for notification in teammate_notifications.json()["notifications"]
        if notification["kind"] == "supplier_risk"
    ]
    assert len(risk_notifications) == 8

    client.headers["Authorization"] = "Bearer " + owner["access_token"]
    cleared = client.put(url, json={})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["alerts"] == []

    invalid_threshold = client.put(
        url,
        json={**thresholds, "min_on_time_delivery_rate": 101},
    )
    assert invalid_threshold.status_code == 422

    client.headers["Authorization"] = "Bearer " + owner["access_token"]
    viewer_invite = client.post(
        f"/companies/{company_id}/invites",
        json={"role": "viewer"},
    )
    assert viewer_invite.status_code == 201, viewer_invite.text
    viewer = register(client, "supplier-risk-viewer@example.test").json()
    client.headers["Authorization"] = "Bearer " + viewer["access_token"]
    accepted_viewer = client.post(
        "/invites/accept",
        json={"token": viewer_invite.json()["token"]},
    )
    assert accepted_viewer.status_code == 200, accepted_viewer.text
    client.headers["Authorization"] = "Bearer " + viewer["access_token"]
    assert client.put(url, json=thresholds).status_code == 403


def test_first_account_claims_legacy_workspaces_and_second_account_cannot_access(
    auth_client,
):
    client, session_factory, legacy_id = auth_client
    alice = register(client, "alice@example.test").json()
    client.headers["Authorization"] = f"Bearer {alice['access_token']}"

    companies = client.get("/companies")
    assert companies.status_code == 200
    assert [company["id"] for company in companies.json()] == [legacy_id]

    created = client.post(
        "/companies",
        json={"name": "Alice Private Workspace"},
    )
    assert created.status_code == 200, created.text
    alice_company_id = created.json()["id"]

    bob = register(client, "bob@example.test").json()
    client.headers["Authorization"] = f"Bearer {bob['access_token']}"
    assert client.get("/companies").json() == []
    assert client.get(f"/companies/{legacy_id}/nodes").status_code == 404
    assert client.get(
        f"/companies/{alice_company_id}/simulation-history"
    ).status_code == 404
    assert client.post(
        "/assistant/guide",
        json={"company_id": alice_company_id, "message": "Show my network"},
    ).status_code == 404

    with session_factory() as db:
        legacy = db.get(Company, legacy_id)
        alice_company = db.get(Company, alice_company_id)
        bob_user = db.query(User).filter_by(email="bob@example.test").one()
        assert legacy.owner_id != bob_user.id
        assert alice_company.owner_id != bob_user.id


def test_company_api_rejects_missing_or_invalid_access_tokens(auth_client):
    client, _, legacy_id = auth_client
    assert client.get("/companies").status_code == 401
    client.headers["Authorization"] = "Bearer invalid.token.value"
    assert client.get(f"/companies/{legacy_id}/nodes").status_code == 401
