import { describe, it, expect } from 'vitest';
import { validateTagAliasYaml } from '../tag-alias-validation.js';

describe('validateTagAliasYaml', () => {
  it('accepts valid alias map', () => {
    const yaml = `nhs:\n  - national-health-service\n  - nhs-england\ncouncil:\n  - local-council`;
    const result = validateTagAliasYaml(yaml);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts empty string as valid (no aliases)', () => {
    const result = validateTagAliasYaml('');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid YAML syntax', () => {
    const result = validateTagAliasYaml('nhs:\n  - [invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-object YAML (e.g. a plain string)', () => {
    const result = validateTagAliasYaml('just a string');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a mapping');
  });

  it('rejects non-object YAML (e.g. an array)', () => {
    const result = validateTagAliasYaml('- item1\n- item2');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a mapping');
  });

  it('rejects keys that map to non-array values', () => {
    const result = validateTagAliasYaml('nhs: just-a-string');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('nhs');
    expect(result.error).toContain('array');
  });

  it('rejects arrays containing non-string items', () => {
    const result = validateTagAliasYaml('nhs:\n  - 123\n  - true');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('nhs');
    expect(result.error).toContain('strings');
  });

  it('accepts an alias map with many entries', () => {
    const yaml = Array.from({ length: 50 }, (_, i) => `tag-${i}:\n  - alias-${i}-a\n  - alias-${i}-b`).join('\n');
    const result = validateTagAliasYaml(yaml);
    expect(result.valid).toBe(true);
  });
});
