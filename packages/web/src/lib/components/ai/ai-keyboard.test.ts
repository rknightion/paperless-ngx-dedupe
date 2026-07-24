import { describe, expect, it } from 'vitest';
import { isAiKeyboardActionAllowed, shouldIgnoreAiShortcutTarget } from './ai-keyboard';

describe('AI review keyboard shortcut targets', () => {
  it('allows reviewed actions after toggling a checkbox', () => {
    expect(shouldIgnoreAiShortcutTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
  });

  it('ignores shortcuts while typing into text controls', () => {
    expect(shouldIgnoreAiShortcutTarget({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(shouldIgnoreAiShortcutTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(shouldIgnoreAiShortcutTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it.each([
    ['pending_review', null, true],
    ['failed', 'review_conflict', true],
    ['failed', 'timeout', false],
    ['skipped', 'no_content', false],
    ['applied', null, false],
    ['partial', null, false],
    ['reverted', null, false],
    ['rejected', null, false],
  ])(
    'matches drawer apply/reject eligibility for %s/%s',
    (appliedStatus, failureType, expected) => {
      const result = { appliedStatus, failureType } as never;
      expect(isAiKeyboardActionAllowed(result, 'apply')).toBe(expected);
      expect(isAiKeyboardActionAllowed(result, 'reject')).toBe(expected);
      expect(isAiKeyboardActionAllowed(result, 'toggle-field')).toBe(expected);
      expect(isAiKeyboardActionAllowed(result, 'navigate')).toBe(true);
      expect(isAiKeyboardActionAllowed(result, 'search')).toBe(true);
    },
  );
});
