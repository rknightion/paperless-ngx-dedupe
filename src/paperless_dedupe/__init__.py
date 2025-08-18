__version__ = "0.1.0"

def main():
    import uvicorn
    
    uvicorn.run(
        "paperless_dedupe.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

if __name__ == "__main__":
    main()