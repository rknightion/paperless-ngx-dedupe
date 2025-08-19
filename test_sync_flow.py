#!/usr/bin/env python3
"""
Test script to verify document sync and deduplication flow
"""
import asyncio
import httpx
import json
import time

BASE_URL = "http://localhost:8000/api/v1"

async def test_connection():
    """Test connection to paperless"""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/config/test-connection")
        print(f"Connection test: {response.status_code}")
        if response.status_code == 200:
            print("✅ Connection successful")
            return True
        else:
            print(f"❌ Connection failed: {response.text}")
            return False

async def start_sync():
    """Start document sync"""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/documents/sync")
        print(f"Sync start: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Sync started: {data}")
            return True
        else:
            print(f"❌ Sync failed to start: {response.text}")
            return False

async def check_sync_status():
    """Check sync status"""
    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(f"{BASE_URL}/documents/sync/status")
            if response.status_code == 200:
                status = response.json()
                print(f"Sync status: {status['current_step']} - {status['progress']}/{status['total']}")
                
                if not status['is_syncing']:
                    if status['error']:
                        print(f"❌ Sync error: {status['error']}")
                        return False
                    else:
                        print(f"✅ Sync completed: {status['documents_synced']} new, {status['documents_updated']} updated")
                        return True
            else:
                print(f"Failed to get sync status: {response.status_code}")
                return False
            
            await asyncio.sleep(2)

async def get_document_count():
    """Get document count"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/documents/?limit=1")
        if response.status_code == 200:
            docs = response.json()
            print(f"📄 Documents in database: {len(docs)}")
            return len(docs)
        return 0

async def start_analysis():
    """Start deduplication analysis"""
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/processing/analyze")
        print(f"Analysis start: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Analysis started: {data}")
            return True
        elif response.status_code == 400:
            print(f"❌ Analysis failed: {response.text}")
            return False
        else:
            print(f"❌ Unexpected error: {response.text}")
            return False

async def check_analysis_status():
    """Check analysis status"""
    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(f"{BASE_URL}/processing/status")
            if response.status_code == 200:
                status = response.json()
                print(f"Analysis status: {status['current_step']} - {status['progress']}/{status['total']}")
                
                if not status['is_processing']:
                    if status['error']:
                        print(f"❌ Analysis error: {status['error']}")
                        return False
                    else:
                        print(f"✅ Analysis completed")
                        return True
            else:
                print(f"Failed to get analysis status: {response.status_code}")
                return False
            
            await asyncio.sleep(2)

async def get_duplicate_groups():
    """Get duplicate groups"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/duplicates/groups")
        if response.status_code == 200:
            groups = response.json()
            print(f"🔍 Found {len(groups)} duplicate groups")
            for group in groups[:5]:  # Show first 5
                print(f"  - Group {group['id']}: {group['document_count']} documents, confidence: {group['confidence_score']:.2f}")
            return len(groups)
        return 0

async def main():
    """Main test flow"""
    print("=" * 50)
    print("Testing Document Sync and Deduplication Flow")
    print("=" * 50)
    
    # Test connection
    print("\n1. Testing connection to Paperless...")
    if not await test_connection():
        print("Please configure Paperless connection first!")
        return
    
    # Check current document count
    print("\n2. Checking current document count...")
    initial_count = await get_document_count()
    
    # Start sync if no documents
    if initial_count == 0:
        print("\n3. No documents found. Starting sync...")
        if await start_sync():
            print("Waiting for sync to complete...")
            if await check_sync_status():
                print("Sync completed successfully!")
            else:
                print("Sync failed!")
                return
    else:
        print(f"\n3. Found {initial_count} documents. Skipping sync.")
    
    # Check document count after sync
    print("\n4. Checking document count after sync...")
    doc_count = await get_document_count()
    
    if doc_count == 0:
        print("No documents available for analysis!")
        return
    
    # Start analysis
    print(f"\n5. Starting deduplication analysis on {doc_count} documents...")
    if await start_analysis():
        print("Waiting for analysis to complete...")
        if await check_analysis_status():
            print("Analysis completed successfully!")
        else:
            print("Analysis failed!")
            return
    
    # Get results
    print("\n6. Getting duplicate groups...")
    group_count = await get_duplicate_groups()
    
    print("\n" + "=" * 50)
    print("Test Summary:")
    print(f"  ✅ Documents synced: {doc_count}")
    print(f"  ✅ Duplicate groups found: {group_count}")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(main())