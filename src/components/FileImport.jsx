import { useState } from 'react';
import { FileDropzone } from './ui/FileDropzone';
import { Spinner } from './ui/Spinner';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { processFiles } from '../lib/fileProcessor';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function buildAggregatedResult(files) {
  const totalGrams = files.reduce(
    (sum, file) => sum + (Number.isFinite(file?.estimatedGrams) ? file.estimatedGrams : 0),
    0
  );

  const totalHours = files.reduce(
    (sum, file) => sum + (Number.isFinite(file?.estimatedHours) ? file.estimatedHours : 0),
    0
  );

  const colorMap = new Map();

  for (const file of files) {
    const entries = Array.isArray(file?.colorEntries) ? file.colorEntries : [];
    for (const entry of entries) {
      const color = entry?.color || 'default';
      const grams = Number.isFinite(entry?.grams) ? entry.grams : 0;
      colorMap.set(color, (colorMap.get(color) || 0) + grams);
    }
  }

  const colorEntries = [...colorMap.entries()].map(([color, grams]) => ({
    color,
    grams,
  }));

  return {
    files,
    totalGrams,
    totalHours,
    colorEntries,
  };
}

function getFileTypeBadge(fileType) {
  if (fileType === 'stl') {
    return { label: 'STL', variant: 'warning' };
  }

  if (fileType === '3mf') {
    return { label: '3MF', variant: 'success' };
  }

  if (fileType === 'gcode') {
    return { label: 'GCODE', variant: 'info' };
  }

  return { label: String(fileType || 'FILE').toUpperCase(), variant: 'neutral' };
}

