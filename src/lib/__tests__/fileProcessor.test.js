// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stlParser.js', () => ({
  parseSTL: vi.fn(() => ({ volumeCm3: 5.5, triangleCount: 100 })),
}));

vi.mock('../threemfParser.js', () => ({
  parse3MF: vi.fn(async () => ({ volumeCm3: 10.2, partCount: 3, objects: [] })),
}));

import { processFile } from '../fileProcessor.js';
import { parseSTL } from '../stlParser.js';
import { parse3MF } from '../threemfParser.js';

describe('processFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes .stl files to parseSTL and returns stl metadata', async () => {
    const file = new File([new ArrayBuffer(100)], 'model.stl');

    const result = await processFile(file);

    expect(parseSTL).toHaveBeenCalledTimes(1);
    expect(parse3MF).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fileName: 'model.stl',
      fileType: 'stl',
      partCount: 1,
      volumeCm3: 5.5,
      triangleCount: 100,
    });
  });

  it('routes .3mf files to parse3MF and returns 3mf metadata', async () => {
    const file = new File([new ArrayBuffer(100)], 'model.3mf');

    const result = await processFile(file);

    expect(parse3MF).toHaveBeenCalledTimes(1);
    expect(parseSTL).not.toHaveBeenCalled();
    expect(result.fileType).toBe('3mf');
    expect(result.fileName).toBe('model.3mf');
  });

  it('handles uppercase .STL extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'MODEL.STL');

    const result = await processFile(file);

    expect(parseSTL).toHaveBeenCalledTimes(1);
    expect(parse3MF).not.toHaveBeenCalled();
    expect(result.fileType).toBe('stl');
  });

  it('handles mixed-case .3MF extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'test.3MF');

    const result = await processFile(file);

    expect(parse3MF).toHaveBeenCalledTimes(1);
    expect(parseSTL).not.toHaveBeenCalled();
    expect(result.fileType).toBe('3mf');
  });

  it('throws for unsupported .obj extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'mesh.obj');

    await expect(processFile(file)).rejects.toThrow(/\.obj/i);
  });

  it('throws for unsupported .gcode extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'print.gcode');

    await expect(processFile(file)).rejects.toThrow(/\.gcode/i);
  });

  it('preserves the original fileName in the result', async () => {
    const file = new File([new ArrayBuffer(100)], 'original-name.STL');

    const result = await processFile(file);

    expect(result.fileName).toBe('original-name.STL');
  });

  it('adds partCount: 1 to STL results', async () => {
    const file = new File([new ArrayBuffer(100)], 'single-part.stl');

    const result = await processFile(file);

    expect(result.partCount).toBe(1);
  });
});
