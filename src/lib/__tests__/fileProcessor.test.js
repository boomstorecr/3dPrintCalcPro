// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stlParser.js', () => ({
  parseSTL: vi.fn(() => ({ volumeCm3: 5.5, triangleCount: 100 })),
}));

vi.mock('../threemfParser.js', () => ({
  parse3MF: vi.fn(async () => ({
    volumeCm3: 10.2,
    partCount: 3,
    objects: [
      { name: 'Part 1', volumeCm3: 5.0, color: '#FF0000', estimatedGrams: 6.2 },
      { name: 'Part 2', volumeCm3: 3.0, color: '#00FF00', estimatedGrams: 3.72 },
      { name: 'Part 3', volumeCm3: 2.2, color: null, estimatedGrams: 2.728 },
    ],
    plates: [
      { name: 'Plate 1', objects: [], totalGrams: 12.648, estimatedHours: 1.5 },
    ],
    colorEntries: [
      { color: '#FF0000', grams: 6.2, source: 'density-estimate' },
      { color: '#00FF00', grams: 3.72, source: 'density-estimate' },
      { color: 'default', grams: 2.728, source: 'density-estimate' },
    ],
    estimatedHours: 1.5,
    estimatedGrams: 12.648,
  })),
}));

vi.mock('../gcodeParser.js', () => ({
  parseGCode: vi.fn(() => ({
    estimatedHours: 2.5,
    extruders: [
      { index: 0, filamentType: 'PLA', color: '#FFFFFF', usageMeters: 3.5, usageGrams: 10.5 },
    ],
    totalGrams: 10.5,
    slicer: 'BambuStudio',
  })),
}));

import { processFile, processFiles, DEFAULT_DENSITY_G_CM3 } from '../fileProcessor.js';
import { parseGCode } from '../gcodeParser.js';
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
    expect(parseGCode).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fileName: 'model.stl',
      fileType: 'stl',
      partCount: 1,
      volumeCm3: 5.5,
      estimatedHours: 0,
      estimatedGrams: 5.5 * 1.24,
      plates: [],
      colorEntries: [],
      triangleCount: 100,
    });
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].name).toBe('model.stl');
  });

  it('routes .3mf files to parse3MF and returns 3mf metadata', async () => {
    const file = new File([new ArrayBuffer(100)], 'model.3mf');

    const result = await processFile(file);

    expect(parse3MF).toHaveBeenCalledTimes(1);
    expect(parseSTL).not.toHaveBeenCalled();
    expect(parseGCode).not.toHaveBeenCalled();
    expect(result.fileType).toBe('3mf');
    expect(result.fileName).toBe('model.3mf');
  });

  it('handles uppercase .STL extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'MODEL.STL');

    const result = await processFile(file);

    expect(parseSTL).toHaveBeenCalledTimes(1);
    expect(parse3MF).not.toHaveBeenCalled();
    expect(parseGCode).not.toHaveBeenCalled();
    expect(result.fileType).toBe('stl');
  });

  it('handles mixed-case .3MF extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'test.3MF');

    const result = await processFile(file);

    expect(parse3MF).toHaveBeenCalledTimes(1);
    expect(parseSTL).not.toHaveBeenCalled();
    expect(parseGCode).not.toHaveBeenCalled();
    expect(result.fileType).toBe('3mf');
  });

  it('throws for unsupported .obj extension', async () => {
    const file = new File([new ArrayBuffer(100)], 'mesh.obj');

    await expect(processFile(file)).rejects.toThrow(/\.obj/i);
  });

  it('routes .gcode files to parseGCode and returns gcode metadata', async () => {
    const file = new File(['G28\nG1 X0'], 'print.gcode');
    const result = await processFile(file);

    expect(parseGCode).toHaveBeenCalledTimes(1);
    expect(result.fileType).toBe('gcode');
    expect(result.fileName).toBe('print.gcode');
    expect(result.estimatedHours).toBe(2.5);
    expect(result.estimatedGrams).toBe(10.5);
    expect(result.volumeCm3).toBe(0);
    expect(result.partCount).toBe(0);
    expect(result.slicer).toBe('BambuStudio');
    expect(result.extruders).toHaveLength(1);
    expect(result.colorEntries).toHaveLength(1);
    expect(result.colorEntries[0]).toMatchObject({ color: '#FFFFFF', grams: 10.5, source: 'file-metadata' });
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

  it('includes estimatedGrams in normalized STL result', async () => {
    const file = new File([new ArrayBuffer(100)], 'model.stl');
    const result = await processFile(file);

    expect(result.estimatedGrams).toBeCloseTo(5.5 * 1.24, 2);
    expect(result.estimatedHours).toBe(0);
    expect(result.plates).toEqual([]);
    expect(result.colorEntries).toEqual([]);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].name).toBe('model.stl');
  });

  it('passes through enhanced 3MF fields in normalized result', async () => {
    const file = new File([new ArrayBuffer(100)], 'model.3mf');
    const result = await processFile(file);

    expect(result.estimatedGrams).toBe(12.648);
    expect(result.estimatedHours).toBe(1.5);
    expect(result.plates).toHaveLength(1);
    expect(result.colorEntries).toHaveLength(3);
    expect(result.objects).toHaveLength(3);
    expect(result.objects[0].color).toBe('#FF0000');
  });

  it('handles uppercase .GCODE extension', async () => {
    const file = new File(['G28'], 'print.GCODE');
    const result = await processFile(file);
    expect(result.fileType).toBe('gcode');
    expect(parseGCode).toHaveBeenCalled();
  });

  it('exports DEFAULT_DENSITY_G_CM3 as 1.24', () => {
    expect(DEFAULT_DENSITY_G_CM3).toBe(1.24);
  });
});

describe('processFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes multiple files in parallel', async () => {
    const stlFile = new File([new ArrayBuffer(100)], 'a.stl');
    const gcodeFile = new File(['G28'], 'b.gcode');

    const results = await processFiles([stlFile, gcodeFile]);

    expect(results).toHaveLength(2);
    expect(results[0].fileType).toBe('stl');
    expect(results[1].fileType).toBe('gcode');
  });

  it('returns empty array for empty input', async () => {
    const results = await processFiles([]);
    expect(results).toEqual([]);
  });
});
