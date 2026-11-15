import { describe, expect, it } from 'vitest';
import { siteLookupState } from './useSite';

describe('siteLookupState', () => {
  it('reports loading while data is loading, not "not found"', () => {
    expect(siteLookupState('loading', false)).toBe('loading');
  });
  it('reports not-found only once data is ready and the id is missing', () => {
    expect(siteLookupState('ready', false)).toBe('not-found');
  });
  it('reports a load error distinctly', () => {
    expect(siteLookupState('error', false)).toBe('error');
  });
  it('reports ready whenever the site exists', () => {
    expect(siteLookupState('loading', true)).toBe('ready');
    expect(siteLookupState('ready', true)).toBe('ready');
  });
});
