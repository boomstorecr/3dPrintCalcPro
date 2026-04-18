import { useEffect } from 'react';

export function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-none focus:outline-none">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 transition-opacity bg-black bg-opacity-50" 
        onClick={onClose} 
        aria-hidden="true"
      ></div>
      
      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg p-4 mx-auto my-6 transition-all transform scale-100 opacity-100">
        <div className="relative flex flex-col w-full bg-white border-0 rounded-lg shadow-xl outline-none focus:outline-none">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-solid rounded-t border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
            <button
              className="p-1 ml-auto text-gray-400 bg-transparent border-0 float-right leading-none font-semibold outline-none focus:outline-none hover:text-gray-900 transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <span className="block w-6 h-6 text-2xl outline-none focus:outline-none">&times;</span>
            </button>
          </div>
          
          {/* Body */}
          <div className="relative flex-auto p-6 text-gray-700">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
