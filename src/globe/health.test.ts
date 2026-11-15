import { beforeEach, describe, expect, it } from 'vitest';
import { hasDrawingBuffer, useGlobeHealth } from './health';

describe('hasDrawingBuffer', () => {
  it('is true for a normal drawing buffer', () => {
    expect(hasDrawingBuffer({ drawingBufferWidth: 1920, drawingBufferHeight: 1080 })).toBe(true);
  });
  it('is false for the 0 x 0 buffer a lost WebGL context reports', () => {
    expect(hasDrawingBuffer({ drawingBufferWidth: 0, drawingBufferHeight: 0 })).toBe(false);
  });
  it('is false when either side is zero', () => {
    expect(hasDrawingBuffer({ drawingBufferWidth: 0, drawingBufferHeight: 600 })).toBe(false);
    expect(hasDrawingBuffer({ drawingBufferWidth: 800, drawingBufferHeight: 0 })).toBe(false);
  });
});

describe('globe health store', () => {
  beforeEach(() => useGlobeHealth.setState({ failure: null }));

  it('starts healthy', () => {
    expect(useGlobeHealth.getState().failure).toBeNull();
  });
  it('records a failure', () => {
    useGlobeHealth.getState().report('context-lost');
    expect(useGlobeHealth.getState().failure).toBe('context-lost');
  });
  it('keeps the first failure, since a render error usually follows the context loss', () => {
    useGlobeHealth.getState().report('context-lost');
    useGlobeHealth.getState().report('render-error');
    expect(useGlobeHealth.getState().failure).toBe('context-lost');
  });
});
