import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    require_company_read_access,
    require_company_write_access,
)
from app.config import settings
from app.db.session import get_db
from app.db_models.entities import Company, CompanyDocument, User, WorkspaceMembership
from app.schemas.network import CompanyCreate, CompanyDocumentRead, CompanyRead

router = APIRouter(prefix="/companies", tags=["companies"])
DOCUMENT_STORAGE_DIR = Path(settings.document_storage_dir)
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
DOCUMENT_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.get("", response_model=list[CompanyRead])
def list_companies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned = [
        {
            **CompanyRead.model_validate(company).model_dump(),
            "role": "owner",
        }
        for company in db.query(Company)
        .filter(Company.owner_id == current_user.id)
        .order_by(Company.id)
        .all()
    ]
    shared = [
        {
            **CompanyRead.model_validate(membership.company).model_dump(),
            "role": membership.role,
        }
        for membership in db.query(WorkspaceMembership)
        .filter_by(user_id=current_user.id)
        .all()
    ]
    return owned + shared


@router.post("", response_model=CompanyRead)
def create_company(
    payload: CompanyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(Company).filter(Company.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Company already exists")

    company = Company(**payload.model_dump(), owner_id=current_user.id)
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}/documents", response_model=list[CompanyDocumentRead])
def list_company_documents(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)
    return (
        db.query(CompanyDocument)
        .filter(CompanyDocument.company_id == company_id)
        .order_by(CompanyDocument.uploaded_at.desc(), CompanyDocument.id.desc())
        .all()
    )


@router.post("/{company_id}/documents", response_model=CompanyDocumentRead, status_code=201)
async def upload_company_document(
    company_id: int,
    request: Request,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_write_access(company_id, current_user, db)

    safe_name = filename.replace("\\", "/").split("/")[-1]
    safe_name = "".join(character for character in safe_name if character.isprintable()).strip()
    extension = Path(safe_name).suffix.lower()
    if not safe_name or extension not in DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, DOCX, and XLSX company documents are supported.",
        )
    if len(safe_name) > 255:
        safe_name = f"{safe_name[:255 - len(extension)]}{extension}"

    company_directory = DOCUMENT_STORAGE_DIR / str(company_id)
    company_directory.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    temporary_path = company_directory / f".{stored_name}.uploading"
    stored_path = company_directory / stored_name
    total_bytes = 0

    try:
        with temporary_path.open("xb") as document_file:
            async for chunk in request.stream():
                total_bytes += len(chunk)
                if total_bytes > MAX_DOCUMENT_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Company documents must be 10 MB or smaller.",
                    )
                document_file.write(chunk)

        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="The uploaded document is empty.")

        with temporary_path.open("rb") as document_file:
            signature = document_file.read(8)
        valid_signature = (
            signature.startswith(b"%PDF-")
            if extension == ".pdf"
            else signature.startswith(b"PK\x03\x04")
        )
        if not valid_signature:
            raise HTTPException(
                status_code=415,
                detail="The file contents do not match the selected PDF, DOCX, or XLSX type.",
            )

        os.replace(temporary_path, stored_path)
        document = CompanyDocument(
            company_id=company_id,
            original_filename=safe_name,
            stored_filename=f"{company_id}/{stored_name}",
            content_type=DOCUMENT_CONTENT_TYPES[extension],
            file_size=total_bytes,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return document
    except HTTPException:
        temporary_path.unlink(missing_ok=True)
        stored_path.unlink(missing_ok=True)
        raise
    except (OSError, SQLAlchemyError) as error:
        db.rollback()
        temporary_path.unlink(missing_ok=True)
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Unable to store the company document locally.",
        ) from error
    finally:
        temporary_path.unlink(missing_ok=True)


@router.get("/{company_id}/documents/{document_id}/download")
def download_company_document(
    company_id: int,
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)
    document = (
        db.query(CompanyDocument)
        .filter(
            CompanyDocument.id == document_id,
            CompanyDocument.company_id == company_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Company document not found.")

    stored_path = DOCUMENT_STORAGE_DIR / document.stored_filename
    if not stored_path.is_file():
        raise HTTPException(status_code=404, detail="Stored company document is missing.")
    return FileResponse(
        stored_path,
        media_type=document.content_type,
        filename=document.original_filename,
        content_disposition_type="attachment",
    )


@router.delete("/{company_id}/documents/{document_id}", status_code=204)
def delete_company_document(
    company_id: int,
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_write_access(company_id, current_user, db)
    document = (
        db.query(CompanyDocument)
        .filter(
            CompanyDocument.id == document_id,
            CompanyDocument.company_id == company_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Company document not found.")

    stored_path = DOCUMENT_STORAGE_DIR / document.stored_filename
    try:
        stored_path.unlink(missing_ok=True)
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to remove the stored company document.",
        ) from error
    db.delete(document)
    db.commit()
