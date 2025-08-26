from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, LargeBinary, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from paperless_dedupe.core.config import settings

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    paperless_id = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String(500))
    fingerprint = Column(String(64), unique=True, index=True)
    minhash_signature = Column(LargeBinary)
    content_hash = Column(String(64))
    ocr_confidence = Column(Float)
    file_size = Column(Integer)
    created_date = Column(DateTime)
    last_processed = Column(DateTime, default=datetime.utcnow)
    processing_status = Column(String(20), default="pending")
    
    # Additional metadata fields
    correspondent = Column(String(200))
    document_type = Column(String(200))
    tags = Column(JSON)  # Store tags as JSON array
    archive_filename = Column(String(500))
    original_filename = Column(String(500))
    added_date = Column(DateTime)
    modified_date = Column(DateTime)
    
    # Relationships
    content = relationship("DocumentContent", back_populates="document", uselist=False, cascade="all, delete-orphan")
    duplicate_memberships = relationship("DuplicateMember", back_populates="document", cascade="all, delete-orphan")

class DocumentContent(Base):
    __tablename__ = "document_content"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), unique=True)
    full_text = Column(Text)
    normalized_text = Column(Text)
    word_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    document = relationship("Document", back_populates="content")

class DuplicateGroup(Base):
    __tablename__ = "duplicate_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    confidence_score = Column(Float)  # Aggregated score (can be recalculated)
    
    # Individual component scores for dynamic recalculation
    jaccard_similarity = Column(Float)  # Jaccard similarity (0-1)
    fuzzy_text_ratio = Column(Float)    # Fuzzy text matching ratio (0-1)
    metadata_similarity = Column(Float)  # Metadata matching score (0-1)
    filename_similarity = Column(Float)  # Filename similarity score (0-1)
    
    algorithm_version = Column(String(10), default="2.0")  # Updated version
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed = Column(Boolean, default=False)
    resolved = Column(Boolean, default=False)
    
    # Relationships
    members = relationship("DuplicateMember", back_populates="group", cascade="all, delete-orphan")
    
    def recalculate_confidence(self, weights: dict) -> float:
        """Recalculate confidence score based on provided weights"""
        scores = []
        total_weight = 0
        
        if weights.get('jaccard', True) and self.jaccard_similarity is not None:
            scores.append((self.jaccard_similarity, 0.4))
            total_weight += 0.4
            
        if weights.get('fuzzy', True) and self.fuzzy_text_ratio is not None:
            scores.append((self.fuzzy_text_ratio, 0.3))
            total_weight += 0.3
            
        if weights.get('metadata', True) and self.metadata_similarity is not None:
            scores.append((self.metadata_similarity, 0.2))
            total_weight += 0.2
            
        if weights.get('filename', True) and self.filename_similarity is not None:
            scores.append((self.filename_similarity, 0.1))
            total_weight += 0.1
            
        if not scores:
            return 0.0
            
        # Normalize weights and calculate weighted average
        weighted_sum = sum(score * weight for score, weight in scores)
        return weighted_sum / total_weight if total_weight > 0 else 0.0

class DuplicateMember(Base):
    __tablename__ = "duplicate_members"
    
    group_id = Column(Integer, ForeignKey("duplicate_groups.id"), primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id"), primary_key=True)
    is_primary = Column(Boolean, default=False)
    
    # Relationships
    group = relationship("DuplicateGroup", back_populates="members")
    document = relationship("Document", back_populates="duplicate_memberships")

class AppConfig(Base):
    __tablename__ = "app_config"
    
    key = Column(String(100), primary_key=True)
    value = Column(JSON)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Database setup
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,   # Recycle connections after 1 hour
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)