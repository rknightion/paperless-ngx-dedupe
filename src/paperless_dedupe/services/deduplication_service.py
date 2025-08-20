import hashlib
import re
from typing import List, Tuple, Dict, Optional, Callable
from datasketch import MinHash, MinHashLSH
from rapidfuzz import fuzz
import logging
from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import Document, DocumentContent, DuplicateGroup, DuplicateMember
from sqlalchemy.orm import Session
import pickle
import asyncio

logger = logging.getLogger(__name__)

class DeduplicationService:
    def __init__(self):
        self.lsh_index = MinHashLSH(
            threshold=settings.lsh_threshold,
            num_perm=settings.minhash_num_perm
        )
        self.minhashes = {}
        
    def preprocess_text(self, text: str) -> str:
        """Preprocess text for deduplication"""
        if not text:
            return ""
            
        # Convert to lowercase
        text = text.lower()
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove special characters but keep alphanumeric and spaces
        text = re.sub(r'[^\w\s]', '', text)
        
        # Trim
        text = text.strip()
        
        return text
    
    def create_minhash(self, text: str) -> MinHash:
        """Create MinHash signature for text"""
        preprocessed = self.preprocess_text(text)
        
        if not preprocessed:
            return None
            
        # Create MinHash object
        minhash = MinHash(num_perm=settings.minhash_num_perm)
        
        # Create shingles (3-gram word shingles)
        words = preprocessed.split()
        for i in range(len(words) - 2):
            shingle = ' '.join(words[i:i+3])
            minhash.update(shingle.encode('utf-8'))
        
        return minhash
    
    def calculate_similarity_score(
        self,
        doc1: Document,
        doc2: Document,
        text1: str,
        text2: str,
        quick_mode: bool = False
    ) -> float:
        """Calculate comprehensive similarity score between two documents
        
        Args:
            quick_mode: If True, skip expensive fuzzy string operations
        """
        
        scores = []
        weights = []
        
        # MinHash Jaccard similarity (FAST - already computed)
        if doc1.id in self.minhashes and doc2.id in self.minhashes:
            jaccard_sim = self.minhashes[doc1.id].jaccard(self.minhashes[doc2.id])
            scores.append(jaccard_sim)
            weights.append(0.6 if quick_mode else 0.4)
        
        # File size similarity (FAST)
        if doc1.file_size and doc2.file_size:
            size_ratio = min(doc1.file_size, doc2.file_size) / max(doc1.file_size, doc2.file_size)
            scores.append(size_ratio)
            weights.append(0.4 if quick_mode else 0.1)
        
        # Skip expensive fuzzy matching in quick mode or if disabled
        if not quick_mode and settings.enable_fuzzy_matching and text1 and text2:
            # Limit text size for fuzzy matching to improve performance
            sample_size = settings.fuzzy_match_sample_size
            text1_sample = text1[:sample_size]
            text2_sample = text2[:sample_size]
            
            # Token sort ratio handles word order differences (EXPENSIVE)
            fuzzy_score = fuzz.token_sort_ratio(text1_sample, text2_sample) / 100.0
            scores.append(fuzzy_score)
            weights.append(0.3)
            
            # Skip partial ratio - it's redundant and expensive
            # partial_score = fuzz.partial_ratio(text1_sample, text2_sample) / 100.0
            # scores.append(partial_score)
            # weights.append(0.2)
        
        # Calculate weighted average
        if scores:
            total_weight = sum(weights[:len(scores)])
            weighted_score = sum(s * w for s, w in zip(scores, weights)) / total_weight
            return weighted_score
        
        return 0.0
    
    async def build_lsh_index(
        self, 
        documents: List[Document], 
        contents: Dict[int, str],
        progress_callback: Optional[Callable] = None
    ):
        """Build LSH index for all documents"""
        logger.info(f"Building LSH index for {len(documents)} documents")
        
        self.lsh_index = MinHashLSH(
            threshold=settings.lsh_threshold,
            num_perm=settings.minhash_num_perm
        )
        self.minhashes = {}
        
        total_docs = len(documents)
        processed = 0
        
        for idx, doc in enumerate(documents):
            if doc.id not in contents or not contents[doc.id]:
                continue
                
            minhash = self.create_minhash(contents[doc.id])
            if minhash:
                self.minhashes[doc.id] = minhash
                self.lsh_index.insert(f"doc_{doc.id}", minhash)
            
            processed += 1
            
            # Report progress every 100 documents or on last
            if progress_callback and (processed % 100 == 0 or idx == total_docs - 1):
                await progress_callback(
                    "Building LSH index",
                    processed,
                    total_docs
                )
            
            # Yield control periodically to prevent blocking
            if processed % 50 == 0:
                await asyncio.sleep(0)
        
        logger.info(f"LSH index built with {len(self.minhashes)} documents")
    
    async def find_duplicates(
        self,
        documents: List[Document],
        contents: Dict[int, str],
        threshold: float = None,
        progress_callback: Optional[Callable] = None
    ) -> List[Dict]:
        """Find duplicate document groups"""
        
        threshold = threshold or (settings.fuzzy_match_threshold / 100.0)
        
        # Build LSH index with progress tracking
        await self.build_lsh_index(documents, contents, progress_callback)
        
        logger.info(f"Starting duplicate detection for {len(documents)} documents with threshold {threshold}")
        
        # Find duplicate groups
        duplicate_groups = []
        processed = set()
        total_docs = len(documents)
        total_comparisons = 0
        candidates_found = 0
        
        # Create document lookup dict for O(1) access
        doc_lookup = {doc.id: doc for doc in documents}
        
        for idx, doc in enumerate(documents):
            if doc.id in processed or doc.id not in self.minhashes:
                continue
                
            # Query LSH for similar documents (FAST)
            candidates = self.lsh_index.query(self.minhashes[doc.id])
            
            if len(candidates) > 1:  # Found potential duplicates
                candidates_found += len(candidates) - 1
                group_docs = []
                group_scores = {}
                
                # Log every 100 documents that have candidates
                if candidates_found % 100 == 0:
                    logger.info(f"Processing document {idx+1}/{total_docs}, found {candidates_found} total candidates so far")
                
                for candidate_key in candidates:
                    candidate_id = int(candidate_key.replace("doc_", ""))
                    
                    if candidate_id != doc.id and candidate_id not in processed:
                        candidate_doc = doc_lookup.get(candidate_id)
                        
                        if candidate_doc:
                            total_comparisons += 1
                            
                            # First do a quick check with MinHash only
                            quick_score = self.calculate_similarity_score(
                                doc,
                                candidate_doc,
                                "",  # No text for quick check
                                "",  # No text for quick check
                                quick_mode=True
                            )
                            
                            # Only do expensive fuzzy matching if quick score is promising
                            if quick_score >= threshold * 0.8:  # 80% of threshold for quick check
                                score = self.calculate_similarity_score(
                                    doc,
                                    candidate_doc,
                                    contents.get(doc.id, ""),
                                    contents.get(candidate_id, ""),
                                    quick_mode=False
                                )
                                
                                if score >= threshold:
                                    group_docs.append(candidate_doc)
                                    group_scores[candidate_id] = score
                                    processed.add(candidate_id)
                
                if group_docs:
                    # Add the primary document
                    group_docs.insert(0, doc)
                    processed.add(doc.id)
                    
                    # Calculate average confidence
                    avg_confidence = sum(group_scores.values()) / len(group_scores) if group_scores else 0
                    
                    duplicate_groups.append({
                        "documents": group_docs,
                        "confidence": avg_confidence,
                        "scores": group_scores
                    })
            
            # Report progress more frequently during the computationally intensive phase
            if progress_callback and ((idx + 1) % 50 == 0 or idx == total_docs - 1):
                await progress_callback(
                    f"Analyzing documents for duplicates ({total_comparisons} comparisons)",
                    idx + 1,
                    total_docs
                )
            
            # Yield control more frequently to prevent blocking
            if (idx + 1) % 20 == 0:
                await asyncio.sleep(0)
        
        logger.info(f"Duplicate detection complete: Found {len(duplicate_groups)} groups from {total_comparisons} comparisons")
        return duplicate_groups
    
    def save_duplicate_groups(self, db: Session, duplicate_groups: List[Dict]):
        """Save duplicate groups to database"""
        
        for group_data in duplicate_groups:
            # Create duplicate group
            group = DuplicateGroup(
                confidence_score=group_data["confidence"],
                algorithm_version="1.0"
            )
            db.add(group)
            db.flush()
            
            # Add members
            for idx, doc in enumerate(group_data["documents"]):
                member = DuplicateMember(
                    group_id=group.id,
                    document_id=doc.id,
                    is_primary=(idx == 0)
                )
                db.add(member)
            
        db.commit()
        logger.info(f"Saved {len(duplicate_groups)} duplicate groups to database")
    
    def get_document_hash(self, text: str) -> str:
        """Generate hash of document content"""
        if not text:
            return None
            
        preprocessed = self.preprocess_text(text)
        return hashlib.sha256(preprocessed.encode()).hexdigest()
    
    def serialize_minhash(self, minhash: MinHash) -> bytes:
        """Serialize MinHash for storage"""
        if not minhash:
            return None
        return pickle.dumps(minhash)
    
    def deserialize_minhash(self, data: bytes) -> MinHash:
        """Deserialize MinHash from storage"""
        if not data:
            return None
        return pickle.loads(data)