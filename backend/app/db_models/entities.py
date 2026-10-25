from datetime import date, datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class NodeType(str, Enum):
    SUPPLIER = "SUPPLIER"
    PLANT = "PLANT"
    PORT = "PORT"
    WAREHOUSE = "WAREHOUSE"
    CUSTOMER = "CUSTOMER"
    DISTRIBUTION_CENTER = "DISTRIBUTION_CENTER"
    OTHER = "OTHER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    companies = relationship("Company", back_populates="owner")
    sessions = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )
    workspace_memberships = relationship(
        "WorkspaceMembership", back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    user = relationship("User", back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    user = relationship("User")


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", name="uq_workspace_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    company = relationship("Company", back_populates="memberships")
    user = relationship("User", back_populates="workspace_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime())
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    company = relationship("Company")
    created_by = relationship("User")


class WorkspaceActivity(Base):
    __tablename__ = "workspace_activity"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    user = relationship("User")


class UserNotification(Base):
    __tablename__ = "user_notifications"
    __table_args__ = (UniqueConstraint("event_key", name="uq_notification_event_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True
    )
    event_key: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(500))
    related_action_id: Mapped[int | None] = mapped_column(
        ForeignKey("control_tower_actions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    recipient = relationship("User")
    company = relationship("Company")
    action = relationship("ControlTowerAction")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    end_to_end_workflow: Mapped[str | None] = mapped_column(Text(), nullable=True)
    requires_manual_network_setup: Mapped[bool] = mapped_column(Boolean(), default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean(), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    owner = relationship("User", back_populates="companies")
    nodes = relationship("SupplyNode", back_populates="company", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="company", cascade="all, delete-orphan")
    documents = relationship("CompanyDocument", back_populates="company", cascade="all, delete-orphan")
    control_tower_actions = relationship(
        "ControlTowerAction", back_populates="company", cascade="all, delete-orphan"
    )
    memberships = relationship(
        "WorkspaceMembership", back_populates="company", cascade="all, delete-orphan"
    )


class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(100), unique=True)
    content_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer())
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    company = relationship("Company", back_populates="documents")


class SupplyNode(Base):
    __tablename__ = "supply_nodes"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_company_node_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(200))
    node_type: Mapped[str] = mapped_column(String(50))
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float(), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float(), nullable=True)
    capacity: Mapped[float | None] = mapped_column(Float(), nullable=True)
    current_inventory: Mapped[float] = mapped_column(Float(), default=0)
    daily_demand: Mapped[float] = mapped_column(Float(), default=0)
    safety_stock: Mapped[float] = mapped_column(Float(), default=0)
    data_source_type: Mapped[str] = mapped_column(String(50), default="USER PROVIDED", nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), default=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    company = relationship("Company", back_populates="nodes")
    outgoing_routes = relationship(
        "SupplyRoute",
        foreign_keys="SupplyRoute.source_node_id",
        back_populates="source_node",
        cascade="all, delete-orphan",
    )
    incoming_routes = relationship(
        "SupplyRoute",
        foreign_keys="SupplyRoute.destination_node_id",
        back_populates="destination_node",
        cascade="all, delete-orphan",
    )
    performance_records = relationship(
        "SupplierPerformanceRecord",
        back_populates="supplier",
        cascade="all, delete-orphan",
    )


class SupplierPerformanceRecord(Base):
    __tablename__ = "supplier_performance_records"
    __table_args__ = (
        UniqueConstraint(
            "supplier_node_id",
            "reporting_date",
            name="uq_supplier_performance_reporting_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_node_id: Mapped[int] = mapped_column(
        ForeignKey("supply_nodes.id", ondelete="CASCADE"), index=True
    )
    reporting_date: Mapped[date] = mapped_column(Date(), index=True)
    on_time_delivery_rate: Mapped[float | None] = mapped_column(Float(), nullable=True)
    average_lead_time_days: Mapped[float | None] = mapped_column(Float(), nullable=True)
    defect_rate: Mapped[float | None] = mapped_column(Float(), nullable=True)
    capacity_utilization: Mapped[float | None] = mapped_column(Float(), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    recorded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    supplier = relationship("SupplyNode", back_populates="performance_records")
    recorded_by = relationship("User")


class SupplierRiskThreshold(Base):
    __tablename__ = "supplier_risk_thresholds"
    __table_args__ = (
        UniqueConstraint("company_id", name="uq_supplier_risk_threshold_company"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    min_on_time_delivery_rate: Mapped[float | None] = mapped_column(
        Float(), nullable=True
    )
    max_average_lead_time_days: Mapped[float | None] = mapped_column(
        Float(), nullable=True
    )
    max_defect_rate: Mapped[float | None] = mapped_column(Float(), nullable=True)
    max_capacity_utilization: Mapped[float | None] = mapped_column(
        Float(), nullable=True
    )
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    updated_by = relationship("User")


class SupplyRoute(Base):
    __tablename__ = "supply_routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    source_node_id: Mapped[int] = mapped_column(ForeignKey("supply_nodes.id", ondelete="CASCADE"))
    destination_node_id: Mapped[int] = mapped_column(ForeignKey("supply_nodes.id", ondelete="CASCADE"))
    transport_mode: Mapped[str] = mapped_column(String(50))
    base_cost: Mapped[float] = mapped_column(Float())
    lead_time_days: Mapped[float] = mapped_column(Float())
    capacity: Mapped[float] = mapped_column(Float())
    fuel_dependency: Mapped[float] = mapped_column(Float(), default=0)
    data_source_type: Mapped[str] = mapped_column(String(50), default="USER PROVIDED", nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), default=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    source_node = relationship("SupplyNode", foreign_keys=[source_node_id], back_populates="outgoing_routes")
    destination_node = relationship("SupplyNode", foreign_keys=[destination_node_id], back_populates="incoming_routes")


class InventorySnapshot(Base):
    __tablename__ = "inventory_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("supply_nodes.id", ondelete="CASCADE"), index=True)
    inventory: Mapped[float] = mapped_column(Float())
    daily_demand: Mapped[float] = mapped_column(Float())
    safety_stock: Mapped[float] = mapped_column(Float())
    recorded_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, index=True)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    user_message: Mapped[str] = mapped_column(Text())
    parsed_scenario: Mapped[dict | None] = mapped_column(JSON(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    company = relationship("Company", back_populates="scenarios")
    runs = relationship("SimulationRun", back_populates="scenario", cascade="all, delete-orphan")


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="COMPLETED")
    result_payload: Mapped[dict] = mapped_column(JSON())
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    scenario = relationship("Scenario", back_populates="runs")


class ControlTowerAction(Base):
    __tablename__ = "control_tower_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    scenario_message: Mapped[str] = mapped_column(Text())
    recommendation: Mapped[str] = mapped_column(Text())
    owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    expected_impact: Mapped[dict | None] = mapped_column(JSON(), nullable=True)
    actual_outcome: Mapped[str | None] = mapped_column(Text(), nullable=True)
    actual_cost_change_percent: Mapped[float | None] = mapped_column(Float(), nullable=True)
    actual_delay_change_days: Mapped[float | None] = mapped_column(Float(), nullable=True)
    actual_stockout_locations: Mapped[int | None] = mapped_column(Integer(), nullable=True)
    actual_emergency_inventory_units: Mapped[float | None] = mapped_column(
        Float(), nullable=True
    )
    is_sample: Mapped[bool] = mapped_column(Boolean(), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company = relationship("Company", back_populates="control_tower_actions")
