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
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

export const PROVIDER_GOOGLE = 'google';

/**
 * Standard Marker and Polyline wrappers to match react-native-maps interface
 */
export const Marker = ({ coordinate, title, children, rotation, ...props }) => {
  return null;
};

export const Polyline = ({ coordinates, strokeColor, strokeWidth, ...props }) => {
  return null;
};

// ── Web Mercator Mathematical Projection ─────────────────────────────────────
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
 * Dynamic Moving Map Component
 * Pure React Native — Zero native binary dependencies, runs everywhere smoothly.
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
    const initialLat = inputRegion?.latitude || 13.035;
    const initialLng = inputRegion?.longitude || 80.197;

    const [center, setCenter] = useState({
      latitude: initialLat,
      longitude: initialLng,
    });
    const [zoom, setZoom] = useState(16);
    const [size, setSize] = useState({ width: 0, height: 0 });

    // Interactive Drag / Pan State
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

    // Sync incoming region from parent (live GPS coordinates from store)
    useEffect(() => {
      if (
        inputRegion?.latitude != null &&
        inputRegion?.longitude != null &&
        (inputRegion.latitude !== center.latitude ||
          inputRegion.longitude !== center.longitude)
      ) {
        setCenter({
          latitude: Number(inputRegion.latitude),
          longitude: Number(inputRegion.longitude),
        });
        setPanOffset({ x: 0, y: 0 });
      }
    }, [inputRegion?.latitude, inputRegion?.longitude]);

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

    // Expose camera methods to parent screens
    useImperativeHandle(ref, () => ({
      animateCamera: cam => {
        if (cam?.center?.latitude != null && cam?.center?.longitude != null) {
          setCenter({
            latitude: Number(cam.center.latitude),
            longitude: Number(cam.center.longitude),
          });
          setPanOffset({ x: 0, y: 0 });
        }
        if (cam?.zoom) {
          setZoom(Math.max(12, Math.min(18, Math.round(cam.zoom))));
        }
      },
      fitToCoordinates: (coords, options) => {
        if (!coords || coords.length === 0) return;
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

        let targetZoom = 16;
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
          setCenter({
            latitude: Number(reg.latitude),
            longitude: Number(reg.longitude),
          });
          setPanOffset({ x: 0, y: 0 });
        }
      },
    }));

    // PanResponder to allow natural dragging & exploration of the map
    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (evt, gesture) =>
            Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
          onPanResponderGrant: () => {},
          onPanResponderMove: (evt, gesture) => {
            setPanOffset({
              x: panOffsetRef.current.x + gesture.dx * 0.15,
              y: panOffsetRef.current.y + gesture.dy * 0.15,
            });
          },
          onPanResponderRelease: (evt, gesture) => {
            // Commit drag offset into new center coordinates
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
              setPanOffset({ x: 0, y: 0 });
            }
          },
        }),
      []
    );

    // Render seamless grid of map tiles
    const renderTiles = () => {
      const { width, height } = size;
      if (width <= 0 || height <= 0) return null;

      const centerWorld = latLngToWorld(center.latitude, center.longitude, zoom);
      const effectiveWorldX = centerWorld.x - panOffset.x;
      const effectiveWorldY = centerWorld.y - panOffset.y;

      const centerTileX = Math.floor(effectiveWorldX / TILE_SIZE);
      const centerTileY = Math.floor(effectiveWorldY / TILE_SIZE);

      const offsetX = width / 2 - (effectiveWorldX - centerTileX * TILE_SIZE);
      const offsetY = height / 2 - (effectiveWorldY - centerTileY * TILE_SIZE);

      const cols = Math.ceil(width / TILE_SIZE / 2) + 1;
      const rows = Math.ceil(height / TILE_SIZE / 2) + 1;

      const tiles = [];
      const maxTile = Math.pow(2, zoom);

      for (let dx = -cols; dx <= cols; dx++) {
        for (let dy = -rows; dy <= rows; dy++) {
          const tx = (centerTileX + dx + maxTile) % maxTile;
          const ty = centerTileY + dy;
          if (ty < 0 || ty >= maxTile) continue;

          const sub = ['a', 'b', 'c', 'd'][Math.abs(tx + ty) % 4];
          const uri = `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`;
          const left = offsetX + dx * TILE_SIZE;
          const top = offsetY + dy * TILE_SIZE;

          tiles.push(
            <Image
              key={`${zoom}_${tx}_${ty}`}
              source={{ uri }}
              style={{
                position: 'absolute',
                left,
                top,
                width: TILE_SIZE,
                height: TILE_SIZE,
              }}
              resizeMode="cover"
            />
          );
        }
      }
      return tiles;
    };

    // Render real road polyline from Google Routes API
    const renderPolyline = () => {
      const { width, height } = size;
      if (width <= 0 || height <= 0 || !routeCoords || routeCoords.length < 2)
        return null;

      // Downsample large point sets so drawing is smooth and performant
      const step = routeCoords.length > 120 ? Math.ceil(routeCoords.length / 80) : 1;
      const sampled = [];
      for (let i = 0; i < routeCoords.length; i += step) {
        sampled.push(routeCoords[i]);
      }
      if (sampled[sampled.length - 1] !== routeCoords[routeCoords.length - 1]) {
        sampled.push(routeCoords[routeCoords.length - 1]);
      }

      const segments = [];
      for (let i = 0; i < sampled.length - 1; i++) {
        const p1 = latLngToScreen(
          sampled[i].latitude,
          sampled[i].longitude,
          center.latitude,
          center.longitude,
          zoom,
          width,
          height,
          panOffset.x,
          panOffset.y
        );
        const p2 = latLngToScreen(
          sampled[i + 1].latitude,
          sampled[i + 1].longitude,
          center.latitude,
          center.longitude,
          zoom,
          width,
          height,
          panOffset.x,
          panOffset.y
        );

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.hypot(dx, dy);
        if (length < 1) continue;

        const angle = Math.atan2(dy, dx);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        segments.push(
          <View
            key={`poly_${i}`}
            style={{
              position: 'absolute',
              left: midX - length / 2,
              top: midY - 2.5,
              width: length,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: '#ff3815',
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      }
      return segments;
    };

    // Render dynamic live markers
    const renderMarkers = () => {
      const { width, height } = size;
      if (width <= 0 || height <= 0) return null;

      const elements = [];

      markers.forEach((m, idx) => {
        const pos = latLngToScreen(
          m.latitude,
          m.longitude,
          center.latitude,
          center.longitude,
          zoom,
          width,
          height,
          panOffset.x,
          panOffset.y
        );

        if (m.role === 'rider') {
          // Dynamic live rider motorcycle marker with pulse wave
          elements.push(
            <View
              key={`rider_${idx}`}
              style={[styles.markerContainer, { left: pos.x - 22, top: pos.y - 22 }]}
            >
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    transform: [
                      {
                        scale: pulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1.8],
                        }),
                      },
                    ],
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 0.4, 1],
                      outputRange: [0.7, 0.35, 0],
                    }),
                  },
                ]}
              />
              <View
                style={[
                  styles.riderBadge,
                  { transform: [{ rotate: `${m.rotation || 0}deg` }] },
                ]}
              >
                <MaterialIcons name="motorcycle" size={20} color="#ffffff" />
              </View>
            </View>
          );
        } else if (m.role === 'restaurant') {
          // Restaurant marker with icon badge
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
        } else {
          // Customer / destination pin
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

      // If no explicit rider marker was provided but center is set, show standard location pin
      if (markers.length === 0 && center.latitude && center.longitude) {
        const centerPos = latLngToScreen(
          center.latitude,
          center.longitude,
          center.latitude,
          center.longitude,
          zoom,
          width,
          height,
          panOffset.x,
          panOffset.y
        );
        elements.push(
          <View
            key="center_pin"
            style={[styles.markerContainer, { left: centerPos.x - 18, top: centerPos.y - 36 }]}
          >
            <Ionicons name="location" size={36} color="#ff471a" />
          </View>
        );
      }

      return elements;
    };

    const handleZoomIn = () => {
      setZoom(z => Math.min(18, z + 1));
    };

    const handleZoomOut = () => {
      setZoom(z => Math.max(12, z - 1));
    };

    const handleRecenter = () => {
      if (inputRegion?.latitude && inputRegion?.longitude) {
        setCenter({
          latitude: Number(inputRegion.latitude),
          longitude: Number(inputRegion.longitude),
        });
        setPanOffset({ x: 0, y: 0 });
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

    return (
      <View
        style={[styles.container, style]}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setSize({ width, height });
          }
        }}
        {...panResponder.panHandlers}
      >
        {/* Slippy Tile Layer */}
        {renderTiles()}

        {/* Real Road Polyline */}
        {renderPolyline()}

        {/* Live Markers */}
        {renderMarkers()}

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
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    position: 'relative',
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
