/**
 * routingService.js
 *
 * Shared routing utility for the Data Udipi Rider app.
 *
 * Uses the Google Routes API v2 with travelMode = TWO_WHEELER
 * (traffic-aware). Falls back to DRIVE if TWO_WHEELER is
 * rejected by the API for the given region.
 *
 * IMPORTANT — Google Maps Platform policy:
 * When TWO_WHEELER routes are displayed, the app MUST show the
 * advisory: "This route may not be suitable for all two-wheelers."
 * See constant TWO_WHEELER_WARNING below.
 *
 * Earnings calculation:
 *   RATE_PER_KM = ₹15
 *   earning     = Math.round(deliveryDistanceKm * RATE_PER_KM)
 *   Uses the restaurant → customer road distance ONLY.
 *   Pickup distance is excluded.
 *
 * Route refresh throttle:
 *   ROUTE_REFRESH_INTERVAL_MS  (default 30 s)
 *
 * Off-route threshold:
 *   OFF_ROUTE_THRESHOLD_METERS (default 80 m)
 */

// ─── Configuration ────────────────────────────────────────────────────────────
export const RATE_PER_KM               = 15;
export const ROUTE_REFRESH_INTERVAL_MS = 30_000;  // 30 seconds
export const OFF_ROUTE_THRESHOLD_METERS = 80;     // metres from route polyline

const ROUTES_API_ENDPOINT =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

// Required field mask for the Routes API response
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory',
].join(',');

// Google Maps Platform — two-wheeler advisory (display when TWO_WHEELER mode is active)
export const TWO_WHEELER_WARNING =
  'Route calculated for two-wheelers. This route may not be suitable for all vehicles. Please exercise caution.';

// ─── Polyline Decoder (Google encoded polyline algorithm) ─────────────────────
/**
 * Decodes a Google encoded polyline string into an array of {latitude, longitude}.
 * @param {string} encoded
 * @returns {{ latitude: number, longitude: number }[]}
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

// ─── Haversine (used only for off-route detection) ────────────────────────────
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Off-Route Detector ───────────────────────────────────────────────────────
/**
 * Returns true if the rider's current position is more than
 * OFF_ROUTE_THRESHOLD_METERS away from every point on the route polyline.
 *
 * We check only every 5th point for performance.
 *
 * @param {number} currentLat
 * @param {number} currentLng
 * @param {{ latitude: number, longitude: number }[]} routeCoords
 * @param {number} [thresholdMeters]
 * @returns {boolean}
 */
export function isOffRoute(currentLat, currentLng, routeCoords, thresholdMeters = OFF_ROUTE_THRESHOLD_METERS) {
  if (!routeCoords || routeCoords.length === 0) return false;
  const step = Math.max(1, Math.floor(routeCoords.length / 50));
  for (let i = 0; i < routeCoords.length; i += step) {
    const d = haversineMeters(currentLat, currentLng, routeCoords[i].latitude, routeCoords[i].longitude);
    if (d <= thresholdMeters) return false;
  }
  return true;
}

// ─── Earning Calculator ───────────────────────────────────────────────────────
/**
 * Calculates rider earning for a completed delivery.
 * Uses restaurant → customer route distance only (not pickup leg).
 *
 * @param {number} deliveryDistanceKm  road distance (restaurant → customer)
 * @returns {number}  earning in ₹ (integer)
 */
export function calculateEarning(deliveryDistanceKm) {
  if (deliveryDistanceKm == null || isNaN(deliveryDistanceKm) || deliveryDistanceKm <= 0) return 0;
  return Math.round(deliveryDistanceKm * RATE_PER_KM);
}

// ─── Routes API Call ──────────────────────────────────────────────────────────
/**
 * Fetches a road route from the Google Routes API v2.
 *
 * Attempts TWO_WHEELER with TRAFFIC_AWARE first.
 * Automatically falls back to DRIVE if:
 *   - The API returns a non-2xx status
 *   - The response contains no routes
 *
 * Returns the fastest route when alternatives are available.
 *
 * @param {{
 *   originLat: number,
 *   originLng: number,
 *   destLat: number,
 *   destLng: number,
 *   apiKey: string,
 * }} params
 *
 * @returns {Promise<{
 *   polylineCoords: { latitude: number, longitude: number }[],
 *   distanceKm: number,
 *   durationMin: number,
 *   travelMode: 'TWO_WHEELER' | 'DRIVE',
 *   travelAdvisoryText: string | null,
 * } | null>}
 */
export async function getRoute({ originLat, originLng, destLat, destLng, apiKey }) {
  if (!apiKey) {
    console.warn('[routingService] No API key provided');
    return null;
  }

  const origin = {
    location: { latLng: { latitude: originLat, longitude: originLng } },
  };
  const destination = {
    location: { latLng: { latitude: destLat, longitude: destLng } },
  };

  // Try TWO_WHEELER first, then DRIVE
  const modes = ['TWO_WHEELER', 'DRIVE'];

  for (const mode of modes) {
    try {
      const body = {
        origin,
        destination,
        travelMode: mode,
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: true,
        languageCode: 'en-IN',
      };

      const response = await fetch(ROUTES_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[routingService] ${mode} request failed (${response.status}): ${errText}`);
        continue; // try next mode
      }

      const data = await response.json();
      const routes = data?.routes;

      if (!routes || routes.length === 0) {
        console.warn(`[routingService] ${mode} returned no routes`);
        continue;
      }

      // Pick the fastest route by duration
      const fastest = routes.reduce((best, r) => {
        const sec = parseDurationSeconds(r.duration);
        const bestSec = parseDurationSeconds(best.duration);
        return sec < bestSec ? r : best;
      });

      const distanceKm  = (fastest.distanceMeters || 0) / 1000;
      const durationMin = Math.max(1, Math.round(parseDurationSeconds(fastest.duration) / 60));
      const polyline    = fastest.polyline?.encodedPolyline;
      const coords      = decodePolyline(polyline);

      // Extract real traffic advisory text if provided by Google (not self-derived)
      let travelAdvisoryText = null;
      const advisory = fastest.travelAdvisory;
      if (advisory) {
        // Google may return speedReadingIntervals or toll info — we only surface the mode advisory
        if (mode === 'TWO_WHEELER') {
          travelAdvisoryText = TWO_WHEELER_WARNING;
        }
      } else if (mode === 'TWO_WHEELER') {
        travelAdvisoryText = TWO_WHEELER_WARNING;
      }

      return {
        polylineCoords: coords,
        distanceKm,
        durationMin,
        travelMode: mode,
        travelAdvisoryText,
      };
    } catch (err) {
      console.warn(`[routingService] ${mode} threw error:`, err?.message || err);
    }
  }

  // Both modes failed
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Parses a Google Routes API duration string like "3456s" → 3456 (seconds).
 * @param {string | undefined} durationStr
 * @returns {number}
 */
function parseDurationSeconds(durationStr) {
  if (!durationStr) return Infinity;
  // Format is "NNNs"
  const match = String(durationStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}
