import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingCart, FileText, Heart, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { getProductBySlug, getRelatedProducts, getProducts } from '../api/products';
import { getProductReviews, submitReview } from '../api/reviews';
import MedicineImage from '../components/MedicineImage';
import SEO from '../components/SEO';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { trackViewItem, trackAddToCart } from '../utils/analytics';
import { flyToCart } from '../utils/flyToCart';
import toast from 'react-hot-toast';
import ProductCard from '../components/ProductCard';

// Resolve /uploads/ relative paths to absolute asset URLs
const _API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const _ASSET_BASE = _API_BASE.replace(/\/api\/?$/, '');
function resolveAssetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${_ASSET_BASE}${url}`;
  return url;
}

function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating" aria-label={`Rating: ${value} out of 5`}>
      {[1,2,3,4,5].map(star => (
        <button
          key={star}
          type="button"
          className={`star-rating__star${(hover || value) >= star ? ' star-rating__star--active' : ''}`}
          onClick={() => !readonly && onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          disabled={readonly}
          aria-label={`${star} star`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const { toggle, isWishlisted } = useWishlist();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mainImg, setMainImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [cartAdded, setCartAdded] = useState(false);
  const [related, setRelated] = useState({ brandRelated: [], categoryRelated: [] });

  // "You may also like" — recommendation feed
  const [recommended, setRecommended] = useState([]);
  const [recPage, setRecPage] = useState(1);
  const [recLoading, setRecLoading] = useState(false);
  const [recHasMore, setRecHasMore] = useState(true);

  // Image carousel
  const [autoPlay, setAutoPlay] = useState(true);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const carouselRef = useRef(null);

  // Brand media
  const [brandMedia, setBrandMedia] = useState([]);

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewMeta, setReviewMeta] = useState({ avgRating: 0, ratingCount: 0, total: 0 });
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPages, setReviewPages] = useState(1);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setMainImg(0);
    setQty(1);
    setMyRating(0);
    setMyComment('');
    setRecommended([]);
    setRecPage(1);
    setRecHasMore(true);
    getProductBySlug(slug)
      .then(r => {
        const p = r.data;
        setProduct(p);
        trackViewItem(p);
        // brandMedia is already attached by the backend on GET /products/:slug
        setBrandMedia(Array.isArray(p.brandMedia) ? p.brandMedia : []);
        getRelatedProducts(p._id)
          .then(res => setRelated(res.data))
          .catch(() => {});
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // Auto-slide images
  const images = product?.images || [];
  const imgCount = Math.max(images.length, 1);

  useEffect(() => {
    if (!autoPlay || imgCount <= 1) return;
    const timer = setInterval(() => {
      setMainImg(prev => (prev + 1) % imgCount);
    }, 3000);
    return () => clearInterval(timer);
  }, [autoPlay, imgCount]);

  // Touch/swipe handlers
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setAutoPlay(false);
  };
  const handleTouchMove = (e) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 40) {
      if (touchDeltaX.current < 0) setMainImg(prev => (prev + 1) % imgCount);
      else setMainImg(prev => (prev - 1 + imgCount) % imgCount);
    }
    setTimeout(() => setAutoPlay(true), 5000);
  };

  const goImg = (dir) => {
    setAutoPlay(false);
    setMainImg(prev => (prev + dir + imgCount) % imgCount);
    setTimeout(() => setAutoPlay(true), 5000);
  };

  // Load "You may also like" recommendations — infinite scroll
  const loadMoreRecs = useCallback(async () => {
    if (recLoading || !recHasMore || !product) return;
    setRecLoading(true);
    try {
      const categorySlug = product.category?.slug || '';
      const { data } = await getProducts({
        category: categorySlug,
        limit: 12,
        page: recPage,
        sort: 'newest',
      });
      const newProducts = (data.products || []).filter(p => p._id !== product._id);
      setRecommended(prev => {
        const ids = new Set(prev.map(p => p._id));
        return [...prev, ...newProducts.filter(p => !ids.has(p._id))];
      });
      if (!data.products?.length || recPage >= (data.pages || 1)) setRecHasMore(false);
      else setRecPage(p => p + 1);
    } catch { setRecHasMore(false); }
    finally { setRecLoading(false); }
  }, [recLoading, recHasMore, product, recPage]);

  // Initial load of recommendations
  useEffect(() => {
    if (product && recommended.length === 0 && recHasMore) loadMoreRecs();
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!product) return;
    getProductReviews(product._id, reviewPage)
      .then(r => {
        setReviews(r.data.reviews);
        setReviewPages(r.data.pages);
        setReviewMeta({ avgRating: r.data.avgRating, ratingCount: r.data.ratingCount, total: r.data.total });
      })
      .catch(() => {});
  }, [product, reviewPage]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!myRating) return toast.error('Please select a rating.');
    setSubmitting(true);
    try {
      await submitReview({ productId: product._id, rating: myRating, comment: myComment });
      toast.success('Review submitted!');
      setMyRating(0);
      setMyComment('');
      // Refresh reviews
      const r = await getProductReviews(product._id, 1);
      setReviews(r.data.reviews);
      setReviewPages(r.data.pages);
      setReviewMeta({ avgRating: r.data.avgRating, ratingCount: r.data.ratingCount, total: r.data.total });
      setReviewPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="spinner" style={{ padding: '80px 0', textAlign: 'center' }}>Loading…</div>;
  if (!product) return <div className="empty-state">Product not found.</div>;

  const discount = product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0;
  const wishlisted = isWishlisted(product._id);
  const useInConditions = product.description?.trim() || 'Consult your doctor/pharmacist for proper use.';
  const sideEffectsText = product.sideEffects?.trim() || 'No common side effects listed. If any discomfort occurs, consult your doctor.';

  // Product schema for SEO
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: useInConditions,
    image: images[0] || 'https://www.batlamedicos.shop/og-image.jpg',
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    sku: String(product._id),
    offers: {
      '@type': 'Offer',
      url: `https://www.batlamedicos.shop/products/${slug}`,
      priceCurrency: 'INR',
      price: product.price,
      availability: product.inStock !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Batla Medicos' },
    },
    ...(reviewMeta.ratingCount > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: reviewMeta.avgRating,
        reviewCount: reviewMeta.ratingCount,
      },
    } : {}),
  };

  // BreadcrumbList schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.batlamedicos.shop/' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://www.batlamedicos.shop/products' },
      { '@type': 'ListItem', position: 3, name: product.name },
    ],
  };

  return (
    <main>
      <SEO
        title={`${product.name}${product.brand ? ` by ${product.brand}` : ''} – Buy Online`}
        description={`Buy ${product.name}${product.brand ? ` by ${product.brand}` : ''} online at ₹${product.price}${discount > 0 ? ` (${discount}% off)` : ''}. ${useInConditions.slice(0, 120)}`}
        path={`/products/${slug}`}
        image={images[0]}
        type="product"
        schema={[productSchema, breadcrumbSchema]}
      />
      <div className="product-detail container">
          {/* Images — Auto-sliding carousel like 1mg */}
          <div className="pd-gallery">
            <div
              className="pd-gallery__carousel"
              ref={carouselRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="pd-gallery__track" style={{ transform: `translateX(-${mainImg * 100}%)` }}>
                {images.length > 0
                  ? images.map((url, i) => (
                      <div className="pd-gallery__slide" key={i}>
                        <img src={url} alt={`${product.name} ${i + 1}`} className="pd-gallery__img" />
                      </div>
                    ))
                  : <div className="pd-gallery__slide">
                      <MedicineImage product={product} className="pd-gallery__img" />
                    </div>
                }
              </div>
              {imgCount > 1 && (
                <>
                  <button className="pd-gallery__arrow pd-gallery__arrow--left" onClick={() => goImg(-1)} aria-label="Previous image"><ChevronLeft size={20} /></button>
                  <button className="pd-gallery__arrow pd-gallery__arrow--right" onClick={() => goImg(1)} aria-label="Next image"><ChevronRight size={20} /></button>
                  <div className="pd-gallery__counter">{mainImg + 1} / {imgCount}</div>
                </>
              )}
            </div>
            {imgCount > 1 && (
              <>
                <div className="pd-gallery__dots">
                  {images.map((_, i) => (
                    <button key={i} className={`pd-gallery__dot${i === mainImg ? ' active' : ''}`} onClick={() => { setMainImg(i); setAutoPlay(false); setTimeout(() => setAutoPlay(true), 5000); }} aria-label={`Image ${i + 1}`} />
                  ))}
                </div>
                <div className="pd-gallery__thumbs">
                  {images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`${product.name} thumb ${i + 1}`}
                      className={`pd-gallery__thumb${i === mainImg ? ' active' : ''}`}
                      onClick={() => { setMainImg(i); setAutoPlay(false); setTimeout(() => setAutoPlay(true), 5000); }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Info */}
          <div className="product-detail__info">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <h1>{product.name}</h1>
                {product.brand && <p className="product-detail__brand">{product.brand}</p>}
                {product.company && <p className="product-detail__company" style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 2 }}>by {product.company}</p>}
              </div>
              <button
                className={`product-detail__wish-btn${wishlisted ? ' active' : ''}`}
                onClick={() => toggle(product)}
                title={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart size={22} fill={wishlisted ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* Rating summary */}
            {reviewMeta.ratingCount > 0 && (
              <div className="product-detail__rating-summary">
                <span className="product-detail__avg-rating">★ {reviewMeta.avgRating}</span>
                <span className="product-detail__rating-count">({reviewMeta.ratingCount} review{reviewMeta.ratingCount !== 1 ? 's' : ''})</span>
              </div>
            )}

            <div className="product-detail__pricing">
              <span className="product-detail__price">₹{product.price}</span>
              {discount > 0 && (
                <>
                  <span className="product-detail__mrp">₹{product.mrp}</span>
                  <span className="product-detail__discount">{discount}% OFF</span>
                </>
              )}
            </div>

            {product.requiresPrescription && (
              <div className="rx-notice">
                <FileText size={16} /> Prescription required — upload at checkout.
              </div>
            )}

            <p className={`product-detail__stock ${product.stock === 0 ? 'out' : product.stock <= 5 ? 'low' : ''}`}>
              {product.stock === 0
                ? 'Currently unavailable'
                : product.stock <= 5
                  ? 'Available - limited units'
                  : 'Available for order'}
            </p>

            {product.salt && (
              <div className="product-detail__salt">
                <span className="product-detail__salt-label">Composition:</span>
                <span className="product-detail__salt-value">{product.salt}</span>
              </div>
            )}

            <div className="product-detail__desc">
              <p><strong>Use in Conditions:</strong> {useInConditions}</p>
              <p style={{ marginTop: 8 }}><strong>Side Effects:</strong> {sideEffectsText}</p>
            </div>

            <div className="product-detail__cart-row">
              <div className="qty-control">
                <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <span className="qty-display">{qty}</span>
                <button className="qty-btn" onClick={() => setQty(q => Math.min(product.stock, q + 1))}>+</button>
              </div>
              <button
                className={`btn btn--primary pd-add-cart${cartAdded ? ' pd-add-cart--added' : ''}`}
                disabled={product.stock === 0}
                onClick={() => {
                  const imgEl = document.querySelector('.pd-gallery__img, .pd-gallery .medicine-image');
                  flyToCart(imgEl, document.querySelector('.pd-gallery, .pd-main'));
                  addItem(product, qty);
                  setCartAdded(true);
                  setTimeout(() => setCartAdded(false), 1200);
                }}
                style={{ flex: 1 }}
              >
                <ShoppingCart size={18} /> {cartAdded ? 'Added ✓' : 'Add to Cart'}
              </button>
            </div>
          </div>

        {/* Product Video */}
        {product.videoUrl && (
          <section className="product-detail__video" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
            <h3 style={{ marginBottom: 10, fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>Product Video</h3>
            <video
              src={resolveAssetUrl(product.videoUrl)}
              controls
              preload="metadata"
              playsInline
              style={{ width: '100%', borderRadius: 10, maxHeight: 400, background: '#000' }}
            >
              <p>Your browser does not support the video tag.</p>
            </video>
          </section>
        )}

        {/* Brand Media — promotional images & videos (from admin brands section) */}
        {brandMedia.length > 0 && (
          <section className="brand-media-section">
            <h3 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>
              More from {product.brand}
            </h3>
            <div className="brand-media-grid">
              {brandMedia.map((m, i) => (
                <div className="brand-media-item" key={i}>
                  {m.type === 'video' ? (
                    <video
                      src={resolveAssetUrl(m.url)}
                      controls
                      preload="metadata"
                      className="brand-media-item__video"
                      playsInline
                      style={{ width: '100%', borderRadius: 10, maxHeight: 320 }}
                    />
                  ) : (
                    <img
                      src={resolveAssetUrl(m.url)}
                      alt={`${product.brand} ${i + 1}`}
                      className="brand-media-item__img"
                      loading="lazy"
                      style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 260 }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Products */}
        {related.brandRelated.length > 0 && (
          <section className="product-detail__related">
            <h2>More from {product.brand}</h2>
            <div className="related-scroll">
              {related.brandRelated.map(p => <ProductCard key={p._id} product={p} />)}
            </div>
          </section>
        )}
        {related.categoryRelated.length > 0 && (
          <section className="product-detail__related">
            <h2>Similar Products</h2>
            <div className="related-scroll">
              {related.categoryRelated.map(p => <ProductCard key={p._id} product={p} />)}
            </div>
          </section>
        )}

        {/* You May Also Like — recommendations */}
        {recommended.length > 0 && (
          <section className="product-detail__related product-detail__recs">
            <h2>You May Also Like</h2>
            <div className="recs-grid">
              {recommended.map(p => <ProductCard key={p._id} product={p} />)}
            </div>
            {recLoading && <p style={{ textAlign: 'center', padding: '16px 0', color: 'var(--gray-400)' }}>Loading more...</p>}
            {!recLoading && recHasMore && (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <button className="btn btn--outline" onClick={loadMoreRecs}>Load more</button>
              </div>
            )}
          </section>
        )}

        {/* Reviews */}
        <section className="product-detail__reviews">
          <div className="reviews__header">
            <h2>Customer Reviews</h2>
            {reviewMeta.ratingCount > 0 && (
              <div className="reviews__summary">
                <span className="reviews__avg">{reviewMeta.avgRating}</span>
                <div>
                  <StarRating value={Math.round(reviewMeta.avgRating)} readonly />
                  <span className="reviews__count">{reviewMeta.ratingCount} review{reviewMeta.ratingCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>

          {/* Write review form (logged-in users only) */}
          {user && (
            <form className="review-form" onSubmit={handleReviewSubmit}>
              <h3>Write a Review</h3>
              <div className="review-form__rating-row">
                <span>Your rating:</span>
                <StarRating value={myRating} onChange={setMyRating} />
              </div>
              <textarea
                className="review-form__textarea"
                placeholder="Share your experience with this product (optional)"
                value={myComment}
                onChange={e => setMyComment(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                  {myComment.length}/500 — Only verified buyers can submit reviews
                </span>
                <button className="btn btn--primary" type="submit" disabled={submitting || !myRating}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </form>
          )}

          {/* Review list */}
          {reviews.length === 0 && !user && (
            <p style={{ color: 'var(--gray-400)', padding: '20px 0' }}>No reviews yet. Be the first to review this product!</p>
          )}
          <div className="review-list">
            {reviews.map(r => (
              <div key={r._id} className="review-item">
                <div className="review-item__top">
                  <span className="review-item__author">{r.user?.name || 'Customer'}</span>
                  <StarRating value={r.rating} readonly />
                  <span className="review-item__date">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                {r.comment && <p className="review-item__comment">{r.comment}</p>}
              </div>
            ))}
          </div>

          {reviewPages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button disabled={reviewPage <= 1} onClick={() => setReviewPage(p => p - 1)}>← Prev</button>
              <span>{reviewPage} / {reviewPages}</span>
              <button disabled={reviewPage >= reviewPages} onClick={() => setReviewPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
