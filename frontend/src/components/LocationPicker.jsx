import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { LocateFixed, Loader2, X } from 'lucide-react';
import { DEFAULT_CENTER, TILE_URL, TILE_ATTRIBUTION, pinIcon, reverseGeocode } from '../utils/geo';

// The form card animates in, so Leaflet measures a zero-size box at first; re-measure once it is laid out.
const FixSize = () => {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(id);
  }, [map]);
  return null;
};

// Tap / click on the map places the pin there.
const TapToPlace = ({ onPlace }) => {
  useMapEvents({ click: (e) => onPlace({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
};

// Moves the view to the pin when it comes from GPS (focusKey changes), not on every drag.
const FlyTo = ({ value, focusKey }) => {
  const map = useMap();
  useEffect(() => {
    if (focusKey && value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 17));
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/**
 * value: {lat, lng} | null.  onChange(pos | null) when the pin moves or is removed.
 * onAddress({display, area, pincode} | null) after each placement (debounced reverse geocoding).
 */
const LocationPicker = ({ value, onChange, onAddress }) => {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [focusKey, setFocusKey] = useState(0);

  // Look up the address 800 ms after the pin settles; cancel stale lookups.
  useEffect(() => {
    if (!value) { onAddress(null); return undefined; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      const addr = await reverseGeocode(value.lat.toFixed(6), value.lng.toFixed(6), ctrl.signal);
      if (!ctrl.signal.aborted) onAddress(addr);
    }, 800);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t('Could not get your location. Tap the map to place the pin.', { defaultValue: 'Could not get your location. Tap the map to place the pin.' }));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setFocusKey((k) => k + 1);
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED
          ? t('Location permission denied. Tap the map to place the pin.', { defaultValue: 'Location permission denied. Tap the map to place the pin.' })
          : t('Could not get your location. Tap the map to place the pin.', { defaultValue: 'Could not get your location. Tap the map to place the pin.' }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="location-picker">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" onClick={useMyLocation} disabled={locating} style={{ padding: '0.5rem 0.9rem', fontSize: '0.875rem', borderRadius: 8, background: '#fff' }}>
          {locating ? <Loader2 size={16} className="spin-anim" /> : <LocateFixed size={16} />}
          {locating ? t('Finding you…', { defaultValue: 'Finding you…' }) : t('Use my current location', { defaultValue: 'Use my current location' })}
        </button>
        {value && (
          <button type="button" className="link-btn muted" onClick={() => onChange(null)} style={{ fontSize: '0.85rem' }}>
            <X size={14} /> {t('Remove pin', { defaultValue: 'Remove pin' })}
          </button>
        )}
      </div>

      <div className="map-box" style={{ height: 220 }}>
        <MapContainer center={value ? [value.lat, value.lng] : DEFAULT_CENTER} zoom={value ? 17 : 12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <FixSize />
          <TapToPlace onPlace={onChange} />
          <FlyTo value={value} focusKey={focusKey} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onChange({ lat: p.lat, lng: p.lng }); } }}
            />
          )}
        </MapContainer>
      </div>

      <div style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: error ? '#B45309' : 'var(--text-muted)' }}>
        {error || (value
          ? t('Drag the pin or tap the map to adjust.', { defaultValue: 'Drag the pin or tap the map to adjust.' })
          : t('Optional: tap the map to mark the exact spot.', { defaultValue: 'Optional: tap the map to mark the exact spot.' }))}
      </div>
    </div>
  );
};

export default LocationPicker;
