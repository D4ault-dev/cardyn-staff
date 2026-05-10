import React, { useState } from 'react'

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  fallback?: React.ReactNode
}

/**
 * Smart image component:
 * - Shows a shimmer placeholder while loading
 * - Shows a broken icon on error
 * - Passes all other props to <img>
 */
export default function Img({ src, fallback, className, style, ...rest }: ImgProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  if (!src) {
    return fallback ? <>{fallback}</> : <div className="img-broken">🖼</div>
  }

  return (
    <div className="img-wrap" style={{ position: 'relative', display: 'inline-block', ...style }}>
      {status === 'loading' && (
        <div className="img-shimmer" style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '400px 100%',
          animation: 'shimmer 1.4s infinite linear',
          borderRadius: 'inherit',
        }} />
      )}
      {status === 'error' ? (
        fallback || <div className="img-broken" style={{ width: '100%', height: '100%' }}>🖼</div>
      ) : (
        <img
          {...rest}
          src={src}
          className={className}
          style={{ display: status === 'loading' ? 'none' : 'block' }}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  )
}