function ColorSwatch({ color }) {
  if (!color || color === 'default') return null;
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-gray-300"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

export default function FileImport({ onResult, onClear }) {
  const [parsedFiles, setParsedFiles] = useState([]);
  const [processingCount, setProcessingCount] = useState(0);
  const [error, setError] = useState('');
  const [expandedMap, setExpandedMap] = useState({});

  const emitResult = (files) => {
    if (typeof onResult === 'function') {
      onResult(buildAggregatedResult(files));
    }
  };

  const handleFiles = async (files) => {
    const incomingFiles = Array.from(files || []);

    if (incomingFiles.length === 0) {
      setError('No supported files selected. Please upload .stl, .3mf, or .gcode files.');
      return;
    }

    setError('');
    setProcessingCount((count) => count + incomingFiles.length);

    const settled = await Promise.allSettled(
      incomingFiles.map((file) =>
        processFiles([file])
          .then((results) => results[0])
          .finally(() => {
            setProcessingCount((count) => Math.max(0, count - 1));
          })
      )
    );

    const successful = [];
    const failedMessages = [];

    settled.forEach((result, index) => {
      const fileName = incomingFiles[index]?.name || `File ${index + 1}`;

      if (result.status === 'fulfilled') {
        successful.push(result.value);
        return;
      }

      const message = result.reason?.message || 'Unknown error while processing file.';
      failedMessages.push(`${fileName}: ${message}`);
    });

    setParsedFiles((currentFiles) => {
      const nextFiles = successful.length > 0 ? [...currentFiles, ...successful] : currentFiles;

      emitResult(nextFiles);

      if (successful.length > 0) {
        setExpandedMap((currentMap) => {
          const nextMap = { ...currentMap };
          for (let index = currentFiles.length; index < nextFiles.length; index += 1) {
            nextMap[index] = true;
          }
          return nextMap;
        });
      }

      return nextFiles;
    });

    if (failedMessages.length > 0) {
      setError(`Some files failed to process:\n${failedMessages.join('\n')}`);
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setParsedFiles((currentFiles) => {
      const nextFiles = currentFiles.filter((_, index) => index !== indexToRemove);

      if (nextFiles.length === 0) {
        setExpandedMap({});
        if (typeof onClear === 'function') {
          onClear();
        }
        return [];
      }

      setExpandedMap((currentMap) => {
        const nextMap = {};
        for (let index = 0; index < nextFiles.length; index += 1) {
          const sourceIndex = index >= indexToRemove ? index + 1 : index;
          nextMap[index] = Boolean(currentMap[sourceIndex]);
        }
        return nextMap;
      });

      emitResult(nextFiles);
      return nextFiles;
    });
  };

  const handleToggleExpanded = (index) => {
    setExpandedMap((currentMap) => ({
      ...currentMap,
      [index]: !currentMap[index],
    }));
  };

  const handleClearAll = () => {
    setParsedFiles([]);
    setExpandedMap({});
    setError('');
    setProcessingCount(0);

    if (typeof onClear === 'function') {
      onClear();
    }
  };

  const aggregated = buildAggregatedResult(parsedFiles);

  return (
    <section className="space-y-4">
      <FileDropzone
        accept=".stl,.3mf,.gcode"
        multiple={true}
        onFiles={handleFiles}
        disabled={processingCount > 0}
        label="Drop .stl, .3mf, or .gcode files here or click to upload"
      />

      {processingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <Spinner size="sm" className="text-indigo-700" />
          <span>
            Processing {processingCount} file{processingCount === 1 ? '' : 's'}...
          </span>
        </div>
      )}

      {error && (
        <p className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {parsedFiles.length >= 2 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <span className="font-semibold text-gray-900">Total:</span> {parsedFiles.length} files |{' '}
          {formatNumber(aggregated.totalGrams)} g filament | {formatNumber(aggregated.totalHours)} hours
        </div>
      )}

      {parsedFiles.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Clear All
          </button>
        </div>
      )}

      {parsedFiles.map((file, index) => {
        const badge = getFileTypeBadge(file.fileType);
        const isExpanded = expandedMap[index] !== false;

        return (
          <Card
            key={`${file.fileName}-${index}`}
            className="border border-gray-200 rounded-lg"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleExpanded(index)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
                    aria-hidden="true"
                  >
                    ▸
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h4 className="max-w-full truncate text-sm font-semibold text-gray-900" title={file.fileName}>
                        {file.fileName}
                      </h4>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      <span>{formatNumber(file.estimatedGrams)} g</span>
                      {Number.isFinite(file.estimatedHours) && file.estimatedHours > 0 && (
                        <span>{formatNumber(file.estimatedHours)} hrs</span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                  aria-label={`Remove ${file.fileName}`}
                  title="Remove"
                >
                  X
                </button>
              </div>

              {isExpanded && (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  {file.fileType === '3mf' && Array.isArray(file.plates) && file.plates.length > 0 && (
                    <div className="space-y-3">
                      {file.plates.map((plate, plateIndex) => (
                        <div key={`${plate.name || 'plate'}-${plateIndex}`} className="rounded-md border border-gray-200 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900">Plate {plateIndex + 1}</p>
                            <p className="text-xs text-gray-600">
                              {formatNumber(plate.totalGrams)} g
                              {Number.isFinite(plate.estimatedHours) && plate.estimatedHours > 0
                                ? ` | ${formatNumber(plate.estimatedHours)} hrs`
                                : ''}
                            </p>
                          </div>

                          {Array.isArray(plate.objects) && plate.objects.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {plate.objects.map((objectItem, objectIndex) => (
                                <li
                                  key={`${objectItem.name || 'object'}-${objectIndex}`}
                                  className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ColorSwatch color={objectItem.color} />
                                    <span className="truncate text-gray-700">{objectItem.name || `Object ${objectIndex + 1}`}</span>
                                    {objectItem.color && objectItem.color !== 'default' && (
                                      <span className="text-xs text-gray-500">{objectItem.color}</span>
                                    )}
                                  </div>
                                  <span className="text-xs font-medium text-gray-900">
                                    {formatNumber(objectItem.estimatedGrams)} g
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-gray-500">No objects mapped to this plate.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {file.fileType === '3mf' && (!Array.isArray(file.plates) || file.plates.length === 0) && (
                    <div>
                      {Array.isArray(file.objects) && file.objects.length > 0 ? (
                        <ul className="space-y-2">
                          {file.objects.map((objectItem, objectIndex) => (
                            <li
                              key={`${objectItem.name || 'object'}-${objectIndex}`}
                              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ColorSwatch color={objectItem.color} />
                                <span className="truncate text-gray-700">{objectItem.name || `Object ${objectIndex + 1}`}</span>
                                {objectItem.color && objectItem.color !== 'default' && (
                                  <span className="text-xs text-gray-500">{objectItem.color}</span>
                                )}
                              </div>
                              <span className="text-xs font-medium text-gray-900">
                                {formatNumber(objectItem.estimatedGrams)} g
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">No object details available.</p>
                      )}
                    </div>
                  )}

                  {file.fileType === 'gcode' && (
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>
                        <span className="font-medium text-gray-900">Print time:</span>{' '}
                        {Number.isFinite(file.estimatedHours) && file.estimatedHours > 0
                          ? `${formatNumber(file.estimatedHours)} hrs`
                          : 'Not available'}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">Slicer:</span> {file.slicer || 'Not detected'}
                      </p>

                      {Array.isArray(file.extruders) && file.extruders.length > 0 ? (
                        <ul className="space-y-2">
                          {file.extruders.map((extruder) => (
                            <li
                              key={`extruder-${extruder.index}`}
                              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ColorSwatch color={extruder.color} />
                                <span className="text-gray-700">Extruder {extruder.index + 1}</span>
                                <span className="text-xs text-gray-500">{extruder.filamentType || 'Unknown filament'}</span>
                                {extruder.color && extruder.color !== 'default' && (
                                  <span className="text-xs text-gray-500">{extruder.color}</span>
                                )}
                              </div>
                              <span className="text-xs font-medium text-gray-900">
                                {formatNumber(extruder.usageGrams)} g
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">No per-extruder data available.</p>
                      )}
                    </div>
                  )}

                  {file.fileType === 'stl' && (
                    <div className="space-y-1 text-sm text-gray-700">
                      <p>
                        <span className="font-medium text-gray-900">Estimated weight:</span>{' '}
                        {formatNumber(file.estimatedGrams)} g
                      </p>
                      <p className="text-xs text-gray-500">
                        No print time or color data available from STL files.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </section>
  );
}
