import React from 'react';
import { View } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const MapView = ({ style, initialRegion, children }) => {
  const lat = initialRegion?.latitude;
  const lng = initialRegion?.longitude;

  let origin = null;
  let destination = null;

  React.Children.forEach(children, (child) => {
    if (child && child.props && child.props.coordinates && Array.isArray(child.props.coordinates) && child.props.coordinates.length >= 2) {
      origin = child.props.coordinates[0];
      destination = child.props.coordinates[child.props.coordinates.length - 1];
    }
  });

  let iframeSrc = "";
  if (origin && destination && origin.latitude && destination.latitude) {
    iframeSrc = `https://www.google.com/maps/embed/v1/directions?key=${API_KEY}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving`;
  } else if (lat && lng) {
    iframeSrc = `https://www.google.com/maps/embed/v1/place?key=${API_KEY}&q=${lat},${lng}&zoom=15`;
  }

  return (
    <View style={[style, { backgroundColor: '#e5e5e5', overflow: 'hidden' }]}>
      <iframe
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        allowFullScreen
        src={iframeSrc}
      />
    </View>
  );
};

const Marker = () => null;
const Polyline = () => null;
const PROVIDER_GOOGLE = 'google';

export { MapView, Marker, Polyline, PROVIDER_GOOGLE };
export default MapView;
