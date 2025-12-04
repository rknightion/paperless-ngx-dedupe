import { faro } from '@grafana/faro-web-sdk';

type UserActionWork<T> = () => Promise<T> | T;

/**
 * Wrap a user action in Faro's user action lifecycle so spans and events
 * are correlated with backend traces.
 */
export async function trackUserAction<T>(
  name: string,
  work: UserActionWork<T>,
  attributes?: Record<string, string>
): Promise<T> {
  const action = faro.api?.startUserAction?.(name, attributes, {
    importance: 'critical',
  }) as { end?: () => void; cancel?: () => void } | undefined;

  try {
    const result = await work();
    action?.end?.();
    return result;
  } catch (error) {
    action?.cancel?.();
    throw error;
  }
}
