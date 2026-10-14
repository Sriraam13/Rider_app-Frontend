import { Platform } from 'react-native';

const RIDER_TOKEN_KEY = 'data_udipi_rider_access_token';

// In-memory token cache for synchronous access
let _memoryToken = null;
let _secureStore = null;
let _hasCheckedSecureStore = false;

/**
 * Checks whether native ExpoSecureStore module is compiled into the binary
 * WITHOUT triggering requireNativeModule exception.
 */
function checkNativeSecureStoreAvailable() {
  if (Platform.OS === 'web') return false;
  try {
    if (globalThis?.expo?.modules?.ExpoSecureStore) {
      return true;
    }
    const { requireOptionalNativeModule } = require('expo-modules-core');
    if (typeof requireOptionalNativeModule === 'function') {
      const nativeMod = requireOptionalNativeModule('ExpoSecureStore');
      return !!nativeMod;
    }
  } catch (e) {
    return false;
  }
  return false;
}

function getSecureStore() {
  if (_hasCheckedSecureStore) {
    return _secureStore;
  }
  _hasCheckedSecureStore = true;

  if (Platform.OS === 'web') {
    return null;
  }

  // If the native module is not in the running APK binary, do NOT require the package
  // to prevent Metro from executing ExpoSecureStore.js and throwing requireNativeModule error
  if (!checkNativeSecureStoreAvailable()) {
    console.warn(
      '[authStorage] Native module "ExpoSecureStore" is not present in this client build. ' +
      'Using secure AsyncStorage/memory fallback.'
    );
    _secureStore = null;
    return null;
  }

  try {
    const mod = require('expo-secure-store');
    if (mod && typeof mod.setItemAsync === 'function') {
      _secureStore = mod;
    }
  } catch (err) {
    _secureStore = null;
  }
  return _secureStore;
}

let _asyncStorage = null;
function getAsyncStorage() {
  if (_asyncStorage) return _asyncStorage;
  try {
    _asyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch {
    _asyncStorage = null;
  }
  return _asyncStorage;
}

export const saveToken = async (token) => {
  if (!token) return false;
  _memoryToken = token;

  const store = getSecureStore();
  if (store) {
    try {
      await store.setItemAsync(RIDER_TOKEN_KEY, token, {
        keychainAccessible: store.AFTER_FIRST_UNLOCK,
      });
      return true;
    } catch (err) {
      console.error('Error saving token to SecureStore:', err?.message || err);
    }
  }

  // Graceful fallback when native SecureStore binary module is not linked
  const fallbackStorage = getAsyncStorage();
  if (fallbackStorage) {
    try {
      await fallbackStorage.setItem(RIDER_TOKEN_KEY, token);
      return true;
    } catch (err) {
      console.error('Error saving token to fallback storage:', err?.message || err);
    }
  }

  return true;
};

export const getToken = async () => {
  if (_memoryToken) {
    return _memoryToken;
  }

  const store = getSecureStore();
  if (store) {
    try {
      const storedToken = await store.getItemAsync(RIDER_TOKEN_KEY);
      if (storedToken) {
        _memoryToken = storedToken;
        return storedToken;
      }
    } catch (err) {
      console.error('Error reading token from SecureStore:', err?.message || err);
    }
  }

  // Graceful fallback when native SecureStore binary module is not linked
  const fallbackStorage = getAsyncStorage();
  if (fallbackStorage) {
    try {
      const storedToken = await fallbackStorage.getItem(RIDER_TOKEN_KEY);
      if (storedToken) {
        _memoryToken = storedToken;
        return storedToken;
      }
    } catch (err) {
      console.error('Error reading token from fallback storage:', err?.message || err);
    }
  }

  return _memoryToken;
};

export const deleteToken = async () => {
  _memoryToken = null;

  const store = getSecureStore();
  if (store) {
    try {
      await store.deleteItemAsync(RIDER_TOKEN_KEY);
    } catch (err) {
      console.error('Error deleting token from SecureStore:', err?.message || err);
    }
  }

  const fallbackStorage = getAsyncStorage();
  if (fallbackStorage) {
    try {
      await fallbackStorage.removeItem(RIDER_TOKEN_KEY);
    } catch (err) {
      console.error('Error deleting token from fallback storage:', err?.message || err);
    }
  }

  return true;
};

export const getCachedTokenSync = () => _memoryToken;
