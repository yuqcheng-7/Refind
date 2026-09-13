import { describe, expect, it } from 'vitest';
import { inferMaterialInputType } from './ingest.js';

describe('inferMaterialInputType', () => {
  it('derives the supported material type from file names and MIME types', () => {
    expect(inferMaterialInputType(new File(['# note'], 'notes.MD', { type: 'text/markdown' }))).toBe('markdown');
    expect(inferMaterialInputType(new File(['plain'], 'readme.txt', { type: 'text/plain' }))).toBe('txt');
    expect(inferMaterialInputType(new File(['pdf'], 'report', { type: 'application/pdf' }))).toBe('pdf');
    expect(inferMaterialInputType(new File(['csv'], 'data.csv', { type: 'text/csv' }))).toBe('csv');
  });
});
