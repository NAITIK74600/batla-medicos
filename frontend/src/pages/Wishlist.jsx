import { Link } from 'react-router-dom';
import { Heart, Trash2, ShoppingCart } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';

export default function Wishlist() {
  const { items, toggle } = useWishlist();
  const { addItem } = useCart();

  return (
    <main className="wishlist-page container">
      <div className="wishlist-page__header">
        <h1><Heart size={22} fill="currentColor" /> My Wishlist</h1>
        {items.length > 0 && (
          <span className="orders-page__count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>❤️</div>
          <h3 style={{ color: 'var(--gray-700)', marginBottom: 8 }}>Your wishlist is empty</h3>
          <p style={{ color: 'var(--gray-400)', marginBottom: 20 }}>
            Save products you love and come back to them anytime.
          </p>
          <Link to="/products" className="btn btn--primary">Browse Products</Link>
        </div>
      ) : (
        <div className="wishlist-grid">
          {items.map(product => {
            const discount = product.mrp > product.price
              ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0;
            return (
              <div key={product._id} className="wishlist-card">
                <Link to={`/products/${product.slug}`} className="wishlist-card__img-wrap">
                  {product.images?.[0]
                    ? <img src={product.images[0]} alt={product.name} />
                    : <div className="wishlist-card__no-img">No Image</div>}
                  {discount > 0 && (
                    <span className="product-card__badge product-card__badge--discount">{discount}% OFF</span>
                  )}
                </Link>
                <div className="wishlist-card__body">
                  <p className="wishlist-card__brand">{product.brand || 'Generic'}</p>
                  <Link to={`/products/${product.slug}`} className="wishlist-card__name">
                    {product.name}
                  </Link>
                  <div className="wishlist-card__pricing">
                    <span className="wishlist-card__price">₹{product.price}</span>
                    {discount > 0 && <span className="wishlist-card__mrp">₹{product.mrp}</span>}
                  </div>
                  <div className="wishlist-card__actions">
                    <button
                      className="btn btn--primary"
                      style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }}
                      disabled={product.stock === 0}
                      onClick={() => addItem(product)}
                    >
                      <ShoppingCart size={14} />
                      {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                    <button
                      className="btn btn--outline"
                      style={{ padding: '8px 10px', color: 'var(--primary)' }}
                      onClick={() => toggle(product)}
                      title="Remove from wishlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
