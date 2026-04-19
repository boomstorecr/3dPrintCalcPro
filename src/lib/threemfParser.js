import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_DENSITY_G_CM3 = 1.24;

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

function normalizeColorHex(colorValue) {
  if (!colorValue || typeof colorValue !== 'string') {
    return null;
  }

  const trimmed = colorValue.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    return null;
  }

  if (hex.length === 8) {
    return `#${hex.slice(2).toUpperCase()}`;
  }

  return `#${hex.toUpperCase()}`;
}

function safeParseFloat(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function safeParseInt(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

function parseBasematerialColorMap(resourcesNode) {
  const map = new Map();
  const basematerialsNodes = toArray(resourcesNode?.basematerials);

  for (const basematerialsNode of basematerialsNodes) {
    const resourceId = String(basematerialsNode?.id ?? '');
    if (!resourceId) {
      continue;
    }

    const baseNodes = toArray(basematerialsNode?.base);
    for (let index = 0; index < baseNodes.length; index += 1) {
      const baseNode = baseNodes[index];
      const normalizedColor = normalizeColorHex(baseNode?.displaycolor);
      if (!normalizedColor) {
        continue;
      }

      map.set(`${resourceId}:${index}`, normalizedColor);
    }
  }

  return map;
}

function getObjectColorFromBasematerials(objectNode, basematerialColorMap) {
  const pid = objectNode?.pid;
  const pindex = objectNode?.pindex;
  if (pid === undefined || pindex === undefined) {
    return null;
  }

  return basematerialColorMap.get(`${String(pid)}:${String(pindex)}`) || null;
}

function findFileByCaseInsensitivePath(zip, expectedPath) {
  const direct = zip.file(expectedPath);
  if (direct) {
    return direct;
  }

  const lowerExpected = expectedPath.toLowerCase();
  const foundPath = Object.keys(zip.files).find(
    (path) => path.toLowerCase() === lowerExpected
  );

  return foundPath ? zip.file(foundPath) : null;
}

function listZipPaths(zip) {
  return Object.keys(zip.files);
}

function getPlateIndexFromMetadataNodes(metadataNodes) {
  const entries = toArray(metadataNodes);
  for (const entry of entries) {
    if (entry?.key === 'index' || entry?.name === 'index') {
      const parsed = safeParseInt(entry?.value ?? entry?.['#text']);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function getPredictionSecondsFromMetadataNodes(metadataNodes) {
  const entries = toArray(metadataNodes);
  for (const entry of entries) {
    const key = String(entry?.key || entry?.name || '').toLowerCase();
    if (key !== 'prediction' && key !== 'estimated_time' && key !== 'print_time') {
      continue;
    }

    const parsed = safeParseFloat(entry?.value ?? entry?.['#text']);
    if (parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function parseGcodeTimeToHours(gcodeText) {
  if (!gcodeText || typeof gcodeText !== 'string') {
    return 0;
  }

  const lines = gcodeText.split(/\r?\n/);
  let seconds = 0;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (!lowerLine.includes('estimated printing time')) {
      continue;
    }

    const secondsMatch = lowerLine.match(/estimated printing time[^\d]*(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)\b/);
    if (secondsMatch) {
      seconds += safeParseFloat(secondsMatch[1]);
      continue;
    }

    const hmsMatch = lowerLine.match(/estimated printing time[^=]*=\s*(.*)$/);
    const payload = hmsMatch ? hmsMatch[1] : lowerLine;
    const h = payload.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = payload.match(/(\d+(?:\.\d+)?)\s*m/);
    const s = payload.match(/(\d+(?:\.\d+)?)\s*s/);
    const totalSeconds = safeParseFloat(h?.[1]) * 3600 + safeParseFloat(m?.[1]) * 60 + safeParseFloat(s?.[1]);
    if (totalSeconds > 0) {
      seconds += totalSeconds;
    }
  }

  return seconds / 3600;
}

function parseSliceInfoConfig(sliceText, parser) {
  if (!sliceText || typeof sliceText !== 'string') {
    return [];
  }

  try {
    const parsed = parser.parse(sliceText);
    const plateNodes = toArray(parsed?.config?.plate);

    return plateNodes.map((plateNode, index) => {
      const metadataNodes = toArray(plateNode?.metadata);
      const predictionSecondsFromMetadata = getPredictionSecondsFromMetadataNodes(metadataNodes);
      const fallbackPrediction = safeParseFloat(plateNode?.prediction);
      const predictionSeconds = predictionSecondsFromMetadata || fallbackPrediction;

      const filamentNodes = toArray(plateNode?.filament).map((filamentNode) => ({
        id: filamentNode?.id ?? null,
        type: filamentNode?.type || null,
        color: normalizeColorHex(filamentNode?.color),
        used_g: safeParseFloat(filamentNode?.used_g),
        used_m: safeParseFloat(filamentNode?.used_m),
      }));

      const plateIndex = getPlateIndexFromMetadataNodes(metadataNodes);

      return {
        index: plateIndex !== null ? plateIndex : index + 1,
        name: `Plate ${plateIndex !== null ? plateIndex : index + 1}`,
        estimatedHours: predictionSeconds > 0 ? predictionSeconds / 3600 : 0,
        filaments: filamentNodes,
      };
    });
  } catch {
    return [];
  }
}

function extractObjectIdsFromValue(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => extractObjectIdsFromValue(entry))
      .filter((id) => id !== null);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? [Math.trunc(value)] : [];
  }

  if (typeof value === 'string') {
    const matches = value.match(/\d+/g);
    return matches ? matches.map((token) => Number.parseInt(token, 10)) : [];
  }

  if (typeof value === 'object') {
    if ('id' in value || 'object_id' in value || 'objectId' in value) {
      return extractObjectIdsFromValue(value.id ?? value.object_id ?? value.objectId);
    }
  }

  return [];
}

function parsePlateAssignmentsFromJson(text) {
  if (!text || typeof text !== 'string') {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Map();
  }

  const assignments = new Map();
  const plateCandidates = Array.isArray(parsed?.plates)
    ? parsed.plates
    : Array.isArray(parsed?.plate)
      ? parsed.plate
      : [];

  for (let index = 0; index < plateCandidates.length; index += 1) {
    const plate = plateCandidates[index];
    const candidateIds = [
      ...extractObjectIdsFromValue(plate?.objects),
      ...extractObjectIdsFromValue(plate?.object_ids),
      ...extractObjectIdsFromValue(plate?.objectIds),
      ...extractObjectIdsFromValue(plate?.models),
    ].filter((id) => Number.isFinite(id));

    if (candidateIds.length === 0) {
      continue;
    }

    const plateIndex =
      safeParseInt(plate?.index) ??
      safeParseInt(plate?.plate_index) ??
      safeParseInt(plate?.id) ??
      index + 1;

    assignments.set(plateIndex, new Set(candidateIds));
  }

  return assignments;
}

function distributeByVolume(objects, totalGrams) {
  if (!Array.isArray(objects) || objects.length === 0) {
    return [];
  }

  const normalizedTotal = safeParseFloat(totalGrams);
  if (normalizedTotal <= 0) {
    return objects.map(() => 0);
  }

  const totalVolume = objects.reduce(
    (sum, objectEntry) => sum + safeParseFloat(objectEntry?.volumeCm3),
    0
  );

  if (totalVolume <= 0) {
    const even = normalizedTotal / objects.length;
    return objects.map(() => even);
  }

  return objects.map(
    (objectEntry) => (safeParseFloat(objectEntry?.volumeCm3) / totalVolume) * normalizedTotal
  );
}

async function extract3MFMetadata(zip, parser) {
  const zipPaths = listZipPaths(zip);
  const metadataPlateFiles = zipPaths.filter((path) => {
    const normalized = path.toLowerCase();
    return (
      /^metadata\/plate_[^/]+\.(model|gcode)$/.test(normalized) ||
      /^metadata\/plate_[^/]+\//.test(normalized)
    );
  });

  const sliceInfoFile = findFileByCaseInsensitivePath(zip, 'Metadata/slice_info.config');
  let sliceInfoPlates = [];
  if (sliceInfoFile) {
    const sliceInfoText = await sliceInfoFile.async('text');
    sliceInfoPlates = parseSliceInfoConfig(sliceInfoText, parser);
  }

  const modelSettingsFile = findFileByCaseInsensitivePath(zip, 'Metadata/model_settings.config');
  const projectSettingsFile = findFileByCaseInsensitivePath(zip, 'Metadata/project_settings.config');

  let assignmentMap = new Map();
  if (modelSettingsFile) {
    const text = await modelSettingsFile.async('text');
    assignmentMap = parsePlateAssignmentsFromJson(text);
  }

  if (assignmentMap.size === 0 && projectSettingsFile) {
    const text = await projectSettingsFile.async('text');
    assignmentMap = parsePlateAssignmentsFromJson(text);
  }

  const gcodeFiles = zipPaths.filter((path) => path.toLowerCase().endsWith('.gcode'));
  const gcodeHoursByPath = new Map();
  for (const gcodePath of gcodeFiles) {
    const gcodeFile = zip.file(gcodePath);
    if (!gcodeFile) {
      continue;
    }

    const gcodeText = await gcodeFile.async('text');
    const hours = parseGcodeTimeToHours(gcodeText);
    if (hours > 0) {
      gcodeHoursByPath.set(gcodePath, hours);
    }
  }

  return {
    metadataPlateFiles,
    sliceInfoPlates,
    assignmentMap,
    gcodeHoursByPath,
  };
}

function buildPlateEntries(objects, metadata) {
  const hasPlateSignals =
    metadata.sliceInfoPlates.length > 0 || metadata.metadataPlateFiles.length > 0;

  if (!hasPlateSignals) {
    return [];
  }

  const objectById = new Map();
  for (const objectEntry of objects) {
    if (objectEntry.objectId !== null) {
      objectById.set(objectEntry.objectId, objectEntry);
    }
  }

  const plateEntries = [];

  if (metadata.sliceInfoPlates.length > 0) {
    for (const slicePlate of metadata.sliceInfoPlates) {
      const assignedObjectIds = metadata.assignmentMap.get(slicePlate.index);
      let plateObjects;

      if (assignedObjectIds && assignedObjectIds.size > 0) {
        plateObjects = [...assignedObjectIds]
          .map((id) => objectById.get(id))
          .filter(Boolean);
      } else if (metadata.sliceInfoPlates.length === 1) {
        plateObjects = [...objects];
      } else {
        plateObjects = [];
      }

      const totalFilamentGrams = slicePlate.filaments.reduce(
        (sum, filament) => sum + safeParseFloat(filament.used_g),
        0
      );

      plateEntries.push({
        name: slicePlate.name,
        index: slicePlate.index,
        objects: plateObjects,
        totalFilamentGrams,
        estimatedHours: safeParseFloat(slicePlate.estimatedHours),
        hasMetadataGrams: totalFilamentGrams > 0,
      });
    }
  } else {
    const sortedPlateFileNames = [...metadata.metadataPlateFiles].sort();
    for (let index = 0; index < sortedPlateFileNames.length; index += 1) {
      const platePath = sortedPlateFileNames[index];
      const plateNumber = index + 1;
      const gcodeHours = metadata.gcodeHoursByPath.get(platePath) || 0;

      plateEntries.push({
        name: `Plate ${plateNumber}`,
        index: plateNumber,
        objects: sortedPlateFileNames.length === 1 ? [...objects] : [],
        totalFilamentGrams: 0,
        estimatedHours: gcodeHours,
        hasMetadataGrams: false,
      });
    }
  }

  if (plateEntries.length > 0) {
    return plateEntries;
  }

  return [];
}

function enrichObjectsWithGrams(objects, plates) {
  const enriched = objects.map((objectEntry) => ({
    ...objectEntry,
    estimatedGrams: 0,
    gramsSource: 'density-estimate',
  }));

  const objectIndexMap = new Map(
    enriched.map((objectEntry, index) => [objectEntry.objectKey, index])
  );

  for (const plate of plates) {
    const metadataTotal = safeParseFloat(plate.totalFilamentGrams);
    const targetObjects = plate.objects;

    if (plate.hasMetadataGrams && metadataTotal > 0 && targetObjects.length > 0) {
      const allocations = distributeByVolume(targetObjects, metadataTotal);
      for (let index = 0; index < targetObjects.length; index += 1) {
        const target = targetObjects[index];
        const objectIndex = objectIndexMap.get(target.objectKey);
        if (objectIndex === undefined) {
          continue;
        }

        enriched[objectIndex].estimatedGrams += allocations[index];
        enriched[objectIndex].gramsSource = 'file-metadata';
      }
    }
  }

  for (let index = 0; index < enriched.length; index += 1) {
    if (enriched[index].estimatedGrams > 0) {
      continue;
    }

    enriched[index].estimatedGrams =
      safeParseFloat(enriched[index].volumeCm3) * DEFAULT_DENSITY_G_CM3;
    enriched[index].gramsSource = 'density-estimate';
  }

  return enriched;
}

function buildColorEntries(objects) {
  const map = new Map();

  for (const objectEntry of objects) {
    const color = objectEntry.color || 'default';
    const existing = map.get(color) || {
      color,
      grams: 0,
      source: 'density-estimate',
    };

    existing.grams += safeParseFloat(objectEntry.estimatedGrams);
    if (objectEntry.gramsSource === 'file-metadata') {
      existing.source = 'file-metadata';
    }

    map.set(color, existing);
  }

  return [...map.values()];
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
  const resourcesNode = parsed?.model?.resources;
  const objectNodes = toArray(resourcesNode?.object);
  const basematerialColorMap = parseBasematerialColorMap(resourcesNode);
  const metadata = await extract3MFMetadata(zip, parser);

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
      objectKey: `${safeParseInt(objectNode?.id) ?? 'no-id'}-${index}`,
      objectId: safeParseInt(objectNode?.id),
      name: objectNode?.name || `Object ${index + 1}`,
      volumeCm3: meshVolumeCm3,
      color: getObjectColorFromBasematerials(objectNode, basematerialColorMap),
    });
  }

  const initialPlates = buildPlateEntries(objects, metadata);
  const enrichedObjects = enrichObjectsWithGrams(objects, initialPlates);
  const enrichedObjectByName = new Map(
    enrichedObjects.map((objectEntry) => [objectEntry.objectKey, objectEntry])
  );

  const plates = initialPlates.map((plate) => {
    const plateObjects = plate.objects
      .map((objectEntry) => enrichedObjectByName.get(objectEntry.objectKey))
      .filter(Boolean)
      .map((objectEntry) => ({
        name: objectEntry.name,
        color: objectEntry.color,
        volumeCm3: objectEntry.volumeCm3,
        estimatedGrams: objectEntry.estimatedGrams,
      }));

    return {
      name: plate.name,
      objects: plateObjects,
      totalGrams: plateObjects.reduce(
        (sum, objectEntry) => sum + safeParseFloat(objectEntry.estimatedGrams),
        0
      ),
      estimatedHours: safeParseFloat(plate.estimatedHours),
    };
  });

  const standaloneGcodeHours = [...metadata.gcodeHoursByPath.values()].reduce(
    (sum, hours) => sum + safeParseFloat(hours),
    0
  );
  const platesHours = plates.reduce(
    (sum, plate) => sum + safeParseFloat(plate.estimatedHours),
    0
  );

  const estimatedHours = platesHours > 0 ? platesHours : standaloneGcodeHours;
  const estimatedGrams = enrichedObjects.reduce(
    (sum, objectEntry) => sum + safeParseFloat(objectEntry.estimatedGrams),
    0
  );

  const colorEntries = buildColorEntries(enrichedObjects);

  const responseObjects = enrichedObjects.map((objectEntry) => ({
    name: objectEntry.name,
    volumeCm3: objectEntry.volumeCm3,
    color: objectEntry.color,
    estimatedGrams: objectEntry.estimatedGrams,
  }));

  return {
    volumeCm3: totalVolumeCm3,
    partCount: objectNodes.length,
    objects: responseObjects,
    plates,
    colorEntries,
    estimatedHours,
    estimatedGrams,
  };
}
