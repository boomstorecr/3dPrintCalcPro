import { describe, expect, it } from 'vitest';

import { parseSTL } from '../stlParser';
import {
  createAsciiCubeSTL,
  createBinaryCubeSTL,
  createEmptyBinarySTL,
  createSingleTriangleBinarySTL,
} from './helpers/stlFixtures.js';

function toArrayBuffer(value) {
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(bytes).buffer;
  }

  if (value && typeof value.byteLength === 'number') {
    const bytes = new Uint8Array(value);
    return new Uint8Array(bytes).buffer;
  }

  throw new Error('Expected a binary buffer input.');
}

describe('parseSTL', () => {
  it('parses a binary cube and returns expected volume and triangle count', () => {
    const result = parseSTL(createBinaryCubeSTL());

    expect(result.triangleCount).toBe(12);
    expect(result.volumeCm3).toBeCloseTo(0.001, 6);
  });

  it('parses an ASCII cube and matches binary volume', () => {
    const asciiResult = parseSTL(toArrayBuffer(createAsciiCubeSTL()));
    const binaryResult = parseSTL(createBinaryCubeSTL());

    expect(asciiResult.triangleCount).toBe(12);
    expect(asciiResult.volumeCm3).toBeCloseTo(binaryResult.volumeCm3, 6);
    expect(asciiResult.volumeCm3).toBeCloseTo(0.001, 6);
  });

  it('parses an empty binary STL (0 triangles)', () => {
    const result = parseSTL(createEmptyBinarySTL());

    expect(result.triangleCount).toBe(0);
    expect(result.volumeCm3).toBe(0);
  });

  it('parses a single triangle binary STL', () => {
    const result = parseSTL(createSingleTriangleBinarySTL());

    expect(result.triangleCount).toBe(1);
    expect(result.volumeCm3).toBeGreaterThanOrEqual(0);
  });

  it('throws for non-ArrayBuffer input', () => {
    expect(() => parseSTL('string')).toThrow('parseSTL expects an ArrayBuffer input.');
  });

  it('handles tiny files with explicit behavior', () => {
    expect(() => parseSTL(new ArrayBuffer(5))).toThrow('Invalid STL file: file is too small.');

    const tinyAscii = toArrayBuffer(new TextEncoder().encode('solid tiny\nendsolid tiny'));
    const result = parseSTL(tinyAscii);

    expect(result.triangleCount).toBe(0);
    expect(result.volumeCm3).toBe(0);
  });

  it('prefers binary parsing when size matches binary STL layout', () => {
    const buffer = createSingleTriangleBinarySTL();
    const header = new Uint8Array(buffer, 0, 80);
    const solidHeader = new TextEncoder().encode('solid maybe-binary');

    header.set(solidHeader.slice(0, 80));

    const result = parseSTL(buffer);
    expect(result.triangleCount).toBe(1);
    expect(result.volumeCm3).toBeGreaterThanOrEqual(0);
  });
});
