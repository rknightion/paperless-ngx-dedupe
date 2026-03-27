import { afterNavigate } from '$app/navigation';
import { faro } from '@grafana/faro-web-sdk';

export function initFaroRouteTracking() {
  afterNavigate(({ to }) => {
    const routeName = to?.route?.id ?? to?.url?.pathname ?? '';
    faro.api?.setView({ name: routeName });
  });
}
