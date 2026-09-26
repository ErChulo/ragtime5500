import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('eFAST raw-row insert SQL', () => {
  it('supplies one value for every declared efast_import_row column', () => {
    const repositoryPath = fileURLToPath(new URL('../src/db/repository.ts', import.meta.url));
    const source = readFileSync(repositoryPath, 'utf8');

    const match = source.match(
      /INSERT INTO efast_import_row\(\s*([\s\S]*?)\s*\)\s*SELECT ei\.efast_import_id,([?\s,]+),NULL,\s*'NEEDS_REVIEW'/,
    );

    expect(match, 'review-gated eFAST INSERT should be present').not.toBeNull();

    const columns = match![1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const placeholderCount = (match![2].match(/\?/g) ?? []).length;

    // SELECT supplies efast_import_id directly, 14 bound raw-row values,
    // then NULL + four classification literals.
    expect(columns).toHaveLength(20);
    expect(placeholderCount).toBe(14);
    expect(1 + placeholderCount + 1 + 4).toBe(columns.length);
  });
});
