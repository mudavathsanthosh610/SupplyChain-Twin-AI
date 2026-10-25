from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    city: str | None = Field(default=None, max_length=200)
    country: str | None = Field(default=None, max_length=100)
    business_type: str | None = Field(default=None, max_length=200)
    end_to_end_workflow: str | None = Field(default=None, max_length=10000)
    requires_manual_network_setup: bool = False
    is_demo: bool = False


class CompanyRead(CompanyCreate):
    id: int
    role: str = "owner"
    model_config = ConfigDict(from_attributes=True)


class CompanyDocumentRead(BaseModel):
    id: int
    company_id: int
    original_filename: str
    content_type: str
    file_size: int
    uploaded_at: datetime
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
    data_source_type: str = "USER PROVIDED"
    source_url: str | None = None
    active: bool = True


class NodeRead(NodeCreate):
    id: int
    company_id: int
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class RouteCreate(BaseModel):
    source_node_id: int
    destination_node_id: int
    transport_mode: str
    base_cost: float = Field(ge=0)
    lead_time_days: float = Field(gt=0)
    capacity: float = Field(gt=0)
    fuel_dependency: float = Field(default=0, ge=0, le=1)
    data_source_type: str = "USER PROVIDED"
    source_reference: str | None = None
    active: bool = True


class RouteRead(RouteCreate):
    id: int
    company_id: int
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class SupplierPerformanceCreate(BaseModel):
    supplier_node_id: int
    reporting_date: date = Field(default_factory=date.today)
    on_time_delivery_rate: float | None = Field(
        default=None, ge=0, le=100, allow_inf_nan=False
    )
    average_lead_time_days: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )
    defect_rate: float | None = Field(
        default=None, ge=0, le=100, allow_inf_nan=False
    )
    capacity_utilization: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )
    source_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_at_least_one_metric(self):
        metric_fields = (
            self.on_time_delivery_rate,
            self.average_lead_time_days,
            self.defect_rate,
            self.capacity_utilization,
        )
        if all(value is None for value in metric_fields):
            raise ValueError("Enter at least one supplier performance metric.")
        return self


class SupplierPerformanceRead(BaseModel):
    id: int
    supplier_node_id: int
    reporting_date: date
    on_time_delivery_rate: float | None
    average_lead_time_days: float | None
    defect_rate: float | None
    capacity_utilization: float | None
    source_reference: str | None
    notes: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SupplierRiskThresholdUpdate(BaseModel):
    min_on_time_delivery_rate: float | None = Field(
        default=None, ge=0, le=100, allow_inf_nan=False
    )
    max_average_lead_time_days: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )
    max_defect_rate: float | None = Field(
        default=None, ge=0, le=100, allow_inf_nan=False
    )
    max_capacity_utilization: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )


class SupplierRiskThresholdRead(SupplierRiskThresholdUpdate):
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class SupplierRiskAlertRead(BaseModel):
    id: str
    supplier_node_id: int
    supplier_name: str
    supplier_code: str
    performance_record_id: int
    reporting_date: date
    metric: Literal[
        "on_time_delivery_rate",
        "average_lead_time_days",
        "defect_rate",
        "capacity_utilization",
    ]
    metric_label: str
    value: float
    threshold: float
    unit: Literal["%", "days"]
    message: str


class SupplierRiskMonitorRead(BaseModel):
    thresholds: SupplierRiskThresholdRead
    alerts: list[SupplierRiskAlertRead]


class ControlTowerActionCreate(BaseModel):
    scenario_message: str = Field(min_length=1, max_length=10000)
    recommendation: str = Field(min_length=1, max_length=10000)
    owner: str | None = Field(default=None, max_length=200)
    due_date: date | None = None
    expected_impact: dict[str, Any] | None = None
    is_sample: bool = False


class ControlTowerActionUpdate(BaseModel):
    owner: str | None = Field(default=None, max_length=200)
    due_date: date | None = None
    status: Literal["OPEN", "IN_PROGRESS", "DONE"] | None = None
    actual_outcome: str | None = Field(default=None, max_length=10000)
    actual_cost_change_percent: float | None = None
    actual_delay_change_days: float | None = None
    actual_stockout_locations: int | None = Field(default=None, ge=0)
    actual_emergency_inventory_units: float | None = Field(default=None, ge=0)


class ControlTowerActionRead(ControlTowerActionCreate):
    id: int
    company_id: int
    status: Literal["OPEN", "IN_PROGRESS", "DONE"]
    actual_outcome: str | None
    actual_cost_change_percent: float | None
    actual_delay_change_days: float | None
    actual_stockout_locations: int | None
    actual_emergency_inventory_units: float | None
    is_sample: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
