// Map helpers shared by the location picker (citizen form) and the read-only location view.
import L from 'leaflet';

export const DEFAULT_CENTER = [28.6139, 77.2090]; // New Delhi, used when GPS is unavailable

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const googleMapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// A CSS-drawn pin, so no marker image files are needed (Leaflet's default icon paths break under bundlers).
export const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span class="map-pin-head"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

const AREA_KEYS = ['suburb', 'neighbourhood', 'city_district', 'village', 'town', 'city'];

/**
 * Address for a point from OpenStreetMap's Nominatim service.
 * Returns { display, area, pincode } or null on any failure (offline, rate-limited, nothing found).
 */
export async function reverseGeocode(lat, lng, signal) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en&zoom=18`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    const a = data.address || {};
    const area = AREA_KEYS.map((k) => a[k]).find(Boolean) || null;
    const pincode = /^\d{6}$/.test(a.postcode || '') ? a.postcode : null;
    return { display: data.display_name || '', area, pincode };
  } catch {
    return null;
  }
}
