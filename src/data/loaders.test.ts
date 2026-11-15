import { describe, expect, it } from 'vitest';
import { DataError, decodeHeightmap } from './loaders';
import type { Heightmap } from './schemas';

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function int16Bytes(values: number[]): Uint8Array {
  const buf = new ArrayBuffer(values.length * 2);
  const view = new DataView(buf);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return new Uint8Array(buf);
}

const make = (over: Partial<Heightmap> & { data: string }): Heightmap =>
  ({ width: 2, height: 2, metersPerPixel: 40, minElevation: -100, maxElevation: 300, encoding: 'int16-base64', ...over }) as Heightmap;

describe('decodeHeightmap', () => {
  it('maps the int16 extremes onto min and max elevation', () => {
    const hm = make({ data: b64(int16Bytes([-32768, 32767, 0, 0])) });
    const elev = decodeHeightmap('t.json', hm);
    expect(elev).toHaveLength(4);
    expect(elev[0]).toBeCloseTo(-100, 3);
    expect(elev[1]).toBeCloseTo(300, 3);
    expect(elev[2]).toBeCloseTo(-100 + (32768 / 65535) * 400, 3);
  });

  it('rejects a payload that is too short instead of returning NaN elevations', () => {
    const hm = make({ data: b64(int16Bytes([1, 2, 3])) });
    expect(() => decodeHeightmap('short.json', hm)).toThrow(DataError);
    expect(() => decodeHeightmap('short.json', hm)).toThrow(/short\.json.*6 bytes.*need 8/);
  });

  it('rejects a payload that is too long', () => {
    const hm = make({ data: b64(int16Bytes([1, 2, 3, 4, 5])) });
    expect(() => decodeHeightmap('long.json', hm)).toThrow(DataError);
  });

  it('rejects an odd byte count with a DataError, not a RangeError', () => {
    const hm = make({ data: b64(new Uint8Array([1, 2, 3, 4, 5, 6, 7])) });
    expect(() => decodeHeightmap('odd.json', hm)).toThrow(DataError);
  });

  it('rejects maxElevation below minElevation', () => {
    const hm = make({ minElevation: 500, maxElevation: 100, data: b64(int16Bytes([0, 0, 0, 0])) });
    expect(() => decodeHeightmap('inverted.json', hm)).toThrow(/maxElevation/);
  });

  it('accepts a flat map where min equals max', () => {
    const hm = make({ minElevation: 50, maxElevation: 50, data: b64(int16Bytes([0, 5, -5, 9])) });
    expect(Array.from(decodeHeightmap('flat.json', hm))).toEqual([50, 50, 50, 50]);
  });
});
