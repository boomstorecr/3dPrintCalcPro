import { parseSTL } from './stlParser.js';
import { parse3MF } from './threemfParser.js';

export async function processFile(file) {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'stl') {
    const result = parseSTL(buffer);
    return { fileName: file.name, fileType: 'stl', ...result, partCount: 1 };
  }

  if (ext === '3mf') {
    const result = await parse3MF(buffer);
    return { fileName: file.name, fileType: '3mf', ...result };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
