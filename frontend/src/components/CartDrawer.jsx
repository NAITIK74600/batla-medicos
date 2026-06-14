import { X, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function CartDrawer({ isOpen, onClose }) {
  const { items, updateQty, removeItem, totalItems, totalPrice } = useCart();
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer__header">
          <h2><ShoppingBag size={20} /> Cart ({totalItems})</h2>
          <button className="drawer__close" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="drawer__body">
          {items.length === 0 ? (
            <div className="drawer__empty">
              <p>Your cart is empty.</p>
              <Link to="/products" onClick={onClose} className="btn btn--primary">Shop Now</Link>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.productId} className="cart-item">
                {item.image && <img src={item.image} alt={item.name} className="cart-item__img" />}
                <div className="cart-item__info">
                  <p className="cart-item__name">{item.name}</p>
                  <p className="cart-item__price">₹{(item.price * item.qty).toFixed(2)}</p>
                  {item.requiresPrescription && (
                    <span className="badge badge--rx">Rx Required</span>
                  )}
                </div>
                <div className="cart-item__actions">
                  <div className="cart-item__qty-row">
                    <button onClick={() => updateQty(item.productId, item.qty - 1)}><Minus size={12} /></button>
                    <span>{item.qty}</span>
                    <button onClick={() => updateQty(item.productId, item.qty + 1)}><Plus size={12} /></button>
                  </div>
                  <button className="cart-item__remove" onClick={() => removeItem(item.productId)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="drawer__footer">
            <div className="drawer__total">
              <span>Total</span>
              <strong>₹{totalPrice.toFixed(2)}</strong>
            </div>
            <button
              className="btn btn--primary btn--full"
              onClick={() => { onClose(); navigate('/checkout'); }}
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
