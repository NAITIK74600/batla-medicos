/**
 * Google Analytics 4 — lightweight wrapper
 *
 * Setup: Add your GA4 Measurement ID in the GA_ID constant below.
 * The gtag script is injected into <head> via index.html.
 *
 * Usage:
 *   import { trackEvent } from '../utils/analytics';
 *   trackEvent('add_to_cart', { item_name: 'Paracetamol', value: 25 });
 */

const GA_ID = 'G-XXXXXXXXXX'; // ← Replace with your GA4 Measurement ID

/**
 * Send a custom event to GA4
 */
export function trackEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

/**
 * Track page view (called automatically by usePageTracking)
 */
export function trackPageView(path, title) {
  if (typeof window.gtag === 'function') {
    window.gtag('config', GA_ID, {
      page_path: path,
      page_title: title,
    });
  }
}

// ── Pre-built e-commerce event helpers ───────────────────────────────────────

export function trackAddToCart(product, qty = 1) {
  trackEvent('add_to_cart', {
    currency: 'INR',
    value: product.price * qty,
    items: [{
      item_id: product._id,
      item_name: product.name,
      item_brand: product.brand || '',
      item_category: product.category?.name || '',
      price: product.price,
      quantity: qty,
    }],
  });
}

export function trackPurchase(order) {
  trackEvent('purchase', {
    transaction_id: order._id,
    currency: 'INR',
    value: order.total,
    items: (order.items || []).map(i => ({
      item_name: i.name,
      price: i.price,
      quantity: i.qty,
    })),
  });
}

export function trackSearch(searchTerm) {
  trackEvent('search', { search_term: searchTerm });
}

export function trackViewItem(product) {
  trackEvent('view_item', {
    currency: 'INR',
    value: product.price,
    items: [{
      item_id: product._id,
      item_name: product.name,
      item_brand: product.brand || '',
      item_category: product.category?.name || '',
      price: product.price,
    }],
  });
}

export function trackLabBooking(booking) {
  trackEvent('lab_booking', {
    booking_id: booking._id,
    value: booking.totalAmount,
    currency: 'INR',
  });
}
