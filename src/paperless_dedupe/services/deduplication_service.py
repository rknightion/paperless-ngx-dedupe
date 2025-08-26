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
    ) -> Tuple[float, Dict[str, float]]:
        """Calculate comprehensive similarity score between two documents
        
        Args:
            quick_mode: If True, skip expensive fuzzy string operations
            
        Returns:
            Tuple of (overall_score, component_scores_dict)
        """
        
        component_scores = {
            'jaccard': None,
            'fuzzy': None,
            'metadata': None,
            'filename': None
        }
        
        scores = []
        weights = []
        
        # MinHash Jaccard similarity (FAST - already computed)
        if doc1.id in self.minhashes and doc2.id in self.minhashes:
            jaccard_sim = self.minhashes[doc1.id].jaccard(self.minhashes[doc2.id])
            component_scores['jaccard'] = jaccard_sim
            scores.append(jaccard_sim)
            weights.append(0.4)
        
        # Metadata similarity - combine multiple factors
        metadata_scores = []
        
        # File size similarity
        if doc1.file_size and doc2.file_size:
            size_ratio = min(doc1.file_size, doc2.file_size) / max(doc1.file_size, doc2.file_size)
            metadata_scores.append(size_ratio)
        
        # Date similarity (if both have dates)
        if doc1.created_date and doc2.created_date:
            from datetime import timedelta
            time_diff = abs((doc1.created_date - doc2.created_date).total_seconds())
            # Documents within 24 hours get high score, decreasing over time
            date_score = max(0, 1 - (time_diff / (86400 * 30)))  # 30 days max
            metadata_scores.append(date_score)
        
        # Document type similarity
        if doc1.document_type and doc2.document_type:
            type_score = 1.0 if doc1.document_type == doc2.document_type else 0.0
            metadata_scores.append(type_score)
            
        # Correspondent similarity
        if doc1.correspondent and doc2.correspondent:
            corr_score = 1.0 if doc1.correspondent == doc2.correspondent else 0.0
            metadata_scores.append(corr_score)
        
        if metadata_scores:
            component_scores['metadata'] = sum(metadata_scores) / len(metadata_scores)
            if not quick_mode:  # Only use metadata in full mode
                scores.append(component_scores['metadata'])
                weights.append(0.2)
        
        # Filename similarity
        if doc1.original_filename and doc2.original_filename and not quick_mode:
            filename_score = fuzz.ratio(doc1.original_filename.lower(), doc2.original_filename.lower()) / 100.0
            component_scores['filename'] = filename_score
            scores.append(filename_score)
            weights.append(0.1)
        
        # Skip expensive fuzzy matching in quick mode or if disabled
        if not quick_mode and settings.enable_fuzzy_matching and text1 and text2:
            # Limit text size for fuzzy matching to improve performance
            sample_size = settings.fuzzy_match_sample_size
            text1_sample = text1[:sample_size]
            text2_sample = text2[:sample_size]
            
            # Token sort ratio handles word order differences (EXPENSIVE)
            fuzzy_score = fuzz.token_sort_ratio(text1_sample, text2_sample) / 100.0
            component_scores['fuzzy'] = fuzzy_score
            scores.append(fuzzy_score)
            weights.append(0.3)
        
        # Calculate weighted average
        if scores:
            total_weight = sum(weights[:len(scores)])
            weighted_score = sum(s * w for s, w in zip(scores, weights)) / total_weight
            return weighted_score, component_scores
        
        return 0.0, component_scores
    
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
            
            # Skip documents with too few words
            word_count = len(contents[doc.id].split())
            if word_count < settings.min_ocr_word_count:
                logger.debug(f"Skipping document {doc.id} with only {word_count} words (min: {settings.min_ocr_word_count})")
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
                            quick_score, _ = self.calculate_similarity_score(
                                doc,
                                candidate_doc,
                                "",  # No text for quick check
                                "",  # No text for quick check
                                quick_mode=True
                            )
                            
                            # Only do expensive fuzzy matching if quick score is promising
                            if quick_score >= threshold * 0.8:  # 80% of threshold for quick check
                                score, components = self.calculate_similarity_score(
                                    doc,
                                    candidate_doc,
                                    contents.get(doc.id, ""),
                                    contents.get(candidate_id, ""),
                                    quick_mode=False
                                )
                                
                                # Store groups with fuzzy score >= 50% (baseline threshold)
                                # This allows dynamic filtering later
                                min_fuzzy = settings.min_fuzzy_threshold / 100.0 if hasattr(settings, 'min_fuzzy_threshold') else 0.5
                                if components.get('fuzzy', 0) >= min_fuzzy or score >= threshold:
                                    group_docs.append(candidate_doc)
                                    group_scores[candidate_id] = {'overall': score, 'components': components}
                                    processed.add(candidate_id)
                
                if group_docs:
                    # Add the primary document
                    group_docs.insert(0, doc)
                    processed.add(doc.id)
                    
                    # Calculate average confidence and component averages
                    if group_scores:
                        avg_confidence = sum(s['overall'] for s in group_scores.values()) / len(group_scores)
                        
                        # Calculate average component scores
                        avg_components = {}
                        for component in ['jaccard', 'fuzzy', 'metadata', 'filename']:
                            component_vals = [s['components'][component] for s in group_scores.values() 
                                            if s['components'][component] is not None]
                            avg_components[component] = sum(component_vals) / len(component_vals) if component_vals else None
                    else:
                        avg_confidence = 0
                        avg_components = {}
                    
                    duplicate_groups.append({
                        "documents": group_docs,
                        "confidence": avg_confidence,
                        "component_scores": avg_components,
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
        """Save duplicate groups to database with component scores"""
        
        for group_data in duplicate_groups:
            # Create duplicate group with component scores
            components = group_data.get("component_scores", {})
            group = DuplicateGroup(
                confidence_score=group_data["confidence"],
                jaccard_similarity=components.get('jaccard'),
                fuzzy_text_ratio=components.get('fuzzy'),
                metadata_similarity=components.get('metadata'),
                filename_similarity=components.get('filename'),
                algorithm_version="2.0"  # Updated version for new scoring
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
        logger.info(f"Saved {len(duplicate_groups)} duplicate groups to database with component scores")
    
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