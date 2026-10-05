from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db_models.entities import Company, SupplyNode, SupplyRoute
from app.schemas.network import NodeCreate, NodeRead, RouteCreate, RouteRead

router = APIRouter(prefix="/companies/{company_id}", tags=["network"])


def require_company(company_id: int, db: Session):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.get("/nodes", response_model=list[NodeRead])
def list_nodes(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return db.query(SupplyNode).filter(SupplyNode.company_id == company_id).order_by(SupplyNode.id).all()


@router.post("/nodes", response_model=NodeRead)
def create_node(company_id: int, payload: NodeCreate, db: Session = Depends(get_db)):
    require_company(company_id, db)
    node = SupplyNode(company_id=company_id, **payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.get("/routes", response_model=list[RouteRead])
def list_routes(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return db.query(SupplyRoute).filter(SupplyRoute.company_id == company_id).order_by(SupplyRoute.id).all()


@router.post("/routes", response_model=RouteRead)
def create_route(company_id: int, payload: RouteCreate, db: Session = Depends(get_db)):
    require_company(company_id, db)

    source = db.get(SupplyNode, payload.source_node_id)
    destination = db.get(SupplyNode, payload.destination_node_id)

    if not source or source.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid source node")
    if not destination or destination.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid destination node")

    route = SupplyRoute(company_id=company_id, **payload.model_dump())
    db.add(route)
    db.commit()
    db.refresh(route)
    return route
