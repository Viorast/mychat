/**
 * Reusable button component dengan berbagai variant
 */
export default function Button({ 
  children, 
  onClick, 
  disabled = false,
  className = '',
  variant = 'primary',
  ...props 
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg text-sm px-4 py-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variants = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      {...props}
    >
      {children}
    </button>
  )
}