import { useEffect, useRef, useState } from 'react';
import { getAdminBrands, createBrand, updateBrand, deleteBrand } from '../../api/brands';
import { uploadImage, uploadVideo } from '../../api/upload';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Star, Leaf, Tag, HeartHandshake, Image, Film, Upload } from 'lucide-react';

const EMPTY = { name: '', category: 'featured', ord: 0, logoUrl: '', gradient: '', isActive: true, media: [] };

const CAT_LABEL = { featured: 'Featured', ayurvedic: 'Ayurvedic', general: 'General', personal_care: 'Personal Care' };
const CAT_COLOR = {
  featured:      { bg: '#FEF2F2', color: '#C0392B' },
  ayurvedic:     { bg: '#F0FBF4', color: '#1B8843' },
  general:       { bg: '#EFF6FF', color: '#2563EB' },
  personal_care: { bg: '#FDF4FF', color: '#7C3AED' },
};

// Default gradients for each personal care tile (fallback)
// slug = the ?category= slug used on the products page (may differ from brand slug)
const PC_PRESETS = [
  { label: 'Skin Care',       slug: 'skin-care',       gradient: 'linear-gradient(135deg,#8BC34A,#5D9E3F)' },
  { label: 'Hair Care',       slug: 'hair-care',       gradient: 'linear-gradient(135deg,#4CAF50,#2E7D32)' },
  { label: 'Sexual Wellness', slug: 'sexual-wellness', gradient: 'linear-gradient(135deg,#FF9800,#E65100)' },
  { label: 'Oral Care',       slug: 'oral-care',       gradient: 'linear-gradient(135deg,#E57373,#C62828)' },
  { label: 'Elderly Care',    slug: 'elderly-care',    gradient: 'linear-gradient(135deg,#29B6F6,#0277BD)' },
  { label: 'Baby Care',       slug: 'baby-care',       gradient: 'linear-gradient(135deg,#9C27B0,#6A1B9A)' },
  { label: 'Women Care',      slug: 'women-care',      gradient: 'linear-gradient(135deg,#EC407A,#AD1457)' },
  { label: 'Men Grooming',    slug: 'men-grooming',    gradient: 'linear-gradient(135deg,#607D8B,#37474F)' },
];

