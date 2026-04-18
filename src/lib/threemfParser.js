import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function signedTetrahedronVolume(v1, v2, v3) {
  return (
    v1.x * (v2.y * v3.z - v3.y * v2.z) -
    v2.x * (v1.y * v3.z - v3.y * v1.z) +
    v3.x * (v1.y * v2.z - v2.y * v1.z)
  ) / 6;
}

function parseVertex(vertex) {
  return {
    x: Number.parseFloat(vertex.x),
    y: Number.parseFloat(vertex.y),
    z: Number.parseFloat(vertex.z),
  };
}

function computeMeshVolumeMm3(vertices, triangles) {
  let volume = 0;

  for (const triangle of triangles) {
    const i1 = Number.parseInt(triangle.v1, 10);
    const i2 = Number.parseInt(triangle.v2, 10);
    const i3 = Number.parseInt(triangle.v3, 10);

    const v1 = vertices[i1];
    const v2 = vertices[i2];
    const v3 = vertices[i3];

    if (!v1 || !v2 || !v3) {
      continue;
    }

    volume += signedTetrahedronVolume(v1, v2, v3);
  }

  return Math.abs(volume);
}

function findModelFile(zip) {
  const exact = zip.file('3D/3dmodel.model');
  if (exact) {
    return exact;
  }

  const fallbackPath = Object.keys(zip.files).find(
    (path) => path.toLowerCase() === '3d/3dmodel.model'
  );

  return fallbackPath ? zip.file(fallbackPath) : null;
}

export async function parse3MF(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new Error('parse3MF expects an ArrayBuffer input.');
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const modelFile = findModelFile(zip);

  if (!modelFile) {
    throw new Error('Invalid 3MF file: missing 3D/3dmodel.model.');
  }

  const modelXml = await modelFile.async('text');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: true,
  });

  const parsed = parser.parse(modelXml);
  const objectNodes = toArray(parsed?.model?.resources?.object);

  const objects = [];
  let totalVolumeCm3 = 0;

  for (let index = 0; index < objectNodes.length; index += 1) {
    const objectNode = objectNodes[index];
    const mesh = objectNode?.mesh;
    const vertices = toArray(mesh?.vertices?.vertex).map(parseVertex);
    const triangles = toArray(mesh?.triangles?.triangle);

    const meshVolumeMm3 = computeMeshVolumeMm3(vertices, triangles);
    const meshVolumeCm3 = meshVolumeMm3 / 1000;

    totalVolumeCm3 += meshVolumeCm3;
    objects.push({
      name: objectNode?.name || `Object ${index + 1}`,
      volumeCm3: meshVolumeCm3,
    });
  }

  return {
    volumeCm3: totalVolumeCm3,
    partCount: objectNodes.length,
    objects,
  };
}
