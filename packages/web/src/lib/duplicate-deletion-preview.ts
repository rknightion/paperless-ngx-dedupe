import type { FrozenDuplicateGroup } from '@paperless-dedupe/core';

export interface DuplicateDeletionPreview {
  planToken: string;
  expiresAt: string;
  groupCount: number;
  documentCount: number;
  groups: FrozenDuplicateGroup[];
}

/** Build one reviewed plan using requests below the default adapter body limit. */
export async function createDeletionPreview(
  groupIds: string[],
  options: { mergeMetadata?: boolean; signal?: AbortSignal } = {},
): Promise<DuplicateDeletionPreview> {
  let preview: DuplicateDeletionPreview | undefined;
  for (let start = 0; start < groupIds.length; start += 10_000) {
    const response = await fetch('/api/v1/batch/delete-non-primary/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupIds: groupIds.slice(start, start + 10_000),
        ...(preview ? { planToken: preview.planToken } : {}),
        ...(options.mergeMetadata ? { mergeMetadata: true } : {}),
      }),
      signal: options.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body.error?.message ?? 'Unable to create the reviewed deletion preview. Try again.',
      );
    }
    preview = body.data;
  }
  if (!preview) throw new Error('Select at least one duplicate group to review.');
  return preview;
}
