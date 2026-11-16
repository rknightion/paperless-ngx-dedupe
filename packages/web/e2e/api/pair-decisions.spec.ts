import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

const path = '/api/v1/duplicates/pair-decisions';
test.beforeEach(({ seedDB }) => {
  seedDB();
});
test.afterEach(({ clearDB }) => clearDB());

test('pair decisions create, paginate and remove with local or missing titles', async ({
  request,
}) => {
  const response = await request.post(path, { data: { paperlessIds: [999, 1] } });
  expect(response.status()).toBe(201);
  const {
    data: { id },
  } = await response.json();
  expect(id).toEqual(expect.any(String));
  expect(await (await request.post(path, { data: { paperlessIds: [1, 999] } })).json()).toEqual({
    data: { id },
  });
  const db = new Database(DB_PATH);
  const local = db.prepare('SELECT title FROM document WHERE paperless_id=1').get() as {
    title: string;
  };
  db.close();
  expect(await (await request.get(path)).json()).toEqual({
    data: [
      {
        id,
        source: 'manual',
        createdAt: expect.any(String),
        documents: [
          { paperlessId: 1, title: local.title },
          { paperlessId: 999, title: null },
        ],
      },
    ],
    meta: { nextCursor: null, total: 1 },
  });
  const second = await (await request.post(path, { data: { paperlessIds: [2, 998] } })).json();
  const firstPage = await (await request.get(`${path}?limit=1`)).json();
  expect(firstPage.data).toHaveLength(1);
  expect(firstPage.meta).toEqual({ total: 2, nextCursor: firstPage.data[0].id });
  const secondPage = await (
    await request.get(`${path}?limit=1&cursor=${firstPage.meta.nextCursor}`)
  ).json();
  expect(secondPage.meta).toEqual({ total: 2, nextCursor: null });
  expect([firstPage.data[0].id, secondPage.data[0].id].sort()).toEqual([id, second.data.id].sort());
  expect(await (await request.delete(`${path}/${id}`)).json()).toEqual({ data: { deleted: true } });
  expect((await request.delete(`${path}/${id}`)).status()).toBe(404);
  expect(
    (await (await request.get(path)).json()).data.map((item: { id: string }) => item.id),
  ).toEqual([second.data.id]);
});

test('pair decision validation and duplicate-operation lease prevent writes', async ({
  request,
}) => {
  for (const body of [
    null,
    {},
    { paperlessIds: [1] },
    { paperlessIds: [1, 2, 3] },
    { paperlessIds: [1, 1] },
    { paperlessIds: [0, 2] },
    { paperlessIds: ['1', 2] },
    { paperlessIds: [1.5, 2] },
  ]) {
    const response = await request.post(path, {
      data: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  }
  for (const query of [
    'limit=0',
    'limit=201',
    'limit=1.5',
    'limit=wrong',
    'cursor=missing',
    'cursor=',
  ]) {
    const response = await request.get(`${path}?${query}`);
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  }
  expect(await (await request.get(path)).json()).toEqual({
    data: [],
    meta: { total: 0, nextCursor: null },
  });
  const {
    data: { id },
  } = await (await request.post(path, { data: { paperlessIds: [1, 2] } })).json();
  const db = new Database(DB_PATH);
  try {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO operation_lease (id,operation,owner_id,acquired_at,heartbeat_at,expires_at) VALUES ('blocking-delete','duplicate_delete','blocking-delete',?,?,?)",
    ).run(now, now, new Date(Date.now() + 60000).toISOString());
    for (const response of [
      await request.post(path, { data: { paperlessIds: [2, 3] } }),
      await request.delete(`${path}/${id}`),
    ]) {
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe('CONFLICT');
    }
    expect(
      (await (await request.get(path)).json()).data.map((item: { id: string }) => item.id),
    ).toEqual([id]);
  } finally {
    db.prepare("DELETE FROM operation_lease WHERE owner_id='blocking-delete'").run();
    db.close();
  }
  expect((await request.delete(`${path}/${id}`)).status()).toBe(200);
});
