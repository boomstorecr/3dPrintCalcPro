function signedTetrahedronVolume(v1, v2, v3) {
  return (
    v1.x * (v2.y * v3.z - v3.y * v2.z) -
    v2.x * (v1.y * v3.z - v3.y * v1.z) +
    v3.x * (v1.y * v2.z - v2.y * v1.z)
  ) / 6;
}

function parseBinarySTL(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const triangleCount = view.getUint32(80, true);

  let volumeMm3 = 0;
  let offset = 84;

  for (let i = 0; i < triangleCount; i += 1) {
    // Skip normal vector (3 floats)
    offset += 12;

    const v1 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;

    const v2 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;

    const v3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;

    volumeMm3 += signedTetrahedronVolume(v1, v2, v3);

    // Skip attribute byte count (uint16)
    offset += 2;
  }

  return {
    volumeCm3: Math.abs(volumeMm3) / 1000,
    triangleCount,
  };
}

function parseAsciiSTL(arrayBuffer) {
  const decoder = new TextDecoder();
  const text = decoder.decode(arrayBuffer);

  const facetRegex = /facet\s+normal\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)[\s\S]*?endfacet/gi;
  const vertexRegex = /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/gi;

  let volumeMm3 = 0;
  let triangleCount = 0;
  let facetMatch = facetRegex.exec(text);

  while (facetMatch) {
    const facetBlock = facetMatch[0];
    const vertices = [];
    vertexRegex.lastIndex = 0;
    let vertexMatch = vertexRegex.exec(facetBlock);

    while (vertexMatch) {
      vertices.push({
        x: Number.parseFloat(vertexMatch[1]),
        y: Number.parseFloat(vertexMatch[2]),
        z: Number.parseFloat(vertexMatch[3]),
      });
      vertexMatch = vertexRegex.exec(facetBlock);
    }

    if (vertices.length >= 3) {
      volumeMm3 += signedTetrahedronVolume(vertices[0], vertices[1], vertices[2]);
      triangleCount += 1;
    }

    facetMatch = facetRegex.exec(text);
  }

  return {
    volumeCm3: Math.abs(volumeMm3) / 1000,
    triangleCount,
  };
}

export function parseSTL(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new Error('parseSTL expects an ArrayBuffer input.');
  }

  if (arrayBuffer.byteLength < 6) {
    throw new Error('Invalid STL file: file is too small.');
  }

  const fileSize = arrayBuffer.byteLength;
  const view = new DataView(arrayBuffer);
  const headerBytes = new Uint8Array(arrayBuffer, 0, Math.min(80, fileSize));
  const headerText = new TextDecoder().decode(headerBytes).trim().toLowerCase();

  let isBinary = false;
  if (fileSize >= 84) {
    const triangleCount = view.getUint32(80, true);
    const expectedBinarySize = 84 + triangleCount * 50;
    isBinary = expectedBinarySize === fileSize;
  }

  if (isBinary) {
    return parseBinarySTL(arrayBuffer);
  }

  const text = new TextDecoder().decode(arrayBuffer).trimStart().toLowerCase();
  if (headerText.startsWith('solid') || text.includes('solid')) {
    return parseAsciiSTL(arrayBuffer);
  }

  throw new Error('Unable to determine STL format (binary or ASCII).');
}
