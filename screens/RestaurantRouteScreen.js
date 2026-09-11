/**
 * RestaurantRouteScreen.js
 *
 * Shows the route from the rider's current GPS location → restaurant.
 *
 * MODE 1 – ROUTE PREVIEW (default):
 *   • Map fits entire route: rider → restaurant
 *   • Real road polyline from Google Routes API
 *   • Real ETA + distance from API
 *   • All order items, restaurant details, drop-off info — fully scrollable
 *   • Bottom buttons (Navigate in Google Maps / I've Arrived) never cover content
 *
 * MODE 2 – ACTIVE DRIVING:
 *   • Full-screen map
 *   • Camera follows rider with heading
 *   • Rider arrow rotates with GPS heading
 *   • Road polyline refreshed every 30 s or when off-route
 *   • Minimal HUD (ETA + distance + call + arrived)
 *
 * Two-wheeler advisory displayed per Google Maps Platform policy.
 * Route calculated with travelMode=TWO_WHEELER, falls back to DRIVE.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, Platform, StatusBar,
  Dimensions, Image, Alert, ScrollView, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE } from '../components/WebSafeMap';
import useRiderStore from '../store/useRiderStore';
import {
  goTowardRestaurant,
  arriveAtRestaurant,
  getDeliveryAssignment,
  getOrderTracking,
  cancelDelivery,
} from '../services/api';
import { startLocationTracking, stopLocationTracking } from '../services/location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getRoute,
  isOffRoute,
  TWO_WHEELER_WARNING,
  ROUTE_REFRESH_INTERVAL_MS,
  calculateEarning,
  RATE_PER_KM,
} from '../services/routingService';
import Constants from 'expo-constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Extract Google Maps API key from Expo config
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey;

// ─── Main Component ────────────────────────────────────────────────────────────
export default function RestaurantRouteScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    activeAssignmentId,
    activeOrderId,
    activeDeliveryStatus,
    restaurant: storeRestaurant,
    updateDeliveryStatus,
    currentLocation,
    customerDetails: storeCustomerDetails,
    orderItems: storeOrderItems,
    activeAssignment: storeActiveAssignment,
  } = useRiderStore();

  // ─── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderTracking, setOrderTracking] = useState(null);
  const [drivingMode, setDrivingMode] = useState(false);
  const goingTriggered = useRef(false);

  // Routing state
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState(null);
  const [routeDurationMin, setRouteDurationMin] = useState(null);
  const [routeTravelMode, setRouteTravelMode] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);

  const mapRef = useRef(null);
  const routeRefreshTimer = useRef(null);
  const lastRouteOrigin = useRef(null);
  const isRouteRequestInFlight = useRef(false);

  // ─── Data Fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      if (activeAssignmentId) {
        const res = await getDeliveryAssignment(activeAssignmentId);
        if (res?.data) setOrderDetails(res.data);
      }
      if (activeOrderId) {
        const trackRes = await getOrderTracking(activeOrderId);
        if (trackRes?.data) setOrderTracking(trackRes.data);
      }
    } catch (err) {
      console.error('RestaurantRouteScreen fetch error:', err);
    }
  }, [activeAssignmentId, activeOrderId]);

  useEffect(() => {
    startLocationTracking();
    fetchData();

    // Trigger GOING_TO_RESTAURANT exactly once
    if (
      !goingTriggered.current &&
      (activeDeliveryStatus === 'ASSIGNED' || activeDeliveryStatus === 'ACCEPTED')
    ) {
      goingTriggered.current = true;
      goTowardRestaurant(activeAssignmentId)
        .then(() => updateDeliveryStatus('GOING_TO_RESTAURANT'))
        .catch(err => {
          console.error('Going to restaurant error:', err);
          goingTriggered.current = false;
        });
    }

    return () => {
      clearInterval(routeRefreshTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived Coordinates ───────────────────────────────────────────────────
  const restLat = useMemo(() => {
    const v =
      orderDetails?.restaurant?.latitude ??
      orderDetails?.restaurant_latitude ??
      storeRestaurant?.latitude ??
      storeActiveAssignment?.restaurant_latitude;
    return v != null ? Number(v) : null;
  }, [orderDetails, storeRestaurant, storeActiveAssignment]);

  const restLng = useMemo(() => {
    const v =
      orderDetails?.restaurant?.longitude ??
      orderDetails?.restaurant_longitude ??
      storeRestaurant?.longitude ??
      storeActiveAssignment?.restaurant_longitude;
    return v != null ? Number(v) : null;
  }, [orderDetails, storeRestaurant, storeActiveAssignment]);

  const riderLat = currentLocation?.latitude != null ? Number(currentLocation.latitude) : null;
  const riderLng = currentLocation?.longitude != null ? Number(currentLocation.longitude) : null;
  const riderHeading = currentLocation?.heading ?? 0;

  const hasRestCoords = restLat != null && restLng != null && !isNaN(restLat) && !isNaN(restLng);
  const hasRiderCoords = riderLat != null && riderLng != null && !isNaN(riderLat) && !isNaN(riderLng);

  // ─── Route Fetching ────────────────────────────────────────────────────────
  const fetchRoute = useCallback(async (oLat, oLng, dLat, dLng) => {
    if (isRouteRequestInFlight.current) return;
    if (!oLat || !oLng || !dLat || !dLng) return;

    isRouteRequestInFlight.current = true;
    setRouteLoading(true);
    setRouteError(false);

    try {
      const result = await getRoute({
        originLat: oLat,
        originLng: oLng,
        destLat: dLat,
        destLng: dLng,
        apiKey: GOOGLE_MAPS_API_KEY,
      });

      if (result && result.polylineCoords.length > 0) {
        setRouteCoords(result.polylineCoords);
        setRouteDistanceKm(result.distanceKm);
        setRouteDurationMin(result.durationMin);
        setRouteTravelMode(result.travelMode);
        lastRouteOrigin.current = { lat: oLat, lng: oLng };

        // Fit map to route in preview mode
        if (!drivingMode && mapRef.current && result.polylineCoords.length > 1) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(result.polylineCoords, {
              edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
              animated: true,
            });
          }, 400);
        }
      } else {
        setRouteError(true);
      }
    } catch (err) {
      console.error('[RestaurantRouteScreen] Route fetch error:', err);
      setRouteError(true);
    } finally {
      setRouteLoading(false);
      isRouteRequestInFlight.current = false;
    }
  }, [drivingMode]);

  // Fetch initial route when coords become available
  useEffect(() => {
    if (hasRiderCoords && hasRestCoords && routeCoords.length === 0 && !routeLoading) {
      fetchRoute(riderLat, riderLng, restLat, restLng);
    }
  }, [hasRiderCoords, hasRestCoords, routeCoords.length, routeLoading, fetchRoute,
      riderLat, riderLng, restLat, restLng]);

  // ─── Periodic Route Refresh + Off-Route Detection ──────────────────────────
  useEffect(() => {
    if (!drivingMode) {
      clearInterval(routeRefreshTimer.current);
      return;
    }

    const checkAndRefresh = () => {
      if (!hasRiderCoords || !hasRestCoords) return;

      // Off-route check
      if (
        routeCoords.length > 0 &&
        isOffRoute(riderLat, riderLng, routeCoords)
      ) {
        fetchRoute(riderLat, riderLng, restLat, restLng);
        return;
      }

      // Periodic refresh
      fetchRoute(riderLat, riderLng, restLat, restLng);
    };

    clearInterval(routeRefreshTimer.current);
    routeRefreshTimer.current = setInterval(checkAndRefresh, ROUTE_REFRESH_INTERVAL_MS);
    return () => clearInterval(routeRefreshTimer.current);
  }, [drivingMode, hasRiderCoords, hasRestCoords, riderLat, riderLng,
      restLat, restLng, routeCoords, fetchRoute]);

  // ─── Camera: Follow Rider in Driving Mode ─────────────────────────────────
  const prevCameraCoords = useRef(null);
  useEffect(() => {
    if (!drivingMode || !mapRef.current || !hasRiderCoords) return;
    const prev = prevCameraCoords.current;
    if (
      !prev ||
      Math.abs(prev.lat - riderLat) > 0.00005 ||
      Math.abs(prev.lng - riderLng) > 0.00005
    ) {
      prevCameraCoords.current = { lat: riderLat, lng: riderLng };
      mapRef.current.animateCamera(
        {
          center: { latitude: riderLat, longitude: riderLng },
          heading: riderHeading,
          pitch: 45,
          zoom: 17,
        },
        { duration: 700 }
      );
    }
  }, [currentLocation, drivingMode, riderLat, riderLng, riderHeading, hasRiderCoords]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleArrive = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await arriveAtRestaurant(activeAssignmentId);
      updateDeliveryStatus('ARRIVED_AT_RESTAURANT');
      Alert.alert('Arrived!', 'You have arrived at the restaurant. Proceed to verify and pick up the order.');
    } catch (err) {
      console.error('Arrive at restaurant error:', err);
      Alert.alert('Error', err?.response?.data?.detail || 'Could not mark arrival. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickup = () => navigation.navigate('VerifyPickup');

  const handleCancelDelivery = () => {
    Alert.alert('Cancel Delivery', 'Are you sure you want to cancel this delivery?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await cancelDelivery(activeAssignmentId);
            stopLocationTracking();
            useRiderStore.getState().clearActiveAssignment();
            useRiderStore.getState().setAvailability(true);
            navigation.replace('Dashboard');
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.detail || 'Could not cancel.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const openGoogleMaps = () => {
    const dest = hasRestCoords
      ? `${restLat},${restLng}`
      : restaurantAddress
        ? encodeURIComponent(restaurantAddress)
        : null;

    if (!dest) {
      Alert.alert('No destination', 'Restaurant location is unavailable.');
      return;
    }

    if (Platform.OS === 'android') {
      Linking.openURL(`google.navigation:q=${dest}&mode=d`).catch(
        () => Alert.alert('Error', 'Could not open Google Maps.')
      );
    } else {
      Linking.openURL(`maps://app?daddr=${dest}&dirflg=d`).catch(
        () => Alert.alert('Error', 'Could not open Apple Maps.')
      );
    }
  };

  const callRestaurant = () => {
    if (!restaurantPhone) {
      Alert.alert('Unavailable', 'Restaurant phone number is not available.');
      return;
    }
    Linking.openURL(`tel:${restaurantPhone}`);
  };

  const handleStartDriving = () => {
    setDrivingMode(true);
    // Trigger immediate route refresh
    if (hasRiderCoords && hasRestCoords) {
      fetchRoute(riderLat, riderLng, restLat, restLng);
    }
  };

  const handleOverview = () => {
    setDrivingMode(false);
    if (mapRef.current && routeCoords.length > 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeCoords, {
          edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
          animated: true,
        });
      }, 300);
    }
  };

  const retryRoute = () => {
    setRouteError(false);
    if (hasRiderCoords && hasRestCoords) {
      fetchRoute(riderLat, riderLng, restLat, restLng);
    }
  };

  // ─── Derived Info ──────────────────────────────────────────────────────────
  const restaurantName =
    orderDetails?.restaurant?.name ||
    orderDetails?.restaurant_name ||
    storeRestaurant?.name ||
    storeActiveAssignment?.restaurant_name ||
    'Restaurant';

  const restaurantAddress =
    orderDetails?.restaurant?.address ||
    orderDetails?.restaurant_address ||
    storeRestaurant?.address ||
    storeActiveAssignment?.restaurant_address ||
    'Address unavailable';

  const restaurantPhone =
    orderDetails?.restaurant?.phone ||
    orderDetails?.restaurant_phone ||
    storeRestaurant?.phone ||
    storeActiveAssignment?.restaurant_phone || null;

  const customerName =
    orderDetails?.customer_name ||
    orderTracking?.delivery_address?.contact_name ||
    storeCustomerDetails?.name ||
    'Customer';

  const customerAddress =
    orderDetails?.customer_address ||
    orderTracking?.delivery_address?.full_address ||
    orderTracking?.delivery_address?.address_line ||
    storeCustomerDetails?.address ||
    'Address unavailable';

  // All order items — no slicing, no limit
  const items =
    orderDetails?.items?.length
      ? orderDetails.items
      : orderDetails?.order?.items?.length
        ? orderDetails.order.items
        : storeOrderItems?.length
          ? storeOrderItems
          : [];

  // Estimated earning for customer leg (displayed during restaurant leg as info only)
  const estimatedEarning = routeDistanceKm != null ? calculateEarning(routeDistanceKm) : null;

  // ─── Map Region (preview only — driving uses animateCamera) ───────────────
  const previewRegion = useMemo(() => {
    if (!hasRiderCoords && !hasRestCoords) return null;
    if (hasRiderCoords && hasRestCoords) {
      const latMid = (riderLat + restLat) / 2;
      const lngMid = (riderLng + restLng) / 2;
      const latDelta = Math.max(Math.abs(riderLat - restLat) * 2.2, 0.02);
      const lngDelta = Math.max(Math.abs(riderLng - restLng) * 2.2, 0.02);
      return { latitude: latMid, longitude: lngMid, latitudeDelta: latDelta, longitudeDelta: lngDelta };
    }
    if (hasRestCoords) return { latitude: restLat, longitude: restLng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    return { latitude: riderLat, longitude: riderLng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  }, [hasRiderCoords, hasRestCoords, riderLat, riderLng, restLat, restLng]);

  // ─── RENDER ────────────────────────────────────────────────────────────────

  // ── DRIVING MODE ──────────────────────────────────────────────────────────
  if (drivingMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Full-screen map */}
        <View style={StyleSheet.absoluteFillObject}>
          {previewRegion ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFillObject}
              initialRegion={previewRegion}
              showsUserLocation={false}
              showsTraffic
              showsCompass
              rotateEnabled
              pitchEnabled
            >
              {/* Rider arrow — rotates with heading */}
              {hasRiderCoords && (
                <Marker
                  coordinate={{ latitude: riderLat, longitude: riderLng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                  rotation={riderHeading}
                >
                  <View style={styles.riderArrow}>
                    <Ionicons name="navigate" size={22} color="#fff" />
                  </View>
                </Marker>
              )}

              {/* Restaurant marker */}
              {hasRestCoords && (
                <Marker coordinate={{ latitude: restLat, longitude: restLng }} title={restaurantName}>
                  <View style={styles.restMarker}>
                    <Ionicons name="restaurant" size={18} color="#fff" />
                  </View>
                </Marker>
              )}

              {/* Real road polyline */}
              {routeCoords.length > 1 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#ff3815"
                  strokeWidth={5}
                />
              )}
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.mapFallback]}>
              <Ionicons name="location-outline" size={36} color="#9ca3af" />
              <Text style={styles.fallbackText}>Waiting for GPS…</Text>
            </View>
          )}
        </View>

        {/* Driving top bar */}
        <View style={[styles.drivingTopBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.drivingBackBtn} onPress={handleOverview}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.drivingStats}>
            {routeLoading ? (
              <ActivityIndicator color="#4ade80" size="small" />
            ) : routeError ? (
              <Text style={styles.drivingEtaText}>Route unavailable</Text>
            ) : (
              <>
                <Text style={styles.drivingEtaText}>
                  {routeDurationMin != null ? `${routeDurationMin} min` : '—'}
                </Text>
                <Text style={styles.drivingDistText}>
                  {routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km` : '—'}
                </Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.drivingOverviewBtn} onPress={handleOverview}>
            <Ionicons name="map-outline" size={18} color="#94a3b8" />
            <Text style={styles.drivingOverviewText}>Overview</Text>
          </TouchableOpacity>
        </View>

        {/* Two-wheeler advisory banner */}
        {routeTravelMode === 'TWO_WHEELER' && (
          <View style={[styles.advisoryBanner, { top: insets.top + 72 }]}>
            <Ionicons name="warning-outline" size={14} color="#f59e0b" style={{ marginRight: 6 }} />
            <Text style={styles.advisoryText} numberOfLines={2}>{TWO_WHEELER_WARNING}</Text>
          </View>
        )}

        {/* Driving bottom HUD */}
        <View style={[styles.drivingHUD, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.hudCallBtn} onPress={callRestaurant}>
            <Ionicons name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {(activeDeliveryStatus === 'GOING_TO_RESTAURANT' ||
            activeDeliveryStatus === 'ASSIGNED' ||
            activeDeliveryStatus === 'ACCEPTED') && (
            <TouchableOpacity
              style={styles.hudArriveBtn}
              onPress={handleArrive}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.hudArriveTxt}>I've Arrived</Text>
              )}
            </TouchableOpacity>
          )}

          {activeDeliveryStatus === 'ARRIVED_AT_RESTAURANT' && (
            <TouchableOpacity
              style={[styles.hudArriveBtn, { backgroundColor: '#05a660' }]}
              onPress={handlePickup}
            >
              <Text style={styles.hudArriveTxt}>Verify & Pickup</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── ROUTE PREVIEW MODE ────────────────────────────────────────────────────
  const FOOTER_HEIGHT = 140;
  const MAP_HEIGHT = 260;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Restaurant Route</Text>
        <TouchableOpacity
          style={[styles.callHeaderBtn, !restaurantPhone && { opacity: 0.4 }]}
          onPress={callRestaurant}
          disabled={!restaurantPhone}
        >
          <Ionicons name="call" size={18} color="#ff3815" />
        </TouchableOpacity>
      </View>

      {/* Map — fixed height, above scrollable content */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
        {!hasRiderCoords && !hasRestCoords ? (
          <View style={[styles.mapInner, styles.mapFallback]}>
            <Ionicons name="location-outline" size={36} color="#9ca3af" />
            <Text style={styles.fallbackText}>Waiting for GPS location…</Text>
          </View>
        ) : (
          <View style={styles.mapInner}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFillObject}
              initialRegion={previewRegion}
              showsUserLocation={false}
              showsCompass
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {/* Rider marker */}
              {hasRiderCoords && (
                <Marker
                  coordinate={{ latitude: riderLat, longitude: riderLng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                  rotation={riderHeading}
                >
                  <View style={styles.riderArrow}>
                    <Ionicons name="navigate" size={18} color="#fff" />
                  </View>
                </Marker>
              )}

              {/* Restaurant marker */}
              {hasRestCoords && (
                <Marker coordinate={{ latitude: restLat, longitude: restLng }} title={restaurantName}>
                  <View style={styles.restMarker}>
                    <Ionicons name="restaurant" size={18} color="#fff" />
                  </View>
                </Marker>
              )}

              {/* Real road polyline */}
              {routeCoords.length > 1 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#ff3815"
                  strokeWidth={4}
                  lineDashPattern={[8, 4]}
                />
              )}
            </MapView>

            {/* Route loading spinner overlay */}
            {routeLoading && (
              <View style={styles.routeLoadingOverlay}>
                <ActivityIndicator color="#ff3815" size="small" />
                <Text style={styles.routeLoadingText}>Finding best route…</Text>
              </View>
            )}

            {/* Route error */}
            {routeError && !routeLoading && (
              <View style={styles.routeErrorOverlay}>
                <Text style={styles.routeErrorText}>Route temporarily unavailable</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={retryRoute}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Start Driving button on map */}
            <TouchableOpacity
              style={styles.startDrivingBtn}
              onPress={handleStartDriving}
              disabled={routeLoading}
            >
              <Ionicons name="navigate" size={15} color="#fff" style={{ marginRight: 5 }} />
              <Text style={styles.startDrivingText}>Start Driving</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Two-wheeler advisory */}
      {routeTravelMode === 'TWO_WHEELER' && (
        <View style={styles.advisoryInline}>
          <Ionicons name="warning-outline" size={13} color="#f59e0b" style={{ marginRight: 5 }} />
          <Text style={styles.advisoryInlineText}>{TWO_WHEELER_WARNING}</Text>
        </View>
      )}

      {/* ETA + Distance row */}
      <View style={styles.etaRow}>
        <View style={styles.etaBlock}>
          {routeLoading ? (
            <Text style={styles.etaValuePlaceholder}>Finding best route…</Text>
          ) : routeError ? (
            <Text style={styles.etaValuePlaceholder}>Route unavailable</Text>
          ) : (
            <>
              <Text style={styles.etaValue}>
                {routeDurationMin != null ? `${routeDurationMin} min` : '—'}
              </Text>
              <Text style={styles.etaLabel}>
                {routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km to restaurant` : '—'}
              </Text>
            </>
          )}
        </View>
        <View style={[
          styles.statusPill,
          activeDeliveryStatus === 'ARRIVED_AT_RESTAURANT' && { backgroundColor: '#05a660' },
        ]}>
          <Text style={styles.statusPillText}>
            {activeDeliveryStatus === 'ARRIVED_AT_RESTAURANT' ? 'ARRIVED' : 'ON THE WAY'}
          </Text>
        </View>
      </View>

      {/* Scrollable info area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: FOOTER_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Restaurant Card */}
        <View style={styles.infoCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="restaurant" size={20} color="#ff3815" />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>{restaurantName}</Text>
            <Text style={styles.infoSub} numberOfLines={2}>{restaurantAddress}</Text>
          </View>
          {restaurantPhone ? (
            <TouchableOpacity style={styles.phoneBtn} onPress={callRestaurant}>
              <Ionicons name="call-outline" size={18} color="#ff3815" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Drop-off Card */}
        <View style={styles.dropOffCard}>
          <View style={styles.iconCircleGreen}>
            <Ionicons name="home" size={18} color="#05a660" />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.dropOffLabel}>DROP OFF: {customerName}</Text>
            <Text style={styles.dropOffSub} numberOfLines={3}>{customerAddress}</Text>
          </View>
        </View>

        {/* Order Items Card — ALL items, no slicing */}
        <View style={styles.itemsCard}>
          <View style={styles.itemsHeader}>
            <Ionicons name="receipt-outline" size={16} color="#111" style={{ marginRight: 6 }} />
            <Text style={styles.itemsTitle}>Order Items ({items.length})</Text>
          </View>

          {items.length > 0 ? (
            items.map((item, index) => (
              <View key={item.id ?? index} style={styles.itemRow}>
                <Text style={styles.itemQty}>{item.quantity || 1}×</Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {/* Variant (if backend ever adds it) */}
                  {item.variant ? (
                    <Text style={styles.itemVariant}>{item.variant}</Text>
                  ) : null}
                  {/* Add-ons (if backend ever adds them) */}
                  {item.addons && item.addons.length > 0 ? (
                    <Text style={styles.itemAddon}>+ {item.addons.join(', ')}</Text>
                  ) : null}
                  {/* Special instructions */}
                  {item.instructions ? (
                    <Text style={styles.itemInstruction}>📝 {item.instructions}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>
                  {item.price != null ? `₹${(item.price * (item.quantity || 1)).toFixed(0)}` : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.loadingItemsText}>Loading order items…</Text>
          )}
        </View>

        {/* Payment / Amount info */}
        {orderDetails?.total_amount != null && (
          <View style={styles.paymentCard}>
            <Text style={styles.paymentLabel}>Order Total</Text>
            <Text style={styles.paymentValue}>₹{Number(orderDetails.total_amount).toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom action footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.btnNavigate} onPress={openGoogleMaps}>
          <Ionicons name="navigate-outline" size={17} color="#ff3815" style={{ marginRight: 6 }} />
          <Text style={styles.btnNavigateText}>Navigate in Google Maps</Text>
        </TouchableOpacity>

        {(activeDeliveryStatus === 'GOING_TO_RESTAURANT' ||
          activeDeliveryStatus === 'ASSIGNED' ||
          activeDeliveryStatus === 'ACCEPTED') && (
          <TouchableOpacity
            style={[styles.btnAction, { marginTop: 10 }]}
            onPress={handleArrive}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.btnActionText}>I've Arrived at Restaurant</Text>}
          </TouchableOpacity>
        )}

        {activeDeliveryStatus === 'ARRIVED_AT_RESTAURANT' && (
          <TouchableOpacity
            style={[styles.btnAction, { marginTop: 10, backgroundColor: '#05a660' }]}
            onPress={handlePickup}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.btnActionText}>Verify & Pick Up Order</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  callHeaderBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff1ee',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },

  // Map container (preview)
  mapContainer: { width: '100%', backgroundColor: '#e8edf2' },
  mapInner: { width: '100%', height: '100%', position: 'relative' },
  mapFallback: {
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6',
  },
  fallbackText: { marginTop: 8, color: '#6b7280', fontSize: 13, fontWeight: '500' },

  // Route loading/error overlays
  routeLoadingOverlay: {
    position: 'absolute', bottom: 50, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 12, gap: 6,
  },
  routeLoadingText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  routeErrorOverlay: {
    position: 'absolute', bottom: 50, alignSelf: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12,
  },
  routeErrorText: { fontSize: 12, fontWeight: '700', color: '#dc2626', marginBottom: 6 },
  retryBtn: { backgroundColor: '#ff3815', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  // Start driving button (on map)
  startDrivingBtn: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ff3815',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  startDrivingText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Advisory
  advisoryInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#fef3c7',
  },
  advisoryInlineText: { flex: 1, fontSize: 11, color: '#92400e', fontWeight: '600', lineHeight: 16 },

  // ETA row
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  etaBlock: { flex: 1 },
  etaValue: { fontSize: 26, fontWeight: '900', color: '#111', marginBottom: 2 },
  etaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  etaValuePlaceholder: { fontSize: 14, color: '#9ca3af', fontWeight: '600', fontStyle: 'italic' },
  statusPill: {
    backgroundColor: '#ff3815',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12,
  },
  statusPillText: { color: 'white', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },

  // Scrollable area
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Info cards
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#f3f4f6',
    marginBottom: 12, backgroundColor: 'white',
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff1ee', alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  iconCircleGreen: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '900', color: '#111', marginBottom: 3 },
  infoSub: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  phoneBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff1ee', alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },

  dropOffCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 16,
    backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1,
    marginBottom: 14,
  },
  dropOffLabel: { fontSize: 12, fontWeight: '900', color: '#065f46', marginBottom: 2 },
  dropOffSub: { fontSize: 12, color: '#047857', lineHeight: 17 },

  // Order Items
  itemsCard: {
    padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#f3f4f6',
    backgroundColor: 'white',
    marginBottom: 14,
    elevation: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  itemsHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
  },
  itemsTitle: { fontSize: 14, fontWeight: '900', color: '#111' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  itemQty: {
    fontSize: 14, fontWeight: '900', color: '#ff3815',
    marginRight: 10, minWidth: 30,
  },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111' },
  itemVariant: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  itemAddon: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  itemInstruction: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#374151', marginLeft: 6 },
  loadingItemsText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 8 },

  // Payment card
  paymentCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 16,
    backgroundColor: '#fafafa', borderColor: '#f3f4f6', borderWidth: 1,
    marginBottom: 12,
  },
  paymentLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  paymentValue: { fontSize: 16, fontWeight: '900', color: '#111' },

  // Footer
  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  btnNavigate: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#ff3815',
  },
  btnNavigateText: { color: '#ff3815', fontWeight: '800', fontSize: 14 },
  btnAction: {
    backgroundColor: '#111827', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  btnActionText: { color: 'white', fontWeight: '900', fontSize: 15 },

  // ── Driving Mode Styles ─────────────────────────────────────────────────────
  drivingTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  drivingBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  drivingStats: { flex: 1, alignItems: 'center' },
  drivingEtaText: { fontSize: 22, fontWeight: '900', color: '#4ade80' },
  drivingDistText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  drivingOverviewBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4,
  },
  drivingOverviewText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  advisoryBanner: {
    position: 'absolute', left: 12, right: 12, zIndex: 19,
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  advisoryText: { flex: 1, fontSize: 11, color: '#92400e', fontWeight: '600', lineHeight: 15 },

  drivingHUD: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, gap: 12,
  },
  hudCallBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#334155',
    alignItems: 'center', justifyContent: 'center',
  },
  hudArriveBtn: {
    backgroundColor: '#ff3815',
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  hudArriveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  // Markers
  riderArrow: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#ff3815',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    elevation: 6,
  },
  restMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#05a660',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },
});
