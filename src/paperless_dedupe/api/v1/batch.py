from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from paperless_dedupe.models.database import get_db

router = APIRouter()


class BatchOperation(BaseModel):
    id: str
    type: str
    status: str
    total_items: int
    processed_items: int
    created_at: datetime
    completed_at: datetime | None = None
    error: str | None = None


@router.get("/operations")
async def list_operations(limit: int = 100, db: Session = Depends(get_db)):
    """List batch operations (stub endpoint for now)"""
    # Return empty list for now - this feature is not yet implemented
    return []


@router.get("/operations/{operation_id}")
async def get_operation(operation_id: str, db: Session = Depends(get_db)):
    """Get single operation status (stub)"""
    raise HTTPException(status_code=404, detail="Operation not found")


@router.post("/operations/{operation_id}/cancel")
async def cancel_operation(operation_id: str, db: Session = Depends(get_db)):
    """Cancel a running operation (stub)"""
    raise HTTPException(status_code=404, detail="Operation not found")
