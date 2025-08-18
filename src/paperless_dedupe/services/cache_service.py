import json
import pickle
from typing import Optional, Any, Dict, List
import redis.asyncio as redis
from paperless_dedupe.core.config import settings
import logging

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self):
        self.redis_client = None
        
    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = await redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=False
            )
            await self.redis_client.ping()
            logger.info("Connected to Redis cache")
        except Exception as e:
            logger.warning(f"Redis connection failed, using in-memory cache: {e}")
            self.redis_client = None
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
    
    async def get_document_metadata(self, doc_id: int) -> Optional[Dict]:
        """Get cached document metadata"""
        if not self.redis_client:
            return None
            
        key = f"doc:{doc_id}:metadata"
        data = await self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None
    
    async def set_document_metadata(self, doc_id: int, metadata: Dict):
        """Cache document metadata"""
        if not self.redis_client:
            return
            
        key = f"doc:{doc_id}:metadata"
        await self.redis_client.setex(
            key,
            settings.redis_ttl_metadata,
            json.dumps(metadata)
        )
    
    async def get_document_ocr(self, doc_id: int) -> Optional[str]:
        """Get cached OCR text"""
        if not self.redis_client:
            return None
            
        key = f"doc:{doc_id}:ocr"
        data = await self.redis_client.get(key)
        if data:
            return data.decode('utf-8')
        return None
    
    async def set_document_ocr(self, doc_id: int, ocr_text: str):
        """Cache OCR text"""
        if not self.redis_client:
            return
            
        key = f"doc:{doc_id}:ocr"
        # Truncate if too long
        if len(ocr_text) > settings.max_ocr_length:
            ocr_text = ocr_text[:settings.max_ocr_length]
            
        await self.redis_client.setex(
            key,
            settings.redis_ttl_ocr,
            ocr_text.encode('utf-8')
        )
    
    async def get_minhash(self, doc_id: int) -> Optional[bytes]:
        """Get cached MinHash signature"""
        if not self.redis_client:
            return None
            
        key = f"minhash:{doc_id}"
        return await self.redis_client.get(key)
    
    async def set_minhash(self, doc_id: int, signature: bytes):
        """Cache MinHash signature"""
        if not self.redis_client:
            return
            
        key = f"minhash:{doc_id}"
        await self.redis_client.setex(
            key,
            settings.redis_ttl_minhash,
            signature
        )
    
    async def get_duplicate_groups(self) -> Optional[List[Dict]]:
        """Get cached duplicate groups"""
        if not self.redis_client:
            return None
            
        key = "duplicate_groups"
        data = await self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None
    
    async def set_duplicate_groups(self, groups: List[Dict]):
        """Cache duplicate groups"""
        if not self.redis_client:
            return
            
        key = "duplicate_groups"
        await self.redis_client.setex(
            key,
            settings.redis_ttl_metadata,
            json.dumps(groups)
        )
    
    async def invalidate_document(self, doc_id: int):
        """Invalidate all caches for a document"""
        if not self.redis_client:
            return
            
        keys = [
            f"doc:{doc_id}:metadata",
            f"doc:{doc_id}:ocr",
            f"minhash:{doc_id}"
        ]
        
        for key in keys:
            await self.redis_client.delete(key)
    
    async def clear_all(self):
        """Clear all cache entries"""
        if not self.redis_client:
            return
            
        await self.redis_client.flushdb()
        logger.info("Cleared all cache entries")

# Global cache instance
cache_service = CacheService()