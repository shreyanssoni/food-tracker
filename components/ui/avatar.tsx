import React from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl'
};

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  
  // Get first letter of name, fallback to '?'
  const getInitial = (name: string | null | undefined): string => {
    if (!name || name.trim().length === 0) return '?';
    return name.trim().charAt(0).toUpperCase();
  };

  // Generate a consistent background color based on the name
  const getBackgroundColor = (name: string | null | undefined): string => {
    if (!name) return 'bg-gray-500';
    
    const colors = [
      'bg-red-500',
      'bg-orange-500', 
      'bg-amber-500',
      'bg-yellow-500',
      'bg-lime-500',
      'bg-green-500',
      'bg-emerald-500',
      'bg-teal-500',
      'bg-cyan-500',
      'bg-sky-500',
      'bg-blue-500',
      'bg-indigo-500',
      'bg-violet-500',
      'bg-purple-500',
      'bg-fuchsia-500',
      'bg-pink-500',
      'bg-rose-500'
    ];
    
    // Simple hash function to get consistent color for same name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };

  if (src) {
    return (
      <img
        className={`${sizeClass} rounded-full object-cover ${className}`}
        src={src}
        alt={name || 'User avatar'}
        onError={(e) => {
          // If image fails to load, hide it and show fallback
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full ${getBackgroundColor(name)} flex items-center justify-center text-white font-semibold ${className}`}
    >
      {getInitial(name)}
    </div>
  );
}

// Wrapper component that handles both image and fallback
export function AvatarWithFallback({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  
  const getInitial = (name: string | null | undefined): string => {
    if (!name || name.trim().length === 0) return '?';
    return name.trim().charAt(0).toUpperCase();
  };

  const getBackgroundColor = (name: string | null | undefined): string => {
    if (!name) return 'bg-gray-500';
    
    const colors = [
      'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
      'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
      'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
      'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500'
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={`relative ${sizeClass} ${className}`}>
      {src && (
        <img
          className={`${sizeClass} rounded-full object-cover`}
          src={src}
          alt={name || 'User avatar'}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      )}
      <div
        className={`${sizeClass} rounded-full ${getBackgroundColor(name)} flex items-center justify-center text-white font-semibold ${src ? 'hidden' : 'flex'}`}
      >
        {getInitial(name)}
      </div>
    </div>
  );
}
