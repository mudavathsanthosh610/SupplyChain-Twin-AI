from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_company_read_access, require_company_write_access
from app.db.session import get_db
from app.db_models.entities import Company, Scenario, SimulationRun, User

def require_company_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)


router = APIRouter(
    prefix="/companies/{company_id}/simulation-history",
    tags=["simulation history"],
    dependencies=[Depends(require_company_access)],
)


def require_company(company_id: int, db: Session) -> None:
    if db.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Company workspace not found.")


@router.get("")
def list_simulation_history(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    entries = (
        db.query(SimulationRun, Scenario)
        .join(Scenario, SimulationRun.scenario_id == Scenario.id)
        .filter(Scenario.company_id == company_id)
        .order_by(SimulationRun.created_at.desc(), SimulationRun.id.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "id": run.id,
            "message": scenario.user_message,
            "created_at": run.created_at,
            "result": run.result_payload,
        }
        for run, scenario in entries
    ]


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_company_write_access)],
)
def clear_simulation_history(
    company_id: int,
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    scenarios = (
        db.query(Scenario)
        .join(SimulationRun, SimulationRun.scenario_id == Scenario.id)
        .filter(Scenario.company_id == company_id)
        .distinct()
        .all()
    )
    for scenario in scenarios:
        db.delete(scenario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
