import * as Location from 'expo-location';
import { updateRiderLocation } from './api';
import useRiderStore from '../store/useRiderStore';

// Note: Background location in Expo requires defining a TaskManager task in the global scope.
// For this MVP, we use foreground location watching.
// Real background tracking requires additional iOS/Android configurations.

let locationSubscription = null;

export const startLocationTracking = async () => {
  // Guard: only ONE subscription at a time
  if (locationSubscription) {
    console.log('Location tracking already active — skipping duplicate start.');
    return true;
  }

  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.error('Permission to access location was denied');
    return false;
  }

  const store = useRiderStore.getState();
  store.startTracking();

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10, // Minimum 10 meters change
      timeInterval: 5000,   // Minimum 5 seconds
    },
    (location) => {
      const currentState = useRiderStore.getState();

      // Stop tracking if it was toggled off or rider logged out
      if (!currentState.locationTrackingActive || !currentState.riderId) {
        stopLocationTracking();
        return;
      }

      currentState.setCurrentLocation(location.coords);

      // Push GPS coordinates to backend so customer can track live
      const orderId = currentState.activeOrderId || currentState.activeAssignment?.order_id || null;
      if (currentState.riderId) {
        updateRiderLocation({
          order_id: orderId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          speed: location.coords.speed,
          heading: location.coords.heading,
        }).catch(err => {
          // If the backend rejects the order_id (400/403), retry without it next tick
          // This handles the case where the assignment has ended mid-ride
          const status = err?.response?.status;
          if (status === 400 || status === 403) {
            console.log('GPS: order_id rejected by backend, retrying without order_id');
            updateRiderLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              speed: location.coords.speed,
              heading: location.coords.heading,
            }).catch(e => console.log('Location update fallback also failed:', e));
          } else {
            console.log('Location update failed:', err?.message || err);
          }
        });
      }
    }
  );

  return true;
};

export const stopLocationTracking = () => {
  const store = useRiderStore.getState();
  store.stopTracking();

  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
};

export const getCurrentLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access location was denied');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });
  return location.coords;
};

export const getAddressFromCoords = async (latitude, longitude) => {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (res && res.length > 0) {
      const p = res[0];
      let nameStr = p.name;
      if (nameStr && nameStr.match(/^[A-Z0-9]{4,}\+[A-Z0-9]+/i)) {
        nameStr = p.street || p.district || p.subregion;
      }
      return `${p.street || nameStr || ''}, ${p.city || p.subregion || p.region || ''}`.replace(/^, /, '').trim();
    }
  } catch (error) {
    console.error('Reverse geocode failed', error);
  }
  return 'Unknown Location';
};
