import { describe, expect, it } from 'vitest';
import { hashForSection, sectionFromHash } from '../src/app/routes';

describe('standalone hash routing', () => {
  it('maps valid section hashes to app sections', () => {
    expect(sectionFromHash('#/home')).toBe('home');
    expect(sectionFromHash('#/workspace')).toBe('workspace');
    expect(sectionFromHash('#/import')).toBe('import');
    expect(sectionFromHash('#/review')).toBe('review');
    expect(sectionFromHash('#/explore')).toBe('explore');
    expect(sectionFromHash('#/database')).toBe('database');
  });

  it('falls back to Guide home for missing or unknown routes', () => {
    expect(sectionFromHash('')).toBe('home');
    expect(sectionFromHash('#/unknown')).toBe('home');
  });

  it('creates file-protocol-safe hash routes', () => {
    expect(hashForSection('review')).toBe('#/review');
  });
});
