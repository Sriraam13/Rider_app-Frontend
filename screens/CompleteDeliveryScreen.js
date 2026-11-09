import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { deliverOrder, failDelivery, getOrderTracking } from '../services/api';
import { stopLocationTracking } from '../services/location';
import { calculateDeliverySplit } from '../services/riderPayoutLogic';

export default function CompleteDeliveryScreen({ navigation, route: routeParam }) {
  const activeAssignmentId = useRiderStore(s => s.activeAssignmentId);
  const activeOrderId = useRiderStore(s => s.activeOrderId);
  const clearActiveAssignment = useRiderStore(s => s.clearActiveAssignment);
  const setAvailability = useRiderStore(s => s.setAvailability);
  // deliveryDistanceKm is passed from CustomerNavigationScreen (restaurant→customer road distance)
  const deliveryDistanceKm = routeParam?.params?.deliveryDistanceKm ?? null;
  const [loading, setLoading] = useState(false);
  const [failLoading, setFailLoading] = useState(false);
  const [orderData, setOrderData] = useState(null);

  // MaitreD Financial Split:
  // Customer delivery fee: Rs. 60
  // Clean split: Rider gets 45, 12 for ESI/PF/Insurance, 3 for platform fee (Rs. 1 per km)
  const tipAmount = orderData?.tip_amount ? parseFloat(orderData.tip_amount) : 0;
  const split = calculateDeliverySplit(deliveryDistanceKm, tipAmount);
  const earnedAmount = split.totalRiderPayout;

  useEffect(() => {
    if (activeOrderId) {
      getOrderTracking(activeOrderId)
        .then((res) => {
          if (res.data) setOrderData(res.data);
        })
        .catch(console.error);
    }
  }, [activeOrderId]);

  const handleConfirmDelivery = async () => {
    if (!activeAssignmentId) return;
    setLoading(true);
    try {
      await deliverOrder(activeAssignmentId, deliveryDistanceKm);
      
      const trip = useRiderStore.getState().activeTrip || { assignments: [] };
      const remaining = trip.assignments.filter(a => (a.assignment_id || a.id) !== activeAssignmentId);
      
      useRiderStore.getState().completeCurrentAssignment();
      
      if (remaining.length === 0) {
        // Stop GPS tracking immediately — all deliveries are complete
        stopLocationTracking();
        useRiderStore.getState().setAvailability(true);
      }
      
      navigation.replace('DeliveryComplete', { orderData, deliveryDistanceKm, earnedAmount, split, hasMoreOrders: remaining.length > 0 });
    } catch (err) {
      console.error('Deliver order error:', err);
      const detail = err?.response?.data?.detail || 'Could not confirm delivery. Please try again.';
      Alert.alert('Delivery Failed', detail);
    } finally {
      setLoading(false);
    }
  };

  const handleFailDelivery = () => {
    Alert.alert(
      'Mark as Failed',
      'Are you sure you cannot complete this delivery?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Mark Failed',
          style: 'destructive',
          onPress: async () => {
            setFailLoading(true);
            try {
              await failDelivery(activeAssignmentId, 'CUSTOMER_UNAVAILABLE');
              
              const trip = useRiderStore.getState().activeTrip || { assignments: [] };
              const remaining = trip.assignments.filter(a => (a.assignment_id || a.id) !== activeAssignmentId);
              
              useRiderStore.getState().completeCurrentAssignment();
              
              if (remaining.length === 0) {
                stopLocationTracking();
                useRiderStore.getState().setAvailability(true);
              }
              
              navigation.replace('Dashboard');
            } catch (err) {
              console.error('Fail delivery error:', err);
              const detail = err?.response?.data?.detail || 'Could not mark delivery as failed.';
              Alert.alert('Error', detail);
            } finally {
              setFailLoading(false);
            }
          },
        },
      ]
    );
  };

  const customerName = orderData?.delivery_address?.contact_name || 'Customer';
  const customerAddress =
    orderData?.delivery_address?.full_address ||
    orderData?.delivery_address?.address_line ||
    null;

  const customerPhone = orderData?.delivery_address?.contact_phone || null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Complete Delivery</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Deliver To Card */}
        <View style={styles.deliverToCard}>
          <Text style={styles.deliverToLabel}>DELIVER TO</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          {customerAddress ? (
            <Text style={styles.customerAddress}>{customerAddress}</Text>
          ) : null}
          {customerPhone ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={14} color="#6b7280" style={{ marginRight: 6 }} />
              <Text style={styles.customerPhone}>{customerPhone}</Text>
            </View>
          ) : null}
        </View>

        {/* Delivery Fee & Clean Split Card */}
        <View style={styles.earningCard}>
          <View style={styles.splitHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="receipt-outline" size={18} color="#05a660" style={{ marginRight: 6 }} />
              <Text style={styles.splitHeaderTitle}>DELIVERY FEE SPLIT</Text>
            </View>
            <Text style={styles.splitDeliveryFeeTotal}>₹{split.deliveryFee}.00</Text>
          </View>
          <Text style={styles.splitSubText}>Customer paid delivery fee of ₹{split.deliveryFee}.00</Text>

          <View style={styles.splitDivider} />

          <View style={styles.earningRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="wallet-outline" size={15} color="#05a660" style={{ marginRight: 6 }} />
              <Text style={[styles.earningLabel, { fontWeight: '700', color: '#111' }]}>Rider Take-Home</Text>
            </View>
            <Text style={[styles.earningValue, { color: '#05a660', fontWeight: '900' }]}>₹{split.riderTakeHome}.00</Text>
          </View>

          <View style={styles.earningRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#0369a1" style={{ marginRight: 6 }} />
              <Text style={styles.earningLabel}>ESI, PF & Insurance</Text>
            </View>
            <Text style={styles.earningValue}>₹{split.esiPfInsurance}.00</Text>
          </View>

          <View style={styles.earningRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="business-outline" size={15} color="#6b7280" style={{ marginRight: 6 }} />
              <Text style={styles.earningLabel}>Platform Fee (Rs. 1/km)</Text>
            </View>
            <Text style={styles.earningValue}>₹{split.platformFee}.00</Text>
          </View>

          {split.tipAmount > 0 && (
            <View style={styles.earningRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="gift-outline" size={15} color="#ff471a" style={{ marginRight: 6 }} />
                <Text style={[styles.earningLabel, { color: '#ff471a', fontWeight: '700' }]}>Customer Tip</Text>
              </View>
              <Text style={[styles.earningValue, { color: '#ff471a', fontWeight: '900' }]}>+₹{split.tipAmount.toFixed(2)}</Text>
            </View>
          )}

          {deliveryDistanceKm != null && (
            <View style={[styles.earningRow, { marginTop: 4 }]}>
              <Text style={[styles.earningLabel, { fontSize: 12, color: '#9ca3af' }]}>Trip Distance</Text>
              <Text style={[styles.earningValue, { fontSize: 12, color: '#9ca3af', fontWeight: '600' }]}>
                {deliveryDistanceKm.toFixed(1)} km
              </Text>
            </View>
          )}

          <View style={[styles.earningRow, { borderTopWidth: 1, borderTopColor: '#bbf7d0', marginTop: 10, paddingTop: 10 }]}>
            <Text style={[styles.earningLabel, { fontWeight: '900', color: '#111', fontSize: 15 }]}>Total Rider Payout</Text>
            <Text style={[styles.earningValue, { color: '#05a660', fontSize: 22, fontWeight: '900' }]}>₹{earnedAmount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Contactless Option */}
        <View style={styles.contactlessBox}>
          <Text style={styles.contactlessTitle}>CONTACTLESS OPTION</Text>
          <Text style={styles.contactlessDesc}>
            If requested, leave package at door or with guard and take a confirmation photo.
          </Text>
          <TouchableOpacity style={styles.btnTakePhotos}>
            <Ionicons name="camera-outline" size={18} color="#6b7280" style={{ marginRight: 8 }} />
            <Text style={styles.btnTakePhotosText}>Take Delivery Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Customer Unavailable */}
        <TouchableOpacity
          style={styles.unavailableRow}
          onPress={handleFailDelivery}
          disabled={failLoading || loading}
        >
          {failLoading ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.unavailableText}>Customer unavailable? Mark as failed</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnConfirm, loading && { opacity: 0.7 }]}
          onPress={handleConfirmDelivery}
          disabled={loading || failLoading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.btnConfirmText}>Confirm Delivery Complete ✓</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },

  scrollContent: { padding: 20, paddingBottom: 40 },

  earningCard: {
    borderWidth: 1, borderColor: '#dcfce7', borderRadius: 16,
    padding: 16, marginBottom: 20, backgroundColor: '#f0fdf4',
  },
  splitHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2,
  },
  splitHeaderTitle: {
    fontSize: 12, fontWeight: '900', color: '#166534', letterSpacing: 0.5,
  },
  splitDeliveryFeeTotal: {
    fontSize: 18, fontWeight: '900', color: '#166534',
  },
  splitSubText: {
    fontSize: 11, color: '#15803d', marginBottom: 12,
  },
  splitDivider: {
    height: 1, backgroundColor: '#dcfce7', marginBottom: 12,
  },
  earningRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  earningLabel: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  earningValue: { fontSize: 14, fontWeight: '800', color: '#111' },

  deliverToCard: {
    borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 16,
    padding: 20, marginBottom: 20, backgroundColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  deliverToLabel: { fontSize: 10, fontWeight: '900', color: '#9ca3af', marginBottom: 8, letterSpacing: 0.5 },
  customerName: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 6 },
  customerAddress: { fontSize: 13, color: '#6b7280', fontWeight: '500', lineHeight: 18 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  customerPhone: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  contactlessBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  contactlessTitle: { fontSize: 11, fontWeight: '900', color: '#111', marginBottom: 8, letterSpacing: 0.3 },
  contactlessDesc: { fontSize: 12, color: '#6b7280', lineHeight: 18, marginBottom: 16 },
  btnTakePhotos: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb',
    padding: 12, borderRadius: 12,
  },
  btnTakePhotosText: { color: '#6b7280', fontWeight: 'bold', fontSize: 13 },

  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  unavailableText: {
    color: '#ef4444', fontWeight: 'bold', fontSize: 13,
    textDecorationLine: 'underline',
  },

  footer: { padding: 20, paddingBottom: 30 },
  btnConfirm: {
    backgroundColor: '#05a660', padding: 18, borderRadius: 16, alignItems: 'center',
    shadowColor: '#05a660', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  btnConfirmText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
