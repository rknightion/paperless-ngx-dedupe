from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from paperless_dedupe.models.database import get_db, Document, DocumentContent
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.services.cache_service import cache_service
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class DocumentResponse(BaseModel):
    id: int
    paperless_id: int
    title: Optional[str]
    file_size: Optional[int]
    processing_status: str
    has_duplicates: bool = False
    
    class Config:
        from_attributes = True

class DocumentSync(BaseModel):
    force_refresh: bool = False
    limit: Optional[int] = None

@router.get("/", response_model=List[DocumentResponse])
async def get_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get list of documents"""
    documents = db.query(Document).offset(skip).limit(limit).all()
    
    # Check if documents have duplicates
    result = []
    for doc in documents:
        doc_response = DocumentResponse.from_orm(doc)
        doc_response.has_duplicates = len(doc.duplicate_memberships) > 0
        result.append(doc_response)
    
    return result

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get single document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc_response = DocumentResponse.from_orm(document)
    doc_response.has_duplicates = len(document.duplicate_memberships) > 0
    return doc_response

@router.get("/{document_id}/content")
async def get_document_content(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get document OCR content"""
    # Try cache first
    cached_content = await cache_service.get_document_ocr(document_id)
    if cached_content:
        return {"content": cached_content, "from_cache": True}
    
    # Get from database
    content = db.query(DocumentContent).filter(
        DocumentContent.document_id == document_id
    ).first()
    
    if not content:
        raise HTTPException(status_code=404, detail="Document content not found")
    
    # Cache for next time
    await cache_service.set_document_ocr(document_id, content.full_text)
    
    return {"content": content.full_text, "from_cache": False}

@router.get("/{document_id}/duplicates")
async def get_document_duplicates(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get duplicates for a specific document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    duplicates = []
    for membership in document.duplicate_memberships:
        group = membership.group
        for member in group.members:
            if member.document_id != document_id:
                duplicates.append({
                    "document_id": member.document.id,
                    "paperless_id": member.document.paperless_id,
                    "title": member.document.title,
                    "confidence": group.confidence_score,
                    "group_id": group.id
                })
    
    return {"document_id": document_id, "duplicates": duplicates}

@router.post("/sync")
async def sync_documents(
    sync_config: DocumentSync,
    db: Session = Depends(get_db)
):
    """Sync documents from paperless-ngx"""
    try:
        async with PaperlessClient() as client:
            # Test connection first
            if not await client.test_connection():
                raise HTTPException(status_code=503, detail="Cannot connect to paperless-ngx API")
            
            # Get all documents from paperless
            logger.info("Starting document sync from paperless-ngx")
            paperless_docs = await client.get_all_documents()
            
            if sync_config.limit:
                paperless_docs = paperless_docs[:sync_config.limit]
            
            # Sync to database
            synced_count = 0
            updated_count = 0
            
            for pdoc in paperless_docs:
                # Check if document exists
                existing = db.query(Document).filter(
                    Document.paperless_id == pdoc["id"]
                ).first()
                
                if existing and not sync_config.force_refresh:
                    updated_count += 1
                    continue
                
                if existing:
                    # Update existing document
                    existing.title = pdoc.get("title", "")
                    existing.file_size = pdoc.get("original_file_size")
                    existing.created_date = pdoc.get("created")
                    updated_count += 1
                else:
                    # Create new document
                    document = Document(
                        paperless_id=pdoc["id"],
                        title=pdoc.get("title", ""),
                        file_size=pdoc.get("original_file_size"),
                        created_date=pdoc.get("created"),
                        processing_status="pending"
                    )
                    db.add(document)
                    synced_count += 1
                
                # Get and store OCR content if not exists
                if sync_config.force_refresh or not existing:
                    content_text = pdoc.get("content", "")
                    if content_text:
                        # Remove existing content if updating
                        if existing:
                            db.query(DocumentContent).filter(
                                DocumentContent.document_id == existing.id
                            ).delete()
                        
                        # Add new content
                        content = DocumentContent(
                            document_id=document.id if not existing else existing.id,
                            full_text=content_text[:settings.max_ocr_length] if len(content_text) > settings.max_ocr_length else content_text,
                            word_count=len(content_text.split())
                        )
                        db.add(content)
            
            db.commit()
            
            return {
                "status": "success",
                "total_documents": len(paperless_docs),
                "new_documents": synced_count,
                "updated_documents": updated_count
            }
            
    except Exception as e:
        logger.error(f"Error syncing documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))