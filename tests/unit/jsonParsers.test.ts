import { describe, expect, it } from 'vitest';
import { extractFirstJsonFragment, parseJsonInput } from '../../domain/wine/jsonParsers.ts';

describe('json parsers', () => {
  it('extracts first JSON fragment from mixed text', () => {
    const input = 'Text before ```json\n{"name":"Wine"}\n``` text after';
    const extracted = extractFirstJsonFragment(input);
    expect(extracted).toBe('{"name":"Wine"}');
  });

  it('parses fenced json content', () => {
    const parsed = parseJsonInput('```json\n{"name":"Wine","vintage":2020}\n```') as Record<string, unknown>;
    expect(parsed.name).toBe('Wine');
    expect(parsed.vintage).toBe(2020);
  });

  it('throws for invalid input', () => {
    expect(() => parseJsonInput('not-json')).toThrow();
  });
});
