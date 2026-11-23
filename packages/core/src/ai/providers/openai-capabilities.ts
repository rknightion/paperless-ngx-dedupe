import { type AiExtractionRequest } from './types.js';

const CLOUDFLARE_GATEWAY_HOST = 'gateway.ai.cloudflare.com';
const CLOUDFLARE_OPENAI_ROUTE = /^\/v1\/[^/]+\/[^/]+\/openai\/?$/;
const CUSTOM_DOMAIN_OPENAI_ROUTE = /\/openai(?:\/v1)?\/?$/;

/**
 * True for an HTTPS Cloudflare AI Gateway route that forwards to OpenAI's own API. A gateway on a
 * custom domain cannot be recognised by its host, so configuring its token declares it.
 */
export function isCloudflareOpenAiGateway(
  baseURL: string | undefined,
  gatewayToken?: string,
): boolean {
  if (!baseURL) return false;
  try {
    const url = new URL(baseURL);
    if (url.protocol !== 'https:') return false;
    if (url.hostname.toLowerCase() === CLOUDFLARE_GATEWAY_HOST) {
      return CLOUDFLARE_OPENAI_ROUTE.test(url.pathname);
    }
    return Boolean(gatewayToken) && CUSTOM_DOMAIN_OPENAI_ROUTE.test(url.pathname);
  } catch {
    return false;
  }
}

/** False only for a custom OpenAI-compatible server, whose parameters and prices are unknown. */
export function usesOpenAiApi(baseURL: string | undefined, gatewayToken?: string): boolean {
  return !baseURL || isCloudflareOpenAiGateway(baseURL, gatewayToken);
}

/** OpenAI is retiring Flex: it stops at GPT-6.1 and GPT-6 Sol never offered it. */
export function supportsFlexProcessing(model: string): boolean {
  if (/^gpt-6-sol(?:-|$)/.test(model)) return false;
  const version = /^gpt-(\d+)(?:\.(\d+))?(?:-|$)/.exec(model);
  if (!version) return true;
  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major < 6 || (major === 6 && minor < 2);
}

const REJECTS_NO_REASONING = /^gpt-6(?:\.\d+)?-astra(?:-|$)|^gpt-6\.[1-9]\d*-sol(?:-|$)/;
const ACCEPTS_NO_REASONING = /^gpt-6(?:\.\d+)?-(?:luna|terra|sol)(?:-|$)/;

/**
 * The effort to send to OpenAI's API. Models that reject `none` get `low`, the nearest effort
 * they accept. Older models omit it, so they keep their established default.
 */
export function resolveOpenAiReasoningEffort(
  model: string,
  effort: AiExtractionRequest['reasoningEffort'],
): AiExtractionRequest['reasoningEffort'] {
  if (effort !== 'none') return effort;
  if (REJECTS_NO_REASONING.test(model)) return 'low';
  return ACCEPTS_NO_REASONING.test(model) ? 'none' : undefined;
}
