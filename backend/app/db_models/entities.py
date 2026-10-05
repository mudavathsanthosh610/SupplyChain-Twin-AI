from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
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


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean(), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)

    nodes = relationship("SupplyNode", back_populates="company", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="company", cascade="all, delete-orphan")


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
    active: Mapped[bool] = mapped_column(Boolean(), default=True)

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
    active: Mapped[bool] = mapped_column(Boolean(), default=True)

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
