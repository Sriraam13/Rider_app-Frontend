import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Text,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';

export const PROVIDER_GOOGLE = 'google';

// Extract Google Maps API Key
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
  'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';

/**
 * Standard Marker and Polyline wrappers to match react-native-maps interface
 */
export const Marker = ({ coordinate, title, children, rotation, ...props }) => {
  return null;
};

export const Polyline = ({ coordinates, strokeColor, strokeWidth, ...props }) => {
  return null;
};

// ── Google Maps JavaScript SDK Loader (for Web) ──────────────────────────────
let gmapsLoadingPromise = null;

function loadGoogleMapsSdk(apiKey = GOOGLE_MAPS_API_KEY) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (gmapsLoadingPromise) return gmapsLoadingPromise;

  gmapsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-sdk');
    if (existing) {
      if (window.google?.maps) {
        return resolve(window.google.maps);
      }
      existing.addEventListener('load', () => resolve(window.google.maps));
      existing.addEventListener('error', e => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('google.maps not available after script load'));
      }
    };
    script.onerror = err => {
      gmapsLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return gmapsLoadingPromise;
}

// ── SVG Icons for Google Maps Markers (Web) ──────────────────────────────────
function createRiderIcon() {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
        <defs>
          <filter id="pin-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.35"/>
          </filter>
        </defs>
        <path fill="#ea4335" stroke="#ffffff" stroke-width="2" filter="url(#pin-shadow)" d="M19 1C9.6 1 2 8.6 2 18c0 12.8 17 26 17 26s17-13.2 17-26C36 8.6 28.4 1 19 1z"/>
        <circle cx="19" cy="18" r="7" fill="#ffffff"/>
        <circle cx="19" cy="18" r="4" fill="#c5221f"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(38, 46),
    anchor: new window.google.maps.Point(19, 44),
  };
}

function createRestaurantIcon() {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
          </filter>
        </defs>
        <path fill="#111827" stroke="#ffffff" stroke-width="2" filter="url(#shadow)" d="M19 1C9.6 1 2 8.6 2 18c0 12.8 17 26 17 26s17-13.2 17-26C36 8.6 28.4 1 19 1z"/>
        <circle cx="19" cy="18" r="9" fill="#ffffff"/>
        <path fill="#ff3815" d="M16 13v4h1.5v-4h1v4H20v-4h1v4.5c0 1.1-.9 2-2 2V23h-2v-3.5c-1.1 0-2-.9-2-2V13h1zm6 0h1c.6 0 1 .4 1 1v3.5c0 .8-.7 1.5-1.5 1.5H22V23h-1.5V13H22z"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(38, 46),
    anchor: new window.google.maps.Point(19, 44),
  };
}

function createCustomerIcon() {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
          </filter>
        </defs>
        <path fill="#05a660" stroke="#ffffff" stroke-width="2" filter="url(#shadow)" d="M19 1C9.6 1 2 8.6 2 18c0 12.8 17 26 17 26s17-13.2 17-26C36 8.6 28.4 1 19 1z"/>
        <circle cx="19" cy="18" r="9" fill="#ffffff"/>
        <circle cx="19" cy="18" r="5" fill="#05a660"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(38, 46),
    anchor: new window.google.maps.Point(19, 44),
  };
}

// ── Web Mercator Mathematical Projection (Fallback Tiles) ────────────────────
const TILE_SIZE = 256;

function latLngToWorld(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n * TILE_SIZE;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE_SIZE;
  return { x, y };
}

function worldToLatLng(worldX, worldY, zoom) {
  const n = Math.pow(2, zoom);
  const lng = (worldX / (n * TILE_SIZE)) * 360 - 180;
  const latRad = Math.atan(
    Math.sinh(Math.PI * (1 - (2 * worldY) / (n * TILE_SIZE)))
  );
  const lat = (latRad * 180) / Math.PI;
  return { latitude: lat, longitude: lng };
}

function latLngToScreen(
  pointLat,
  pointLng,
  centerLat,
  centerLng,
  zoom,
  width,
  height,
  panX = 0,
  panY = 0
) {
  const centerWorld = latLngToWorld(centerLat, centerLng, zoom);
  const pointWorld = latLngToWorld(pointLat, pointLng, zoom);
  return {
    x: width / 2 + (pointWorld.x - centerWorld.x) + panX,
    y: height / 2 + (pointWorld.y - centerWorld.y) + panY,
  };
}

