import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION, pinIcon, googleMapsUrl } from '../utils/geo';

// The drawer / modal animates in, so re-measure once it is laid out.
const FixSize = () => {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(id);
  }, [map]);
  return null;
};

/** Address block for a complaint, plus a small read-only map when it has coordinates. */
const LocationView = ({ g, showDirections = false }) => {
  const { t } = useTranslation();
  const hasPin = g.latitude != null && g.longitude != null;
  const lines = [g.address_line, g.landmark && `${t('Landmark', { defaultValue: 'Landmark' })}: ${g.landmark}`, [g.location, g.pincode].filter(Boolean).join(' – ')].filter(Boolean);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: 'var(--text-main)', fontWeight: 500, fontSize: '0.95rem' }}>
        <MapPin size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 3 }} />
        <div>{lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : t('Not provided', { defaultValue: 'Not provided' })}</div>
      </div>
      {hasPin && (
        <>
          <div className="map-box" style={{ height: 180, marginTop: '0.75rem' }}>
            <MapContainer center={[g.latitude, g.longitude]} zoom={16} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <FixSize />
              <Marker position={[g.latitude, g.longitude]} icon={pinIcon} />
            </MapContainer>
          </div>
          {showDirections && (
            <a href={googleMapsUrl(g.latitude, g.longitude)} target="_blank" rel="noreferrer" className="btn btn-outline"
              style={{ marginTop: '0.6rem', padding: '0.5rem 0.9rem', fontSize: '0.875rem', borderRadius: 8, textDecoration: 'none', background: '#fff' }}>
              <Navigation size={15} /> {t('Open in Google Maps', { defaultValue: 'Open in Google Maps' })}
            </a>
          )}
        </>
      )}
    </div>
  );
};

export default LocationView;
