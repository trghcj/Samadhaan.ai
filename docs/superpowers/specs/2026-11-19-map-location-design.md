# Map location and address lines for complaints

Date: 2026-11-19 · Status: approved in chat, awaiting spec review · Target: localhost demo on 2026-11-20

## Goal
Let a citizen mark the exact spot of a problem on a map and give a fuller address while filing a complaint, so the officer can find the place again. Show that location to the operator (with directions) and to the citizen.

## Decisions
- The map and address fields go on the existing details form ("Where is the problem?"), after recording or typing. There is no editing of the location after the complaint is submitted (out of scope).
- Map: OpenStreetMap tiles through Leaflet (`leaflet` + `react-leaflet`). There is no API key. Reverse geocoding uses the public Nominatim service, one request per pin placement, debounced (about 1 request per second at most).
- Storage: new nullable columns, not a packed string.

## Data
New nullable columns on `grievances`:

| column | type | meaning |
|---|---|---|
| `latitude` | Float | WGS84, -90..90 |
| `longitude` | Float | WGS84, -180..180 |
| `address_line` | String | house / street |
| `landmark` | String | nearby landmark |
| `pincode` | String | 6-digit Indian PIN |

`location` (existing, required in the form) stays the area / village.

Schema update: at backend startup, after `create_all`, a helper compares the `grievances` table with the model and runs `ALTER TABLE grievances ADD COLUMN …` for each missing column. It works on Postgres (Supabase) and SQLite (tests). Old rows get NULL. The old deployed backend keeps working because it does not select unknown columns.

## Backend
- `POST /api/upload` and `POST /api/submit-text` accept optional form fields `latitude`, `longitude`, `address_line`, `landmark`, `pincode`, pass them through `process_audio_task` / `process_text_task` to `route_and_save`, and store them.
- Validation: latitude and longitude must both be present or both absent, and within range, or the request fails with HTTP 400. Text fields are trimmed and capped at 200 characters. `pincode` must be 6 digits if given.
- The grievance list endpoints return the new fields (they serialise the model, so the columns appear automatically; verify).

## Citizen form
- A "Use my current location" button calls `navigator.geolocation.getCurrentPosition` (high accuracy, 10 s timeout) and centres the map with a draggable pin. Tapping the map moves the pin.
- When permission is denied or there is no GPS, the form shows a short message, the map stays centred on Delhi (28.6139, 77.2090), and the pin can still be placed by tapping.
- After each pin placement, the form calls Nominatim reverse geocoding and shows "Near: <display name>". It fills Area/village and PIN code only if they are empty or were filled automatically before, so it never overwrites the citizen's typing.
- Fields: House / street (optional), Landmark (optional), Area / village (required), PIN code (optional). There is a "Remove pin" link.
- The map is optional: the form submits without a pin.

## Operator ticket panel
- If coordinates exist: a small read-only map with the pin, the full address block, and an "Open in Google Maps" link (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`).
- The register's Location column shows a small pin icon when coordinates exist.

## Citizen details popup
The same read-only map and address block.

## Error handling
- Nominatim fails or is slow: the pin stays and the "Near" line is hidden. The citizen can still type the address.
- Map tiles fail (offline): the map area is grey, and the pin and fields still work.

## Testing
- Backend (pytest, SQLite): submitting text with location fields stores and returns them. A half-pair latitude/longitude is rejected (400). The column-adding helper adds missing columns to an old-shaped table. Then the existing suite runs.
- Frontend: `npm run build`, then a manual check on localhost (GPS allow and deny, dragging the pin, submit, operator panel, Google Maps link).

## Out of scope
A city-wide map of all complaints, editing the location after submitting, Google Maps tiles, and offline map tiles.
