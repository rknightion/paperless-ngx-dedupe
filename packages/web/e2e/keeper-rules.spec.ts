import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from './fixtures/test-app';
test.beforeEach(({ seedDB }) => seedDB());
test.afterEach(({ clearDB }) => clearDB());

test('the new-group keeper rule saves and reloads in Settings', async ({ page, request }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  await page.getByLabel('Keeper rule', { exact: true }).selectOption('most_metadata');
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await expect(page.getByText(/Configuration saved/)).toBeVisible();
  expect((await (await request.get('/api/v1/config/dedup')).json()).data.primaryStrategy).toBe(
    'most_metadata',
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  await expect(page.getByLabel('Keeper rule', { exact: true })).toHaveValue('most_metadata');
});

test('wizard keeper previews protect manual choices and reject stale counts before apply', async ({
  page,
}) => {
  const db = new Database(DB_PATH);
  try {
    const groups = db.prepare('SELECT id FROM duplicate_group ORDER BY id').all() as {
      id: string;
    }[];
    db.exec(
      "UPDATE document SET added_date=printf('2024-01-%02d',paperless_id); UPDATE duplicate_group SET status='pending',primary_source='auto',confidence_score=1",
    );
    db.prepare("UPDATE duplicate_group SET primary_source='manual' WHERE id=?").run(groups[1].id);
    db.prepare("UPDATE duplicate_group SET status='ignored' WHERE id=?").run(groups[2].id);
    const snapshot = () => db.prepare('SELECT * FROM duplicate_member ORDER BY id').all();
    const before = snapshot();
    await page.goto('/duplicates/wizard');
    const panel = page.getByRole('region', { name: 'Keeper selection', exact: true });
    await panel.getByLabel('Keeper rule', { exact: true }).selectOption('newest_added');
    await panel.getByRole('button', { name: 'Preview keeper changes', exact: true }).click();
    await expect(
      panel.getByText('Would change the keeper in 1 of 1 groups', { exact: true }),
    ).toBeVisible();
    expect(snapshot()).toEqual(before);
    await panel.getByLabel('Keeper rule', { exact: true }).selectOption('lowest_id');
    await expect(
      panel.getByRole('button', { name: 'Apply keeper changes', exact: true }),
    ).toHaveCount(0);
    await panel.getByLabel('Keeper rule', { exact: true }).selectOption('newest_added');
    await panel.getByRole('button', { name: 'Preview keeper changes', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Apply keeper changes', exact: true }),
    ).toBeEnabled();
    db.prepare("UPDATE duplicate_group SET primary_source='manual' WHERE id=?").run(groups[0].id);
    await panel.getByRole('button', { name: 'Apply keeper changes', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Preview again');
    expect(snapshot()).toEqual(before);
    await panel.getByLabel('Include manually selected keepers').check();
    await panel.getByRole('button', { name: 'Preview keeper changes', exact: true }).click();
    await expect(
      panel.getByText('Would change the keeper in 2 of 2 groups', { exact: true }),
    ).toBeVisible();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/duplicates/primary/apply', async (route) => {
      await held;
      await route.continue();
    });
    await panel.getByRole('button', { name: 'Apply keeper changes', exact: true }).click();
    try {
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await expect(page.getByLabel('Minimum Confidence', { exact: true })).toBeDisabled();
    } finally {
      release();
    }
    await expect(panel.getByRole('status')).toContainText('Updated 2 keepers');
    for (const group of groups.slice(0, 2)) {
      const expected = db
        .prepare(
          'SELECT max(d.paperless_id) AS paperless_id FROM duplicate_member m JOIN document d ON d.id=m.document_id WHERE m.group_id=?',
        )
        .get(group.id);
      expect(
        db
          .prepare(
            'SELECT d.paperless_id FROM duplicate_member m JOIN document d ON d.id=m.document_id WHERE m.group_id=? AND m.is_primary=1',
          )
          .get(group.id),
      ).toEqual(expected);
    }
    expect(
      db.prepare('SELECT * FROM duplicate_member WHERE group_id=? ORDER BY id').all(groups[2].id),
    ).toEqual((before as { group_id: string }[]).filter((row) => row.group_id === groups[2].id));
  } finally {
    db.close();
  }
});

test('an earlier expanded-view response cannot overwrite a newly applied keeper', async ({
  page,
}) => {
  const db = new Database(DB_PATH);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const group = db.prepare('SELECT id FROM duplicate_group ORDER BY id LIMIT 1').get() as {
      id: string;
    };
    db.exec(
      "UPDATE document SET added_date=printf('2024-01-%02d',paperless_id); UPDATE duplicate_group SET confidence_score=1,status='ignored'",
    );
    db.prepare("UPDATE duplicate_group SET status='pending' WHERE id=?").run(group.id);
    const expected = db
      .prepare(
        'SELECT max(d.paperless_id) AS id FROM duplicate_member m JOIN document d ON d.id=m.document_id WHERE m.group_id=?',
      )
      .get(group.id) as { id: number };
    let captured!: () => void;
    let delivered!: () => void;
    const capture = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const delivery = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    await page.route(
      `**/api/v1/duplicates/${group.id}?light=true`,
      async (route) => {
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
        delivered();
      },
      { times: 1 },
    );
    await page.goto('/duplicates/wizard');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByTitle('Expanded view', { exact: true }).click();
    await capture;
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Keeper selection', exact: true });
    await panel.getByLabel('Keeper rule', { exact: true }).selectOption('newest_added');
    await panel.getByRole('button', { name: 'Preview keeper changes', exact: true }).click();
    await panel.getByRole('button', { name: 'Apply keeper changes', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Updated 1 keepers');
    release();
    await delivery;
    // Let the delivered response and its render effects settle before returning to review.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByTitle('Open in Paperless-NGX', { exact: true }).first()).toHaveAttribute(
      'href',
      new RegExp(`/documents/${expected.id}/details$`),
    );
  } finally {
    release();
    db.close();
  }
});
