import { useState } from 'react';
import { FileDropzone } from './ui/FileDropzone';
import { Spinner } from './ui/Spinner';
import { Card } from './ui/Card';
import { processFile } from '../lib/fileProcessor';

const DEFAULT_DENSITY_G_CM3 = 1.24;

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

export default function FileImport({ onResult, onClear }) {
  const [parsedFile, setParsedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const handleFile = async (file) => {
    setIsProcessing(true);
    setError('');
    setParsedFile(null);

    try {
      const result = await processFile(file);
      setParsedFile(result);

      if (typeof onResult === 'function') {
        onResult(result);
      }
    } catch (processingError) {
      const message = processingError?.message || 'Failed to process file.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    if (isProcessing) {
      return;
    }

    setParsedFile(null);
    setError('');
    setDropzoneKey((current) => current + 1);

    if (typeof onClear === 'function') {
      onClear();
    }
  };

  const fileVolume = parsedFile?.volumeCm3 || 0;
  const estimatedWeight = fileVolume * DEFAULT_DENSITY_G_CM3;
  const isStl = parsedFile?.fileType === 'stl';
  const is3mf = parsedFile?.fileType === '3mf';

  return (
    <section className="space-y-4">
      <FileDropzone
        key={dropzoneKey}
        accept=".stl,.3mf"
        disabled={isProcessing}
        onFile={handleFile}
        label={isProcessing ? 'Processing file...' : 'Drop a .stl or .3mf file here or click to upload'}
      />

      {isProcessing && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <Spinner size="sm" className="text-indigo-700" />
          <span>Processing 3D geometry and calculating volume...</span>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {parsedFile && (
        <Card title="Imported File Summary">
          <div className="space-y-4">
            <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">File:</span> {parsedFile.fileName}
              </p>
              <p>
                <span className="font-medium text-slate-900">Type:</span> {parsedFile.fileType.toUpperCase()}
              </p>
              <p>
                <span className="font-medium text-slate-900">Volume:</span> {formatNumber(fileVolume)} cm3
              </p>
              <p>
                <span className="font-medium text-slate-900">Estimated Weight (PLA):</span> {formatNumber(estimatedWeight)} g
              </p>
              <p>
                <span className="font-medium text-slate-900">Parts:</span> {parsedFile.partCount}
              </p>
              {isStl && (
                <p>
                  <span className="font-medium text-slate-900">Triangles:</span> {parsedFile.triangleCount || 0}
                </p>
              )}
            </div>

            {is3mf && Array.isArray(parsedFile.objects) && parsedFile.objects.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900">3MF Objects</h4>
                <ul className="mt-2 space-y-2">
                  {parsedFile.objects.map((object, index) => (
                    <li
                      key={`${object.name}-${index}`}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700">{object.name}</span>
                      <span className="font-medium text-slate-900">{formatNumber(object.volumeCm3)} cm3</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={handleClear}
                disabled={isProcessing}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </Card>
      )}

      {!parsedFile && !isProcessing && error && (
        <div>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
