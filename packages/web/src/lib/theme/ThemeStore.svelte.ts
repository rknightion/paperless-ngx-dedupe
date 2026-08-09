import { browser } from '$app/environment';

/**
 * Theme preference. `system` follows the OS and keeps following it — it is the
 * default, so a first-time visitor gets whatever they already asked their
 * machine for.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Resolved theme — what is actually painted. `system` never appears here. */
export type ResolvedTheme = 'light' | 'dark';

export const STORAGE_KEY = 'pngx-dedupe-theme';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

/**
 * Read the stored preference. Falls back to `system` on anything unexpected,
 * including a SecurityError from localStorage — Safari throws rather than
 * returning null when storage is blocked, and an unhandled throw here would
 * take the whole layout down.
 */
export function readStoredPreference(): ThemePreference {
  if (!browser) return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function prefersDark(): boolean {
  if (!browser) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light';
  return preference;
}

const state = $state({
  preference: 'system' as ThemePreference,
  resolved: 'light' as ResolvedTheme,
});

let mediaQuery: MediaQueryList | undefined;
let listening = false;

/**
 * Apply the resolved theme to <html>. The `.dark` class is what every token
 * override keys off — see the `@custom-variant dark` declaration in app.css.
 * `color-scheme` is set alongside it so form controls, scrollbars and the
 * browser's own chrome follow; without it a dark page keeps white scrollbars.
 */
function paint(resolved: ResolvedTheme): void {
  if (!browser) return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

function refresh(): void {
  state.resolved = resolve(state.preference);
  paint(state.resolved);
}

export const theme = {
  get preference(): ThemePreference {
    return state.preference;
  },

  get resolved(): ResolvedTheme {
    return state.resolved;
  },

  get isDark(): boolean {
    return state.resolved === 'dark';
  },

  /**
   * Adopt the stored preference and start following the OS.
   *
   * The inline script in app.html has already painted the correct class before
   * first paint; this only syncs the store to it, so calling it on mount does
   * not cause a flash.
   */
  init(): () => void {
    if (!browser || listening) return () => {};

    state.preference = readStoredPreference();
    refresh();

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // Only `system` tracks the OS. An explicit choice stays put.
      if (state.preference === 'system') refresh();
    };
    mediaQuery.addEventListener('change', onChange);
    listening = true;

    return () => {
      mediaQuery?.removeEventListener('change', onChange);
      listening = false;
    };
  },

  set(preference: ThemePreference): void {
    state.preference = preference;
    refresh();
    if (!browser) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Storage blocked. The choice still applies for this session.
    }
  },

  /** Cycle light → dark → system. Matches the order shown in the control. */
  cycle(): void {
    const next = PREFERENCES[(PREFERENCES.indexOf(state.preference) + 1) % PREFERENCES.length];
    theme.set(next);
  },
};
