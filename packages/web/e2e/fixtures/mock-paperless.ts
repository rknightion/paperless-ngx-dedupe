import http from 'node:http';

const PORT = 18923;
const EXPECTED_TOKEN = 'test-token-e2e';

interface MockDocument {
  id: number;
  title: string;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
  created: string;
  added: string;
  modified: string;
  content: string;
  original_file_name: string;
  archive_size: number | null;
  original_size: number;
}

interface MockState {
  documents: MockDocument[];
  correspondents: Array<{ id: number; name: string }>;
  documentTypes: Array<{ id: number; name: string }>;
  tags: Array<{ id: number; name: string }>;
}

function createDefaultState(): MockState {
  const documents: MockDocument[] = [];
  for (let i = 1; i <= 15; i++) {
    documents.push({
      id: i,
      title: `Test Document ${i}`,
      correspondent: i % 3 === 0 ? null : i % 3,
      document_type: i % 4 === 0 ? null : i % 4,
      tags: [((i - 1) % 3) + 1],
      created: `2024-0${Math.min(i, 9)}-01T00:00:00Z`,
      added: `2024-0${Math.min(i, 9)}-02T00:00:00Z`,
      modified: `2024-0${Math.min(i, 9)}-03T00:00:00Z`,
      content: `This is the full text content of test document ${i}. It contains enough words to pass validation.`,
      original_file_name: `document_${i}.pdf`,
      archive_size: 1000 + i * 100,
      original_size: 2000 + i * 200,
    });
  }

  return {
    documents,
    correspondents: [
      { id: 1, name: 'Alice Corp' },
      { id: 2, name: 'Bob Industries' },
      { id: 3, name: 'Charlie LLC' },
    ],
    documentTypes: [
      { id: 1, name: 'Invoice' },
      { id: 2, name: 'Receipt' },
      { id: 3, name: 'Contract' },
    ],
    tags: [
      { id: 1, name: 'finance' },
      { id: 2, name: 'tax' },
      { id: 3, name: 'important' },
    ],
  };
}

let state: MockState = createDefaultState();
let server: http.Server | null = null;

function checkAuth(req: http.IncomingMessage): boolean {
  const auth = req.headers.authorization;
  return auth === `Token ${EXPECTED_TOKEN}`;
}

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function paginate<T>(
  items: T[],
  url: URL,
): { count: number; next: string | null; previous: string | null; results: T[] } {
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('page_size') ?? '25', 10);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const results = items.slice(start, end);
  const count = items.length;
  const totalPages = Math.ceil(count / pageSize);

  return {
    count,
    next:
      page < totalPages
        ? `http://localhost:${PORT}${url.pathname}?page=${page + 1}&page_size=${pageSize}`
        : null,
    previous:
      page > 1
        ? `http://localhost:${PORT}${url.pathname}?page=${page - 1}&page_size=${pageSize}`
        : null,
    results,
  };
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  // Control endpoint - no auth needed
  if (path === '/__control__/reset' && req.method === 'POST') {
    state = createDefaultState();
    return jsonResponse(res, { ok: true });
  }

  // HEAD request for health check (readiness probe)
  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Auth check for all other routes
  if (!checkAuth(req)) {
    return jsonResponse(res, { detail: 'Authentication credentials were not provided.' }, 401);
  }

  // GET /api/statistics/
  if (path === '/api/statistics/' && req.method === 'GET') {
    return jsonResponse(res, {
      documents_total: state.documents.length,
      documents_inbox: 2,
      inbox_tag: 1,
      document_file_type_counts: [{ mime_type: 'application/pdf', count: state.documents.length }],
      character_count: 50000,
    });
  }

  // GET /api/documents/
  if (path === '/api/documents/' && req.method === 'GET') {
    return jsonResponse(res, paginate(state.documents, url));
  }

  // GET /api/documents/:id/
  const docMatch = path.match(/^\/api\/documents\/(\d+)\/$/);
  if (docMatch && req.method === 'GET') {
    const id = parseInt(docMatch[1], 10);
    const doc = state.documents.find((d) => d.id === id);
    if (!doc) {
      return jsonResponse(res, { detail: 'Not found.' }, 404);
    }
    return jsonResponse(res, doc);
  }

  // GET /api/documents/:id/metadata/
  const metaMatch = path.match(/^\/api\/documents\/(\d+)\/metadata\/$/);
  if (metaMatch && req.method === 'GET') {
    return jsonResponse(res, {
      original_checksum: 'abc123',
      original_size: 1234,
      original_mime_type: 'application/pdf',
      media_filename: `document_${metaMatch[1]}.pdf`,
      has_archive_version: true,
      archive_checksum: 'def456',
      archive_size: 5678,
      archive_media_filename: `document_${metaMatch[1]}_archive.pdf`,
    });
  }

  // GET /api/correspondents/
  if (path === '/api/correspondents/' && req.method === 'GET') {
    return jsonResponse(res, paginate(state.correspondents, url));
  }

  // GET /api/document_types/
  if (path === '/api/document_types/' && req.method === 'GET') {
    return jsonResponse(res, paginate(state.documentTypes, url));
  }

  // GET /api/tags/
  if (path === '/api/tags/' && req.method === 'GET') {
    return jsonResponse(res, paginate(state.tags, url));
  }

  // Fallback
  jsonResponse(res, { detail: 'Not found.' }, 404);
}

export function startMockPaperless(): Promise<void> {
  return new Promise((resolve, reject) => {
    state = createDefaultState();
    server = http.createServer(handleRequest);
    server.on('error', reject);
    server.listen(PORT, () => {
      resolve();
    });
  });
}

export function stopMockPaperless(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function resetMockPaperless(): void {
  state = createDefaultState();
}
