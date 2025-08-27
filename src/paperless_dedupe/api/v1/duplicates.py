import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from paperless_dedupe.models.database import (
    Document,
    DuplicateGroup,
    DuplicateMember,
    get_db,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class DuplicateGroupResponse(BaseModel):
    id: str
    confidence: float
    documents: list[dict]
    reviewed: bool
    created_at: str
    updated_at: str
    confidence_breakdown: dict | None = None


class DuplicateGroupsListResponse(BaseModel):
    groups: list[DuplicateGroupResponse]
    count: int
    page: int
    page_size: int
    total_pages: int


class MarkReviewedRequest(BaseModel):
    reviewed: bool = True
    resolved: bool = False


class ConfidenceWeights(BaseModel):
    jaccard: bool = True
    fuzzy: bool = True
    metadata: bool = True
    filename: bool = True


@router.get("/groups", response_model=DuplicateGroupsListResponse)
async def get_duplicate_groups(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    reviewed: bool | None = None,
    resolved: bool | None = None,
    sort_by: str = Query(
        "confidence", regex="^(confidence|created|documents|filename)$"
    ),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    # Dynamic confidence weights for filtering (optional)
    use_jaccard: bool = Query(True),
    use_fuzzy: bool = Query(True),
    use_metadata: bool = Query(True),
    use_filename: bool = Query(True),
    min_fuzzy_ratio: float = Query(0.0, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
):
    """Get list of duplicate groups with pagination and dynamic confidence recalculation"""
    try:
        logger.debug(
            f"Getting duplicate groups: page={page}, page_size={page_size}, sort_by={sort_by}, sort_order={sort_order}"
        )
        query = db.query(DuplicateGroup)

        # Build confidence weights for dynamic recalculation
        weights = {
            "jaccard": use_jaccard,
            "fuzzy": use_fuzzy,
            "metadata": use_metadata,
            "filename": use_filename,
        }

        # Apply filters - filter by fuzzy ratio if specified (minimum 50%)
        if min_fuzzy_ratio > 0.5:
            query = query.filter(DuplicateGroup.fuzzy_text_ratio >= min_fuzzy_ratio)
        if reviewed is not None:
            query = query.filter(DuplicateGroup.reviewed == reviewed)
        if resolved is not None:
            query = query.filter(DuplicateGroup.resolved == resolved)

        # Get total count before any joins for sorting
        from sqlalchemy import func

        total_count = query.count()

        # Apply sorting
        if sort_by == "confidence":
            order_col = DuplicateGroup.confidence_score
        elif sort_by == "created":
            order_col = DuplicateGroup.created_at
        elif sort_by == "documents":
            # Sort by number of documents in the group - this requires a subquery
            subquery = (
                db.query(
                    DuplicateMember.group_id,
                    func.count(DuplicateMember.id).label("doc_count"),
                )
                .group_by(DuplicateMember.group_id)
                .subquery()
            )
            query = query.outerjoin(subquery, DuplicateGroup.id == subquery.c.group_id)
            order_col = func.coalesce(
                subquery.c.doc_count, 0
            )  # Handle NULLs from outer join
        elif sort_by == "filename":
            # Sort by primary document's filename
            from sqlalchemy.orm import aliased

            primary_member = aliased(DuplicateMember)
            primary_doc = aliased(Document)
            query = query.outerjoin(
                primary_member,
                (DuplicateGroup.id == primary_member.group_id)
                & (primary_member.is_primary == True),
            ).outerjoin(primary_doc, primary_member.document_id == primary_doc.id)
            order_col = func.coalesce(primary_doc.original_filename, "")
        else:
            # Default to confidence
            order_col = DuplicateGroup.confidence_score

        if sort_order == "desc":
            query = query.order_by(order_col.desc())
        else:
            query = query.order_by(order_col.asc())
        total_pages = (total_count + page_size - 1) // page_size

        # Calculate skip from page number
        skip = (page - 1) * page_size

        groups = query.offset(skip).limit(page_size).all()

        result = []
        skipped_count = 0
        for group in groups:
            # Recalculate confidence based on provided weights
            recalculated_confidence = group.recalculate_confidence(weights)

            # Skip if below minimum confidence after recalculation
            if recalculated_confidence < min_confidence:
                skipped_count += 1
                continue

            documents = []
            for member in group.members:
                doc_data = {
                    "id": member.document.id,
                    "paperless_id": member.document.paperless_id,
                    "title": member.document.title,
                    "is_primary": member.is_primary,
                    "created": member.document.created_date.isoformat()
                    if member.document.created_date
                    else None,
                    "file_type": "pdf",  # TODO: Get from document metadata
                    "archive_serial_number": member.document.id,  # Using ID as placeholder
                    "correspondent": member.document.correspondent,
                    "document_type": member.document.document_type,
                    "tags": member.document.tags if member.document.tags else [],
                    "original_filename": member.document.original_filename,
                    "file_size": member.document.file_size,
                }
            documents.append(doc_data)

        # Use actual component scores if available, otherwise estimate from total
        if group.jaccard_similarity is not None:
            confidence_breakdown = {
                "jaccard_similarity": group.jaccard_similarity if use_jaccard else None,
                "fuzzy_text_ratio": group.fuzzy_text_ratio if use_fuzzy else None,
                "metadata_similarity": group.metadata_similarity
                if use_metadata
                else None,
                "filename_similarity": group.filename_similarity
                if use_filename
                else None,
            }
        else:
            # Legacy groups - estimate breakdown
            confidence_breakdown = {
                "jaccard_similarity": group.confidence_score if use_jaccard else None,
                "fuzzy_text_ratio": group.confidence_score * 0.95
                if use_fuzzy
                else None,
                "metadata_similarity": group.confidence_score * 0.85
                if use_metadata
                else None,
                "filename_similarity": group.confidence_score * 0.75
                if use_filename
                else None,
            }

        result.append(
            DuplicateGroupResponse(
                id=str(group.id),
                confidence=recalculated_confidence,  # Use recalculated confidence
                documents=documents,
                reviewed=group.reviewed,
                created_at=group.created_at.isoformat() if group.created_at else "",
                updated_at=group.created_at.isoformat() if group.created_at else "",
                confidence_breakdown=confidence_breakdown,
            )
        )

        # Adjust total count to account for filtered groups
        adjusted_count = total_count - skipped_count

        return DuplicateGroupsListResponse(
            groups=result,
            count=adjusted_count,
            page=page,
            page_size=page_size,
            total_pages=(adjusted_count + page_size - 1) // page_size,
        )
    except Exception as e:
        logger.error(f"Error in get_duplicate_groups: {str(e)}")
        logger.error(
            f"Parameters: sort_by={sort_by}, sort_order={sort_order}, page={page}, page_size={page_size}"
        )
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching duplicate groups: {str(e)}"
        )


@router.get("/groups/{group_id}", response_model=DuplicateGroupResponse)
async def get_duplicate_group(group_id: int, db: Session = Depends(get_db)):
    """Get single duplicate group"""
    group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Duplicate group not found")

    documents = []
    for member in group.members:
        documents.append(
            {
                "id": member.document.id,
                "paperless_id": member.document.paperless_id,
                "title": member.document.title,
                "is_primary": member.is_primary,
                "file_size": member.document.file_size,
                "created_date": member.document.created_date.isoformat()
                if member.document.created_date
                else None,
            }
        )

    return DuplicateGroupResponse(
        id=str(group.id),
        confidence=group.confidence_score,
        documents=documents,
        reviewed=group.reviewed,
        created_at=group.created_at.isoformat() if group.created_at else "",
        updated_at=group.created_at.isoformat()
        if group.created_at
        else "",  # Use created_at since updated_at doesn't exist
        confidence_breakdown={
            "jaccard_similarity": group.confidence_score,
            "fuzzy_text_ratio": group.confidence_score * 0.95,
            "metadata_similarity": group.confidence_score * 0.85,
            "filename_similarity": group.confidence_score * 0.75,
        }
        if group.confidence_score
        else None,
    )


@router.post("/groups/{group_id}/review")
async def mark_group_reviewed(
    group_id: int, request: MarkReviewedRequest, db: Session = Depends(get_db)
):
    """Mark a duplicate group as reviewed/resolved"""
    group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Duplicate group not found")

    group.reviewed = request.reviewed
    group.resolved = request.resolved
    db.commit()

    return {
        "status": "success",
        "group_id": group_id,
        "reviewed": group.reviewed,
        "resolved": group.resolved,
    }


@router.delete("/groups/{group_id}")
async def delete_duplicate_group(group_id: int, db: Session = Depends(get_db)):
    """Delete a duplicate group (marks as false positive)"""
    group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Duplicate group not found")

    db.delete(group)
    db.commit()

    return {"status": "success", "message": f"Duplicate group {group_id} deleted"}


@router.get("/statistics")
async def get_duplicate_statistics(db: Session = Depends(get_db)):
    """Get statistics about duplicates"""
    total_groups = db.query(DuplicateGroup).count()
    reviewed_groups = (
        db.query(DuplicateGroup).filter(DuplicateGroup.reviewed == True).count()
    )
    resolved_groups = (
        db.query(DuplicateGroup).filter(DuplicateGroup.resolved == True).count()
    )

    # Get confidence distribution
    groups = db.query(DuplicateGroup).all()
    confidence_distribution = {
        "high": sum(1 for g in groups if g.confidence_score >= 0.8),
        "medium": sum(1 for g in groups if 0.5 <= g.confidence_score < 0.8),
        "low": sum(1 for g in groups if g.confidence_score < 0.5),
    }

    # Calculate total duplicate documents and potential deletions
    total_duplicate_documents = 0
    potential_deletions = 0

    for group in groups:
        if len(group.members) > 1:
            # All documents in the group are duplicates
            total_duplicate_documents += len(group.members)
            # Can potentially delete all but one document
            potential_deletions += len(group.members) - 1

    # Still calculate space savings for legacy compatibility
    total_duplicate_size = 0
    for group in groups:
        if len(group.members) > 1:
            for member in group.members:
                if not member.is_primary and member.document.file_size:
                    total_duplicate_size += member.document.file_size

    return {
        "total_groups": total_groups,
        "total_duplicates": total_duplicate_documents,  # Fixed: Now returns actual count
        "potential_deletions": potential_deletions,  # New: Number of documents that can be deleted
        "reviewed_groups": reviewed_groups,
        "resolved_groups": resolved_groups,
        "unreviewed_groups": total_groups - reviewed_groups,
        "confidence_distribution": confidence_distribution,
        "potential_space_savings": total_duplicate_size,  # Kept for compatibility
        "potential_space_savings_bytes": total_duplicate_size,
        "potential_space_savings_mb": round(total_duplicate_size / (1024 * 1024), 2),
    }
