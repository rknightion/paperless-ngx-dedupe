import { test, expect } from './fixtures/test-app';

for (const mode of ['bulk', 'single'] as const) {
  test(`previews missing metadata in the ${mode} confirmation before submitting the frozen deletion plan`, async ({
    page,
    seedDB,
    clearDB,
  }) => {
    const seed = seedDB();
    const previews: Array<{ groupIds: string[]; mergeMetadata?: boolean }> = [];
    const executions: unknown[] = [];
    await page.route('**/api/v1/batch/delete-non-primary/preview', async (route) => {
      const body = route.request().postDataJSON();
      previews.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            planToken: 'synthetic-reviewed-merge-plan-token-0001',
            expiresAt: '2099-01-01T00:00:00Z',
            groupCount: 1,
            documentCount: 1,
            groups: [
              {
                groupId: body.groupIds[0],
                primaryPaperlessId: 101,
                nonPrimaryDocuments: [{ documentId: 'synthetic-copy', paperlessId: 102 }],
                ...(body.mergeMetadata
                  ? {
                      merge: {
                        addTags: ['Synthetic tag'],
                        setCorrespondent: 'Synthetic supplier',
                        setDocumentType: 'Synthetic type',
                        addCustomFieldNames: ['Reference'],
                      },
                    }
                  : {}),
              },
            ],
          },
        }),
      });
    });
    await page.route('**/api/v1/batch/delete-non-primary', async (route) => {
      executions.push(route.request().postDataJSON());
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });
    try {
      if (mode === 'bulk') {
        await page.goto('/duplicates');
        await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
        await page.getByRole('button', { name: 'Delete Non-Primary' }).click();
      } else {
        await page.goto(`/duplicates/${seed.groupIds[0]}`);
        await page.getByRole('button', { name: 'Delete Duplicates' }).click();
      }
      const dialog = page.getByRole('dialog', {
        name: mode === 'bulk' ? 'Review documents to delete' : 'Delete Non-Primary Documents',
        exact: true,
      });
      const option = dialog.getByLabel('Copy missing tags and metadata to the kept document');
      await expect(option).not.toBeChecked();
      await option.check();
      for (const text of ['Synthetic tag', 'Synthetic supplier', 'Synthetic type', 'Reference'])
        await expect(dialog).toContainText(text);
      expect(previews.at(-1)?.mergeMetadata).toBe(true);
      const deleteButton = dialog.getByRole('button', {
        name: mode === 'bulk' ? 'Delete 1 document' : 'Delete Documents',
        exact: true,
      });
      if (mode === 'bulk') await dialog.getByLabel('I reviewed this exact deletion list').check();
      await expect(deleteButton).toBeEnabled();
      expect(executions).toEqual([]);
      await option.uncheck();
      if (mode === 'bulk') {
        await expect(dialog.getByText('Synthetic tag')).toHaveCount(0);
        await dialog.getByLabel('I reviewed this exact deletion list').check();
        expect(previews.at(-1)).not.toHaveProperty('mergeMetadata');
      }
      await expect(deleteButton).toBeEnabled();
      await option.check();
      await expect(dialog).toContainText('Reference');
      if (mode === 'bulk') await dialog.getByLabel('I reviewed this exact deletion list').check();
      await deleteButton.click();
      if (mode === 'bulk')
        await page
          .getByRole('dialog', { name: 'Confirm deletion of reviewed documents', exact: true })
          .getByRole('button', { name: 'Move documents to recycle bin', exact: true })
          .click();
      await expect
        .poll(() => executions)
        .toEqual([{ planToken: 'synthetic-reviewed-merge-plan-token-0001', confirm: true }]);
    } finally {
      clearDB();
    }
  });
}
