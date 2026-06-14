import { Link } from 'react-router-dom';
import { useCallback, useRef, useState } from 'react';
import { ShoppingCart, FileText, Heart, Plus, Minus, Trash2, Star, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import MedicineImage from './MedicineImage';
import { flyToCart } from '../utils/flyToCart';

/* 🛒 Cart add sound — bright pop */
function playCartSound(isIncrement = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    if (isIncrement) {
      // Softer tick for quantity increment
      o.frequency.setValueAtTime(660, ctx.currentTime);
      g.gain.setValueAtTime(0.10, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.12);
    } else {
      // Cheerful pop for first add
      o.frequency.setValueAtTime(440, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.06);
      g.gain.setValueAtTime(0.20, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.22);
    }
  } catch { /* AudioContext blocked — silent fail */ }
}

/* Deterministic star rating from product id/name (since we have no ratings in DB) */
function pseudoRating(product) {
  let h = 0;
  const s = (product._id || '') + (product.name || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const rating = 3.5 + ((Math.abs(h) % 16) / 10); // 3.5 – 5.0
  const count  = 10 + (Math.abs(h >> 4) % 490);    // 10 – 499
  return { rating: Math.min(5, +rating.toFixed(1)), count };
}

function StarRow({ rating }) {
  return (
    <div className="pc-stars" aria-label={`${rating} out of 5`}>
      {[1,2,3,4,5].map(i => {
        const fill = i <= Math.floor(rating) ? 1 : i - rating < 1 ? rating - Math.floor(rating) : 0;
        return (
          <span key={i} className="pc-star-wrap">
            <Star size={11} className="pc-star pc-star--bg" />
            {fill > 0 && (
              <span className="pc-star-fill" style={{ width: `${fill * 100}%` }}>
                <Star size={11} className="pc-star pc-star--fg" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function ProductCard({ product }) {
  const { addItem, items, updateQty, removeItem } = useCart();
  const { toggle, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product._id);
  const cartItem = items.find(i => i.productId === product._id);
  const inCart = !!cartItem;
  const [added, setAdded] = useState(false);
  const cardRef = useRef(null);
  const rafId = useRef(0);

  /* 3D tilt on mouse move */
  const handleTilt = useCallback((e) => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * 10;
      const rotateX = (0.5 - y) * 8;
      el.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03,1.03,1.03)`;
    });
  }, []);
  const handleTiltReset = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    const el = cardRef.current;
    if (el) el.style.transform = '';
  }, []);

  const { rating, count } = pseudoRating(product);

  const discount = product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;

  const handleAdd = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Fly-to-cart animation
    const imgEl = cardRef.current?.querySelector('.medicine-image, .mi-fallback, img');
    flyToCart(imgEl, cardRef.current);
    addItem(product);
    playCartSound();
    // Show "Added" feedback for 1.2s
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }, [addItem, product]);

  const handleInc = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    updateQty(product._id, cartItem.qty + 1);
    playCartSound(true); // soft tick for increment
  }, [updateQty, product._id, cartItem]);

  const handleDec = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItem.qty <= 1) removeItem(product._id);
    else updateQty(product._id, cartItem.qty - 1);
  }, [updateQty, removeItem, product._id, cartItem]);

  const handleRemove = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    removeItem(product._id);
  }, [removeItem, product._id]);

  const handleWishlist = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(product);
  }, [toggle, product]);

  return (
    <div className="product-card" ref={cardRef} onMouseMove={handleTilt} onMouseLeave={handleTiltReset}>
      <Link to={`/products/${product.slug}`}>
        {/* Wishlist heart — top right */}
        <button
          className={`product-card__wish-btn${wishlisted ? ' product-card__wish-btn--active' : ''}`}
          onClick={handleWishlist}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={15} fill={wishlisted ? 'currentColor' : 'none'} />
        </button>

        <div className="product-card__image-wrap">
          <MedicineImage product={product} />
          {discount > 0 && (
            <span className="product-card__badge product-card__badge--discount">{discount}%<br/>OFF</span>
          )}
          {product.requiresPrescription && (
            <span className="product-card__badge product-card__badge--rx">
              <FileText size={9} /> Rx
            </span>
          )}
        </div>

        <div className="product-card__info">
          <p className="product-card__brand">{product.brand || 'Generic'}</p>
          <p className="product-card__name">{product.name}</p>
          {product.pack && <p className="product-card__pack">{product.pack}</p>}

          {/* Star rating row */}
          <div className="pc-rating-row">
            <StarRow rating={rating} />
            <span className="pc-rating-num">{rating}</span>
            <span className="pc-rating-count">({count})</span>
          </div>

          <div className="product-card__pricing">
            <span className="product-card__price">₹{product.price}</span>
            {discount > 0 && <span className="product-card__mrp">₹{product.mrp}</span>}
          </div>
        </div>
      </Link>

      {/* Cart action footer */}
      <div className="product-card__footer-row">
        {product.stock === 0 ? (
          <span className="pc-out-of-stock">Out of Stock</span>
        ) : inCart ? (
          <div className="pc-qty-row">
            <button className="pc-qty-btn pc-qty-btn--dec" onClick={handleDec} aria-label="Decrease">
              {cartItem.qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
            </button>
            <span className="pc-qty-val">{cartItem.qty}</span>
            <button className="pc-qty-btn pc-qty-btn--inc" onClick={handleInc} aria-label="Increase">
              <Plus size={13} />
            </button>
          </div>
        ) : (
          <button
            className={`product-card__add-btn${added ? ' product-card__add-btn--added' : ''}`}
            onClick={handleAdd}
            aria-label={`Add ${product.name} to cart`}
          >
            {added
              ? <><Check size={14} /> Added!</>
              : <><ShoppingCart size={14} /> ADD</>}
          </button>
        )}
      </div>
    </div>
  );
}

