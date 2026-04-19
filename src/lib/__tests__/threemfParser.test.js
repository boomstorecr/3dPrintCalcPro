import { describe, expect, it } from 'vitest';
import { parse3MF } from '../threemfParser';
import JSZip from 'jszip';

async function create3MFBuffer(modelXml) {
  const zip = new JSZip();
  zip.file('3D/3dmodel.model', modelXml);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return buffer;
}

async function create3MFBufferWithFiles(modelXml, extraFiles = {}) {
  const zip = new JSZip();
  zip.file('3D/3dmodel.model', modelXml);
  for (const [path, content] of Object.entries(extraFiles)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'arraybuffer' });
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

function cubeObjectXmlWithAttributes({
  id,
  name,
  pid,
  pindex,
}) {
  const attrs = [`id="${id}"`, 'type="model"', `name="${name}"`];

  if (pid !== undefined) {
    attrs.push(`pid="${pid}"`);
  }

  if (pindex !== undefined) {
    attrs.push(`pindex="${pindex}"`);
  }

  return `
<object ${attrs.join(' ')}>
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

  describe('new fields on simple 3MF (backward compatibility)', () => {
    it('returns estimatedGrams based on default density', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.estimatedGrams).toBeCloseTo(0.00124, 8);
    });

    it('returns estimatedHours as 0 when no metadata exists', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.estimatedHours).toBe(0);
    });

    it('returns empty plates array for simple 3MF', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.plates).toEqual([]);
    });

    it('returns one default color entry using density estimate source', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.colorEntries).toHaveLength(1);
      expect(result.colorEntries[0].color).toBe('default');
      expect(result.colorEntries[0].grams).toBeCloseTo(0.00124, 8);
      expect(result.colorEntries[0].source).toBe('density-estimate');
    });

    it('returns null color for objects when no basematerials are present', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.objects[0].color).toBeNull();
    });

    it('returns estimatedGrams per object', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.objects[0].estimatedGrams).toBeGreaterThan(0);
    });
  });

  describe('basematerials color extraction', () => {
    it('resolves ARGB basematerial colors to RGB on objects', async () => {
      const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">
      <base name="PLA Red" displaycolor="#FFFF0000"/>
      <base name="PLA Blue" displaycolor="#FF0000FF"/>
    </basematerials>
    ${cubeObjectXmlWithAttributes({ id: 2, name: 'RedCube', pid: 1, pindex: 0 })}
    ${cubeObjectXmlWithAttributes({ id: 3, name: 'BlueCube', pid: 1, pindex: 1 })}
  </resources>
</model>`;

      const buffer = await create3MFBuffer(modelXml);
      const result = await parse3MF(buffer);

      const redCube = result.objects.find((obj) => obj.name === 'RedCube');
      const blueCube = result.objects.find((obj) => obj.name === 'BlueCube');

      expect(redCube?.color).toBe('#FF0000');
      expect(blueCube?.color).toBe('#0000FF');
    });

    it('aggregates colorEntries by resolved colors', async () => {
      const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">
      <base name="PLA Red" displaycolor="#FFFF0000"/>
      <base name="PLA Blue" displaycolor="#FF0000FF"/>
    </basematerials>
    ${cubeObjectXmlWithAttributes({ id: 2, name: 'RedCube', pid: 1, pindex: 0 })}
    ${cubeObjectXmlWithAttributes({ id: 3, name: 'BlueCube', pid: 1, pindex: 1 })}
  </resources>
</model>`;

      const buffer = await create3MFBuffer(modelXml);
      const result = await parse3MF(buffer);

      expect(result.colorEntries).toHaveLength(2);
      expect(result.colorEntries.some((entry) => entry.color === '#FF0000')).toBe(true);
      expect(result.colorEntries.some((entry) => entry.color === '#0000FF')).toBe(true);
    });

    it('supports 6-char displaycolor values directly', async () => {
      const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">
      <base name="PLA Red" displaycolor="#FF0000"/>
    </basematerials>
    ${cubeObjectXmlWithAttributes({ id: 2, name: 'RedCube', pid: 1, pindex: 0 })}
  </resources>
</model>`;

      const buffer = await create3MFBuffer(modelXml);
      const result = await parse3MF(buffer);
      const redCube = result.objects.find((obj) => obj.name === 'RedCube');

      expect(redCube?.color).toBe('#FF0000');
    });
  });

  describe('slice_info.config plate metadata', () => {
    it('builds plates and totals from slice_info.config', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const sliceInfoXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="3600"/>
    <filament id="1" type="PLA" color="#FFFFFF" used_g="12.5" used_m="4.2"/>
  </plate>
</config>`;

      const buffer = await create3MFBufferWithFiles(modelXml, {
        'Metadata/slice_info.config': sliceInfoXml,
      });

      const result = await parse3MF(buffer);

      expect(result.plates).toHaveLength(1);
      expect(result.plates[0].name).toBe('Plate 1');
      expect(result.plates[0].estimatedHours).toBeCloseTo(1, 8);
      expect(result.plates[0].totalGrams).toBeCloseTo(12.5, 8);
      expect(result.estimatedHours).toBeCloseTo(1, 8);
      expect(result.estimatedGrams).toBeGreaterThan(0);
    });
  });

  describe('slice_info.config with multiple plates', () => {
    it('sums estimated hours and filament usage across plates', async () => {
      const objectOne = cubeObjectXmlWithAttributes({ id: 1, name: 'PlateOneCube' });
      const objectTwo = cubeObjectXmlWithAttributes({ id: 2, name: 'PlateTwoCube' });
      const modelXml = modelXmlWithObjects(`${objectOne}\n${objectTwo}`);
      const sliceInfoXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="3600"/>
    <filament id="1" type="PLA" color="#FFFFFF" used_g="10.0"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="7200"/>
    <filament id="1" type="PETG" color="#FF0000" used_g="8.5"/>
  </plate>
</config>`;
      const modelSettingsJson = JSON.stringify({
        plates: [
          { index: 1, object_ids: [1] },
          { index: 2, object_ids: [2] },
        ],
      });

      const buffer = await create3MFBufferWithFiles(modelXml, {
        'Metadata/slice_info.config': sliceInfoXml,
        'Metadata/model_settings.config': modelSettingsJson,
      });

      const result = await parse3MF(buffer);

      expect(result.plates).toHaveLength(2);
      expect(result.estimatedHours).toBeCloseTo(3, 8);

      const totalPlateGrams = result.plates.reduce(
        (sum, plate) => sum + plate.totalGrams,
        0
      );
      expect(totalPlateGrams).toBeCloseTo(18.5, 8);
    });
  });

  describe('embedded gcode print time', () => {
    it('uses embedded gcode estimate when plate metadata is unavailable', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXml);
      const gcodeContent =
        '; estimated printing time (normal mode) = 2h 30m 0s\nG28\nG1 X0 Y0\n';

      const buffer = await create3MFBufferWithFiles(modelXml, {
        'Metadata/plate_1.gcode': gcodeContent,
      });

      const result = await parse3MF(buffer);

      expect(result.estimatedHours).toBeCloseTo(2.5, 8);
    });
  });

  describe('object without basematerials gets default color', () => {
    it('keeps null object color and aggregates under default colorEntry', async () => {
      const modelXml = modelXmlWithObjects(cubeObjectXmlWithAttributes({
        id: 7,
        name: 'NoColorCube',
      }));
      const buffer = await create3MFBuffer(modelXml);

      const result = await parse3MF(buffer);

      expect(result.objects[0].color).toBeNull();
      expect(result.colorEntries).toHaveLength(1);
      expect(result.colorEntries[0].color).toBe('default');
    });
  });
});
