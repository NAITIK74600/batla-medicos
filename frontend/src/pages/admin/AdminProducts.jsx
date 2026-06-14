import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  getAdminProducts, quickUpdateProduct, createProduct, updateProduct, updateProductImages,
  deleteProduct, bulkImportProducts, downloadImportTemplate, bulkUpdateProducts, bulkDiscountProducts,
  exportProductsExcel,
} from '../../api/products';
import { importStock, getImportStockStatus } from '../../api/admin';
import { uploadImage, uploadVideo } from '../../api/upload';
import { getCategories } from '../../api/categories';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Upload, ToggleLeft, ToggleRight, Camera, X, Link,
  FileSpreadsheet, CheckCircle, AlertTriangle, Search, Package, Percent, Zap,
} from 'lucide-react';

const EMPTY = { name: '', category: '', secondaryCategoryIds: [], brand: '', company: '', salt: '', description: '', mrp: '', price: '', stock: '', requiresPrescription: false, videoUrl: '' };

const STOCK_OPTS = [
  { value: 'all', label: 'All Stock' },
  { value: 'in',  label: 'In Stock (>10)' },
  { value: 'low', label: 'Low Stock (1-10)' },
  { value: 'out', label: 'Out of Stock' },
];
const STATUS_OPTS = [
  { value: 'all',      label: 'All Status' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const SORT_OPTS = [
  { value: 'newest',        label: 'Newest First' },
  { value: 'category_asc',  label: 'Category A-Z' },
  { value: 'category_desc', label: 'Category Z-A' },
  { value: 'name_asc',      label: 'Name A-Z' },
  { value: 'name_desc',     label: 'Name Z-A' },
  { value: 'stock_asc',     label: 'Stock Low-High' },
  { value: 'stock_desc',    label: 'Stock High-Low' },
  { value: 'price_asc',     label: 'Price Low-High' },
  { value: 'price_desc',    label: 'Price High-Low' },
];

function StockBadge({ stock }) {
  if (stock === 0)  return <span className="stock-badge stock-badge--out">Out</span>;
  if (stock <= 10)  return <span className="stock-badge stock-badge--low">Low</span>;
  return                   <span className="stock-badge stock-badge--in">OK</span>;
}

export default function AdminProducts() {
  /* ── Products & Categories ── */
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [page,  setPage]  = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  /* ── Filters ── */
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [brandFilter,  setBrandFilter]  = useState('');
  const [stockFilter,  setStockFilter]  = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy,       setSortBy]       = useState('newest');
  const searchTimer = useRef(null);

  /* ── Pre-apply URL ?category= filter (from AdminCategories click-through) ── */
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const catId = searchParams.get('category');
    if (catId) setCatFilter(catId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Form ── */
  const [form,           setForm]           = useState(EMPTY);
  const [editing,        setEditing]        = useState(null);
  const [images,         setImages]         = useState([]);
  const [imgPreviews,    setImgPreviews]    = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [removeImages,   setRemoveImages]   = useState([]);
  const [showForm,       setShowForm]       = useState(false);
  const [formImageUrls,  setFormImageUrls]  = useState([]);   // URLs added via paste in form
  const [formImageUrl,   setFormImageUrl]   = useState('');    // current URL input

  /* ── Import ── */
  const [importing,       setImporting]       = useState(false);
  const [importResult,    setImportResult]    = useState(null);
  const [importModeModal, setImportModeModal] = useState({ open: false, file: null });
  const csvInputRef = useRef(null);
  const stockInputRef = useRef(null);
  const [stockImporting, setStockImporting] = useState(false);
  const [stockImportResult, setStockImportResult] = useState(null);

  /* ── Inline image upload ── */
  const inlineUploadRef = useRef(null);
  const [uploadingFor,  setUploadingFor] = useState(null);

  /* ── Video upload (form) ── */
  const videoInputRef = useRef(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress,  setVideoProgress]  = useState(0);

  /* ── Image URL modal ── */
  const [urlModal, setUrlModal] = useState({ open: false, productId: null, url: '', urls: [] });

  /* ── Quick stock ── */
  const [stockEdit, setStockEdit] = useState({});

  /* ── Missing info filter ── */
  const [missingFilter, setMissingFilter] = useState(false);

  /* ── Bulk select ── */
  const [selectedIds,       setSelectedIds]       = useState(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  /* ── Bulk stock modal ── */
  const [bulkModal, setBulkModal] = useState({ open: false, value: '', mode: 'set' });

  /* ── Quick Restock modal ── */
  const [restockModal, setRestockModal] = useState({ open: false, type: 'out', qty: '' });

  /* ── Bulk discount modal ── */
  const [discountModal, setDiscountModal] = useState({ open: false, pct: '' });

  /* ── Refresh trigger ── */
  const [trigger, setTrigger] = useState(0);
  const refresh = () => setTrigger(t => t + 1);

  /* ── Fetch ── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 20, search, category: catFilter || undefined, brand: brandFilter || undefined, stockFilter, status: statusFilter, sort: sortBy };
        if (missingFilter) params.missingInfo = '1';
        const [pRes, cRes] = await Promise.all([
          getAdminProducts(params),
          categories.length === 0 ? getCategories() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProducts(pRes.data.products || []);
        setPages(pRes.data.pages || 1);
        setTotal(pRes.data.total || 0);
        if (cRes) setCategories(cRes.data.categories || []);
        setSelectedIds(new Set());
      } catch { /* errors shown via toast in handlers */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, catFilter, brandFilter, stockFilter, statusFilter, sortBy, trigger, missingFilter]);

  /* ── Search debounce ── */
  const handleSearchInput = (val) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); setSelectAllMatching(false); }, 400);
  };
  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setCatFilter(''); setBrandFilter('');
    setStockFilter('all'); setStatusFilter('all'); setSortBy('newest'); setPage(1);
    setSelectAllMatching(false); setSelectedIds(new Set());
  };
  const hasFilters = !!(search || catFilter || brandFilter || stockFilter !== 'all' || statusFilter !== 'all');

  /* -- Current filter params (for applyToAll bulk) -- */
  const currentFilterParams = { search, category: catFilter || undefined, brand: brandFilter || undefined, stockFilter, status: statusFilter };

  /* ── Quick stock update ── */
  const handleQuickStock = async (id, val) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return;
    try {
      await quickUpdateProduct(id, { stock: n });
      setProducts(prev => prev.map(p => p._id === id ? { ...p, stock: n } : p));
      toast.success('Stock updated.');
    } catch { toast.error('Failed to update stock.'); }
  };

  /* ── Toggle active ── */
  const handleToggleActive = async (product) => {
    try {
      const { data } = await quickUpdateProduct(product._id, { isActive: !product.isActive });
      setProducts(prev => prev.map(p => p._id === product._id ? { ...p, isActive: data.isActive } : p));
      toast.success(data.isActive ? 'Product activated.' : 'Product deactivated.');
    } catch { toast.error('Failed to toggle status.'); }
  };

  /* ── Bulk select ── */
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(products.map(p => p._id)));
    }
  };

  /* ── Bulk actions ── */
  /* -- bulkCount = how many items will be affected -- */
  const bulkCount = selectAllMatching ? total : selectedIds.size;
  /* -- bulkPayload = request body for bulk endpoints -- */
  const bulkPayload = (extra) =>
    selectAllMatching
      ? { applyToAll: true, filterParams: currentFilterParams, ...extra }
      : { ids: [...selectedIds], ...extra };

  const handleBulkActivate = async (active) => {
    if (!bulkCount) return;
    try {
      await bulkUpdateProducts(bulkPayload({ update: { isActive: active } }));
      if (!selectAllMatching)
        setProducts(prev => prev.map(p => selectedIds.has(p._id) ? { ...p, isActive: active } : p));
      else refresh();
      toast.success(`${bulkCount} products ${active ? 'activated' : 'deactivated'}.`);
      setSelectedIds(new Set()); setSelectAllMatching(false);
    } catch { toast.error('Bulk update failed.'); }
  };

  const handleBulkMarkOutOfStock = async () => {
    if (!bulkCount) return;
    if (!confirm(`Mark ${bulkCount} products as Out of Stock (stock = 0)?`)) return;
    try {
      await bulkUpdateProducts(bulkPayload({ update: { stock: 0 }, mode: 'set' }));
      if (!selectAllMatching)
        setProducts(prev => prev.map(p => selectedIds.has(p._id) ? { ...p, stock: 0 } : p));
      else refresh();
      toast.success(`${bulkCount} products marked out of stock.`);
      setSelectedIds(new Set()); setSelectAllMatching(false);
    } catch { toast.error('Failed.'); }
  };

  const handleBulkDelete = async () => {
    if (!bulkCount) return;
    if (!confirm(`Delete ${bulkCount} products? This cannot be undone.`)) return;
    try {
      await bulkUpdateProducts(bulkPayload({ update: { isDeleted: true } }));
      toast.success(`${bulkCount} products deleted.`);
      setSelectedIds(new Set()); setSelectAllMatching(false);
      refresh();
    } catch { toast.error('Bulk delete failed.'); }
  };

  /* -- Quick Restock (all out/low stock without manual selection) -- */
  const handleRestock = async () => {
    const qty = parseInt(restockModal.qty, 10);
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity (>0).'); return; }
    const label = restockModal.type === 'out' ? 'out-of-stock' : 'low-stock';
    if (!confirm(`Add ${qty} units to ALL ${label} products?`)) return;
    try {
      const { data } = await bulkUpdateProducts({
        applyToAll: true,
        filterParams: { stockFilter: restockModal.type },
        update: { stock: qty },
        mode: 'add',
      });
      toast.success(`Added ${qty} units to ${data.modified} ${label} products.`);
      setRestockModal({ open: false, type: 'out', qty: '' });
      refresh();
    } catch { toast.error('Restock failed.'); }
  };

  /* -- Bulk discount -- */
  const handleBulkDiscount = async () => {
    const pct = parseFloat(discountModal.pct);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Enter discount % between 0 and 100.'); return; }
    try {
      const { data } = await bulkDiscountProducts(bulkPayload({ discountPct: pct }));
      toast.success(`${pct}% discount applied to ${data.modified} products.`);
      setDiscountModal({ open: false, pct: '' });
      setSelectedIds(new Set()); setSelectAllMatching(false);
      refresh();
    } catch { toast.error('Discount apply failed.'); }
  };

  const handleBulkStockSubmit = async () => {
    const val = parseInt(bulkModal.value, 10);
    if (isNaN(val) || val < 0) { toast.error('Enter a valid stock number (0 or more).'); return; }
    try {
      await bulkUpdateProducts(bulkPayload({ update: { stock: val }, mode: bulkModal.mode }));
      if (!selectAllMatching && bulkModal.mode === 'set') {
        setProducts(prev => prev.map(p => selectedIds.has(p._id) ? { ...p, stock: val } : p));
      } else {
        refresh();
      }
      const modeLabel = bulkModal.mode === 'set' ? `set to ${val}` : bulkModal.mode === 'add' ? `+${val}` : `-${val}`;
      toast.success(`Stock ${modeLabel} for ${bulkCount} products.`);
      setBulkModal({ open: false, value: '', mode: 'set' });
      setSelectedIds(new Set()); setSelectAllMatching(false);
    } catch { toast.error('Bulk stock update failed.'); }
  };

  /* ── Create / Edit form ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Send product data as JSON (no files — images handled separately)
      const formPayload = { ...form, secondaryCategoryIds: (form.secondaryCategoryIds || []).map(Number).filter(Boolean), videoUrl: form.videoUrl || null };
      let productId = editing;
      if (editing) { await updateProduct(editing, formPayload); toast.success('Product updated.'); }
      else         { const res = await createProduct(formPayload); toast.success('Product created.'); productId = res.data._id; }

      // Handle image changes via dedicated image endpoint
      if (productId && (images.length > 0 || removeImages.length > 0 || formImageUrls.length > 0)) {
        const uploadedUrls = [];
        for (const img of images) {
          try {
            const uploadRes = await uploadImage(img);
            if (uploadRes?.data?.url) uploadedUrls.push(uploadRes.data.url);
          } catch (uploadErr) {
            console.error('Image upload failed:', uploadErr);
            toast.error('Failed to upload an image.');
          }
        }

        const allNewUrls = [...uploadedUrls, ...formImageUrls];
        const imgPayload = {};
        if (allNewUrls.length > 0) imgPayload.imageUrls = allNewUrls;
        if (removeImages.length > 0) imgPayload.removeImages = removeImages;
        if (editing && allNewUrls.length > 0) imgPayload.mode = 'replace';

        if (Object.keys(imgPayload).length > 0) {
          await updateProductImages(productId, imgPayload);
        }
      }
      setForm(EMPTY); setImages([]); setImgPreviews([]); setExistingImages([]); setRemoveImages([]);
      setFormImageUrls([]); setFormImageUrl(''); setVideoProgress(0);
      setEditing(null); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    try { await deleteProduct(id); toast.success('Product deleted.'); refresh(); }
    catch { toast.error('Delete failed.'); }
  };

  /* ── CSV / Excel import ── */
  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { toast.error('Upload .xlsx, .xls, or .csv file.'); return; }
    // Show mode picker modal instead of auto-replacing
    setImportModeModal({ open: true, file });
  };

  const runImport = async (mode) => {
    const { file } = importModeModal;
    setImportModeModal({ open: false, file: null });
    if (!file) return;
    setImporting(true);
    try {
      const { data } = await bulkImportProducts(file, mode);
      const parts = [];
      if (data.updated)  parts.push(`${data.updated} updated`);
      if (data.inserted) parts.push(`${data.inserted} added`);
      if (data.skipped)  parts.push(`${data.skipped} skipped`);
      toast.success(`Import done: ${parts.join(', ') || 'no changes'}.`);
      setImportResult(data);
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Import failed.'); }
    finally { setImporting(false); }
  };

  /* ── Stock Import (from billing software export) ── */
  const handleStockImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { toast.error('Upload .xlsx, .xls, or .csv file.'); return; }
    setStockImporting(true);
    try {
      await importStock(file);
      toast.success('Stock import started! Checking progress...');
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const { data: st } = await getImportStockStatus();
          if (!st.running) {
            clearInterval(poll);
            setStockImporting(false);
            if (st.error) {
              toast.error('Stock import failed: ' + st.error);
            } else {
              const parts = [];
              if (st.updated)  parts.push(`${st.updated} updated`);
              if (st.inserted) parts.push(`${st.inserted} added`);
              if (st.skipped)  parts.push(`${st.skipped} unchanged`);
              toast.success(`Stock import done: ${parts.join(', ') || 'no changes'}.`);
              setStockImportResult(st);
              refresh();
            }
          }
        } catch { clearInterval(poll); setStockImporting(false); }
      }, 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stock import failed.');
      setStockImporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const { data } = await exportProductsExcel({ search, category: catFilter || undefined, brand: brandFilter || undefined, status: statusFilter, stockFilter });
      // Check if the response is a JSON error (blob responses with error status)
      if (data instanceof Blob && data.type?.includes('application/json')) {
        const text = await data.text();
        try { const err = JSON.parse(text); toast.error(err.message || 'Export failed.'); } catch { toast.error('Export failed.'); }
        return;
      }
      if (!data || data.size === 0) {
        toast.error('No products found to export.');
        return;
      }
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel export downloaded! Edit and re-import to update products.');
    } catch (err) {
      // When responseType is 'blob', error responses come as blobs too
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          toast.error(parsed.message || 'Could not export products.');
        } catch { toast.error('Could not export products. Try applying filters to reduce the dataset.'); }
      } else {
        const msg = err.response?.data?.message || 'Could not export products. Try again or apply filters to reduce the number of products.';
        toast.error(msg);
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const { data } = await downloadImportTemplate();
      if (!data || data.size === 0) {
        toast.error('Could not download template.');
        return;
      }
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'products-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Blank template downloaded! Fill in your products and import.');
    } catch { toast.error('Could not download template.'); }
  };

  /* ── Edit helpers ── */
  const startEdit = (p) => {
    setEditing(p._id);
    setForm({ name: p.name, category: p.category?._id || '', secondaryCategoryIds: (p.secondaryCategoryIds || []).map(String), brand: p.brand || '', company: p.company || '', salt: p.salt || '', description: p.description || '', mrp: p.mrp, price: p.price, stock: p.stock, requiresPrescription: p.requiresPrescription, videoUrl: p.videoUrl || '' });
    setImages([]); setImgPreviews([]); setExistingImages(p.images || []); setRemoveImages([]);
    setFormImageUrls([]); setFormImageUrl(''); setVideoProgress(0);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMarkRemove = (url) => {
    setRemoveImages(r => [...r, url]);
    setExistingImages(e => e.filter(u => u !== url));
  };

  const handleNewImages = (files) => {
    const arr = Array.from(files).slice(0, 5);
    if (editing && existingImages.length > 0) {
      setRemoveImages(existingImages);
      setExistingImages([]);
    }
    setImages(arr);
    setImgPreviews(arr.map(f => URL.createObjectURL(f)));
  };

  const handleInlineUpload = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file || !uploadingFor) return;
    try {
      // Step 1: Upload file to get a URL
      const uploadRes = await uploadImage(file);
      const imageUrl = uploadRes.data.url;
      // Step 2: Add URL to product images via dedicated endpoint
      const { data } = await updateProductImages(uploadingFor, { imageUrl });
      setProducts(prev => prev.map(p => p._id === uploadingFor ? { ...p, images: data.images || [imageUrl] } : p));
      toast.success('Image uploaded!');
    } catch (err) {
      const status = err.response?.status || 'network';
      const msg = err.response?.data?.message || err.message;
      console.error('Image upload error:', status, err.response?.data || err.message);
      toast.error(`Image upload failed (${status}): ${msg}`);
    }
    finally { setUploadingFor(null); }
  };

  const handleImageUrl = async () => {
    const { productId, url, urls } = urlModal;
    // Collect all URLs (current input + queued ones)
    const allUrls = [...(urls || [])];
    if (url.trim() && /^https?:\/\//i.test(url.trim())) allUrls.push(url.trim());
    const unique = [...new Set(allUrls)];
    if (!unique.length) { toast.error('Enter at least one valid URL.'); return; }
    try {
      const payload = unique.length === 1 ? { imageUrl: unique[0] } : { imageUrls: unique };
      const { data } = await updateProductImages(productId, payload);
      setProducts(prev => prev.map(p => p._id === productId ? { ...p, images: data.images || unique } : p));
      toast.success(`${unique.length} image${unique.length > 1 ? 's' : ''} added!`);
      setUrlModal({ open: false, productId: null, url: '', urls: [] });
    } catch (err) {
      const status = err.response?.status || 'network';
      const msg = err.response?.data?.message || err.message;
      console.error('Add image URL error:', status, err.response?.data || err.message);
      toast.error(`Failed to add image (${status}): ${msg}`);
    }
  };

  const allSelected  = products.length > 0 && selectedIds.size === products.length;
  const someSelected = selectedIds.size > 0;

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div className="admin-page">

      {/* ── Page Header ── */}
      <div className="admin-page__header">
        <h1>
          Products{' '}
          {total > 0 && <span className="admin-page__count">{total.toLocaleString()}</span>}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn--outline" onClick={handleDownloadTemplate} title="Download blank template for adding new products">
            <FileSpreadsheet size={16} /> Template
          </button>
          <button className="btn btn--outline" onClick={handleExportExcel} title="Export filtered products to Excel (.xlsx)">
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <button className="btn btn--outline" onClick={() => csvInputRef.current?.click()} disabled={importing}>
            <Upload size={16} /> {importing ? 'Importing...' : 'Import CSV/Excel'}
          </button>
          <input ref={csvInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleExcelImport} />
          <button className="btn btn--outline" style={{ borderColor: '#10b981', color: '#10b981' }} onClick={() => stockInputRef.current?.click()} disabled={stockImporting}>
            <Upload size={16} /> {stockImporting ? 'Importing Stock...' : 'Import Stock'}
          </button>
          <input ref={stockInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleStockImport} />
          <button className="btn btn--primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm(EMPTY); setExistingImages([]); setRemoveImages([]); setImages([]); setImgPreviews([]); setFormImageUrls([]); setFormImageUrl(''); }}>
            <Plus size={16} /> {showForm && !editing ? 'Cancel' : 'Add Product'}
          </button>
        </div>
      </div>

      {/* ── Import Mode Modal ── */}
      {importModeModal.open && (
        <div className="import-modal-overlay" onClick={() => setImportModeModal({ open: false, file: null })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="import-modal__close" onClick={() => setImportModeModal({ open: false, file: null })}><X size={18} /></button>
            <h2 style={{ marginBottom: '0.25rem' }}>Choose Import Option</h2>
            <p style={{ fontSize: '0.83rem', color: 'var(--gray-500)', marginBottom: '1.25rem' }}>
              File: <strong>{importModeModal.file?.name}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Option 1 */}
              <div style={{ border: '2px solid var(--primary)', borderRadius: 8, padding: '0.85rem 1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>1 — Update existing + Add new</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 10 }}>
                  Rows <strong>with ID</strong> → update that product (price, stock, brand…)<br />
                  Rows <strong>without ID</strong> → insert as new product
                </div>
                <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => runImport('update')}>
                  ✏️ Update existing + Add new
                </button>
              </div>
              {/* Option 2 */}
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '0.85rem 1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>2 — Add new products only</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 10 }}>
                  All rows are inserted as <strong>new products</strong> — ID column is ignored
                </div>
                <button className="btn btn--outline" style={{ width: '100%' }} onClick={() => runImport('append')}>
                  ➕ Add new products only
                </button>
              </div>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--gray-400)', marginTop: '1rem' }}>
              💡 Download the <strong>Template</strong> for a blank sheet to add new products, or use <strong>Export Excel</strong> to get existing products with IDs for editing.
            </p>
          </div>
        </div>
      )}

      {/* ── Import Result Modal ── */}
      {importResult && (
        <div className="import-modal-overlay" onClick={() => setImportResult(null)}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <button className="import-modal__close" onClick={() => setImportResult(null)}><X size={18} /></button>
            <h2 style={{ marginBottom: '1rem' }}>Import Results</h2>
            <div className="import-modal__stats">
              {(importResult.updated > 0) && (
                <div className="import-stat import-stat--ok"><Pencil size={22} /><span className="import-stat__num">{importResult.updated}</span><span className="import-stat__lbl">Updated</span></div>
              )}
              <div className="import-stat import-stat--ok"><CheckCircle size={22} /><span className="import-stat__num">{importResult.inserted}</span><span className="import-stat__lbl">Added</span></div>
              <div className="import-stat import-stat--skip"><AlertTriangle size={22} /><span className="import-stat__num">{importResult.skipped}</span><span className="import-stat__lbl">Skipped</span></div>
            </div>
            {importResult.errors?.length > 0 && (
              <div className="import-modal__errors">
                <h3 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#ef4444' }}>Row Errors ({importResult.errors.length})</h3>
                <ul>{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            <button className="btn btn--primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setImportResult(null)}>Close</button>
          </div>
        </div>
      )}

      {/* ── Stock Import Result Modal ── */}
      {stockImportResult && (
        <div className="import-modal-overlay" onClick={() => setStockImportResult(null)}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <button className="import-modal__close" onClick={() => setStockImportResult(null)}><X size={18} /></button>
            <h2 style={{ marginBottom: '1rem' }}>Stock Import Results</h2>
            <div className="import-modal__stats">
              {(stockImportResult.updated > 0) && (
                <div className="import-stat import-stat--ok"><Pencil size={22} /><span className="import-stat__num">{stockImportResult.updated}</span><span className="import-stat__lbl">Updated</span></div>
              )}
              {(stockImportResult.inserted > 0) && (
                <div className="import-stat import-stat--ok"><CheckCircle size={22} /><span className="import-stat__num">{stockImportResult.inserted}</span><span className="import-stat__lbl">Added</span></div>
              )}
              {(stockImportResult.skipped > 0) && (
                <div className="import-stat import-stat--skip"><AlertTriangle size={22} /><span className="import-stat__num">{stockImportResult.skipped}</span><span className="import-stat__lbl">Unchanged</span></div>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: '#888', marginTop: 12 }}>Total items processed: {stockImportResult.total}</p>
            <button className="btn btn--primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setStockImportResult(null)}>Close</button>
          </div>
        </div>
      )}

      {/* ── Hidden inline image upload ── */}
      <input ref={inlineUploadRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleInlineUpload} />

      {/* ── Image URL Modal ── */}
      {urlModal.open && (
        <div className="import-modal-overlay" onClick={() => setUrlModal({ open: false, productId: null, url: '', urls: [] })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <button className="import-modal__close" onClick={() => setUrlModal({ open: false, productId: null, url: '', urls: [] })}><X size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Link size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ margin: 0 }}>Add Images by URL</h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: 16 }}>
              Paste image URLs (jpg, png, webp). Add multiple images by clicking "+ Queue" then submit all at once.
            </p>

            {/* Queued URLs */}
            {(urlModal.urls || []).length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {urlModal.urls.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <img src={u} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                    <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', padding: 2 }}
                      onClick={() => setUrlModal(m => ({ ...m, urls: m.urls.filter((_, j) => j !== i) }))}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{urlModal.urls.length} image{urlModal.urls.length > 1 ? 's' : ''} queued</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="url"
                autoFocus
                placeholder="https://example.com/image.jpg"
                value={urlModal.url}
                onChange={e => setUrlModal(m => ({ ...m, url: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (urlModal.url.trim() && /^https?:\/\//i.test(urlModal.url.trim())) {
                      setUrlModal(m => ({ ...m, urls: [...(m.urls || []), m.url.trim()], url: '' }));
                    }
                  }
                }}
                style={{ flex: 1, padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
              <button type="button" className="btn btn--outline" style={{ flexShrink: 0 }}
                disabled={!urlModal.url.trim() || !/^https?:\/\//i.test(urlModal.url.trim())}
                onClick={() => setUrlModal(m => ({ ...m, urls: [...(m.urls || []), m.url.trim()], url: '' }))}>
                + Queue
              </button>
            </div>

            {urlModal.url && /^https?:\/\//i.test(urlModal.url) && (
              <img
                src={urlModal.url}
                alt="preview"
                onError={e => { e.target.style.display = 'none'; }}
                style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12, background: 'var(--gray-50)' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleImageUrl}>
                <Link size={14} /> Add {((urlModal.urls || []).length + (urlModal.url.trim() && /^https?:\/\//i.test(urlModal.url.trim()) ? 1 : 0)) || ''} Image{((urlModal.urls || []).length + (urlModal.url.trim() && /^https?:\/\//i.test(urlModal.url.trim()) ? 1 : 0)) > 1 ? 's' : ''}
              </button>
              <button className="btn btn--outline" onClick={() => setUrlModal({ open: false, productId: null, url: '', urls: [] })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Stock Modal ── */}
      {bulkModal.open && (
        <div className="import-modal-overlay" onClick={() => setBulkModal({ open: false, value: '', mode: 'set' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <button className="import-modal__close" onClick={() => setBulkModal({ open: false, value: '', mode: 'set' })}><X size={18} /></button>
            <h2 style={{ marginBottom: '0.5rem' }}>Bulk Stock Update</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1.25rem' }}>
              Updating <strong>{selectedIds.size} products</strong>
            </p>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 8 }}>Update Mode</label>
              <div className="bulk-mode-group">
                {[['set', '= Set to'], ['add', '+ Add'], ['subtract', '- Subtract']].map(([val, lbl]) => (
                  <button key={val} type="button"
                    className={`bulk-mode-btn${bulkModal.mode === val ? ' active' : ''}`}
                    onClick={() => setBulkModal(m => ({ ...m, mode: val }))}
                  >{lbl}</button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>
                {bulkModal.mode === 'set' ? 'New Stock Value' : bulkModal.mode === 'add' ? 'Add Quantity' : 'Subtract Quantity'}
              </label>
              <input
                type="number" min="0" autoFocus
                value={bulkModal.value}
                onChange={e => setBulkModal(m => ({ ...m, value: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleBulkStockSubmit()}
              placeholder="Enter number..."
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleBulkStockSubmit}>
                Apply to {selectedIds.size} Products
              </button>
              <button className="btn btn--outline" onClick={() => setBulkModal({ open: false, value: '', mode: 'set' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Restock Modal ── */}
      {restockModal.open && (
        <div className="import-modal-overlay" onClick={() => setRestockModal({ open: false, type: 'out', qty: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="import-modal__close" onClick={() => setRestockModal({ open: false, type: 'out', qty: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: '0.5rem' }}>
              Quick Restock — {restockModal.type === 'out' ? 'Out of Stock' : 'Low Stock'} Products
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1.25rem' }}>
              Add a fixed quantity to <strong>all {restockModal.type === 'out' ? 'out-of-stock' : 'low-stock'}</strong> products at once.
            </p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>Quantity to Add</label>
              <input
                type="number" min="1" autoFocus
                value={restockModal.qty}
                onChange={e => setRestockModal(m => ({ ...m, qty: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleRestock()}
                placeholder="e.g. 50"
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleRestock}>
                <Zap size={14} /> Restock Now
              </button>
              <button className="btn btn--outline" onClick={() => setRestockModal({ open: false, type: 'out', qty: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Discount Modal ── */}
      {discountModal.open && (
        <div className="import-modal-overlay" onClick={() => setDiscountModal({ open: false, pct: '' })}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="import-modal__close" onClick={() => setDiscountModal({ open: false, pct: '' })}><X size={18} /></button>
            <h2 style={{ marginBottom: '0.5rem' }}>Apply Bulk Discount</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1.25rem' }}>
              Sets selling price = MRP × (1 − discount%). Applies to <strong>{selectAllMatching ? `all ${total.toLocaleString()} matching` : `${selectedIds.size} selected`}</strong> products.
            </p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>Discount % (0–100)</label>
              <input
                type="number" min="0" max="100" step="0.5" autoFocus
                value={discountModal.pct}
                onChange={e => setDiscountModal(m => ({ ...m, pct: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleBulkDiscount()}
                placeholder="e.g. 15"
                style={{ width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ flex: 1, background: 'var(--green)', borderColor: 'var(--green)' }} onClick={handleBulkDiscount}>
                <Percent size={14} /> Apply Discount
              </button>
              <button className="btn btn--outline" onClick={() => setDiscountModal({ open: false, pct: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editing ? 'Edit Product' : 'New Product'}</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={200} />
            </div>
            <div className="form-group">
              <label>Primary Category *</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value, secondaryCategoryIds: f.secondaryCategoryIds.filter(id => id !== e.target.value) }))}
                required
              >
                <option value="">Select category</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Brand</label>
              <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} maxLength={100} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Company / Manufacturer</label>
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} maxLength={150} placeholder="e.g. Sun Pharma, Cipla Ltd" />
            </div>
          </div>

          {/* ── Also appears in (multi-category) ── */}
          <div className="form-group">
            <label>Also appears in <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: '0.82em' }}>(optional secondary categories)</span></label>
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 14px', maxHeight: 140, overflowY: 'auto', background: 'var(--gray-50)', display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
              {categories.filter(c => c._id !== form.category).map(cat => (
                <label key={cat._id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={form.secondaryCategoryIds.includes(cat._id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      secondaryCategoryIds: e.target.checked
                        ? [...f.secondaryCategoryIds, cat._id]
                        : f.secondaryCategoryIds.filter(id => id !== cat._id),
                    }))}
                  />
                  {cat.name}
                </label>
              ))}
              {categories.length === 0 && <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>Loading categories…</span>}
            </div>
            <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, marginBottom: 0 }}>e.g. Dolo 650 → Primary: Caps &amp; Tablets · Also in: Allopathic</p>
          </div>

          <div className="form-group">
            <label>Composition / Salt</label>
            <input
              value={form.salt}
              onChange={e => setForm(f => ({ ...f, salt: e.target.value }))}
              maxLength={500}
              placeholder="e.g. Paracetamol 650mg, Ibuprofen 400mg + Paracetamol 325mg"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={2000} rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>MRP (Rs.) *</label>
              <input type="number" min="0" step="0.01" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Sale Price (Rs.) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Stock *</label>
              <input type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
            </div>
          </div>
          <div className="form-group">
            <label>Images (max 5)</label>
            {editing && existingImages.length > 0 && (
              <div className="img-manage__existing">
                {existingImages.map((url, i) => (
                  <div key={i} className="img-manage__thumb">
                    <img src={url} alt={`existing ${i + 1}`} />
                    <button type="button" className="img-manage__remove" onClick={() => handleMarkRemove(url)} title="Remove"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => handleNewImages(e.target.files)} />
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: 6 }}>
              <input type="text" placeholder="Paste image URL (https://...)" value={formImageUrl} onChange={e => setFormImageUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (/^https?:\/\//i.test(formImageUrl.trim())) { setFormImageUrls(u => [...u, formImageUrl.trim()]); setFormImageUrl(''); } } }}
                style={{ flex: 1, fontSize: '0.85rem' }} />
              <button type="button" className="btn btn--outline" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => { if (/^https?:\/\//i.test(formImageUrl.trim())) { setFormImageUrls(u => [...u, formImageUrl.trim()]); setFormImageUrl(''); } else if (formImageUrl.trim()) { toast.error('Enter a valid URL'); } }}>
                <Link size={13} /> Add URL
              </button>
            </div>
            {formImageUrls.length > 0 && (
              <div className="img-manage__existing" style={{ marginTop: 8 }}>
                {formImageUrls.map((u, i) => (
                  <div key={i} className="img-manage__thumb img-manage__thumb--new">
                    <img src={u} alt={`url ${i + 1}`} />
                    <button type="button" className="img-manage__remove" onClick={() => setFormImageUrls(arr => arr.filter((_, j) => j !== i))} title="Remove"><X size={12} /></button>
                    <span className="img-manage__new-label">URL</span>
                  </div>
                ))}
              </div>
            )}
            {imgPreviews.length > 0 && (
              <div className="img-manage__existing" style={{ marginTop: 8 }}>
                {imgPreviews.map((src, i) => (
                  <div key={i} className="img-manage__thumb img-manage__thumb--new">
                    <img src={src} alt={`new ${i + 1}`} />
                    <span className="img-manage__new-label">New</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.requiresPrescription} onChange={e => setForm(f => ({ ...f, requiresPrescription: e.target.checked }))} />
            Requires Prescription (Rx)
          </label>

          {/* ── Video Section ── */}
          <div className="form-group">
            <label>Product Video</label>
            <input
              type="text"
              placeholder="Paste video URL (YouTube, Cloudinary, etc.)"
              value={form.videoUrl}
              onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>— OR —</span>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  e.target.value = '';
                  if (!file) return;
                  setVideoUploading(true);
                  setVideoProgress(0);
                  try {
                    const res = await uploadVideo(file, (evt) => {
                      if (evt.total) setVideoProgress(Math.round((evt.loaded / evt.total) * 100));
                    });
                    setForm(f => ({ ...f, videoUrl: res.data.url }));
                    toast.success('Video uploaded!');
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Video upload failed.');
                  } finally {
                    setVideoUploading(false);
                    setVideoProgress(0);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--outline"
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                disabled={videoUploading}
                onClick={() => videoInputRef.current?.click()}
              >
                {videoUploading ? `Uploading… ${videoProgress}%` : '📹 Upload Video'}
              </button>
              {form.videoUrl && (
                <button
                  type="button"
                  className="img-manage__remove"
                  title="Remove video"
                  onClick={() => setForm(f => ({ ...f, videoUrl: '' }))}
                ><X size={13} /></button>
              )}
            </div>
            {videoUploading && (
              <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${videoProgress}%`, background: '#3451D1', transition: 'width 0.2s' }} />
              </div>
            )}
            {form.videoUrl && !videoUploading && (
              <video
                src={form.videoUrl}
                controls
                style={{ marginTop: 8, width: '100%', maxHeight: 200, borderRadius: 6, background: '#000' }}
              />
            )}
          </div>

          <div className="form-actions">
            <button className="btn btn--primary" type="submit">{editing ? 'Update Product' : 'Create Product'}</button>
            <button type="button" className="btn btn--outline" onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY); setExistingImages([]); setRemoveImages([]); setImages([]); setImgPreviews([]); setFormImageUrls([]); setFormImageUrl(''); setVideoProgress(0); }}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Filter Bar ── */}
      <div className="admin-filter-bar">
        <div className="admin-filter-bar__search">
          <Search size={15} className="admin-filter-bar__search-icon" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="admin-filter-bar__clear" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select className="admin-filter-bar__select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

        <input
          type="text"
          className="admin-filter-bar__input"
          placeholder="Filter by brand..."
          value={brandFilter}
          onChange={e => { setBrandFilter(e.target.value); setPage(1); }}
          style={{ minWidth: '140px' }}
        />

        <select className="admin-filter-bar__select" value={stockFilter} onChange={e => { setStockFilter(e.target.value); setPage(1); }}>
          {STOCK_OPTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select className="admin-filter-bar__select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          {STATUS_OPTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select className="admin-filter-bar__select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}>
          {SORT_OPTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {hasFilters && (
          <button className="btn btn--sm btn--outline" onClick={clearFilters}>x Clear Filters</button>
        )}
        <button
          className={`btn btn--sm ${missingFilter ? 'btn--primary' : 'btn--outline'}`}
          style={missingFilter ? { background: '#7c3aed', borderColor: '#7c3aed' } : { borderColor: '#7c3aed', color: '#7c3aed' }}
          onClick={() => { setMissingFilter(f => !f); setPage(1); }}
          title="Show only products missing salt or description"
        >
          ⚠ {missingFilter ? 'Hide Missing' : 'Missing Info'}
        </button>
      </div>


      {/* -- Quick Restock Panel -- */}
      <div className="quick-restock-bar">
        <span className="quick-restock-bar__label"><Zap size={14} /> Quick Restock</span>
        <button className="btn btn--sm btn--outline" onClick={() => setRestockModal({ open: true, type: 'out', qty: '' })}>
          Restock Out of Stock
        </button>
        <button className="btn btn--sm btn--outline" onClick={() => setRestockModal({ open: true, type: 'low', qty: '' })}>
          Restock Low Stock
        </button>
      </div>

      {/* -- Bulk Actions Bar (shown when items selected) -- */}
      {someSelected && (
        <div className="bulk-actions-bar">
          <span className="bulk-actions-bar__count">
            {selectAllMatching ? `All ${total.toLocaleString()} matching` : `${selectedIds.size} selected`}
          </span>
          <div className="bulk-actions-bar__btns">
            <button className="btn btn--sm btn--outline" onClick={() => handleBulkActivate(true)}>Activate</button>
            <button className="btn btn--sm btn--outline" onClick={() => handleBulkActivate(false)}>Deactivate</button>
            <button className="btn btn--sm btn--outline" onClick={handleBulkMarkOutOfStock}>Mark Out of Stock</button>
            <button className="btn btn--sm btn--primary" onClick={() => setBulkModal({ open: true, value: '', mode: 'set' })}>
              <Package size={14} /> Update Stock
            </button>
            <button className="btn btn--sm btn--primary" style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
              onClick={() => setDiscountModal({ open: true, pct: '' })}>
              <Percent size={14} /> Discount
            </button>
            <button className="btn btn--sm btn--danger" onClick={handleBulkDelete}><Trash2 size={14} /> Delete</button>
            <button className="btn btn--sm btn--outline" onClick={() => { setSelectedIds(new Set()); setSelectAllMatching(false); }}><X size={13} /></button>
          </div>
        </div>
      )}

      {/* -- Select All Matching Banner -- */}
      {someSelected && !selectAllMatching && total > products.length && (
        <div className="select-all-banner">
          <span>Only <strong>{products.length}</strong> of <strong>{total.toLocaleString()}</strong> matching products selected.</span>
          <button className="btn btn--sm btn--link" onClick={() => setSelectAllMatching(true)}>
            Select all {total.toLocaleString()} matching products
          </button>
        </div>
      )}
      {selectAllMatching && (
        <div className="select-all-banner select-all-banner--active">
          <span>All <strong>{total.toLocaleString()}</strong> matching products are selected.</span>
          <button className="btn btn--sm btn--link" onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()); }}>
            Cancel selection
          </button>
        </div>
      )}
      {/* ── Products Table ── */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="admin-state-msg">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="admin-state-msg">No products found. Try adjusting filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all on page" />
                </th>
                <th>Image</th>
                <th>Name / Brand / Category</th>
                <th>MRP</th>
                <th>Price</th>
                <th>Disc%</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Rx</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p._id}
                  className={selectedIds.has(p._id) ? 'row--selected' : ''}
                  style={{ opacity: p.isActive === false ? 0.6 : 1 }}
                >
                  <td>
                    <input type="checkbox" checked={selectedIds.has(p._id)} onChange={() => toggleSelect(p._id)} />
                  </td>
                  <td>
                    <div className="table-img-cell">
                      {p.images?.[0]
                        ? <img src={p.images[0]} alt={p.name} className="table-thumb" />
                        : <span className="table-no-img">No img</span>}
                      <button type="button" className="btn btn--sm table-img-upload-btn" title="Upload image file"
                        onClick={() => { setUploadingFor(p._id); setTimeout(() => inlineUploadRef.current?.click(), 50); }}>
                        <Camera size={13} />
                      </button>
                      <button type="button" className="btn btn--sm table-img-upload-btn" title="Add image by URL"
                        style={{ marginLeft: 2 }}
                        onClick={() => setUrlModal({ open: true, productId: p._id, url: '', urls: [] })}>
                        <Link size={13} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="product-name-cell">
                      <span className="product-name-cell__name">{p.name}</span>
                      {(!p.salt || !p.description) && (
                        <span className="missing-info-badge" title="Missing salt or description">⚠ Missing</span>
                      )}
                      {p.brand && <span className="product-name-cell__brand">{p.brand}</span>}
                      <span className="product-name-cell__cat">
                        {p.category?.name || '-'}
                        {p.secondaryCategoryIds?.length > 0 && p.secondaryCategoryIds.map(id => {
                          const cat = categories.find(c => c._id === String(id));
                          return cat ? <span key={id} style={{ opacity: 0.7 }}> · {cat.name}</span> : null;
                        })}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--gray-500)', textDecoration: 'line-through', fontSize: '0.85rem' }}>&#8377;{p.mrp}</td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>&#8377;{p.price}</td>
                  <td>{p.mrp > 0 && p.price < p.mrp ? (
                    <span className="disc-badge">{Math.round((p.mrp - p.price) / p.mrp * 100)}%</span>
                  ) : <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>-</span>}</td>
                  <td>
                    <div className="stock-edit-cell">
                      <input
                        type="number" min="0"
                        className={`quick-stock-input${p.stock === 0 ? ' qs--out' : p.stock <= 10 ? ' qs--low' : ''}`}
                        value={stockEdit[p._id] !== undefined ? stockEdit[p._id] : p.stock}
                        onChange={e => setStockEdit(s => ({ ...s, [p._id]: e.target.value }))}
                        onBlur={() => {
                          if (stockEdit[p._id] !== undefined) {
                            handleQuickStock(p._id, stockEdit[p._id]);
                            setStockEdit(s => { const n = { ...s }; delete n[p._id]; return n; });
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleQuickStock(p._id, stockEdit[p._id] !== undefined ? stockEdit[p._id] : p.stock);
                            setStockEdit(s => { const n = { ...s }; delete n[p._id]; return n; });
                            e.target.blur();
                          }
                        }}
                        style={{ width: 68 }}
                        title="Type a number and press Enter or Tab to save"
                      />
                      <StockBadge stock={p.stock} />
                    </div>
                  </td>
                  <td>
                    <button
                      className={`toggle-active-btn${p.isActive === false ? '' : ' toggle-active-btn--on'}`}
                      onClick={() => handleToggleActive(p)}
                      title={p.isActive === false ? 'Click to activate' : 'Click to deactivate'}
                    >
                      {p.isActive === false
                        ? <><ToggleLeft size={17} /> Inactive</>
                        : <><ToggleRight size={17} /> Active</>}
                    </button>
                  </td>
                <td>{p.requiresPrescription ? <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem' }}>Rx</span> : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn--sm btn--outline" onClick={() => startEdit(p)} title="Edit"><Pencil size={14} /></button>
                      <button className="btn btn--sm btn--danger" onClick={() => handleDelete(p._id)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && pages > 0 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&laquo; Prev</button>
          <span>Page {page} / {pages} &nbsp;&middot;&nbsp; {total.toLocaleString()} products</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next &raquo;</button>
        </div>
      )}
    </div>
  );
}
