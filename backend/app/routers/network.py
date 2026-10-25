from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db_models.entities import Company, SupplyNode, SupplyRoute
from app.auth import (
    get_current_user,
    log_workspace_activity,
    require_company_read_access,
    require_company_write_access,
)
from app.db_models.entities import User
from app.schemas.network import NodeCreate, NodeRead, RouteCreate, RouteRead

def require_company_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)


router = APIRouter(
    prefix="/companies/{company_id}",
    tags=["network"],
    dependencies=[Depends(require_company_access)],
)


def require_company(company_id: int, db: Session):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def get_node_or_404(company_id: int, node_id: int, db: Session) -> SupplyNode:
    node = db.get(SupplyNode, node_id)
    if not node or node.company_id != company_id:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


def get_route_or_404(company_id: int, route_id: int, db: Session) -> SupplyRoute:
    route = db.get(SupplyRoute, route_id)
    if not route or route.company_id != company_id:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


@router.get("/nodes", response_model=list[NodeRead])
def list_nodes(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return db.query(SupplyNode).filter(SupplyNode.company_id == company_id).order_by(SupplyNode.id).all()


@router.get("/nodes/{node_id}", response_model=NodeRead)
def get_node(company_id: int, node_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return get_node_or_404(company_id, node_id, db)


@router.post(
    "/nodes",
    response_model=NodeRead,
    dependencies=[Depends(require_company_write_access)],
)
def create_node(
    company_id: int,
    payload: NodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    node = SupplyNode(company_id=company_id, **payload.model_dump())
    db.add(node)
    log_workspace_activity(
        db, company_id, current_user, "network_node_created", f"Added location {node.name}."
    )
    db.commit()
    db.refresh(node)
    return node


@router.put(
    "/nodes/{node_id}",
    response_model=NodeRead,
    dependencies=[Depends(require_company_write_access)],
)
def update_node(
    company_id: int,
    node_id: int,
    payload: NodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    node = get_node_or_404(company_id, node_id, db)

    for key, value in payload.model_dump().items():
        setattr(node, key, value)

    log_workspace_activity(
        db, company_id, current_user, "network_node_updated", f"Updated location {node.name}."
    )
    db.commit()
    db.refresh(node)
    return node


@router.delete(
    "/nodes/{node_id}",
    dependencies=[Depends(require_company_write_access)],
)
def delete_node(
    company_id: int,
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    node = get_node_or_404(company_id, node_id, db)
    node_name = node.name
    db.delete(node)
    log_workspace_activity(
        db, company_id, current_user, "network_node_deleted", f"Removed location {node_name}."
    )
    db.commit()
    return {"status": "deleted", "node_id": node_id}


@router.get("/routes", response_model=list[RouteRead])
def list_routes(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return db.query(SupplyRoute).filter(SupplyRoute.company_id == company_id).order_by(SupplyRoute.id).all()


@router.get("/routes/{route_id}", response_model=RouteRead)
def get_route(company_id: int, route_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return get_route_or_404(company_id, route_id, db)


@router.post(
    "/routes",
    response_model=RouteRead,
    dependencies=[Depends(require_company_write_access)],
)
def create_route(
    company_id: int,
    payload: RouteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)

    source = db.get(SupplyNode, payload.source_node_id)
    destination = db.get(SupplyNode, payload.destination_node_id)

    if not source or source.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid source node")
    if not destination or destination.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid destination node")

    route = SupplyRoute(company_id=company_id, **payload.model_dump())
    db.add(route)
    log_workspace_activity(
        db, company_id, current_user, "network_route_created", "Added a supply-chain route."
    )
    db.commit()
    db.refresh(route)
    return route


@router.put(
    "/routes/{route_id}",
    response_model=RouteRead,
    dependencies=[Depends(require_company_write_access)],
)
def update_route(
    company_id: int,
    route_id: int,
    payload: RouteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    route = get_route_or_404(company_id, route_id, db)

    source = db.get(SupplyNode, payload.source_node_id)
    destination = db.get(SupplyNode, payload.destination_node_id)

    if not source or source.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid source node")
    if not destination or destination.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid destination node")

    for key, value in payload.model_dump().items():
        setattr(route, key, value)

    log_workspace_activity(
        db, company_id, current_user, "network_route_updated", "Updated a supply-chain route."
    )
    db.commit()
    db.refresh(route)
    return route


@router.delete(
    "/routes/{route_id}",
    dependencies=[Depends(require_company_write_access)],
)
def delete_route(
    company_id: int,
    route_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    route = get_route_or_404(company_id, route_id, db)
    db.delete(route)
    log_workspace_activity(
        db, company_id, current_user, "network_route_deleted", "Removed a supply-chain route."
    )
    db.commit()
    return {"status": "deleted", "route_id": route_id}
