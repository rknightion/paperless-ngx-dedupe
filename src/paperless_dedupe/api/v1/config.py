from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from paperless_dedupe.models.database import get_db, AppConfig
from paperless_dedupe.core.config import settings
from paperless_dedupe.services.paperless_client import PaperlessClient
from pydantic import BaseModel, Field
from typing import Optional
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class ConfigUpdate(BaseModel):
    paperless_url: Optional[str] = Field(None, description="Paperless-ngx API URL")
    paperless_api_token: Optional[str] = Field(None, description="API Token for authentication")
    paperless_username: Optional[str] = Field(None, description="Username for authentication")
    paperless_password: Optional[str] = Field(None, description="Password for authentication")
    fuzzy_match_threshold: Optional[int] = Field(None, ge=0, le=100, description="Fuzzy matching threshold (0-100)")
    max_ocr_length: Optional[int] = Field(None, ge=1000, description="Maximum OCR text length to store")
    lsh_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="LSH similarity threshold")

class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    paperless_version: Optional[str] = None

@router.get("/")
async def get_config(db: Session = Depends(get_db)):
    """Get current configuration"""
    # Get config from database
    db_config = {}
    config_items = db.query(AppConfig).all()
    for item in config_items:
        db_config[item.key] = item.value
    
    # Merge with settings
    return {
        "paperless_url": db_config.get("paperless_url", settings.paperless_url),
        "paperless_api_configured": bool(
            db_config.get("paperless_api_token", settings.paperless_api_token) or
            (db_config.get("paperless_username", settings.paperless_username) and 
             db_config.get("paperless_password", settings.paperless_password))
        ),
        "fuzzy_match_threshold": db_config.get("fuzzy_match_threshold", settings.fuzzy_match_threshold),
        "max_ocr_length": db_config.get("max_ocr_length", settings.max_ocr_length),
        "lsh_threshold": db_config.get("lsh_threshold", settings.lsh_threshold),
        "minhash_num_perm": settings.minhash_num_perm,
        "lsh_num_bands": settings.lsh_num_bands,
        "api_rate_limit": settings.api_rate_limit,
        "api_page_size": settings.api_page_size
    }

@router.put("/")
async def update_config(
    config_update: ConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update configuration"""
    updated_fields = []
    
    # Update each provided field
    for field, value in config_update.dict(exclude_unset=True).items():
        if value is not None:
            # Check if config exists
            config_item = db.query(AppConfig).filter(AppConfig.key == field).first()
            
            if config_item:
                config_item.value = value
            else:
                config_item = AppConfig(key=field, value=value)
                db.add(config_item)
            
            updated_fields.append(field)
            
            # Update runtime settings
            if hasattr(settings, field):
                setattr(settings, field, value)
    
    db.commit()
    
    return {
        "status": "success",
        "updated_fields": updated_fields,
        "message": f"Updated {len(updated_fields)} configuration fields"
    }

@router.post("/test-connection")
async def test_paperless_connection(db: Session = Depends(get_db)):
    """Test connection to paperless-ngx API"""
    # Get current config
    config_items = {item.key: item.value for item in db.query(AppConfig).all()}
    
    # Override settings with database config
    test_settings = {
        "paperless_url": config_items.get("paperless_url", settings.paperless_url),
        "paperless_api_token": config_items.get("paperless_api_token", settings.paperless_api_token),
        "paperless_username": config_items.get("paperless_username", settings.paperless_username),
        "paperless_password": config_items.get("paperless_password", settings.paperless_password)
    }
    
    # Temporarily update settings
    original_values = {}
    for key, value in test_settings.items():
        original_values[key] = getattr(settings, key)
        setattr(settings, key, value)
    
    try:
        async with PaperlessClient() as client:
            success = await client.test_connection()
            
            if success:
                # Try to get API info
                try:
                    response = await client._request_with_retry("GET", f"{client.base_url}/api/")
                    api_info = response.json()
                    version = api_info.get("version", "Unknown")
                except:
                    version = None
                
                return ConnectionTestResponse(
                    success=True,
                    message="Successfully connected to paperless-ngx",
                    paperless_version=version
                )
            else:
                return ConnectionTestResponse(
                    success=False,
                    message="Failed to connect to paperless-ngx. Please check your configuration."
                )
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        return ConnectionTestResponse(
            success=False,
            message=f"Connection failed: {str(e)}"
        )
    finally:
        # Restore original settings
        for key, value in original_values.items():
            setattr(settings, key, value)

@router.post("/reset")
async def reset_config(db: Session = Depends(get_db)):
    """Reset configuration to defaults"""
    # Delete all config items
    db.query(AppConfig).delete()
    db.commit()
    
    return {
        "status": "success",
        "message": "Configuration reset to defaults"
    }