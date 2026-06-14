import { createContext, useContext, useState, useEffect } from 'react';
import { trackAddToCart } from '../utils/analytics';

const CART_KEY = 'bm_cart';

const CartContext = createContext(null);

// Cart stores: [{ productId, name, price, mrp, image, requiresPrescription, qty }]
// Prices are only display values — server re-validates at checkout.

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1) => {
    trackAddToCart(product, qty);
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product._id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product._id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [...prev, {
        productId: product._id,
        name: product.name,
        price: product.price,
        mrp: product.mrp,
        image: product.images?.[0] || '',
        requiresPrescription: product.requiresPrescription,
        qty,
      }];
    });
  };

  const removeItem = (productId) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));

  const updateQty = (productId, qty) => {
    if (qty < 1) return removeItem(productId);
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, qty } : i));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const hasRxItems = items.some((i) => i.requiresPrescription);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice, hasRxItems }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
