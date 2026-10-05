from typing import List, Literal, Optional
from pydantic import BaseModel, Field

NodeType = Literal["supplier", "factory", "port", "warehouse", "customer"]


class SupplyNode(BaseModel):
    id: str
    name: str
    type: NodeType
    capacity: float = Field(gt=0)
    inventory: float = Field(default=0, ge=0)
    daily_demand: float = Field(default=0, ge=0)
    safety_stock: float = Field(default=0, ge=0)

class SupplyRoute(BaseModel):
    source: str
    destination: str
    transport_mode: str = "sea"
    cost: float = Field(gt=0)
    lead_time_days: float = Field(gt=0)
    capacity: float = Field(gt=0)
    fuel_dependency: float = Field(default=1.0, ge=0)


class NetworkDefinition(BaseModel):
    nodes: List[SupplyNode]
    routes: List[SupplyRoute]


class SimulationRequest(BaseModel):
    closed_nodes: List[str] = []
    closed_routes: List[str] = []
    closure_duration_days: int = Field(default=0, ge=0)
    fuel_cost_increase_percent: float = Field(default=0, ge=0)
    source: str
    destination: str


class RouteResult(BaseModel):
    route: List[str]
    total_cost: float
    lead_time_days: float
    bottleneck_capacity: float

class InventoryImpact(BaseModel):
    node_id: str
    node_name: str
    starting_inventory: float
    daily_demand: float
    safety_stock: float
    disruption_days: int

    demand_during_disruption: float
    days_of_inventory: float
    days_until_safety_stock: float

    projected_inventory: float
    projected_shortage: float

    replenishment_arrival_days: Optional[float] = None
    shortage_days_before_replenishment: float = 0
    emergency_inventory_required: float = 0

    safety_stock_breached: bool
    stockout_expected: bool
    inventory_risk: str


class SimulationResult(BaseModel):
    baseline: RouteResult
    disrupted: Optional[RouteResult]
    cost_change_percent: Optional[float]
    delay_change_days: Optional[float]
    risk_level: str
    inventory_impact: List[InventoryImpact] = []
    notes: List[str]
