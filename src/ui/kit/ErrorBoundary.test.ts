import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary state logic', () => {
  it('stores the thrown error so the fallback renders', () => {
    const err = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });

  it('keeps the error while the reset key is unchanged', () => {
    const state = { error: new Error('boom'), key: '/lab/a' };
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: '/lab/a' }, state)).toBeNull();
  });

  it('clears the error when the reset key changes, so navigating away recovers', () => {
    const state = { error: new Error('boom'), key: '/lab/a' };
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: '/' }, state)).toEqual({ key: '/', error: null });
  });
});
