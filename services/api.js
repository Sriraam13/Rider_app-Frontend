import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (__DEV__) {
    // Only in development: fallback logic
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname || 'localhost';
      return `http://${host}:8001`;
    }

    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants.manifest?.debuggerHost;

    if (hostUri) {
      const devHost = hostUri.split(':')[0];
      if (devHost) {
        return `http://${devHost}:8001`;
      }
    }
    // Active Wi-Fi IPv4 fallback (development only)
    return 'http://10.66.204.246:8001';
  }

  // In production, EXPO_PUBLIC_API_URL is mandatory
  throw new Error("EXPO_PUBLIC_API_URL is required for production");
};

const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Token Injection ---
// Dynamically inject the JWT token from the store before each request
let _getToken = null;
export const setTokenGetter = (getter) => { _getToken = getter; };

api.interceptors.request.use((config) => {
  const token = _getToken ? _getToken() : null;
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// --- Response Error Handling ---
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        console.warn("API Error 401: Unauthorized. Session may be invalid.");
      } else if (status === 403) {
        console.warn("API Error 403: Forbidden.");
      } else if (status === 404) {
        console.warn("API Error 404: Not Found.");
      } else if (status === 422) {
        console.warn("API Error 422: Validation Error.");
      } else if (status >= 500) {
        console.warn(`API Error ${status}: Internal Server Error.`);
      }
    } else if (error.request) {
      console.warn("API Error: Network timeout or no response.");
    }
    return Promise.reject(error);
  }
);

// Auth
export const authLogin = (phone, password = '1234') =>
  api.post('/api/v1/rider/auth/login', { phone, password });

export const authLogout = () => api.post('/api/v1/rider/auth/logout');

// Rider profile & Status
export const getRiderMe = () => api.get('/api/v1/riders/me');
export const updateRiderProfile = (data) => api.patch('/api/v1/riders/me', data);
export const setOnlineStatus = (riderId, is_online) => api.patch(`/api/v1/delivery-partners/${riderId}/online-status`, { is_online });
export const setAvailability = (riderId, is_available) => api.patch(`/api/v1/delivery-partners/${riderId}/availability`, { is_available });
export const getVehicleInfo = () => api.get('/api/v1/riders/me/vehicle');
export const updateVehicleInfo = (data) => api.patch('/api/v1/riders/me/vehicle', data);

// Delivery Requests
export const getDeliveryRequests = () => api.get('/api/v1/rider/delivery-requests');
export const getAvailableOrders = () => api.get('/api/v1/rider/available-orders');
export const acceptAvailableOrder = (orderId) => api.post(`/api/v1/rider/available-orders/${orderId}/accept`);
export const getCurrentDelivery = () => api.get('/api/v1/rider/deliveries/current');
export const getDeliveryAssignment = (assignmentId) => api.get(`/api/v1/rider/deliveries/${assignmentId}`);

// Assignment Actions
export const acceptAssignment = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/accept`);
export const rejectAssignment = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/reject`);
export const goTowardRestaurant = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/going-to-restaurant`);
export const arriveAtRestaurant = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/arrived-restaurant`);
export const pickupOrder = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/pickup`);
export const arriveAtCustomer = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/arrived-customer`);
export const deliverOrder = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/delivered`);
export const failDelivery = (assignmentId, reason) => api.post(`/api/v1/delivery/assignments/${assignmentId}/failed`, { reason });
export const cancelDelivery = (assignmentId) => api.post(`/api/v1/delivery/assignments/${assignmentId}/cancel`);

// Location
export const updateRiderLocation = (data) => api.post(`/api/v1/riders/me/location`, data);
export const getRiderLocation = () => api.get(`/api/v1/riders/me/location`);

// Tracking & History
export const getOrderTracking = (orderId) => api.get(`/api/v1/public/orders/${orderId}/tracking`);
export const getDeliveryHistory = () => api.get('/api/v1/rider/deliveries/history');
export const getEarningsSummary = () => api.get('/api/v1/rider/stats');
export const getEarningsHistory = () => api.get('/api/v1/rider/earnings/history');

export const updateRiderStatus = async (riderId, isOnline) => {
  try {
    const response = await setOnlineStatus(riderId, isOnline);
    return response.data;
  } catch (error) {
    console.error('Error updating rider status:', error);
    throw error;
  }
};

export const getRiderDocuments = () => api.get('/api/v1/riders/me/documents');
export const updateRiderDocuments = (data) => api.patch('/api/v1/riders/me/documents', data);

export const getRiderBankDetails = () => api.get('/api/v1/riders/me/bank-details');
export const updateRiderBankDetails = (data) => api.patch('/api/v1/riders/me/bank-details', data);

export default api;
