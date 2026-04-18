import { Spinner } from './Spinner';

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  loading = false, 
  disabled = false, 
  children, 
  className = '', 
  ...rest 
}) {
  const baseStyle = "inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200";
  
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 border border-transparent",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-indigo-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-transparent"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };
  
  const isDisabled = disabled || loading;
  const disabledStyle = isDisabled ? "opacity-50 cursor-not-allowed" : "";

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${disabledStyle} ${className}`}
      disabled={isDisabled}
      {...rest}
    >
      {loading && <Spinner size="sm" className={`mr-2 ${variant === 'secondary' ? 'text-gray-500' : 'text-current'}`} />}
      {children}
    </button>
  );
}
