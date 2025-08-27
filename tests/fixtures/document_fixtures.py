"""
Test fixtures for document data and realistic test scenarios
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Dict


@pytest.fixture
def sample_invoice_documents():
    """Sample invoice documents with OCR variations"""
    return [
        {
            "paperless_id": 1,
            "title": "Invoice_2024_001.pdf",
            "fingerprint": "inv001_original",
            "file_size": 124580,
            "created_date": datetime(2024, 1, 15),
            "ocr_content": """
            INVOICE #INV-2024-001

            Date: January 15, 2024
            Due Date: February 15, 2024

            Bill To:
            Acme Corporation
            123 Business Street
            Suite 100
            New York, NY 10001

            Description                    Qty    Rate      Amount
            Consulting Services - January   40    $125.00   $5,000.00
            Software License               1     $500.00    $500.00

            Subtotal:                                      $5,500.00
            Tax (8.25%):                                    $453.75
            Total Due:                                    $5,953.75

            Payment Terms: Net 30
            Thank you for your business!
            """,
        },
        {
            "paperless_id": 2,
            "title": "Invoice_2024_001_scanned.pdf",
            "fingerprint": "inv001_scanned",
            "file_size": 128934,
            "created_date": datetime(2024, 1, 15, 10, 30),
            "ocr_content": """
            INVOICE #INV-2O24-OOl

            Date: January l5, 2024
            Due Date: February l5, 2024

            Bill To:
            Acme Corporation
            l23 Business Street
            Suite lOO
            New York, NY lOOOl

            Description                    Qty    Rate      Amount
            Consulting Services - January   4O    $l25.OO   $5,OOO.OO
            Software License               l     $5OO.OO    $5OO.OO

            Subtotal:                                      $5,5OO.OO
            Tax (8.25%):                                    $453.75
            Total Due:                                    $5,953.75

            Payment Terms: Net 3O
            Thank you for your business!
            """,
        },
        {
            "paperless_id": 3,
            "title": "Invoice_2024_002.pdf",
            "fingerprint": "inv002_original",
            "file_size": 118420,
            "created_date": datetime(2024, 2, 1),
            "ocr_content": """
            INVOICE #INV-2024-002

            Date: February 1, 2024
            Due Date: March 1, 2024

            Bill To:
            Different Company Inc.
            456 Corporate Avenue
            Floor 5
            Chicago, IL 60601

            Description                    Qty    Rate      Amount
            Web Development                60    $100.00   $6,000.00
            Hosting Services               12    $50.00     $600.00

            Subtotal:                                      $6,600.00
            Tax (9.25%):                                    $610.50
            Total Due:                                    $7,210.50

            Payment Terms: Net 30
            Thank you for your business!
            """,
        },
    ]


@pytest.fixture
def sample_receipt_documents():
    """Sample receipt documents with quality variations"""
    return [
        {
            "paperless_id": 10,
            "title": "coffee_receipt_20240115.jpg",
            "fingerprint": "receipt_coffee_hq",
            "file_size": 45680,
            "created_date": datetime(2024, 1, 15, 9, 30),
            "ocr_content": """
            BREW & BEANS COFFEE
            123 Main Street
            Downtown, NY 10002
            Tel: (555) 123-4567

            Date: 01/15/2024
            Time: 09:30 AM
            Order #: 12345

            Cappuccino (Large)          $4.50
            Blueberry Muffin           $3.25
            Extra Shot                 $0.75

            Subtotal:                  $8.50
            Tax:                       $0.68
            Total:                     $9.18

            Payment: Credit Card
            Card: ****1234

            Thank you for your visit!
            """,
        },
        {
            "paperless_id": 11,
            "title": "coffee_receipt_scan.pdf",
            "fingerprint": "receipt_coffee_lq",
            "file_size": 48230,
            "created_date": datetime(2024, 1, 15, 9, 35),
            "ocr_content": """
            BREW & BEANS COFFEE
            l23 Main Street
            Downtown, NY lOOO2
            Tel: (555) l23-4567

            Date: Ol/l5/2O24
            Time: O9:3O AM
            Order #: l2345

            Cappuccino (Large)          $4.5O
            Blueberry Muffin           $3.25
            Extra Shot                 $O.75

            Subtotal:                  $8.5O
            Tax:                       $O.68
            Total:                     $9.l8

            Payment: Credit Card
            Card: ****l234

            Thank you for your visit!
            """,
        },
        {
            "paperless_id": 12,
            "title": "grocery_receipt_20240116.jpg",
            "fingerprint": "receipt_grocery",
            "file_size": 67890,
            "created_date": datetime(2024, 1, 16),
            "ocr_content": """
            FRESH MART GROCERY
            789 Food Street
            Suburb, NY 10003

            Date: 01/16/2024
            Time: 14:25

            Bananas (2 lbs)            $2.98
            Milk (1 gallon)            $3.49
            Bread (whole wheat)        $2.79
            Eggs (dozen)               $3.99
            Cheese (cheddar)           $4.99
            Apples (3 lbs)             $4.47

            Subtotal:                 $22.71
            Tax:                       $0.00
            Total:                    $22.71

            Payment: Debit Card
            """,
        },
    ]


@pytest.fixture
def sample_contract_documents():
    """Sample contract documents with similar templates"""
    return [
        {
            "paperless_id": 20,
            "title": "service_agreement_acme.pdf",
            "fingerprint": "contract_acme_v1",
            "file_size": 234567,
            "created_date": datetime(2024, 1, 10),
            "ocr_content": """
            SERVICE AGREEMENT

            This Service Agreement ("Agreement") is entered into on January 10, 2024,
            between Tech Solutions LLC ("Provider") and Acme Corporation ("Client").

            1. SCOPE OF SERVICES
            Provider agrees to provide software development services including:
            - Web application development
            - Database design and implementation
            - System integration
            - Technical support and maintenance

            2. TERM
            This Agreement shall commence on February 1, 2024, and shall continue
            for a period of twelve (12) months, unless terminated earlier.

            3. COMPENSATION
            Client agrees to pay Provider $10,000 per month for the services.
            Payment is due within 30 days of receipt of invoice.

            4. CONFIDENTIALITY
            Both parties agree to maintain confidentiality of proprietary information.

            IN WITNESS WHEREOF, the parties have executed this Agreement.

            Tech Solutions LLC
            By: John Smith, CEO
            Date: January 10, 2024

            Acme Corporation
            By: Jane Doe, VP
            Date: January 10, 2024
            """,
        },
        {
            "paperless_id": 21,
            "title": "service_agreement_acme_amended.pdf",
            "fingerprint": "contract_acme_v2",
            "file_size": 238901,
            "created_date": datetime(2024, 1, 15),
            "ocr_content": """
            SERVICE AGREEMENT (AMENDED)

            This Service Agreement ("Agreement") is entered into on January 10, 2024,
            between Tech Solutions LLC ("Provider") and Acme Corporation ("Client").

            AMENDMENT dated January 15, 2024:
            The compensation section has been modified as follows.

            1. SCOPE OF SERVICES
            Provider agrees to provide software development services including:
            - Web application development
            - Database design and implementation
            - System integration
            - Technical support and maintenance
            - Additional mobile app development

            2. TERM
            This Agreement shall commence on February 1, 2024, and shall continue
            for a period of twelve (12) months, unless terminated earlier.

            3. COMPENSATION (AMENDED)
            Client agrees to pay Provider $12,000 per month for the services.
            Payment is due within 30 days of receipt of invoice.

            4. CONFIDENTIALITY
            Both parties agree to maintain confidentiality of proprietary information.

            IN WITNESS WHEREOF, the parties have executed this Agreement.

            Tech Solutions LLC
            By: John Smith, CEO
            Date: January 15, 2024

            Acme Corporation
            By: Jane Doe, VP
            Date: January 15, 2024
            """,
        },
        {
            "paperless_id": 22,
            "title": "service_agreement_beta_corp.pdf",
            "fingerprint": "contract_beta",
            "file_size": 241234,
            "created_date": datetime(2024, 2, 5),
            "ocr_content": """
            SERVICE AGREEMENT

            This Service Agreement ("Agreement") is entered into on February 5, 2024,
            between Tech Solutions LLC ("Provider") and Beta Corporation ("Client").

            1. SCOPE OF SERVICES
            Provider agrees to provide software development services including:
            - Mobile application development
            - API development and integration
            - Quality assurance testing
            - Deployment and maintenance

            2. TERM
            This Agreement shall commence on March 1, 2024, and shall continue
            for a period of six (6) months, unless terminated earlier.

            3. COMPENSATION
            Client agrees to pay Provider $8,000 per month for the services.
            Payment is due within 30 days of receipt of invoice.

            4. CONFIDENTIALITY
            Both parties agree to maintain confidentiality of proprietary information.

            IN WITNESS WHEREOF, the parties have executed this Agreement.

            Tech Solutions LLC
            By: John Smith, CEO
            Date: February 5, 2024

            Beta Corporation
            By: Mike Johnson, CTO
            Date: February 5, 2024
            """,
        },
    ]


@pytest.fixture
def sample_mixed_documents():
    """Mixed document types for comprehensive testing"""
    return [
        {
            "paperless_id": 100,
            "title": "bank_statement_jan_2024.pdf",
            "fingerprint": "bank_stmt_jan",
            "file_size": 156789,
            "created_date": datetime(2024, 2, 1),
            "ocr_content": """
            FIRST NATIONAL BANK
            Monthly Statement

            Account Holder: John Smith
            Account Number: ****5678
            Statement Period: 01/01/2024 - 01/31/2024

            Beginning Balance: $5,234.67

            DEPOSITS AND CREDITS:
            01/05  Direct Deposit - Salary        $3,500.00
            01/15  Transfer from Savings          $1,000.00
            01/25  Check Deposit                    $250.00

            WITHDRAWALS AND DEBITS:
            01/03  ATM Withdrawal                   -$100.00
            01/07  Grocery Store                    -$87.45
            01/12  Gas Station                      -$45.67
            01/18  Online Purchase                 -$124.99
            01/22  Rent Payment                  -$1,200.00

            Ending Balance: $8,426.56
            """,
        },
        {
            "paperless_id": 101,
            "title": "insurance_policy_auto.pdf",
            "fingerprint": "insurance_auto",
            "file_size": 289345,
            "created_date": datetime(2024, 1, 20),
            "ocr_content": """
            AUTO INSURANCE POLICY

            Policy Number: AI-2024-789012
            Policy Holder: John Smith
            Effective Date: January 20, 2024
            Expiration Date: January 20, 2025

            VEHICLE INFORMATION:
            2020 Honda Accord
            VIN: 1HGCV1F3XLA123456

            COVERAGE:
            Liability: $100,000/$300,000/$100,000
            Comprehensive: $500 deductible
            Collision: $500 deductible
            Uninsured Motorist: $100,000/$300,000

            ANNUAL PREMIUM: $1,245.60
            Payment Schedule: Semi-Annual ($622.80)

            Agent: Sarah Johnson
            Phone: (555) 987-6543
            """,
        },
        {
            "paperless_id": 102,
            "title": "medical_bill_specialist.pdf",
            "fingerprint": "medical_specialist",
            "file_size": 78901,
            "created_date": datetime(2024, 1, 22),
            "ocr_content": """
            DOWNTOWN MEDICAL SPECIALISTS
            456 Health Avenue
            Medical City, NY 10004

            Patient: John Smith
            DOB: 03/15/1985
            Date of Service: 01/18/2024

            SERVICES:
            Office Visit - Consultation         $275.00
            Blood Work - Complete Panel         $150.00
            X-Ray - Chest                       $125.00

            Total Charges:                      $550.00
            Insurance Payment:                 -$440.00
            Patient Responsibility:             $110.00

            Payment Due Date: 02/18/2024

            For questions, call: (555) 444-3333
            """,
        },
    ]


@pytest.fixture
def performance_test_documents():
    """Large set of documents for performance testing"""
    documents = []
    base_content = """
    This is a test document for performance benchmarking.
    It contains various text patterns and structures that
    simulate real-world document content for deduplication testing.
    """

    # Create 1000 documents with varying similarity levels
    for i in range(1000):
        # Every 10th document is a near-duplicate
        if i % 10 == 1:
            content = base_content + f" Document variation {i // 10}"
        else:
            content = f"Unique document {i} with specific content about topic {i % 50}."

        documents.append(
            {
                "paperless_id": 1000 + i,
                "title": f"perf_test_doc_{i:04d}.pdf",
                "fingerprint": f"perf_{i:04d}",
                "file_size": 1024 + (i % 500),
                "created_date": datetime(2024, 1, 1) + timedelta(hours=i),
                "ocr_content": content,
            }
        )

    return documents


@pytest.fixture
def expected_duplicate_groups():
    """Expected duplicate groups for testing"""
    return {
        "invoices": {
            "group_1": {
                "document_ids": [1, 2],  # Original and scanned invoice
                "expected_confidence": 0.85,
                "reason": "Same invoice with OCR variations",
            }
        },
        "receipts": {
            "group_1": {
                "document_ids": [10, 11],  # Coffee receipts
                "expected_confidence": 0.90,
                "reason": "Same receipt, different scan quality",
            }
        },
        "contracts": {
            "group_1": {
                "document_ids": [20, 21],  # Original and amended contract
                "expected_confidence": 0.75,
                "reason": "Similar contract with amendments",
            }
        },
    }


@pytest.fixture
def similarity_test_cases():
    """Test cases for similarity algorithm validation"""
    return [
        {
            "name": "identical_text",
            "text1": "This is exactly the same text",
            "text2": "This is exactly the same text",
            "expected_similarity": 1.0,
        },
        {
            "name": "ocr_variations",
            "text1": "Invoice #12345 dated January 1, 2024",
            "text2": "Invoice #l2345 dated January l, 2O24",
            "expected_similarity": 0.85,
        },
        {
            "name": "word_order_difference",
            "text1": "Total amount due is $500.00",
            "text2": "$500.00 is the total amount due",
            "expected_similarity": 0.70,
        },
        {
            "name": "completely_different",
            "text1": "This document is about cats and pets",
            "text2": "Financial report for quarterly earnings",
            "expected_similarity": 0.10,
        },
        {
            "name": "partial_overlap",
            "text1": "Service agreement for web development services",
            "text2": "Service agreement for mobile app development",
            "expected_similarity": 0.60,
        },
    ]
