import { useEffect, useState, useRef } from 'react';
import api from '../../api/axios';
import { updateBrand } from '../../api/brands';
import { uploadVideo } from '../../api/upload';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, X, Film, Upload, Search, RefreshCw,
  Monitor, Store, Layers, GripVertical, Eye,
} from 'lucide-react';

const DISPLAY_OPTIONS = [
  { value: 'both', label: 'Both (Home + Brand)', icon: '🌐' },
  { value: 'home', label: 'Home page only',      icon: '🏠' },
  { value: 'brand', label: 'Brand page only',    icon: '🏷️' },
];

export default function AdminPromotions() {
  const [promos, setPromos]       = useState([]);   // flattened: { brand, video, mediaIndex }
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState('all'); // 'all' | 'home' | 'brand' | 'both'

  /* add panel */
  const [addOpen, setAddOpen]     = useState(false);
  const [brands, setBrands]       = useState([]);
  const [brandId, setBrandId]     = useState('');
  const [title, setTitle]         = useState('');
  const [displayOn, setDisplayOn] = useState('both');
  const [videoUrl, setVideoUrl]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [saving, setSaving]       = useState(false);
  const videoRef = useRef(null);

  /* ── load all promotion videos ── */
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/brands/promotions');
      const flat = [];
      for (const p of (r.data.promotions || [])) {
        p.videos.forEach((v) => {
          flat.push({ brand: p.brand, video: v, brandId: p.brand._id });
        });
      }
      setPromos(flat);
    } catch { toast.error('Failed to load promotions.'); }
    finally { setLoading(false); }
  };

  const loadBrands = async () => {
    try {
      const r = await api.get('/brands');
      setBrands(r.data.brands || []);
    } catch {}
  };

  useEffect(() => { load(); loadBrands(); }, []);

  /* ── add a promo video ── */
  const handleUpload = async (file) => {
    setUploading(true); setProgress(0);
    try {
      const res = await uploadVideo(file, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      if (res?.data?.url) {
        setVideoUrl(res.data.url);
        toast.success('Video uploaded!');
      }
    } catch (err) { toast.error(err?.response?.data?.message || 'Upload failed.'); }
    finally { setUploading(false); setProgress(0); }
  };

  const handleAdd = async () => {
    if (!brandId) return toast.error('Select a brand.');
    if (!videoUrl.trim()) return toast.error('Upload or paste a video URL.');
    setSaving(true);
    try {
      // fetch current brand media
      const brand = brands.find(b => String(b._id) === String(brandId));
      if (!brand) return toast.error('Brand not found.');
      const r = await api.get(`/brands/${brand.slug || brand._id}`);
      const existing = r.data.brand?.media || [];
      const newEntry = { type: 'video', url: videoUrl.trim(), displayOn };
      if (title.trim()) newEntry.title = title.trim();
      const fd = new FormData();
      fd.append('name', brand.name);
      fd.append('category', brand.category || 'general');
      fd.append('media', JSON.stringify([...existing, newEntry]));
      await updateBrand(brand._id, fd);
      toast.success('Promotion video added!');
      closeAdd();
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to add.'); }
    finally { setSaving(false); }
  };

  const closeAdd = () => {
    setAddOpen(false); setBrandId(''); setTitle(''); setDisplayOn('both'); setVideoUrl('');
  };

  /* ── delete a promo video ── */
  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.video.title || 'this video'}" from ${item.brand.name}?`)) return;
    try {
      const r = await api.get(`/brands/${item.brand.slug || item.brand._id}`);
      const media = r.data.brand?.media || [];
      const updated = media.filter(m => !(m.type === 'video' && m.url === item.video.url));
      const fd = new FormData();
      fd.append('name', r.data.brand.name);
      fd.append('category', r.data.brand.category || 'general');
      fd.append('media', JSON.stringify(updated));
      await updateBrand(item.brand._id, fd);
      toast.success('Promotion removed.');
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to remove.'); }
  };

  /* ── change displayOn inline ── */
  const handleChangeDisplay = async (item, newDisplay) => {
    try {
      const r = await api.get(`/brands/${item.brand.slug || item.brand._id}`);
      const media = (r.data.brand?.media || []).map(m => {
        if (m.type === 'video' && m.url === item.video.url) return { ...m, displayOn: newDisplay };
        return m;
      });
      const fd = new FormData();
      fd.append('name', r.data.brand.name);
      fd.append('category', r.data.brand.category || 'general');
      fd.append('media', JSON.stringify(media));
      await updateBrand(item.brand._id, fd);
      toast.success('Display location updated.');
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed.'); }
  };

  /* ── filtered list ── */
  const filtered = filter === 'all' ? promos : promos.filter(p => {
    const on = p.video.displayOn || 'both';
    return on === filter || on === 'both';
  });

  return (
    <div className="admin-page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film size={22} style={{ color: '#C0392B' }} /> Video Promotions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
            Manage promotional / ad videos displayed on home page, brand pages, etc.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--outline btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Promotion
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all',   label: 'All Videos',   icon: <Layers size={13} /> },
          { key: 'home',  label: 'Home Page',     icon: <Monitor size={13} /> },
          { key: 'brand', label: 'Brand Page',    icon: <Store size={13} /> },
        ].map(t => (
          <button key={t.key}
            className={`btn btn--sm ${filter === t.key ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setFilter(t.key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {t.icon} {t.label}
            {t.key === 'all' && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '0 6px', fontSize: '0.72rem', marginLeft: 2 }}>{promos.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Video grid ── */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>Loading promotions…</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <Film size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No promotion videos found.</p>
          <button className="btn btn--primary btn--sm" style={{ marginTop: 14 }} onClick={() => setAddOpen(true)}>
            <Plus size={13} /> Add Your First Promotion
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map((item, i) => (
            <div key={`${item.brand._id}-${i}`} style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
              overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              {/* video */}
              <video src={item.video.url} controls muted playsInline
                style={{ width: '100%', maxHeight: 200, display: 'block', background: '#000' }} />

              {/* info */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {item.brand.logoUrl
                    ? <img src={item.brand.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: '#f3f4f6', padding: 2, flexShrink: 0 }} />
                    : <span style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#3451D1,#27AE60)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{item.brand.name?.slice(0, 2).toUpperCase()}</span>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.video.title || item.brand.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{item.brand.name}</div>
                  </div>
                </div>

                {/* display on */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Eye size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                  <select
                    className="form-input"
                    style={{ flex: 1, fontSize: '0.78rem', padding: '4px 6px', margin: 0 }}
                    value={item.video.displayOn || 'both'}
                    onChange={e => handleChangeDisplay(item, e.target.value)}
                  >
                    {DISPLAY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                    ))}
                  </select>
                </div>

                {/* delete */}
                <button
                  onClick={() => handleDelete(item)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
                    borderRadius: 8, padding: '6px 0', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                  }}
                >
                  <Trash2 size={13} /> Remove Promotion
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ ADD PROMOTION MODAL ═══════════ */}
      {addOpen && (
        <div className="modal-backdrop" onClick={closeAdd}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Film size={18} /> Add Promotion Video</h3>
              <button className="modal__close" onClick={closeAdd}><X size={20} /></button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* brand select */}
              <div>
                <label className="form-label">Brand *</label>
                <select className="form-input" value={brandId} onChange={e => setBrandId(e.target.value)}>
                  <option value="">Select brand…</option>
                  {brands.map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* title */}
              <div>
                <label className="form-label">Video Title</label>
                <input className="form-input" placeholder="e.g. Summer Sale 2026" value={title}
                  onChange={e => setTitle(e.target.value)} maxLength={100} />
              </div>

              {/* display location */}
              <div>
                <label className="form-label">Display On *</label>
                <select className="form-input" value={displayOn} onChange={e => setDisplayOn(e.target.value)}>
                  {DISPLAY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                  ))}
                </select>
              </div>

              {/* video upload / URL */}
              <div>
                <label className="form-label">Video *</label>
                {videoUrl ? (
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 8 }}>
                    <video src={videoUrl} controls muted playsInline style={{ width: '100%', maxHeight: 180, display: 'block', background: '#000' }} />
                    <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb' }}>
                      <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>✓ Video ready</span>
                      <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={() => setVideoUrl('')}>Change</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="file" accept="video/*" ref={videoRef} style={{ display: 'none' }}
                      onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = ''; }} />
                    <button type="button" className="btn btn--outline" disabled={uploading}
                      onClick={() => videoRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 0' }}
                    >
                      <Upload size={15} /> {uploading ? `Uploading… ${progress}%` : 'Upload Video File'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>or</span>
                      <input className="form-input" type="url" placeholder="Paste video URL (https://...)" style={{ flex: 1, margin: 0 }}
                        onBlur={e => { if (e.target.value.trim() && /^https?:\/\//i.test(e.target.value.trim())) setVideoUrl(e.target.value.trim()); }}
                        onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim() && /^https?:\/\//i.test(e.target.value.trim())) setVideoUrl(e.target.value.trim()); }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--outline" onClick={closeAdd}>Cancel</button>
              <button className="btn btn--primary" onClick={handleAdd} disabled={saving || !brandId || !videoUrl}>
                {saving ? 'Saving…' : 'Add Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
