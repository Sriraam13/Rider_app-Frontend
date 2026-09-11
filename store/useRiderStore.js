import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTokenGetter } from '../services/api';

const useRiderStore = create(
  persist(
    (set, get) => ({
      riderId: null,
      riderProfile: null,
      token: null,
      isAuthenticated: false,
      isOnline: false,
      isAvailable: false,

      activeAssignmentId: null,
      activeOrderId: null,
      activeDeliveryStatus: null,
      activeAssignment: null,

      restaurant: null,
      customerAddress: null,
      customerDetails: null,
      orderItems: [],

      currentLocation: null,
      locationTrackingActive: false,

      // Local UI state for features without backend tables yet
      documents: {
        aadhaarFront: null,
        aadhaarBack: null,
        pan: null,
        license: null,
      },
      bankDetails: {
        accountName: '',
        accountNumber: '',
        ifsc: '',
        bankName: 'HDFC Bank', // Default or user input
      },
      settings: {
        pushNotifications: true,
        autoAccept: false,
        darkTheme: false,
      },

      loginRider: (profile, token) => set({
        riderId: profile.id,
        riderProfile: profile,
        token: token || null,
        isAuthenticated: true,
        isOnline: profile.is_online || false,
        isAvailable: profile.is_available || false,
      }),

      logoutRider: () => set({
        riderId: null,
        riderProfile: null,
        token: null,
        isAuthenticated: false,
        isOnline: false,
        isAvailable: false,
        activeAssignmentId: null,
        activeOrderId: null,
        activeDeliveryStatus: null,
        activeAssignment: null,
        restaurant: null,
        customerAddress: null,
        customerDetails: null,
        orderItems: [],
        locationTrackingActive: false,
        currentLocation: null,
      }),

      setOnlineStatus: (status) => set({ isOnline: status, isAvailable: status }),

      setAvailability: (status) => set({ isAvailable: status }),

      setActiveAssignment: (assignmentData) => {
        if (!assignmentData) return;
        const deliveryAddr = assignmentData.delivery_address || {};
        const customerAddrStr = typeof deliveryAddr === 'string'
          ? deliveryAddr
          : (assignmentData.customer_address || deliveryAddr.address_line || deliveryAddr.full_address || '');

        const rest = assignmentData.restaurant || {
          name: assignmentData.restaurant_name,
          address: assignmentData.restaurant_address,
          latitude: assignmentData.restaurant_latitude || null,
          longitude: assignmentData.restaurant_longitude || null,
        };

        set({
          activeAssignmentId: assignmentData.assignment_id || assignmentData.id,
          activeOrderId: assignmentData.order_id,
          activeDeliveryStatus: assignmentData.status,
          activeAssignment: assignmentData,
          restaurant: rest,
          customerAddress: customerAddrStr,
          customerDetails: {
            name: assignmentData.customer_name || deliveryAddr.contact_name || 'Customer',
            phone: assignmentData.customer_phone || deliveryAddr.contact_phone || '',
            address: customerAddrStr,
            latitude: deliveryAddr.latitude != null ? Number(deliveryAddr.latitude) : (assignmentData.customer_latitude != null ? Number(assignmentData.customer_latitude) : null),
            longitude: deliveryAddr.longitude != null ? Number(deliveryAddr.longitude) : (assignmentData.customer_longitude != null ? Number(assignmentData.customer_longitude) : null),
            landmark: deliveryAddr.landmark || '',
            instructions: deliveryAddr.instructions || assignmentData.delivery_instructions || '',
          },
          orderItems: assignmentData.items || [],
        });
      },

      updateDeliveryStatus: (status) => set({ activeDeliveryStatus: status }),

      clearActiveAssignment: () => set({
        activeAssignmentId: null,
        activeOrderId: null,
        activeDeliveryStatus: null,
        activeAssignment: null,
        restaurant: null,
        customerAddress: null,
        customerDetails: null,
        orderItems: [],
      }),

      setCurrentLocation: (location) => set({ currentLocation: location }),

      startTracking: () => set({ locationTrackingActive: true }),

      stopTracking: () => set({ locationTrackingActive: false }),

      updateDocuments: (docs) => set((state) => ({ documents: { ...state.documents, ...docs } })),
      updateBankDetails: (details) => set((state) => ({ bankDetails: { ...state.bankDetails, ...details } })),
      updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
    }),
    {
      name: 'rider-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist auth + active assignment — not ephemeral location/UI state
      partialize: (state) => ({
        riderId: state.riderId,
        riderProfile: state.riderProfile,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        isOnline: state.isOnline,
        isAvailable: state.isAvailable,
        activeAssignmentId: state.activeAssignmentId,
        activeOrderId: state.activeOrderId,
        activeDeliveryStatus: state.activeDeliveryStatus,
        activeAssignment: state.activeAssignment,
        restaurant: state.restaurant,
        customerAddress: state.customerAddress,
        customerDetails: state.customerDetails,
        orderItems: state.orderItems,
        documents: state.documents,
        bankDetails: state.bankDetails,
        settings: state.settings,
      }),
      // After rehydration, re-register the token getter so all API calls are authenticated
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          const token = state.token;
          setTokenGetter(() => token);
        }
      },
    }
  )
);

export default useRiderStore;
