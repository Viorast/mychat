'use client';

export default function Avatar({ src, alt, size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`${sizes[size]} rounded-full bg-gray-300 flex items-center justify-center ${className}`}>
      {src ? (
        <img 
          src={src} 
          alt={alt} 
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span className="text-gray-600 text-sm font-medium">
          {alt ? alt.charAt(0).toUpperCase() : 'U'}
        </span>
      )}
    </div>
  );
}