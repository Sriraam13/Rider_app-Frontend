/**
 * CustomerNavigationScreen.js
 *
 * Shows the route from rider's current GPS → customer delivery address.
 * Uses delivery_address_snapshot coordinates (frozen at order time).
 *
 * MODE 1 – ROUTE PREVIEW (default):
 *   • Map fits entire route: rider → customer
 *   • Real road polyline from Google Routes API (TWO_WHEELER / DRIVE)
 *   • Real ETA + distance from API
 *   • Estimated earning displayed (route distance × ₹15/km)
 *   • Customer details + scrollable bottom sheet
 *
 * MODE 2 – ACTIVE DRIVING:
 *   • Full-screen map, camera follows rider with heading
 *   • Rider arrow rotates with GPS heading
 *   • Minimal HUD (ETA, distance, call, arrived/complete)
 *   • Route auto-refreshes every 30 s or on off-route detection
 *
 * Earning rule:
 *   Earning = restaurant→customer road distance × ₹15/km
 *   Labeled "Estimated" until delivery is confirmed (DELIVERED).
 *   Pickup distance excluded.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, Platform, StatusBar,
  Dimensions, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE } from '../components/WebSafeMap';
import useRiderStore from '../store/useRiderStore';
import { arriveAtCustomer, getOrderTracking, getDeliveryAssignment, cancelDelivery } from '../services/api';
import { startLocationTracking, stopLocationTracking } from '../services/location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getRoute,
  isOffRoute,
  calculateEarning,
  TWO_WHEELER_WARNING,
  ROUTE_REFRESH_INTERVAL_MS,
  RATE_PER_KM,
} from '../services/routingService';
import Constants from 'expo-constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey;

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CustomerNavigationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    activeAssignmentId,
    activeOrderId,
    activeDeliveryStatus,
    updateDeliveryStatus,
    currentLocation,
    customerDetails: storeCustomerDetails,
    orderItems: storeOrderItems,
    activeAssignment,
  } = useRiderStore();

  // ─── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [assignmentData, setAssignmentData] = useState(null);
  const [drivingMode, setDrivingMode] = useState(false);

  // Routing state
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState(null);
  const [routeDurationMin, setRouteDurationMin] = useState(null);
  const [routeTravelMode, setRouteTravelMode] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);

  // deliveryDistanceKm is passed to DeliveryComplete screen after confirmation
  const deliveryDistanceKm = routeDistanceKm;

  const mapRef = useRef(null);
  const routeRefreshTimer = useRef(null);
  const isRouteRequestInFlight = useRef(false);
  const prevCameraCoords = useRef(null);

  // ─── Data Fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      if (activeOrderId) {
        const res = await getOrderTracking(activeOrderId);
        if (res.data) setOrderData(res.data);
      }
      if (activeAssignmentId) {
        const res = await getDeliveryAssignment(activeAssignmentId);
        if (res.data) setAssignmentData(res.data);
      }
    } catch (err) {
      console.error('CustomerNav fetch error:', err);
    }
  }, [activeOrderId, activeAssignmentId]);

  useEffect(() => {
    startLocationTracking();
    fetchData();
    return () => clearInterval(routeRefreshTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived Coordinates ───────────────────────────────────────────────────
  // Customer destination — always use delivery_address_snapshot coordinates
  const custLat = useMemo(() => {
    const v =
      orderData?.delivery_address?.latitude ??
      assignmentData?.delivery_address?.latitude ??
      storeCustomerDetails?.latitude;
    return v != null ? Number(v) : null;
  }, [orderData, assignmentData, storeCustomerDetails]);

  const custLng = useMemo(() => {
    const v =
      orderData?.delivery_address?.longitude ??
      assignmentData?.delivery_address?.longitude ??
      storeCustomerDetails?.longitude;
    return v != null ? Number(v) : null;
  }, [orderData, assignmentData, storeCustomerDetails]);

  const riderLat = currentLocation?.latitude != null ? Number(currentLocation.latitude) : null;
  const riderLng = currentLocation?.longitude != null ? Number(currentLocation.longitude) : null;
  const riderHeading = currentLocation?.heading ?? 0;

  const hasCustCoords = custLat != null && custLng != null && !isNaN(custLat) && !isNaN(custLng);
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

        // Fit map in preview mode
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
      console.error('[CustomerNav] Route fetch error:', err);
      setRouteError(true);
    } finally {
      setRouteLoading(false);
      isRouteRequestInFlight.current = false;
    }
  }, [drivingMode]);

  // Fetch initial route when coords are ready
  useEffect(() => {
    if (hasRiderCoords && hasCustCoords && routeCoords.length === 0 && !routeLoading) {
      fetchRoute(riderLat, riderLng, custLat, custLng);
    }
  }, [hasRiderCoords, hasCustCoords, routeCoords.length, routeLoading, fetchRoute,
      riderLat, riderLng, custLat, custLng]);

  // ─── Periodic Refresh + Off-Route ─────────────────────────────────────────
  useEffect(() => {
    if (!drivingMode) {
      clearInterval(routeRefreshTimer.current);
      return;
    }

    const checkAndRefresh = () => {
      if (!hasRiderCoords || !hasCustCoords) return;
      if (routeCoords.length > 0 && isOffRoute(riderLat, riderLng, routeCoords)) {
        fetchRoute(riderLat, riderLng, custLat, custLng);
        return;
      }
      fetchRoute(riderLat, riderLng, custLat, custLng);
    };

    clearInterval(routeRefreshTimer.current);
    routeRefreshTimer.current = setInterval(checkAndRefresh, ROUTE_REFRESH_INTERVAL_MS);
    return () => clearInterval(routeRefreshTimer.current);
  }, [drivingMode, hasRiderCoords, hasCustCoords, riderLat, riderLng,
      custLat, custLng, routeCoords, fetchRoute]);

  // ─── Camera: Follow Rider in Driving Mode ─────────────────────────────────
  useEffect(() => {
    if (!drivingMode || !mapRef.current || !hasRiderCoords) return;
    const prev = prevCameraCoords.current;
    if (!prev || Math.abs(prev.lat - riderLat) > 0.00005 || Math.abs(prev.lng - riderLng) > 0.00005) {
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
      await arriveAtCustomer(activeAssignmentId);
      updateDeliveryStatus('ARRIVED_AT_CUSTOMER');
    } catch (err) {
      console.error('Arrive at customer error:', err);
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to mark arrival.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeliver = () => {
    navigation.navigate('CompleteDelivery', {
      deliveryDistanceKm: deliveryDistanceKm,
    });
  };

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
            Alert.alert('Error', err?.response?.data?.detail || 'Could not cancel delivery.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const openGoogleMapsNavigation = () => {
    const dest = hasCustCoords
      ? `${custLat},${custLng}`
      : customerAddress
        ? encodeURIComponent(customerAddress)
        : null;

    if (!dest) {
      Alert.alert('No destination', 'Customer location data is not available.');
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

  const callCustomer = () => {
    if (!customerPhone) {
      Alert.alert('Unavailable', 'Customer phone number is not available.');
      return;
    }
    Linking.openURL(`tel:${customerPhone}`);
  };

  const handleStartDriving = () => {
    setDrivingMode(true);
    if (hasRiderCoords && hasCustCoords) {
      fetchRoute(riderLat, riderLng, custLat, custLng);
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
    if (hasRiderCoords && hasCustCoords) {
      fetchRoute(riderLat, riderLng, custLat, custLng);
    }
  };

  // ─── Derived Info ──────────────────────────────────────────────────────────
  const customerName =
    orderData?.delivery_address?.contact_name ||
    assignmentData?.customer_name ||
    storeCustomerDetails?.name || null;

  const customerPhone =
    orderData?.delivery_address?.contact_phone ||
    assignmentData?.customer_phone ||
    storeCustomerDetails?.phone || null;

  const customerAddress =
    orderData?.delivery_address?.full_address ||
    orderData?.delivery_address?.address_line ||
    assignmentData?.customer_address ||
    storeCustomerDetails?.address || null;

  const displayOrderId =
    orderData?.display_order_id ||
    assignmentData?.display_order_id ||
    (activeOrderId ? `ORD-${String(activeOrderId).padStart(6, '0')}` : null);

  // Estimated earning = delivery route distance × ₹15 (restaurant→customer leg)
  const estimatedEarning = routeDistanceKm != null ? calculateEarning(routeDistanceKm) : null;

  // ─── Map Preview Region ────────────────────────────────────────────────────
  const previewRegion = useMemo(() => {
    if (hasRiderCoords && hasCustCoords) {
      const latMid = (riderLat + custLat) / 2;
      const lngMid = (riderLng + custLng) / 2;
      const latDelta = Math.max(Math.abs(riderLat - custLat) * 2.2, 0.02);
      const lngDelta = Math.max(Math.abs(riderLng - custLng) * 2.2, 0.02);
      return { latitude: latMid, longitude: lngMid, latitudeDelta: latDelta, longitudeDelta: lngDelta };
    }
    if (hasCustCoords) return { latitude: custLat, longitude: custLng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    if (hasRiderCoords) return { latitude: riderLat, longitude: riderLng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    return null;
  }, [hasRiderCoords, hasCustCoords, riderLat, riderLng, custLat, custLng]);

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

              {/* Customer marker */}
              {hasCustCoords && (
                <Marker coordinate={{ latitude: custLat, longitude: custLng }} title={customerName || 'Customer'}>
                  <View style={styles.custMarker}>
                    <Ionicons name="home" size={18} color="#fff" />
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
              <Ionicons name="navigate-circle-outline" size={52} color="#94a3b8" />
              <Text style={styles.noMapText}>Waiting for GPS signal…</Text>
              <ActivityIndicator color="#ff3815" style={{ marginTop: 12 }} />
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

          <TouchableOpacity style={styles.overviewBtn} onPress={handleOverview}>
            <Ionicons name="map-outline" size={16} color="#94a3b8" />
            <Text style={styles.overviewBtnText}>Overview</Text>
          </TouchableOpacity>
        </View>

        {/* Two-wheeler advisory */}
        {routeTravelMode === 'TWO_WHEELER' && (
          <View style={[styles.advisoryBanner, { top: insets.top + 72 }]}>
            <Ionicons name="warning-outline" size={13} color="#f59e0b" style={{ marginRight: 5 }} />
            <Text style={styles.advisoryText} numberOfLines={2}>{TWO_WHEELER_WARNING}</Text>
          </View>
        )}

        {/* Driving bottom HUD */}
        <View style={[styles.drivingHUD, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.hudInfo}>
            <Text style={styles.hudEta}>{routeDurationMin != null ? `${routeDurationMin} min` : '—'}</Text>
            <Text style={styles.hudDist}>{routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km` : ''}</Text>
            {estimatedEarning != null && (
              <Text style={styles.hudEarning}>Est. ₹{estimatedEarning}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.hudCallBtn, !customerPhone && { opacity: 0.4 }]}
            onPress={callCustomer}
            disabled={!customerPhone}
          >
            <Ionicons name="call" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.hudArriveBtn,
              activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' && { backgroundColor: '#05a660' },
            ]}
            onPress={activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' ? handleDeliver : handleArrive}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.hudArriveTxt}>
                {activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' ? 'Complete' : 'Arrived'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ROUTE PREVIEW MODE ────────────────────────────────────────────────────
  const FOOTER_HEIGHT = 160;
  const MAP_HEIGHT = 280;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Route</Text>
        <TouchableOpacity
          style={[styles.callHeaderBtn, !customerPhone && { opacity: 0.4 }]}
          onPress={callCustomer}
          disabled={!customerPhone}
        >
          <Ionicons name="call" size={18} color="#ff3815" />
        </TouchableOpacity>
      </View>

      {/* Map — fixed above scrollable content */}
      <View style={[styles.mapWrapper, { height: MAP_HEIGHT }]}>
        {!hasCustCoords && !hasRiderCoords ? (
          <View style={[styles.mapInner, styles.mapFallback]}>
            <Ionicons name="navigate-circle-outline" size={52} color="#94a3b8" />
            <Text style={styles.noMapText}>Waiting for GPS signal…</Text>
            <ActivityIndicator color="#ff3815" style={{ marginTop: 12 }} />
          </View>
        ) : !hasCustCoords ? (
          <View style={[styles.mapInner, styles.mapFallback]}>
            <Ionicons name="location-outline" size={40} color="#9ca3af" />
            <Text style={styles.noMapText}>Delivery location unavailable</Text>
          </View>
        ) : (
          <View style={styles.mapInner}>
            {previewRegion ? (
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
                {/* Rider arrow */}
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

                {/* Customer marker */}
                {hasCustCoords && (
                  <Marker coordinate={{ latitude: custLat, longitude: custLng }} title={customerName || 'Customer'}>
                    <View style={styles.custMarker}>
                      <Ionicons name="home" size={18} color="#fff" />
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
            ) : null}

            {/* Route loading */}
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

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="time-outline" size={16} color="#ff3815" />
          {routeLoading ? (
            <ActivityIndicator color="#ff3815" size="small" style={{ marginTop: 4 }} />
          ) : (
            <Text style={styles.statValue}>
              {routeDurationMin != null ? `${routeDurationMin} min` : '—'}
            </Text>
          )}
          <Text style={styles.statLabel}>ETA</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="navigate-outline" size={16} color="#ff3815" />
          {routeLoading ? (
            <ActivityIndicator color="#ff3815" size="small" style={{ marginTop: 4 }} />
          ) : (
            <Text style={styles.statValue}>
              {routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km` : '—'}
            </Text>
          )}
          <Text style={styles.statLabel}>Distance</Text>
        </View>

        <View style={[styles.statCard, { borderColor: '#dcfce7', backgroundColor: '#f0fdf4' }]}>
          <Ionicons name="wallet-outline" size={16} color="#05a660" />
          {routeLoading ? (
            <ActivityIndicator color="#05a660" size="small" style={{ marginTop: 4 }} />
          ) : (
            <Text style={[styles.statValue, { color: '#05a660' }]}>
              {estimatedEarning != null ? `₹${estimatedEarning}` : '—'}
            </Text>
          )}
          <Text style={[styles.statLabel, { color: '#059669' }]}>Est. Earning</Text>
        </View>
      </View>

      {/* Rate note */}
      {routeDistanceKm != null && (
        <View style={styles.rateNote}>
          <Text style={styles.rateNoteText}>
            {routeDistanceKm.toFixed(1)} km × ₹{RATE_PER_KM}/km = ₹{estimatedEarning} estimated
          </Text>
        </View>
      )}

      {/* Scrollable bottom sheet */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: FOOTER_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Delivering Now header */}
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.orderIdLabel}>DELIVERING NOW</Text>
            {displayOrderId && <Text style={styles.orderIdValue}>#{displayOrderId}</Text>}
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        </View>

        {/* Customer card */}
        <View style={styles.customerCard}>
          <View style={styles.custAvatarCircle}>
            <Ionicons name="person" size={24} color="#ff3815" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            {customerName
              ? <Text style={styles.customerName}>{customerName}</Text>
              : <Text style={styles.unknownText}>Customer name unavailable</Text>}
            {customerAddress
              ? <Text style={styles.customerAddress} numberOfLines={2}>{customerAddress}</Text>
              : <Text style={styles.unknownText}>Address unavailable</Text>}
          </View>
          <View style={styles.custActions}>
            <TouchableOpacity
              style={[styles.actionBtn, !customerPhone && { opacity: 0.4 }]}
              onPress={callCustomer}
              disabled={!customerPhone}
            >
              <Ionicons name="call" size={20} color="#ff3815" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Open in Google Maps */}
        <TouchableOpacity style={styles.btnGMaps} onPress={openGoogleMapsNavigation}>
          <Ionicons name="map" size={17} color="#ff3815" style={{ marginRight: 8 }} />
          <Text style={styles.btnGMapsText}>Open in Google Maps</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[
            styles.btnArrive,
            activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' && styles.btnComplete,
          ]}
          onPress={activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' ? handleDeliver : handleArrive}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' ? 'checkmark-circle' : 'location'}
                size={18} color="#fff" style={{ marginRight: 8 }}
              />
              <Text style={styles.btnArriveText}>
                {activeDeliveryStatus === 'ARRIVED_AT_CUSTOMER' ? 'Complete Delivery' : "I've Reached the Customer"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
  callHeaderBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff1ee', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111' },

  // Map
  mapWrapper: { width: '100%', backgroundColor: '#e8edf2' },
  mapInner: { width: '100%', height: '100%', position: 'relative' },
  mapFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  noMapText: { marginTop: 10, color: '#64748b', fontSize: 14, fontWeight: '600' },

  // Route overlays
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

  startDrivingBtn: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ff3815', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 14, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  startDrivingText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Advisory
  advisoryInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#fef3c7',
  },
  advisoryInlineText: { flex: 1, fontSize: 11, color: '#92400e', fontWeight: '600', lineHeight: 16 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  statCard: {
    flex: 1, backgroundColor: '#fafafa', borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6',
  },
  statValue: { fontSize: 15, fontWeight: '900', color: '#111', marginTop: 5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginTop: 2 },

  // Rate note
  rateNote: { paddingHorizontal: 16, paddingBottom: 8 },
  rateNoteText: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic' },

  // Scroll area
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderIdLabel: { fontSize: 11, fontWeight: '900', color: '#6b7280', letterSpacing: 0.5 },
  orderIdValue: { fontSize: 18, fontWeight: '900', color: '#111', marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#05a660' },
  livePillText: { color: '#05a660', fontWeight: '900', fontSize: 12 },

  // Customer card
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#ffe4da',
    elevation: 2, shadowColor: '#ff3815', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  custAvatarCircle: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff5f2',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ffddd4',
  },
  customerName: { fontSize: 16, fontWeight: '900', color: '#111' },
  customerAddress: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 },
  unknownText: { fontSize: 12, color: '#d1d5db', fontStyle: 'italic' },
  custActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  actionBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff5f2',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#ffddd4',
  },

  btnGMaps: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#ff3815',
  },
  btnGMapsText: { color: '#ff3815', fontWeight: '800', fontSize: 15 },

  // Footer
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  btnArrive: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1e293b', borderRadius: 16, paddingVertical: 16,
  },
  btnComplete: { backgroundColor: '#05a660' },
  btnArriveText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Driving Mode Styles ─────────────────────────────────────────────────────
  drivingTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  drivingBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  drivingStats: { flex: 1, alignItems: 'center' },
  drivingEtaText: { fontSize: 22, fontWeight: '900', color: '#4ade80' },
  drivingDistText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  overviewBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4,
  },
  overviewBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

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
  hudInfo: { flex: 1 },
  hudEta: { color: '#fff', fontSize: 22, fontWeight: '900' },
  hudDist: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  hudEarning: { color: '#4ade80', fontSize: 13, fontWeight: '700', marginTop: 2 },
  hudCallBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center',
  },
  hudArriveBtn: {
    backgroundColor: '#ff3815', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14,
  },
  hudArriveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  // Markers
  riderArrow: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#ff3815', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff', elevation: 6,
  },
  custMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#05a660', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },
});
