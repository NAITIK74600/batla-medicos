/**
 * getGeoPosition — safe wrapper around navigator.geolocation.getCurrentPosition
 *
 * Pre-checks navigator.permissions BEFORE calling getCurrentPosition so Chrome
 * never logs "[Violation] Permissions policy violation" when the server's
 * Permissions-Policy header blocks geolocation.
 *
 * Returns:
 *   { position }               — success
 *   { error: 'unsupported' }   — browser has no geolocation API
 *   { error: 'denied' }        — blocked by policy or user denied
 *   { error: 'unavailable' }   — hardware/network unavailable
 *   { error: 'timeout' }       — request timed out
 */
export async function getGeoPosition(options = {}) {
  if (!navigator.geolocation) return { error: 'unsupported' };

  // Pre-check via Permissions API — avoids [Violation] log when policy blocks it
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'denied') return { error: 'denied' };
    } catch { /* permissions API not available — proceed and let getCurrentPosition decide */ }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ position }),
      (err) => {
        if (err.code === 1) resolve({ error: 'denied' });
        else if (err.code === 2) resolve({ error: 'unavailable' });
        else resolve({ error: 'timeout' });
      },
      { timeout: 20000, enableHighAccuracy: true, maximumAge: 0, ...options }
    );
  });
}

/** Standard user-facing messages for each error code */
export const GEO_ERROR_MESSAGES = {
  unsupported: 'GPS is not supported by your browser.',
  denied:      'Location access is blocked. Please allow GPS in your browser settings, then reload the page.',
  unavailable: 'Location unavailable. Check your GPS / network signal.',
  timeout:     'Location request timed out. Please try again.',
};
