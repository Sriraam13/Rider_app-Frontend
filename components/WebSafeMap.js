import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Linking, Platform, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TILE = 256;
const TILE_ZOOM = 16;

// Stitches raster tiles around a coordinate (no API key required)
const TileMosaic = ({ lat, lng, width, height }) => {
  const n = Math.pow(2, TILE_ZOOM);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const offX = width / 2 - (x - tx) * TILE;
  const offY = height / 2 - (y - ty) * TILE;
  const cols = Math.ceil(width / TILE / 2) + 1;
  const rows = Math.ceil(height / TILE / 2) + 1;
  const tiles = [];
  for (let dx = -cols; dx <= cols; dx++) {
    for (let dy = -rows; dy <= rows; dy++) {
      const sub = ['a', 'b', 'c'][Math.abs(dx + dy) % 3];
      tiles.push(
        <Image
          key={`${dx}_${dy}`}
          source={{ uri: `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${TILE_ZOOM}/${tx + dx}/${ty + dy}.png` }}
          style={{ position: 'absolute', width: TILE, height: TILE, left: offX + dx * TILE, top: offY + dy * TILE }}
        />
      );
    }
  }
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {tiles}
      <View style={{ position: 'absolute', left: width / 2 - 14, top: height / 2 - 28 }}>
        <Ionicons name="location" size={28} color="#ff471a" />
      </View>
    </View>
  );
};

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';

const USE_NATIVE_MAP = process.env.EXPO_PUBLIC_USE_NATIVE_MAP === 'true';

let RNMapView = null;
let RNMarker = null;
let RNPolyline = null;
let RN_PROVIDER_GOOGLE = null;

if (USE_NATIVE_MAP && Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    RNMapView = maps.default || maps.MapView;
    RNMarker = maps.Marker;
    RNPolyline = maps.Polyline;
    RN_PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (e) {
    RNMapView = null;
  }
}

export const PROVIDER_GOOGLE = RN_PROVIDER_GOOGLE || 'google';

export const Marker = ({ coordinate, title, children, ...props }) => {
  if (RNMarker) {
    return <RNMarker coordinate={coordinate} title={title} {...props}>{children}</RNMarker>;
  }
  return null;
};

export const Polyline = ({ coordinates, ...props }) => {
  if (RNPolyline) {
    return <RNPolyline coordinates={coordinates} {...props} />;
  }
  return null;
};

export const MapView = forwardRef(({
  style,
  region,
  initialRegion,
  children,
  onPress,
  ...props
}, ref) => {
  const currentRegion = region || initialRegion;
  const lat = currentRegion?.latitude || 13.3409;
  const lng = currentRegion?.longitude || 74.7421;

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Google Static Map URL using user's API key
  const googleMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;

  useEffect(() => {
    setIsLoading(true);
    setLoadFailed(false);
  }, [lat, lng, GOOGLE_MAPS_API_KEY]);

  useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    fitToCoordinates: () => {},
    animateCamera: () => {},
  }));

  if (USE_NATIVE_MAP && RNMapView) {
    return (
      <RNMapView
        ref={ref}
        style={style}
        region={region}
        initialRegion={initialRegion}
        {...props}
      >
        {children}
      </RNMapView>
    );
  }

  const openExternalMaps = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(Your+Location)`,
    }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      }}
    >
      <TouchableOpacity
        style={styles.touchable}
        activeOpacity={0.9}
        onPress={onPress || openExternalMaps}
      >
        <Image
          key={googleMapUrl}
          source={{ uri: googleMapUrl }}
          style={styles.mapImage}
          resizeMode="cover"
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
            setLoadFailed(false);
          }}
          onError={(err) => {
            console.warn('[WebSafeMap] Google Static Map load failed:', err?.nativeEvent);
            setIsLoading(false);
            setLoadFailed(true);
          }}
        />

        {loadFailed && (
          <TileMosaic
            lat={lat}
            lng={lng}
            width={size.width || 350}
            height={size.height || 130}
          />
        )}
      </TouchableOpacity>

      {isLoading && !loadFailed && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#ff471a" />
          <Text style={styles.loadingText}>Loading Map...</Text>
        </View>
      )}

      {/* Floating pill on bottom-left so it NEVER collides with locateBtn on bottom-right */}
      <TouchableOpacity
        style={styles.openMapsBtn}
        onPress={openExternalMaps}
        activeOpacity={0.8}
      >
        <Ionicons name="map" size={13} color="#fff" style={{ marginRight: 4 }} />
        <Text style={styles.openMapsText}>Google Maps</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    position: 'relative',
  },
  touchable: {
    width: '100%',
    height: '100%',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  openMapsBtn: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
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
  },
  openMapsText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default MapView;
