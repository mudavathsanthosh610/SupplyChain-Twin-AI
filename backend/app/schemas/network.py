from pydantic import BaseModel, ConfigDict, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    is_demo: bool = False


class CompanyRead(CompanyCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class NodeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str
    node_type: str
    country: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    capacity: float | None = None
    current_inventory: float = 0
    daily_demand: float = 0
    safety_stock: float = 0
    active: bool = True


class NodeRead(NodeCreate):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)


class RouteCreate(BaseModel):
    source_node_id: int
    destination_node_id: int
    transport_mode: str
    base_cost: float = Field(ge=0)
    lead_time_days: float = Field(gt=0)
    capacity: float = Field(gt=0)
    fuel_dependency: float = Field(default=0, ge=0, le=1)
    active: bool = True


class RouteRead(RouteCreate):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)
