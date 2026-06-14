import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WishlistContext = createContext(null);
const KEY = 'bm_wishlist';

export function WishlistProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const toggle = useCallback((product) => {
    setItems(prev => {
      const exists = prev.some(p => p._id === product._id);
      return exists ? prev.filter(p => p._id !== product._id) : [...prev, product];
    });
  }, []);

  const isWishlisted = useCallback((id) => items.some(p => p._id === id), [items]);
  const clear = useCallback(() => setItems([]), []);

  return (
    <WishlistContext.Provider value={{ items, toggle, isWishlisted, clear }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
