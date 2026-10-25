from datetime import datetime

from sqlalchemy.orm import Session

from app.db_models.entities import (
    SupplierPerformanceRecord,
    SupplierRiskThreshold,
    SupplyNode,
)
from app.notifications import notify_workspace_members
from app.schemas.network import (
    SupplierRiskAlertRead,
    SupplierRiskThresholdRead,
)

RISK_METRICS = (
    (
        "on_time_delivery_rate",
        "On-time delivery",
        "min_on_time_delivery_rate",
        "%",
        "below",
    ),
    (
        "average_lead_time_days",
        "Average lead time",
        "max_average_lead_time_days",
        "days",
        "above",
    ),
    ("defect_rate", "Defect rate", "max_defect_rate", "%", "above"),
    (
        "capacity_utilization",
        "Capacity utilization",
        "max_capacity_utilization",
        "%",
        "above",
    ),
)


def build_supplier_risk_alerts(
    db: Session,
    company_id: int,
    thresholds: SupplierRiskThresholdRead,
) -> list[SupplierRiskAlertRead]:
    records = (
        db.query(SupplierPerformanceRecord, SupplyNode)
        .join(SupplyNode, SupplierPerformanceRecord.supplier_node_id == SupplyNode.id)
        .filter(
            SupplyNode.company_id == company_id,
            SupplyNode.node_type.ilike("supplier"),
        )
        .order_by(
            SupplierPerformanceRecord.reporting_date.desc(),
            SupplierPerformanceRecord.id.desc(),
        )
        .all()
    )
    latest_by_supplier: dict[int, tuple[SupplierPerformanceRecord, SupplyNode]] = {}
    for record, supplier in records:
        latest_by_supplier.setdefault(supplier.id, (record, supplier))

    alerts: list[SupplierRiskAlertRead] = []
    for record, supplier in latest_by_supplier.values():
        for metric, label, threshold_field, unit, direction in RISK_METRICS:
            value = getattr(record, metric)
            threshold = getattr(thresholds, threshold_field)
            if value is None or threshold is None:
                continue
            breached = value < threshold if direction == "below" else value > threshold
            if not breached:
                continue
            comparison = "below" if direction == "below" else "above"
            alerts.append(
                SupplierRiskAlertRead(
                    id=f"{record.id}:{metric}",
                    supplier_node_id=supplier.id,
                    supplier_name=supplier.name,
                    supplier_code=supplier.code,
                    performance_record_id=record.id,
                    reporting_date=record.reporting_date,
                    metric=metric,
                    metric_label=label,
                    value=value,
                    threshold=threshold,
                    unit=unit,
                    message=(
                        f"{label} is {value:g}{unit} and is {comparison} "
                        f"your threshold of {threshold:g}{unit}."
                    ),
                )
            )
    return alerts


def notify_supplier_risk_alerts(
    db: Session,
    company_id: int,
    actor_id: int,
    alerts: list[SupplierRiskAlertRead],
    thresholds_updated_at: datetime | None,
) -> None:
    threshold_version = (
        thresholds_updated_at.isoformat() if thresholds_updated_at else "initial"
    )
    for alert in alerts:
        notify_workspace_members(
            db,
            company_id,
            actor_id,
            (
                f"supplier-risk:{alert.performance_record_id}:"
                f"{alert.metric}:{threshold_version}"
            ),
            "supplier_risk",
            f"Supplier threshold breached: {alert.supplier_name}",
            alert.message,
        )
