import { useState, useRef } from 'react';

export function FileDropzone({ 
  accept, 
  onFile, 
  multiple = false,
  onFiles,
  label = 'Drop file here or click to upload', 
  disabled = false, 
  className = '' 
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState(null);
  const inputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const getAcceptedFiles = (files) => {
    if (!accept) return files;

    const extensions = accept
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.startsWith('.'));

    if (extensions.length === 0) return files;

    return files.filter((file) => {
      const fileName = file.name.toLowerCase();
      return extensions.some((extension) => fileName.endsWith(extension));
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (multiple) {
        const droppedFiles = Array.from(e.dataTransfer.files);
        const acceptedFiles = getAcceptedFiles(droppedFiles);
        setSelectedFileName(
          acceptedFiles.length > 0 ? `${acceptedFiles.length} files selected` : null
        );
        if (onFiles) onFiles(acceptedFiles);
        e.dataTransfer.clearData();
        return;
      }

      const file = e.dataTransfer.files[0];
      setSelectedFileName(file.name);
      if (onFile) onFile(file);
      e.dataTransfer.clearData();
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (disabled) return;
    
    if (e.target.files && e.target.files.length > 0) {
      if (multiple) {
        const selectedFiles = Array.from(e.target.files);
        const acceptedFiles = getAcceptedFiles(selectedFiles);
        setSelectedFileName(
          acceptedFiles.length > 0 ? `${acceptedFiles.length} files selected` : null
        );
        if (onFiles) onFiles(acceptedFiles);
        return;
      }

      const file = e.target.files[0];
      setSelectedFileName(file.name);
      if (onFile) onFile(file);
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors text-center
        ${disabled ? 'opacity-50 cursor-not-allowed border-gray-300 bg-gray-50' : 'cursor-pointer'}
        ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
        ${className}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <svg 
        className={`w-10 h-10 mb-3 ${isDragActive ? 'text-indigo-500' : 'text-gray-400'}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
      </svg>
      <p className="text-sm font-medium text-gray-700">
        {selectedFileName ? (
          <span className="text-indigo-600 font-semibold">{selectedFileName}</span>
        ) : (
          label
        )}
      </p>
      {!selectedFileName && accept && (
        <p className="mt-1 text-xs text-gray-500">
          Supported files: {accept.replace(/,/g, ', ')}
        </p>
      )}
    </div>
  );
}
