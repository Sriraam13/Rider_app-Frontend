const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg";

export default {
  "expo": {
    "name": "MaitreD Rider",
    "slug": "mobile-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.maitred.rider",
      "config": {
        "googleMapsApiKey": GOOGLE_MAPS_API_KEY
      },
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Allow MaitreD Rider to access your location to track deliveries.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Allow MaitreD Rider to access your location to track deliveries in the background.",
        "NSCameraUsageDescription": "Allow MaitreD Rider to access camera to take verification photos.",
        "NSPhotoLibraryUsageDescription": "Allow MaitreD Rider to access photos for verification documents."
      }
    },
    "android": {
      "package": "com.maitred.rider",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "config": {
        "googleMaps": {
          "apiKey": GOOGLE_MAPS_API_KEY
        }
      },
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-status-bar",
      "expo-font",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow MaitreD Rider to access your location to track deliveries."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow MaitreD Rider to access your photos for document verification.",
          "cameraPermission": "Allow MaitreD Rider to access your camera to take delivery verification photos."
        }
      ],
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "76cb360d-7b63-43c6-8586-4c1fd0c3d8be"
      }
    }
  }
}
