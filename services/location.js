import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { updateRiderLocation } from './api';

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';

// Default center (Udupi delivery hub)
export const DEFAULT_COORDS = {
  latitude: 13.3409,
  longitude: 74.7421,
};

// Lazy loader to eliminate require cycle between useRiderStore and location
const getRiderStore = () => {
  try {
    return require('../store/useRiderStore').default;
  } catch (e) {
    return null;
  }
};

let locationSubscription = null;
let isUpdatingLocation = false;
let lastReportedCoords = null;
let lastReportedTime = 0;

export const ensureLocationServicesEnabled = async () => {
  try {
    const isEnabled = await Location.hasServicesEnabledAsync();
    if (!isEnabled && Platform.OS === 'android') {
      // Prompt user with native Google Play Services dialog:
      // "To continue, turn on device location, which uses Google's location service"
      await Location.enableNetworkProviderAsync();
      return true;
    }
    return isEnabled;
  } catch (e) {
    console.log('Location provider prompt rejected or unavailable:', e?.message || e);
    return false;
  }
};

export const startLocationTracking = async () => {
  if (locationSubscription) {
    console.log('Location tracking already active — skipping duplicate start.');
    return true;
  }

  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.error('Permission to access location was denied');
    return false;
  }

  await ensureLocationServicesEnabled();

  const store = getRiderStore()?.getState();
  if (store) store.startTracking();

  try {
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 10, // Minimum 10 meters change
        timeInterval: 5000,   // Minimum 5 seconds
      },
      (location) => {
        const currentState = getRiderStore()?.getState();
        if (!currentState) return;

        if (!currentState.locationTrackingActive || !currentState.riderId) {
          stopLocationTracking();
          return;
        }

        currentState.setCurrentLocation(location.coords);

        const now = Date.now();
        // Check if movement is significant (at least ~8m or heading changed by >10 deg) or at least 15s elapsed
        const isSignificantMovement = !lastReportedCoords ||
          Math.abs(lastReportedCoords.latitude - location.coords.latitude) > 0.00007 ||
          Math.abs(lastReportedCoords.longitude - location.coords.longitude) > 0.00007 ||
          (now - lastReportedTime > 15000);

        if (currentState.riderId && !isUpdatingLocation && isSignificantMovement) {
          isUpdatingLocation = true;
          const orderId = currentState.activeOrderId || currentState.activeAssignment?.order_id || null;
          updateRiderLocation({
            order_id: orderId,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            heading: location.coords.heading,
          })
          .then(() => {
            lastReportedCoords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
            lastReportedTime = Date.now();
          })
          .catch(err => {
            const status = err?.response?.status;
            if (status === 400 || status === 403) {
              return updateRiderLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy,
                speed: location.coords.speed,
                heading: location.coords.heading,
              }).then(() => {
                lastReportedCoords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
                lastReportedTime = Date.now();
              }).catch(e => console.log('Location update fallback failed:', e));
            }
          })
          .finally(() => {
            isUpdatingLocation = false;
          });
        }
      }
    );
    return true;
  } catch (err) {
    console.warn('Failed to start watchPositionAsync:', err);
    return false;
  }
};

export const stopLocationTracking = () => {
  const store = getRiderStore()?.getState();
  if (store) store.stopTracking();

  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  isUpdatingLocation = false;
  lastReportedCoords = null;
  lastReportedTime = 0;
};

export const getCurrentLocation = async () => {
  let { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    const req = await Location.requestForegroundPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    throw new Error('Permission to access location was denied');
  }

  // Ask to turn on high accuracy / Google Location Services if disabled
  await ensureLocationServicesEnabled();

  // 1. Try to get current position
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 4000,
    });
    if (location?.coords && location.coords.latitude !== 0) {
      return location.coords;
    }
  } catch (err) {
    console.warn('getCurrentPositionAsync failed, trying last known position:', err?.message || err);
  }

  // 2. Fallback to last known position
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({});
    if (lastKnown?.coords && lastKnown.coords.latitude !== 0) {
      return lastKnown.coords;
    }
  } catch (err) {
    console.warn('getLastKnownPositionAsync failed:', err?.message || err);
  }

  // 3. Graceful fallback to default delivery hub coordinates
  return DEFAULT_COORDS;
};

export const getAddressFromCoords = async (latitude, longitude) => {
  if (!latitude || !longitude) return 'Udupi Central, Karnataka';

  // 1. Try Expo reverse geocoding
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (res && res.length > 0) {
      const p = res[0];
      let nameStr = p.name;
      if (nameStr && nameStr.match(/^[A-Z0-9]{4,}\+[A-Z0-9]+/i)) {
        nameStr = p.street || p.district || p.subregion;
      }
      const raw = `${p.street || nameStr || ''}, ${p.city || p.subregion || p.region || ''}`.replace(/^, /, '').trim();
      if (raw && raw !== ',') return raw;
    }
  } catch (error) {
    // Reverse geocode failed on OS level, fall through to Google API
  }

  // 2. Google Maps Geocoding API Fallback
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data?.results && data.results.length > 0) {
      const formatted = data.results[0].formatted_address;
      if (formatted) {
        const parts = formatted.split(',');
        return parts.slice(0, 3).join(',').trim();
      }
    }
  } catch (err) {
    console.warn('Google geocoding fallback failed:', err);
  }

  return 'Udupi Central, Karnataka';
};
