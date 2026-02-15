import { PaperlessClient } from '../../client.js';

const PAPERLESS_URL = process.env.INTEGRATION_PAPERLESS_URL ?? 'http://localhost:8000';
const ADMIN_USER = process.env.INTEGRATION_ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.INTEGRATION_ADMIN_PASSWORD ?? 'admin';

/** Sample documents to seed into Paperless-NGX for testing. */
const TEST_DOCUMENTS = [
  {
    title: 'Invoice 2024-001',
    content:
      'Invoice from Acme Corp dated January 15, 2024. Total amount due: $1,250.00. ' +
      'Payment terms: Net 30. Bill to: John Smith, 123 Main Street, Springfield.',
  },
  {
    title: 'Invoice 2024-002',
    content:
      'Invoice from Acme Corp dated February 20, 2024. Total amount due: $2,500.00. ' +
      'Payment terms: Net 30. Bill to: Jane Doe, 456 Oak Avenue, Shelbyville.',
  },
  {
    title: 'Meeting Notes Q1 2024',
    content:
      'Quarterly planning meeting held on March 1, 2024. Attendees: Alice, Bob, Carol. ' +
      'Key decisions: migrate to new CRM by Q2, hire two additional engineers, ' +
      'launch marketing campaign for product X.',
  },
  {
    title: 'Employment Contract - John Smith',
    content:
      'Employment agreement between TechCo Inc and John Smith. Start date: April 1, 2024. ' +
      'Position: Senior Software Engineer. Annual salary: $150,000. ' +
      'Benefits include health insurance, 401k matching, and 20 days PTO.',
  },
  {
    title: 'Tax Return Summary 2023',
    content:
      'Federal tax return summary for fiscal year 2023. Gross income: $95,000. ' +
      'Total deductions: $18,500. Taxable income: $76,500. ' +
      'Tax owed: $12,800. Estimated payments made: $13,000. Refund due: $200.',
  },
];

/**
 * Obtain an API token from Paperless-NGX by POSTing credentials to /api/token/.
 */
export async function getApiToken(): Promise<string> {
  const response = await fetch(`${PAPERLESS_URL}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get API token: ${response.status} ${response.statusText} - ${body}`);
  }

  const json = (await response.json()) as { token: string };
  return json.token;
}

/**
 * Create a PaperlessClient configured for integration testing.
 */
export async function createIntegrationClient(): Promise<PaperlessClient> {
  const token = await getApiToken();
  return new PaperlessClient({
    url: PAPERLESS_URL,
    token,
    timeout: 30_000,
    maxRetries: 3,
  });
}

/**
 * Upload a single text document to Paperless-NGX via POST /api/documents/post_document/.
 * Returns the task ID assigned by Paperless.
 */
async function uploadDocument(token: string, title: string, content: string): Promise<string> {
  const blob = new Blob([content], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('document', blob, `${title}.txt`);
  formData.append('title', title);

  const response = await fetch(`${PAPERLESS_URL}/api/documents/post_document/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to upload document "${title}": ${response.status} ${response.statusText} - ${body}`,
    );
  }

  const taskId = await response.text();
  return taskId.replace(/"/g, '');
}

/**
 * Poll the statistics endpoint until Paperless-NGX reports at least `expectedCount` documents.
 * Throws after `timeoutMs` milliseconds if the count is not reached.
 */
async function waitForDocuments(
  token: string,
  expectedCount: number,
  timeoutMs: number = 120_000,
): Promise<void> {
  const start = Date.now();
  const pollInterval = 3_000;

  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${PAPERLESS_URL}/api/statistics/`, {
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/json; version=9',
      },
    });

    if (response.ok) {
      const stats = (await response.json()) as { documents_total: number };
      if (stats.documents_total >= expectedCount) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timed out waiting for ${expectedCount} documents after ${timeoutMs}ms`);
}

/**
 * Seed test documents into Paperless-NGX and wait for processing to complete.
 * Returns the API token used for seeding.
 */
export async function seedDocuments(count: number = 5): Promise<string> {
  const token = await getApiToken();

  // Check how many documents already exist
  const statsResponse = await fetch(`${PAPERLESS_URL}/api/statistics/`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/json; version=9',
    },
  });
  const stats = (await statsResponse.json()) as { documents_total: number };
  const existingCount = stats.documents_total;

  if (existingCount >= count) {
    // Already have enough documents seeded
    return token;
  }

  const docsToUpload = TEST_DOCUMENTS.slice(0, count - existingCount);
  const uploadPromises = docsToUpload.map((doc) => uploadDocument(token, doc.title, doc.content));
  await Promise.all(uploadPromises);

  // Wait for Paperless-NGX to finish processing all documents
  await waitForDocuments(token, count);

  return token;
}

/** The base URL used for integration tests. */
export { PAPERLESS_URL };