export default function AdminBrands() {
  const [brands, setBrands]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState(null); // null | 'add' | 'edit'
  const [form, setForm]         = useState(EMPTY);
  const [logoFile, setLogoFile] = useState(null);
  const [preview, setPreview]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState(0);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDisplayOn, setMediaDisplayOn] = useState('both');
  const mediaVideoRef = useRef(null);
  const mediaImageRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getAdminBrands();
      setBrands(r.data.brands || []);
    } catch { toast.error('Failed to load brands.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm(EMPTY); setLogoFile(null); setPreview(null); setMediaUrl(''); setMediaType('image'); setMediaProgress(0); setMediaTitle(''); setMediaDisplayOn('both'); setModal('add');
  };

  const openAddPC = (preset) => {
    setForm({ ...EMPTY, category: 'personal_care', name: preset.label, gradient: preset.gradient });
    setLogoFile(null); setPreview(null); setMediaUrl(''); setMediaType('image'); setMediaProgress(0); setMediaTitle(''); setMediaDisplayOn('both'); setModal('add');
  };

  const openEdit = (b) => {
    setForm({ name: b.name, category: b.category, ord: b.ord, logoUrl: b.logoUrl || '', isActive: b.isActive, _id: b._id, gradient: b.gradient || '', media: b.media || [] });
    setLogoFile(null);
    setPreview(b.logoUrl || null);
    setMediaUrl(''); setMediaType('image'); setMediaProgress(0); setMediaTitle(''); setMediaDisplayOn('both');
    setModal('edit');
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Brand name is required.');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('category', form.category);
      fd.append('ord', String(form.ord || 0));
      fd.append('isActive', String(form.isActive));
      fd.append('gradient', form.gradient || '');
      fd.append('media', JSON.stringify(form.media || []));
      if (logoFile) fd.append('logo', logoFile);
      else if (form.logoUrl) fd.append('logoUrl', form.logoUrl);

      if (modal === 'add') {
        await createBrand(fd);
        toast.success('Brand added!');
      } else {
        if (!logoFile && !form.logoUrl) fd.append('removeLogo', 'false');
        await updateBrand(form._id, fd);
        toast.success('Brand updated!');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.response?.data?.errors?.[0]?.msg || 'Could not save brand.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete brand "${name}"?`)) return;
    setDeletingId(id);
    try {
      await deleteBrand(id);
      toast.success('Brand deleted.');
      setBrands(prev => prev.filter(b => b._id !== id));
    } catch { toast.error('Could not delete brand.'); }
    finally { setDeletingId(null); }
  };

  const grouped = {
    personal_care: brands.filter(b => b.category === 'personal_care'),
    featured:      brands.filter(b => b.category === 'featured'),
    ayurvedic:     brands.filter(b => b.category === 'ayurvedic'),
    general:       brands.filter(b => b.category === 'general'),
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1>Brands</h1>
        <button className="btn btn--primary" onClick={openAdd}>
          <Plus size={16} /> Add Brand
        </button>
      </div>

      {loading ? (
        <div className="spinner" style={{ padding: '60px 0', textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Personal Care section — top, special UI */}
          <div className="admin-section-box">
            <div className="admin-section-box__header">
              <HeartHandshake size={16} /> Personal Care Tiles (shown on homepage)
              <span className="badge" style={{ marginLeft: 8, background: CAT_COLOR.personal_care.bg, color: CAT_COLOR.personal_care.color }}>
                {grouped.personal_care.length}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Each entry represents one tile in the "Personal Care" section on the homepage. Upload a custom image; if none set, the default image will be used.
            </p>
            {grouped.personal_care.length === 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ color: 'var(--gray-400)', marginBottom: 10, fontSize: 13 }}>No tiles configured yet — click a preset to create one:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PC_PRESETS.map(p => (
                    <button key={p.label} className="btn btn--outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => openAddPC(p)}>
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="brands-admin-grid">
              {grouped.personal_care.map(b => (
                <div key={b._id} className={`brand-admin-card ${!b.isActive ? 'brand-admin-card--inactive' : ''}`}>
                  <div className="brand-admin-card__logo" style={{ background: b.gradient || 'linear-gradient(135deg,#8BC34A,#5D9E3F)' }}>
                    {b.logoUrl
                      ? <img src={b.logoUrl} alt={b.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover', borderRadius: 8 }} />
                      : <span style={{ fontSize: 22 }}>🌿</span>
                    }
                  </div>
                  <div className="brand-admin-card__name">{b.name}</div>
                  <div className="brand-admin-card__meta">
                    {!b.isActive && <span style={{ fontSize: 11, color: '#999' }}>Hidden</span>}
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>ord: {b.ord}</span>
                    {(b.media || []).length > 0 && <span style={{ fontSize: 10, color: '#2563EB' }}>📷 {b.media.length} media</span>}
                  </div>
                  <div className="brand-admin-card__actions">
                    <button className="icon-btn" onClick={() => openEdit(b)} title="Edit"><Pencil size={14} /></button>
                    <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(b._id, b.name)} disabled={deletingId === b._id} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            {grouped.personal_care.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ color: 'var(--gray-400)', fontSize: 12, marginBottom: 8 }}>Add more tiles:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PC_PRESETS.filter(p => !grouped.personal_care.some(b => b.name === p.label)).map(p => (
                    <button key={p.label} className="btn btn--outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openAddPC(p)}>
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Standard brand sections */}
          {[['featured', <Star size={16} />, 'Featured Brands (shown on homepage)'],
            ['ayurvedic', <Leaf size={16} />, 'Ayurvedic Brands'],
            ['general', <Tag size={16} />, 'General Brands']].map(([cat, icon, label]) => (
            <div key={cat} className="admin-section-box">
              <div className="admin-section-box__header">
                {icon} {label}
                <span className="badge" style={{ marginLeft: 8, background: CAT_COLOR[cat].bg, color: CAT_COLOR[cat].color }}>
                  {grouped[cat].length}
                </span>
              </div>
              <div className="brands-admin-grid">
                {grouped[cat].length === 0 && (
                  <p style={{ color: 'var(--gray-400)', padding: '16px 0' }}>No brands yet. Click "Add Brand" to create one.</p>
                )}
                {grouped[cat].map(b => (
                  <div key={b._id} className={`brand-admin-card ${!b.isActive ? 'brand-admin-card--inactive' : ''}`}>
                    <div className="brand-admin-card__logo">
                      {b.logoUrl
                        ? <img src={b.logoUrl} alt={b.name} />
                        : <span style={{ fontSize: 28, color: 'var(--gray-300)' }}>🏷</span>
                      }
                    </div>
                    <div className="brand-admin-card__name">{b.name}</div>
                    <div className="brand-admin-card__meta">
                      <span style={{ background: CAT_COLOR[b.category].bg, color: CAT_COLOR[b.category].color, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                        {CAT_LABEL[b.category]}
                      </span>
                      {!b.isActive && <span style={{ fontSize: 11, color: '#999' }}>Hidden</span>}
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>ord: {b.ord}</span>
                      {(b.media || []).length > 0 && <span style={{ fontSize: 10, color: '#2563EB' }}>📷 {b.media.length} media</span>}
                    </div>
                    <div className="brand-admin-card__actions">
                      <button className="icon-btn" onClick={() => openEdit(b)} title="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(b._id, b.name)} disabled={deletingId === b._id} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}  {/* end standard brand sections */}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{modal === 'add' ? 'Add Brand' : 'Edit Brand'}</h3>
              <button className="modal__close" onClick={() => setModal(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Logo upload */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 120, height: 80, margin: '0 auto 10px', border: '1.5px dashed var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: form.category === 'personal_care' && form.gradient ? form.gradient : '#fafafa' }}>
                  {preview
                    ? <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: form.category === 'personal_care' ? 'cover' : 'contain' }} />
                    : <span style={{ color: form.category === 'personal_care' ? 'rgba(255,255,255,0.7)' : 'var(--gray-300)', fontSize: 28 }}>{form.category === 'personal_care' ? '🌿' : '🏷'}</span>
                  }
                </div>
                <label className="btn btn--outline" style={{ cursor: 'pointer', fontSize: 13 }}>
                  {form.category === 'personal_care' ? 'Upload Tile Image' : 'Upload Logo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
                </label>
                {preview && (
                  <button type="button" className="btn btn--ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={() => { setLogoFile(null); setPreview(null); setForm(f => ({ ...f, logoUrl: '' })); }}>
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="form-label">Or paste logo URL</label>
                <input className="form-input" type="url" placeholder="https://..." value={form.logoUrl}
                  onChange={e => { setForm(f => ({ ...f, logoUrl: e.target.value })); if (e.target.value) { setPreview(e.target.value); setLogoFile(null); } }} />
              </div>

              <div>
                <label className="form-label">Brand Name *</label>
                <input className="form-input" type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={150} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Category *</label>
                  <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="featured">Featured</option>
                    <option value="ayurvedic">Ayurvedic</option>
                    <option value="general">General</option>
                    <option value="personal_care">Personal Care Tile</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Order (lower = first)</label>
                  <input className="form-input" type="number" min={0} value={form.ord}
                    onChange={e => setForm(f => ({ ...f, ord: e.target.value }))} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Visible on website
              </label>

              {form.category === 'personal_care' && (
                <div>
                  <label className="form-label">Tile Gradient (CSS)</label>
                  <input className="form-input" type="text"
                    placeholder="linear-gradient(135deg,#8BC34A,#5D9E3F)"
                    value={form.gradient}
                    onChange={e => setForm(f => ({ ...f, gradient: e.target.value }))} />
                  <div style={{ marginTop: 6, height: 32, borderRadius: 8, background: form.gradient || 'linear-gradient(135deg,#8BC34A,#5D9E3F)', border: '1px solid var(--border)' }} />
                  <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Background colour shown behind the image. Use a CSS gradient or solid hex colour.</p>
                </div>
              )}

              {/* Brand Media — Images & Videos */}
              <div>
                <label className="form-label">Brand Media (Images &amp; Videos)</label>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 8 }}>Add promotional images or video URLs for this brand (max 10). These will be displayed on product pages of this brand.</p>

                {/* Existing media list */}
                {(form.media || []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {form.media.map((m, i) => (
                      <div key={i} style={{ background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
                          {m.type === 'video' ? <Film size={14} style={{ color: '#e74c3c', flexShrink: 0 }} /> : <Image size={14} style={{ color: '#2ecc71', flexShrink: 0 }} />}
                          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.url}</span>
                          <span style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', flexShrink: 0 }}>{m.type}</span>
                          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', padding: 2 }}
                            onClick={() => setForm(f => ({ ...f, media: f.media.filter((_, j) => j !== i) }))}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {m.type === 'video' && (
                          <div style={{ padding: '4px 10px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input type="text" className="form-input" placeholder="Video title (optional)"
                              value={m.title || ''}
                              onChange={e => setForm(f => ({ ...f, media: f.media.map((item, j) => j === i ? { ...item, title: e.target.value } : item) }))}
                              style={{ flex: 1, minWidth: 130, fontSize: 12, padding: '4px 8px', margin: 0 }} />
                            <select className="form-input"
                              value={m.displayOn || 'both'}
                              onChange={e => setForm(f => ({ ...f, media: f.media.map((item, j) => j === i ? { ...item, displayOn: e.target.value } : item) }))}
                              style={{ width: 155, fontSize: 12, padding: '4px 6px', margin: 0 }}>
                              <option value="both">Both (Home + Brand)</option>
                              <option value="home">Home page only</option>
                              <option value="brand">Brand page only</option>
                            </select>
                          </div>
                        )}
                        {m.type === 'video' && m.url && (
                          <video src={m.url} controls muted playsInline
                            style={{ width: '100%', maxHeight: 140, display: 'block', background: '#000' }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new media */}
                {(form.media || []).length < 10 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Type selector */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="form-input" style={{ width: 90, flexShrink: 0 }} value={mediaType} onChange={e => setMediaType(e.target.value)}>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                      <input className="form-input" type="url" placeholder="Paste URL (https://...)" style={{ flex: 1 }}
                        value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />
                      <button type="button" className="btn btn--outline" style={{ flexShrink: 0, padding: '8px 12px' }}
                        onClick={() => {
                          if (!mediaUrl.trim() || !/^https?:\/\//i.test(mediaUrl.trim())) return toast.error('Enter a valid URL');
                          const entry = { type: mediaType, url: mediaUrl.trim() };
                          if (mediaType === 'video') { if (mediaTitle.trim()) entry.title = mediaTitle.trim(); entry.displayOn = mediaDisplayOn; }
                          setForm(f => ({ ...f, media: [...(f.media || []), entry] }));
                          setMediaUrl(''); setMediaTitle(''); setMediaDisplayOn('both');
                        }}>
                        <Plus size={14} /> Add URL
                      </button>
                    </div>

                    {/* Video-specific: title + display location */}
                    {mediaType === 'video' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <input type="text" className="form-input" placeholder="Video title (e.g. New Summer Range)" style={{ flex: 1, minWidth: 170, margin: 0 }}
                          value={mediaTitle} onChange={e => setMediaTitle(e.target.value)} />
                        <select className="form-input" style={{ width: 165, margin: 0 }} value={mediaDisplayOn} onChange={e => setMediaDisplayOn(e.target.value)}>
                          <option value="both">Both (Home + Brand)</option>
                          <option value="home">Home page only</option>
                          <option value="brand">Brand page only</option>
                        </select>
                      </div>
                    )}

                    {/* Direct file upload */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>— OR upload file —</span>

                      {/* Hidden file inputs */}
                      <input ref={mediaImageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files[0]; e.target.value = '';
                          if (!file) return;
                          setMediaUploading(true); setMediaProgress(0);
                          try {
                            const res = await uploadImage(file);
                            if (res?.data?.url) {
                              setForm(f => ({ ...f, media: [...(f.media || []), { type: 'image', url: res.data.url }] }));
                              toast.success('Image uploaded!');
                            }
                          } catch (err) { toast.error(err.response?.data?.message || 'Image upload failed.'); }
                          finally { setMediaUploading(false); setMediaProgress(0); }
                        }}
                      />
                      <input ref={mediaVideoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo" style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files[0]; e.target.value = '';
                          if (!file) return;
                          setMediaUploading(true); setMediaProgress(0);
                          try {
                            const res = await uploadVideo(file, (evt) => {
                              if (evt.total) setMediaProgress(Math.round((evt.loaded / evt.total) * 100));
                            });
                            if (res?.data?.url) {
                              const vEntry = { type: 'video', url: res.data.url };
                              if (mediaTitle.trim()) vEntry.title = mediaTitle.trim();
                              vEntry.displayOn = mediaDisplayOn;
                              setForm(f => ({ ...f, media: [...(f.media || []), vEntry] }));
                              setMediaTitle(''); setMediaDisplayOn('both');
                              toast.success('Video uploaded!');
                            }
                          } catch (err) { toast.error(err.response?.data?.message || 'Video upload failed.'); }
                          finally { setMediaUploading(false); setMediaProgress(0); }
                        }}
                      />

                      <button type="button" className="btn btn--outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        disabled={mediaUploading}
                        onClick={() => mediaType === 'video' ? mediaVideoRef.current?.click() : mediaImageRef.current?.click()}>
                        <Upload size={13} /> {mediaUploading ? `Uploading… ${mediaProgress}%` : `Upload ${mediaType === 'video' ? 'Video' : 'Image'}`}
                      </button>
                    </div>

                    {/* Progress bar */}
                    {mediaUploading && (
                      <div style={{ height: 5, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${mediaProgress}%`, background: '#3451D1', transition: 'width 0.2s' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Saving…' : modal === 'add' ? 'Add Brand' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
