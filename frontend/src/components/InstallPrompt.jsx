import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

let deferredPrompt = null;

export default function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (navigator.standalone) return;
    const dismissed = sessionStorage.getItem('pwa-dismissed');
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    deferredPrompt = null;
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem('pwa-dismissed', '1');
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #C0392B 0%, #96281B 100%)',
      color: '#fff', padding: '14px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      boxShadow: '0 -4px 20px rgba(0,0,0,.25)',
      fontFamily: 'system-ui, sans-serif',
      animation: 'slideUp .4s ease-out',
    }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      <img src="/icons/icon-72x72.png" alt="" width={40} height={40}
        style={{ borderRadius: 10, background: '#fff', padding: 2 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Install Batla Medicos</div>
        <div style={{ fontSize: 12, opacity: .85 }}>Get the app for faster ordering & offline access</div>
      </div>

      <button onClick={handleInstall} style={{
        background: '#fff', color: '#C0392B', border: 'none',
        borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 14,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
      }}>
        <Download size={16} /> Install
      </button>

      <button onClick={handleDismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, opacity: .7 }}>
        <X size={20} />
      </button>
    </div>
  );
}
