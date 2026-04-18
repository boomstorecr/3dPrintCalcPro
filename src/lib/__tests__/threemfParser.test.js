import { describe, expect, it } from 'vitest';
import { parse3MF } from '../threemfParser';
import JSZip from 'jszip';

async function create3MFBuffer(modelXml) {
  const zip = new JSZip();
  zip.file('3D/3dmodel.model', modelXml);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return buffer;
}

const cubeObjectXml = `
<object id="1" type="model" name="TestCube">
  <mesh>
    <vertices>
      <vertex x="0" y="0" z="0"/>
      <vertex x="1" y="0" z="0"/>
      <vertex x="1" y="1" z="0"/>
      <vertex x="0" y="1" z="0"/>
      <vertex x="0" y="0" z="1"/>
      <vertex x="1" y="0" z="1"/>
      <vertex x="1" y="1" z="1"/>
      <vertex x="0" y="1" z="1"/>
    </vertices>
    <triangles>
      <triangle v1="0" v2="2" v3="1"/>
      <triangle v1="0" v2="3" v3="2"/>
      <triangle v1="4" v2="5" v3="6"/>
      <triangle v1="4" v2="6" v3="7"/>
      <triangle v1="0" v2="1" v3="5"/>
      <triangle v1="0" v2="5" v3="4"/>
      <triangle v1="2" v2="3" v3="7"/>
      <triangle v1="2" v2="7" v3="6"/>
      <triangle v1="1" v2="2" v3="6"/>
      <triangle v1="1" v2="6" v3="5"/>
      <triangle v1="0" v2="4" v3="7"/>
      <triangle v1="0" v2="7" v3="3"/>
    </triangles>
  </mesh>
</object>
`;

function modelXmlWithObjects(objectsXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    ${objectsXml}
  </resources>
</model>`;
}

describe('parse3MF', () => {
  it('parses a single cube object', async () => {
    const modelXml = modelXmlWithObjects(cubeObjectXml);
    const buffer = await create3MFBuffer(modelXml);

    const result = await parse3MF(buffer);

    expect(result.volumeCm3).toBeCloseTo(0.001, 6);
    expect(result.partCount).toBe(1);
    expect(result.objects).toHaveLength(1);
  });

  it('parses multiple objects and sums volume', async () => {
    const objectOne = cubeObjectXml;
    const objectTwo = cubeObjectXml
      .replace('id="1"', 'id="2"')
      .replace('name="TestCube"', 'name="TestCube2"');

    const modelXml = modelXmlWithObjects(`${objectOne}\n${objectTwo}`);
    const buffer = await create3MFBuffer(modelXml);

    const result = await parse3MF(buffer);

    expect(result.partCount).toBe(2);
    expect(result.volumeCm3).toBeCloseTo(0.002, 6);
    expect(result.objects).toHaveLength(2);
  });

  it('returns zero volume for an object with no triangles', async () => {
    const emptyMeshXml = `
<object id="1" type="model" name="NoTriangles">
  <mesh>
    <vertices>
      <vertex x="0" y="0" z="0"/>
      <vertex x="1" y="0" z="0"/>
      <vertex x="1" y="1" z="0"/>
    </vertices>
  </mesh>
</object>
`;

    const modelXml = modelXmlWithObjects(emptyMeshXml);
    const buffer = await create3MFBuffer(modelXml);

    const result = await parse3MF(buffer);

    expect(result.partCount).toBe(1);
    expect(result.volumeCm3).toBe(0);
    expect(result.objects[0].volumeCm3).toBe(0);
  });

  it('keeps object name when present', async () => {
    const modelXml = modelXmlWithObjects(cubeObjectXml);
    const buffer = await create3MFBuffer(modelXml);

    const result = await parse3MF(buffer);

    expect(result.objects[0].name).toBe('TestCube');
  });

  it('falls back to default name when object has no name', async () => {
    const unnamedObjectXml = cubeObjectXml.replace(' name="TestCube"', '');
    const modelXml = modelXmlWithObjects(unnamedObjectXml);
    const buffer = await create3MFBuffer(modelXml);

    const result = await parse3MF(buffer);

    expect(result.objects[0].name).toBe('Object 1');
  });

  it('throws when 3D/3dmodel.model is missing', async () => {
    const zip = new JSZip();
    zip.file('3D/not-model.model', '<model />');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parse3MF(buffer)).rejects.toThrow(
      'Invalid 3MF file: missing 3D/3dmodel.model.'
    );
  });

  it('throws for non-ArrayBuffer input', async () => {
    await expect(parse3MF('string')).rejects.toThrow(
      'parse3MF expects an ArrayBuffer input.'
    );
  });
});
