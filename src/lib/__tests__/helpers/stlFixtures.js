function writeVector3(view, offset, vector) {
  view.setFloat32(offset, vector.x, true);
  view.setFloat32(offset + 4, vector.y, true);
  view.setFloat32(offset + 8, vector.z, true);
}

function computeNormal(v1, v2, v3) {
  const ux = v2.x - v1.x;
  const uy = v2.y - v1.y;
  const uz = v2.z - v1.z;

  const vx = v3.x - v1.x;
  const vy = v3.y - v1.y;
  const vz = v3.z - v1.z;

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: nx / length,
    y: ny / length,
    z: nz / length,
  };
}

function createBinarySTLFromTriangles(triangles) {
  const triangleCount = triangles.length;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);

  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (const triangle of triangles) {
    const [v1, v2, v3] = triangle;
    const normal = computeNormal(v1, v2, v3);

    writeVector3(view, offset, normal);
    offset += 12;

    writeVector3(view, offset, v1);
    offset += 12;

    writeVector3(view, offset, v2);
    offset += 12;

    writeVector3(view, offset, v3);
    offset += 12;

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

function createCubeTriangles() {
  const v000 = { x: 0, y: 0, z: 0 };
  const v100 = { x: 1, y: 0, z: 0 };
  const v110 = { x: 1, y: 1, z: 0 };
  const v010 = { x: 0, y: 1, z: 0 };
  const v001 = { x: 0, y: 0, z: 1 };
  const v101 = { x: 1, y: 0, z: 1 };
  const v111 = { x: 1, y: 1, z: 1 };
  const v011 = { x: 0, y: 1, z: 1 };

  return [
    [v000, v110, v100],
    [v000, v010, v110],

    [v001, v101, v111],
    [v001, v111, v011],

    [v000, v100, v101],
    [v000, v101, v001],

    [v010, v111, v110],
    [v010, v011, v111],

    [v000, v001, v011],
    [v000, v011, v010],

    [v100, v111, v101],
    [v100, v110, v111],
  ];
}

export function createBinaryCubeSTL() {
  return createBinarySTLFromTriangles(createCubeTriangles());
}

export function createAsciiCubeSTL() {
  const triangles = createCubeTriangles();

  const lines = ['solid cube'];
  for (const triangle of triangles) {
    const [v1, v2, v3] = triangle;
    const normal = computeNormal(v1, v2, v3);

    lines.push(`  facet normal ${normal.x} ${normal.y} ${normal.z}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${v1.x} ${v1.y} ${v1.z}`);
    lines.push(`      vertex ${v2.x} ${v2.y} ${v2.z}`);
    lines.push(`      vertex ${v3.x} ${v3.y} ${v3.z}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push('endsolid cube');

  return new TextEncoder().encode(lines.join('\n')).buffer;
}

export function createEmptyBinarySTL() {
  const buffer = new ArrayBuffer(84);
  const view = new DataView(buffer);
  view.setUint32(80, 0, true);
  return buffer;
}

export function createSingleTriangleBinarySTL() {
  const triangle = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ];

  return createBinarySTLFromTriangles([triangle]);
}
