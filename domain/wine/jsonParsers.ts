export const extractFirstJsonFragment = (input: string): string | null => {
  const startIndex = input.search(/[{[]/);
  if (startIndex === -1) return null;

  const opener = input[startIndex];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opener) {
      depth += 1;
    } else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, i + 1);
      }
    }
  }

  return null;
};

export const parseJsonInput = (raw: string): unknown => {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/```json/gi, '```')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const attempts: string[] = [];
  attempts.push(normalized);

  const fencedMatch = normalized.match(/```([\s\S]*?)```/);
  if (fencedMatch?.[1]) {
    attempts.push(fencedMatch[1].trim());
  }

  const extracted = extractFirstJsonFragment(normalized);
  if (extracted) {
    attempts.push(extracted.trim());
  }

  let lastError: unknown = null;
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const candidate = attempt.trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Ungültiges JSON. Bitte nur JSON ohne zusätzlichen Text einfügen.');
};

export const parseJsonField = <T,>(
  raw: string,
  label: string,
  validate: (value: unknown) => value is T,
  fallback: T
): T => {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label}: JSON ist ungültig.`);
  }

  if (!validate(parsed)) {
    throw new Error(`${label}: Struktur ist ungültig.`);
  }
  return parsed;
};
