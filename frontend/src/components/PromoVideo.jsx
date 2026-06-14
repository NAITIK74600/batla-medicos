import { useState, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function PromoVideo({ url, title, brandName, brandLogoUrl, resolveImageUrl }) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);

  const toggleMute = () => {
    setMuted(m => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxHeight: '50vh', overflow: 'hidden', background: '#000' }}>
      <video
        ref={videoRef}
        src={url}
        autoPlay
        loop
        muted={muted}
        playsInline
        style={{ width: '100%', height: '50vh', display: 'block', objectFit: 'contain', background: '#000' }}
      />

      {/* Sound toggle */}
      <button
        onClick={toggleMute}
        style={{
          position: 'absolute', top: 12, right: 12,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(4px)', zIndex: 2,
        }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Bottom overlay: title + brand */}
      {(title || brandName) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
          padding: '24px 16px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {brandLogoUrl
            ? <img
                src={resolveImageUrl ? resolveImageUrl(brandLogoUrl) : brandLogoUrl}
                alt={brandName || ''}
                style={{ width: 30, height: 30, borderRadius: 7, objectFit: 'contain', background: '#fff', padding: 2, flexShrink: 0 }}
              />
            : brandName && (
              <span style={{
                width: 30, height: 30, borderRadius: 7,
                background: 'linear-gradient(135deg,#3451D1,#27AE60)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{brandName.slice(0, 2).toUpperCase()}</span>
            )
          }
          <div>
            <div style={{ color: '#fff', fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.2 }}>{title || brandName}</div>
            {title && brandName && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', marginTop: 2 }}>{brandName}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
