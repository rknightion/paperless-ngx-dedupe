__version__ = "0.1.0"

def main():
    import uvicorn
    from paperless_dedupe.core.config import settings
    
    # Configure uvicorn logging based on our log level setting
    log_config = uvicorn.config.LOGGING_CONFIG
    log_level = settings.log_level.upper()
    
    # Set log level for uvicorn and its components
    log_config["loggers"]["uvicorn"]["level"] = log_level
    log_config["loggers"]["uvicorn.error"]["level"] = log_level
    log_config["loggers"]["uvicorn.access"]["level"] = log_level
    
    uvicorn.run(
        "paperless_dedupe.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_config=log_config
    )

if __name__ == "__main__":
    main()