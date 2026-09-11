import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import useRiderStore from '../store/useRiderStore';

const getBaseUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:8002`;
  }
  
  // Dynamically extract the computer's dev IP from Expo bundler connection
  const hostUri = 
    Constants.expoConfig?.hostUri || 
    Constants.manifest2?.extra?.expoGo?.debuggerHost || 
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const devHost = hostUri.split(':')[0];
    if (devHost) {
      return `http://${devHost}:8002`;
    }
  }

  // Active Wi-Fi IPv4 fallback
  return 'http://10.66.204.246:8002';
};

const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Token Injection ---
// Dynamically inject the JWT token from the store before each request
let _getToken = null;
export const setTokenGetter = (getter) => { _getToken = getter; };

api.interceptors.request.use((config) => {
  const token = (_getToken ? _getToken() : null) || useRiderStore.getState().token;
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// --- Response Error Handling ---
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
export const setOnlineStatus = (is_online) => api.put(`/api/v1/riders/me/status`, { is_online });
export const getVehicleInfo = () => api.get('/api/v1/riders/me/vehicle');
export const updateVehicleInfo = (data) => api.patch('/api/v1/riders/me/vehicle', data);

// Delivery Requests
export const getDeliveryRequests = () => api.get('/api/v1/rider/delivery-requests');
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

export const updateRiderStatus = async (isOnline) => {
  try {
    const response = await setOnlineStatus(isOnline);
    return response.data;
  } catch (error) {
    console.error('Error updating rider status:', error);
    throw error;
  }
};

export default api;
