from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    log_workspace_activity,
    require_company_read_access,
    require_company_write_access,
)
from app.db.session import get_db
from app.db_models.entities import Company, SupplierRiskThreshold, User
from app.schemas.network import (
    SupplierRiskMonitorRead,
    SupplierRiskThresholdRead,
    SupplierRiskThresholdUpdate,
)
from app.supplier_risk import build_supplier_risk_alerts, notify_supplier_risk_alerts

router = APIRouter(
    prefix="/companies/{company_id}/supplier-risk-monitor",
    tags=["supplier risk monitoring"],
)


def require_company_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)


def get_thresholds(
    db: Session,
    company_id: int,
) -> SupplierRiskThresholdRead:
    thresholds = (
        db.query(SupplierRiskThreshold)
        .filter_by(company_id=company_id)
        .first()
    )
    if thresholds is None:
        return SupplierRiskThresholdRead()
    return SupplierRiskThresholdRead.model_validate(thresholds)


@router.get(
    "",
    response_model=SupplierRiskMonitorRead,
    dependencies=[Depends(require_company_access)],
)
def get_supplier_risk_monitor(
    company_id: int,
    db: Session = Depends(get_db),
):
    thresholds = get_thresholds(db, company_id)
    return {
        "thresholds": thresholds,
        "alerts": build_supplier_risk_alerts(db, company_id, thresholds),
    }


@router.put(
    "",
    response_model=SupplierRiskMonitorRead,
    dependencies=[Depends(require_company_write_access)],
)
def update_supplier_risk_thresholds(
    company_id: int,
    payload: SupplierRiskThresholdUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company workspace not found.",
        )
    thresholds = (
        db.query(SupplierRiskThreshold)
        .filter_by(company_id=company_id)
        .first()
    )
    if thresholds is None:
        thresholds = SupplierRiskThreshold(company_id=company_id)
        db.add(thresholds)
        changed = True
    else:
        changed = any(
            getattr(thresholds, field) != value
            for field, value in payload.model_dump().items()
        )
    if not changed:
        threshold_read = SupplierRiskThresholdRead.model_validate(thresholds)
        return {
            "thresholds": threshold_read,
            "alerts": build_supplier_risk_alerts(db, company_id, threshold_read),
        }
    for field, value in payload.model_dump().items():
        setattr(thresholds, field, value)
    thresholds.updated_by_id = current_user.id
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "supplier_risk_thresholds_updated",
        "Updated supplier performance risk thresholds.",
    )
    db.commit()
    db.refresh(thresholds)
    threshold_read = SupplierRiskThresholdRead.model_validate(thresholds)
    alerts = build_supplier_risk_alerts(db, company_id, threshold_read)
    notify_supplier_risk_alerts(
        db,
        company_id,
        current_user.id,
        alerts,
        threshold_read.updated_at,
    )
    db.commit()
    return {"thresholds": threshold_read, "alerts": alerts}
