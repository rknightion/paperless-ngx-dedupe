import { parse } from 'yaml';

export interface TagAliasValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a YAML string as a tag alias map.
 * Expected shape: Record<string, string[]> — each key is a canonical tag,
 * each value is an array of alias strings.
 */
export function validateTagAliasYaml(yaml: string): TagAliasValidationResult {
  if (yaml.trim() === '') {
    return { valid: true };
  }

  let parsed: unknown;
  try {
    parsed = parse(yaml);
  } catch (e) {
    return { valid: false, error: `Invalid YAML syntax: ${(e as Error).message}` };
  }

  if (parsed === null || parsed === undefined) {
    return { valid: true };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Tag alias map must be a mapping of tag names to alias lists' };
  }

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      return { valid: false, error: `"${key}" must map to an array of aliases` };
    }
    if (!value.every((item) => typeof item === 'string')) {
      return { valid: false, error: `"${key}" aliases must all be strings` };
    }
  }

  return { valid: true };
}
