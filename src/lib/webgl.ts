/** Kept out of globe/viewer.ts so the WebGL check does not pull Cesium into the first-paint bundle. */
export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
