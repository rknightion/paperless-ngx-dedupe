import { type PrimaryStrategy } from './types.js';

export interface PrimaryMember {
  id: string;
  paperlessId: number;
  addedDate?: string | null;
  wordCount?: number | null;
  correspondent?: string | null;
  documentType?: string | null;
  tagsJson?: string | null;
  customFieldsJson?: string | null;
}

function hasValue(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length > 0) &&
    (!Array.isArray(value) || value.length > 0)
  );
}

function hasArrayValue(json: string | null | undefined, customFields = false): boolean {
  try {
    const values: unknown = JSON.parse(json ?? '[]');
    return (
      Array.isArray(values) &&
      values.some((value: unknown) =>
        customFields
          ? typeof value === 'object' && value !== null && 'value' in value && hasValue(value.value)
          : hasValue(value),
      )
    );
  } catch {
    return false;
  }
}

function rank(member: PrimaryMember, strategy: PrimaryStrategy): number {
  switch (strategy) {
    case 'lowest_id':
      return -member.paperlessId;
    case 'most_text':
      return member.wordCount ?? 0;
    case 'most_metadata':
      return (
        Number(hasValue(member.correspondent)) +
        Number(hasValue(member.documentType)) +
        Number(hasArrayValue(member.tagsJson)) +
        Number(hasArrayValue(member.customFieldsJson, true))
      );
    case 'oldest_added':
    case 'newest_added': {
      const time = Date.parse(member.addedDate ?? '');
      // Missing dates cannot outrank a known date in either direction.
      return Number.isFinite(time) ? (strategy === 'oldest_added' ? -time : time) : -Infinity;
    }
  }
}

const reasons: Record<PrimaryStrategy, string> = {
  lowest_id: 'Lowest Paperless id',
  oldest_added: 'Oldest added date',
  newest_added: 'Newest added date',
  most_text: 'Highest word count',
  most_metadata: 'Most non-empty metadata categories',
};

export function selectPrimary(
  members: readonly PrimaryMember[],
  strategy: PrimaryStrategy,
): { documentId: string; reason: string } {
  if (members.length === 0) throw new RangeError('Cannot select a primary from an empty group');
  let selected = members[0];
  let score = rank(selected, strategy);
  for (const member of members.slice(1)) {
    const candidate = rank(member, strategy);
    if (candidate > score || (candidate === score && member.paperlessId < selected.paperlessId)) {
      selected = member;
      score = candidate;
    }
  }
  return { documentId: selected.id, reason: reasons[strategy] };
}
