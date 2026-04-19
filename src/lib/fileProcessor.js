import { parseSTL } from './stlParser.js';
import { parse3MF } from './threemfParser.js';
import { parseGCode } from './gcodeParser.js';

export const DEFAULT_DENSITY_G_CM3 = 1.24;

function normalizeResult(fileName, fileType, parserResult = {}) {
  if (fileType === 'stl') {
    const volumeCm3 = Number.isFinite(parserResult.volumeCm3) ? parserResult.volumeCm3 : 0;
    const estimatedGrams = volumeCm3 * DEFAULT_DENSITY_G_CM3;

    return {
      fileName,
      fileType,
      volumeCm3,
      partCount: 1,
      estimatedGrams,
      estimatedHours: 0,
      plates: [],
      colorEntries: [],
      objects: [
        {
          name: fileName,
          volumeCm3,
          estimatedGrams,
        },
      ],
      triangleCount: parserResult.triangleCount,
    };
  }

  if (fileType === '3mf') {
    const volumeCm3 = Number.isFinite(parserResult.volumeCm3) ? parserResult.volumeCm3 : 0;
    const partCount = Number.isFinite(parserResult.partCount)
      ? parserResult.partCount
      : Array.isArray(parserResult.objects)
        ? parserResult.objects.length
        : 0;
    const estimatedGrams = Number.isFinite(parserResult.estimatedGrams)
      ? parserResult.estimatedGrams
      : volumeCm3 * DEFAULT_DENSITY_G_CM3;
    const estimatedHours = Number.isFinite(parserResult.estimatedHours) ? parserResult.estimatedHours : 0;
    const plates = parserResult.plates ?? [];
    const colorEntries = parserResult.colorEntries ?? [];
    const objects = parserResult.objects ?? [];

    return {
      ...parserResult,
      fileName,
      fileType,
      volumeCm3,
      partCount,
      estimatedGrams,
      estimatedHours,
      plates,
      colorEntries,
      objects,
    };
  }

  if (fileType === 'gcode') {
    const extruders = Array.isArray(parserResult.extruders) ? parserResult.extruders : [];
    const estimatedHours = Number.isFinite(parserResult.estimatedHours) ? parserResult.estimatedHours : 0;
    const estimatedGrams = Number.isFinite(parserResult.totalGrams) ? parserResult.totalGrams : 0;

    return {
      fileName,
      fileType,
      volumeCm3: 0,
      partCount: 0,
      estimatedGrams,
      estimatedHours,
      plates: [],
      colorEntries: extruders
        .filter((entry) => Number.isFinite(entry.usageGrams) && entry.usageGrams > 0)
        .map((entry) => ({
          color: entry.color || 'default',
          grams: entry.usageGrams,
          source: 'file-metadata',
        })),
      objects: [],
      slicer: parserResult.slicer ?? null,
      extruders,
    };
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

export async function processFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'stl') {
    const buffer = await file.arrayBuffer();
    const result = parseSTL(buffer);
    return normalizeResult(file.name, 'stl', result);
  }

  if (ext === '3mf') {
    const buffer = await file.arrayBuffer();
    const result = await parse3MF(buffer);
    return normalizeResult(file.name, '3mf', result);
  }

  if (ext === 'gcode') {
    const text = await file.text();
    const result = parseGCode(text);
    return normalizeResult(file.name, 'gcode', result);
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

export async function processFiles(files) {
  const results = await Promise.all(Array.from(files).map((file) => processFile(file)));
  return results;
}
