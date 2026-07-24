import type { AiResultSummary } from '@paperless-dedupe/core';

interface ShortcutTarget {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

export function shouldIgnoreAiShortcutTarget(target: ShortcutTarget): boolean {
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }
  return target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio';
}

export type AiKeyboardAction = 'apply' | 'reject' | 'toggle-field' | 'navigate' | 'search';

export function isAiKeyboardActionAllowed(
  result: Pick<AiResultSummary, 'appliedStatus' | 'failureType'> | undefined,
  action: AiKeyboardAction,
): boolean {
  if (action === 'navigate' || action === 'search') return true;
  return Boolean(
    result &&
    (result.appliedStatus === 'pending_review' ||
      (result.appliedStatus === 'failed' && result.failureType === 'review_conflict')),
  );
}