/**
 * Dynamic Google Maps Component (with seamless fallbacks)
 */
export const MapView = forwardRef(
  (
    {
      style,
      region,
      initialRegion,
      children,
      onPress,
      showsUserLocation,
      followsUserLocation,
      ...props
    },
    ref
  ) => {
    const inputRegion = region || initialRegion;
    const initialLat = Number(inputRegion?.latitude) || 13.0827;
    const initialLng = Number(inputRegion?.longitude) || 80.2707;

    const [center, setCenter] = useState({
      latitude: initialLat,
      longitude: initialLng,
    });
    // Stable map background center (prevents Fresco download cancellations on continuous GPS streams)
    const [staticCenter, setStaticCenter] = useState({
      latitude: initialLat,
      longitude: initialLng,
    });
    const staticCenterRef = useRef(staticCenter);
    staticCenterRef.current = staticCenter;

    const [zoom, setZoom] = useState(16);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [gmapsReady, setGmapsReady] = useState(false);
    const [staticMapFailed, setStaticMapFailed] = useState(false);
    const [isStaticLoading, setIsStaticLoading] = useState(true);

    // Google Maps References (Web)
    const mapContainerRef = useRef(null);
    const gmapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);

    // Pan state for static map drag
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const panOffsetRef = useRef({ x: 0, y: 0 });
    panOffsetRef.current = panOffset;

    const centerRef = useRef(center);
    centerRef.current = center;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const sizeRef = useRef(size);
    sizeRef.current = size;

    // Pulse animation for the live rider marker
    const pulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, []);

    // Parse markers and polyline from React children
    const { markers, routeCoords } = useMemo(() => {
      const markersList = [];
      let route = [];

      React.Children.forEach(children, child => {
        if (!child) return;
        const coord = child.props?.coordinate;
        if (coord && coord.latitude != null && coord.longitude != null) {
          const title = child.props.title || '';
          const rotation = child.props.rotation ?? 0;
          const isRider =
            child.props.rotation !== undefined ||
            title.toLowerCase().includes('your location') ||
            title.toLowerCase().includes('rider');
          const isRest =
            title.toLowerCase().includes('restaurant') ||
            title.toLowerCase().includes('maitred') ||
            title.toLowerCase().includes('data udipi');
          const isCust =
            title.toLowerCase().includes('customer') ||
            title.toLowerCase().includes('drop');

          markersList.push({
            latitude: Number(coord.latitude),
            longitude: Number(coord.longitude),
            title,
            rotation,
            role: isRider ? 'rider' : isRest ? 'restaurant' : isCust ? 'customer' : 'point',
            children: child.props.children,
          });
        } else if (
          child.props?.coordinates &&
          Array.isArray(child.props.coordinates)
        ) {
          route = child.props.coordinates
            .filter(c => c && c.latitude != null && c.longitude != null)
            .map(c => ({
              latitude: Number(c.latitude),
              longitude: Number(c.longitude),
            }));
        }
      });

      return { markers: markersList, routeCoords: route };
    }, [children]);

    // ── Load Google Maps JavaScript SDK (Web only) ───────────────────────────
    const isWeb = Platform.OS === 'web';
    useEffect(() => {
      if (!isWeb) return;

      let isMounted = true;
      loadGoogleMapsSdk(GOOGLE_MAPS_API_KEY)
        .then(() => {
          if (isMounted) setGmapsReady(true);
        })
        .catch(err => {
          console.warn('[WebSafeMap] Google Maps Web SDK load error:', err);
        });

      return () => {
        isMounted = false;
      };
    }, [isWeb]);

    // ── Mount Web Google Map ─────────────────────────────────────────────────
    useEffect(() => {
      if (!isWeb || !gmapsReady || !window.google?.maps) return;

      const domNode = mapContainerRef.current;
      if (!domNode) return;

      if (!gmapInstanceRef.current) {
        const map = new window.google.maps.Map(domNode, {
          center: { lat: center.latitude, lng: center.longitude },
          zoom: zoom,
          disableDefaultUI: false,
          zoomControl: true,
          zoomControlOptions: {
            position: window.google.maps.ControlPosition.RIGHT_TOP,
          },
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        gmapInstanceRef.current = map;

        map.addListener('idle', () => {
          const c = map.getCenter();
          if (c) {
            setCenter({ latitude: c.lat(), longitude: c.lng() });
          }
          const z = map.getZoom();
          if (z) setZoom(z);
        });
      }
    }, [isWeb, gmapsReady]);

    // ── Sync Markers for Web Google Map ──────────────────────────────────────
    useEffect(() => {
      const map = gmapInstanceRef.current;
      if (!map || !window.google?.maps) return;

      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      markers.forEach(m => {
        let icon;
        if (m.role === 'rider') {
          icon = createRiderIcon();
        } else if (m.role === 'restaurant') {
          icon = createRestaurantIcon();
        } else if (m.role === 'customer') {
          icon = createCustomerIcon();
        }

        const marker = new window.google.maps.Marker({
          position: { lat: m.latitude, lng: m.longitude },
          map,
          title: m.title || '',
          icon,
          zIndex: m.role === 'rider' ? 100 : m.role === 'restaurant' ? 50 : 20,
        });

        markersRef.current.push(marker);
      });
    }, [markers, gmapsReady]);

    // ── Sync Polyline for Web Google Map ─────────────────────────────────────
    useEffect(() => {
      const map = gmapInstanceRef.current;
      if (!map || !window.google?.maps) return;

      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }

      if (routeCoords && routeCoords.length > 1) {
        polylineRef.current = new window.google.maps.Polyline({
          path: routeCoords.map(c => ({ lat: c.latitude, lng: c.longitude })),
          geodesic: true,
          strokeColor: '#ff3815',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          map,
        });
      }
    }, [routeCoords, gmapsReady]);

    // ── Construct High-Res Google Static Map URL ──────────────────────────────
    // Uses stable staticCenter (rounded to 4 decimal places ~11m) so the image downloads once and stays cached
    const googleStaticMapUrl = useMemo(() => {
      const lat = Number(staticCenter.latitude).toFixed(4);
      const lng = Number(staticCenter.longitude).toFixed(4);
      const w = Math.max(360, Math.min(640, Math.round(size.width || 480)));
      const h = Math.max(160, Math.min(640, Math.round(size.height || 260)));

      let url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=roadmap&format=jpg&key=${GOOGLE_MAPS_API_KEY}`;

      // Append route polyline if present
      if (routeCoords && routeCoords.length > 1) {
        const step = Math.max(1, Math.floor(routeCoords.length / 25));
        const pathPoints = [];
        for (let i = 0; i < routeCoords.length; i += step) {
          pathPoints.push(`${routeCoords[i].latitude.toFixed(5)},${routeCoords[i].longitude.toFixed(5)}`);
        }
        const lastP = `${routeCoords[routeCoords.length - 1].latitude.toFixed(5)},${routeCoords[routeCoords.length - 1].longitude.toFixed(5)}`;
        if (pathPoints[pathPoints.length - 1] !== lastP) {
          pathPoints.push(lastP);
        }
        url += `&path=color:0xff3815ff|weight:5|${pathPoints.join('|')}`;
      }

      // Add destination markers if navigating
      markers.forEach(m => {
        if (m.role === 'restaurant') {
          url += `&markers=color:0x111827%7Clabel:R%7C${m.latitude.toFixed(5)},${m.longitude.toFixed(5)}`;
        } else if (m.role === 'customer') {
          url += `&markers=color:0x05a660%7Clabel:C%7C${m.latitude.toFixed(5)},${m.longitude.toFixed(5)}`;
        }
      });

      return url;
    }, [staticCenter.latitude, staticCenter.longitude, zoom, size.width, size.height, routeCoords, markers]);

    // Sync incoming region from parent (live GPS coordinates from store)
    useEffect(() => {
      if (
        inputRegion?.latitude != null &&
        inputRegion?.longitude != null
      ) {
        const newLat = Number(inputRegion.latitude);
        const newLng = Number(inputRegion.longitude);
        setCenter({ latitude: newLat, longitude: newLng });

        // Only update static map background URL if moved significantly (> 150m)
        const latDiff = Math.abs(newLat - staticCenterRef.current.latitude);
        const lngDiff = Math.abs(newLng - staticCenterRef.current.longitude);
        if (latDiff > 0.0015 || lngDiff > 0.0015) {
          setStaticCenter({ latitude: newLat, longitude: newLng });
          setPanOffset({ x: 0, y: 0 });
        }

        if (gmapInstanceRef.current) {
          gmapInstanceRef.current.panTo({ lat: newLat, lng: newLng });
        }
      }
    }, [inputRegion?.latitude, inputRegion?.longitude]);

    // Expose camera methods to parent screens
    useImperativeHandle(ref, () => ({
      animateCamera: cam => {
        if (cam?.center?.latitude != null && cam?.center?.longitude != null) {
          const lat = Number(cam.center.latitude);
          const lng = Number(cam.center.longitude);
          setCenter({ latitude: lat, longitude: lng });
          setPanOffset({ x: 0, y: 0 });

          if (gmapInstanceRef.current) {
            gmapInstanceRef.current.panTo({ lat, lng });
          }
        }
        if (cam?.zoom) {
          const z = Math.max(12, Math.min(18, Math.round(cam.zoom)));
          setZoom(z);
          if (gmapInstanceRef.current) {
            gmapInstanceRef.current.setZoom(z);
          }
        }
      },
      fitToCoordinates: (coords, options) => {
        if (!coords || coords.length === 0) return;

        if (gmapInstanceRef.current && window.google?.maps) {
          const bounds = new window.google.maps.LatLngBounds();
          coords.forEach(c => {
            if (c?.latitude != null && c?.longitude != null) {
              bounds.extend(
                new window.google.maps.LatLng(Number(c.latitude), Number(c.longitude))
              );
            }
          });
          const padding = options?.edgePadding
            ? {
                top: options.edgePadding.top || 40,
                right: options.edgePadding.right || 40,
                bottom: options.edgePadding.bottom || 40,
                left: options.edgePadding.left || 40,
              }
            : 40;
          gmapInstanceRef.current.fitBounds(bounds, padding);
          return;
        }

        let minLat = 90,
          maxLat = -90,
          minLng = 180,
          maxLng = -180;
        coords.forEach(c => {
          if (!c || c.latitude == null || c.longitude == null) return;
          const lat = Number(c.latitude);
          const lng = Number(c.longitude);
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        });

        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        const maxDelta = Math.max(maxLat - minLat, maxLng - minLng);

        let targetZoom = 15;
        if (maxDelta > 0.12) targetZoom = 12;
        else if (maxDelta > 0.06) targetZoom = 13;
        else if (maxDelta > 0.025) targetZoom = 14;
        else if (maxDelta > 0.009) targetZoom = 15;
        else targetZoom = 16;

        setCenter({ latitude: centerLat, longitude: centerLng });
        setZoom(targetZoom);
        setPanOffset({ x: 0, y: 0 });
      },
      animateToRegion: (reg, duration) => {
        if (reg?.latitude != null && reg?.longitude != null) {
          const lat = Number(reg.latitude);
          const lng = Number(reg.longitude);
          setCenter({ latitude: lat, longitude: lng });
          setPanOffset({ x: 0, y: 0 });

          if (gmapInstanceRef.current) {
            gmapInstanceRef.current.panTo({ lat, lng });
          }
        }
      },
    }));

    // PanResponder for smooth dragging of static Google Map
    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (evt, gesture) =>
            Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
          onPanResponderGrant: () => {},
          onPanResponderMove: (evt, gesture) => {
            setPanOffset({
              x: gesture.dx * 0.4,
              y: gesture.dy * 0.4,
            });
          },
          onPanResponderRelease: (evt, gesture) => {
            const currentSize = sizeRef.current;
            if (currentSize.width > 0 && currentSize.height > 0) {
              const centerWorld = latLngToWorld(
                centerRef.current.latitude,
                centerRef.current.longitude,
                zoomRef.current
              );
              const newWorldX = centerWorld.x - (gesture.dx + panOffsetRef.current.x);
              const newWorldY = centerWorld.y - (gesture.dy + panOffsetRef.current.y);
              const newCoords = worldToLatLng(newWorldX, newWorldY, zoomRef.current);
              setCenter(newCoords);
              setStaticCenter(newCoords);
              setPanOffset({ x: 0, y: 0 });
            }
          },
        }),
      []
    );

    // Render live markers overlay
    const renderMarkerOverlays = () => {
      const { width, height } = size;
      const effectiveW = width > 0 ? width : 400;
      const effectiveH = height > 0 ? height : 240;

      const elements = [];

      markers.forEach((m, idx) => {
        const pos = latLngToScreen(
          m.latitude,
          m.longitude,
          staticCenter.latitude,
          staticCenter.longitude,
          zoom,
          effectiveW,
          effectiveH,
          panOffset.x,
          panOffset.y
        );

        if (m.role === 'rider') {
          const isRouteMode = routeCoords && routeCoords.length > 0;
          if (isRouteMode) {
            // Authentic Google Maps Two-Wheeler / Bike Navigation Avatar
            elements.push(
              <View
                key={`rider_${idx}`}
                style={[styles.bikeAvatarContainer, { left: pos.x - 28, top: pos.y - 28 }]}
              >
                {/* 1. Pulsing Radar GPS Accuracy Aura */}
                <Animated.View
                  style={[
                    styles.bikeRadarPulse,
                    {
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.9, 1.8],
                          }),
                        },
                      ],
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.55, 0.25, 0],
                      }),
                    },
                  ]}
                />
                {/* 2. Inner Blue Accuracy Core */}
                <View style={styles.bikeAccuracyDot} />

                {/* 3. Rotating Bike Avatar Disc */}
                <View
                  style={[
                    styles.bikeAvatarDisc,
                    { transform: [{ rotate: `${m.rotation || 0}deg` }] },
                  ]}
                >
                  {/* Directional Forward Heading Tip */}
                  <View style={styles.bikeForwardTip} />
                  {/* White Two-Wheeler / Motorcycle Icon */}
                  <MaterialIcons name="two-wheeler" size={20} color="#ffffff" />
                </View>
              </View>
            );
          } else {
            // Home Screen (Dashboard): Red Location Pin with "Current Location" Pill
            elements.push(
              <View
                key={`rider_${idx}`}
                style={[styles.pointerContainer, { left: pos.x - 55, top: pos.y - 68 }]}
              >
                {/* "Current Location" floating badge */}
                <View style={styles.locationPill}>
                  <View style={styles.locationPillDot} />
                  <Text style={styles.locationPillText}>Current Location</Text>
                </View>
                <View style={styles.locationPillArrow} />

                <Animated.View
                  style={[
                    styles.pulseShadow,
                    {
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1.5],
                          }),
                        },
                      ],
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 0.4, 1],
                        outputRange: [0.6, 0.25, 0],
                      }),
                    },
                  ]}
                />
                <View style={styles.mapPin}>
                  <Ionicons name="location" size={38} color="#ea4335" />
                  <View style={styles.mapPinDot} />
                </View>
              </View>
            );
          }
        } else if (m.role === 'restaurant') {
          elements.push(
            <View
              key={`rest_${idx}`}
              style={[styles.markerContainer, { left: pos.x - 18, top: pos.y - 36 }]}
            >
              <View style={styles.restBadge}>
                <Ionicons name="restaurant" size={17} color="#ffffff" />
              </View>
              <View style={styles.badgeTip} />
            </View>
          );
        } else if (m.role === 'customer') {
          elements.push(
            <View
              key={`dest_${idx}`}
              style={[styles.markerContainer, { left: pos.x - 16, top: pos.y - 32 }]}
            >
              <Ionicons name="location" size={32} color="#05a660" />
            </View>
          );
        }
      });

      // Default red location pointer at center if no explicit markers provided
      if (markers.length === 0 && center.latitude && center.longitude) {
        const centerPos = { x: effectiveW / 2 + panOffset.x, y: effectiveH / 2 + panOffset.y };
        elements.push(
          <View
            key="center_rider"
            style={[styles.pointerContainer, { left: centerPos.x - 55, top: centerPos.y - 68 }]}
          >
            {/* "Current Location" floating badge */}
            <View style={styles.locationPill}>
              <View style={styles.locationPillDot} />
              <Text style={styles.locationPillText}>Current Location</Text>
            </View>
            <View style={styles.locationPillArrow} />

            <Animated.View
              style={[
                styles.pulseShadow,
                {
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.5],
                      }),
                    },
                  ],
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0.6, 0.25, 0],
                  }),
                },
              ]}
            />
            <View style={styles.mapPin}>
              <Ionicons name="location" size={38} color="#ea4335" />
              <View style={styles.mapPinDot} />
            </View>
          </View>
        );
      }

      return elements;
    };

    const handleZoomIn = () => {
      const nextZ = Math.min(18, zoom + 1);
      setZoom(nextZ);
      if (gmapInstanceRef.current) {
        gmapInstanceRef.current.setZoom(nextZ);
      }
    };

    const handleZoomOut = () => {
      const nextZ = Math.max(12, zoom - 1);
      setZoom(nextZ);
      if (gmapInstanceRef.current) {
        gmapInstanceRef.current.setZoom(nextZ);
      }
    };

    const handleRecenter = () => {
      if (inputRegion?.latitude && inputRegion?.longitude) {
        const lat = Number(inputRegion.latitude);
        const lng = Number(inputRegion.longitude);
        setCenter({ latitude: lat, longitude: lng });
        setPanOffset({ x: 0, y: 0 });

        if (gmapInstanceRef.current) {
          gmapInstanceRef.current.panTo({ lat, lng });
        }
      }
    };

    const openExternalMaps = () => {
      const lat = center.latitude;
      const lng = center.longitude;
      const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      const nativeUrl = Platform.select({
        android: `google.navigation:q=${lat},${lng}&mode=d`,
        ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
        default: webUrl,
      });

      Linking.openURL(nativeUrl).catch(() => {
        Linking.openURL(webUrl).catch(() => {});
      });
    };

    const showWebGmaps = isWeb && gmapsReady;

    return (
      <View
        style={[styles.container, style]}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setSize({ width, height });
          }
        }}
        {...(!showWebGmaps ? panResponder.panHandlers : {})}
      >
        {/* Web Interactive Google Maps */}
        {showWebGmaps && (
          <div
            ref={mapContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              zIndex: 1,
            }}
          />
        )}

        {/* Mobile / Android / Web Fallback: High-Resolution Google Static Map Roadmap */}
        {!showWebGmaps && (
          <View style={styles.mapCanvasWrapper}>
            {/* Google Static Map Roadmap (Official Google Maps Platform) */}
            <Image
              source={{ uri: googleStaticMapUrl }}
              style={[
                styles.staticMapImage,
                size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : null,
                (panOffset.x !== 0 || panOffset.y !== 0)
                  ? {
                      transform: [
                        { translateX: panOffset.x },
                        { translateY: panOffset.y },
                      ],
                    }
                  : null,
              ]}
              resizeMode="cover"
              onLoadStart={() => setIsStaticLoading(true)}
              onLoadEnd={() => setIsStaticLoading(false)}
              onError={(err) => {
                console.log('[WebSafeMap] Static map load error:', err?.nativeEvent);
                setIsStaticLoading(false);
              }}
            />

            {/* Dynamic Rider, Restaurant & Customer Marker Overlays */}
            {renderMarkerOverlays()}
          </View>
        )}

        {/* Loading Spinner for Map Image */}
        {!showWebGmaps && isStaticLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#ff3815" />
            <Text style={styles.loadingText}>Connecting Google Maps...</Text>
          </View>
        )}

        {/* Zoom Controls (Top Right) */}
        <View style={styles.zoomControls}>
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={handleZoomIn}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoomBtn, { marginTop: 4 }]}
            onPress={handleZoomOut}
            activeOpacity={0.8}
          >
            <Ionicons name="remove" size={18} color="#111827" />
          </TouchableOpacity>
        </View>

        {/* Recenter Crosshairs (Bottom Right) */}
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={handleRecenter}
          activeOpacity={0.85}
        >
          <Ionicons name="locate" size={18} color="#ff3815" />
        </TouchableOpacity>

        {/* External Google Maps Button (Bottom Left) */}
        <TouchableOpacity
          style={styles.openMapsBtn}
          onPress={openExternalMaps}
          activeOpacity={0.85}
        >
          <Ionicons
            name="navigate-circle"
            size={14}
            color="#ffffff"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.openMapsText}>Google Maps</Text>
        </TouchableOpacity>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
    position: 'relative',
  },
  mapCanvasWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  staticMapImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
    marginLeft: 6,
  },
  pointerContainer: {
    position: 'absolute',
    width: 110,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 15,
    pointerEvents: 'none',
  },
  locationPill: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  locationPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#05a660',
    marginRight: 4,
  },
  locationPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
  },
  locationPillArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
    marginBottom: -2,
  },
  pulseShadow: {
    position: 'absolute',
    bottom: -4,
    width: 24,
    height: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(234, 67, 53, 0.45)',
    zIndex: 9,
  },
  mapPin: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
  mapPinDot: {
    position: 'absolute',
    top: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  markerContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ff3815',
  },
  riderBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ff3815',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  restBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  badgeTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#111827',
    alignSelf: 'center',
  },
  bikeAvatarContainer: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  bikeRadarPulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(66, 133, 244, 0.35)',
  },
  bikeAccuracyDot: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(66, 133, 244, 0.22)',
  },
  bikeAvatarDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  bikeForwardTip: {
    position: 'absolute',
    top: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderBottomWidth: 6,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
  },
  zoomControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  recenterBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 20,
  },
  openMapsBtn: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 20,
  },
  openMapsText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default MapView;
