import { create } from 'zustand';

export type GlobeFailure = 'context-lost' | 'render-error';

interface GlobeHealth {
  /** Why the globe stopped drawing, or null while it is healthy. The first failure wins. */
  failure: GlobeFailure | null;
  report: (f: GlobeFailure) => void;
}

export const useGlobeHealth = create<GlobeHealth>((set, get) => ({
  failure: null,
  report: (f) => {
    if (!get().failure) set({ failure: f });
  },
}));

/**
 * A lost WebGL context reports a 0 x 0 drawing buffer. Cesium then throws from inside the render loop
 * and from any call that takes the buffer size (for example camera.getPixelSize), so callers check this first.
 */
export function hasDrawingBuffer(scene: { drawingBufferWidth: number; drawingBufferHeight: number }): boolean {
  return scene.drawingBufferWidth > 0 && scene.drawingBufferHeight > 0;
}
