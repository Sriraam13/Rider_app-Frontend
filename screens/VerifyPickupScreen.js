import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { pickupOrder, getDeliveryAssignment } from '../services/api';

export default function VerifyPickupScreen({ navigation }) {
  const { activeAssignmentId, setActiveAssignment, activeOrderId } = useRiderStore();
  const [loading, setLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState([]);
  const [items, setItems] = useState([]);
  const [deliveryInstructions, setDeliveryInstructions] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (activeAssignmentId) {
      getDeliveryAssignment(activeAssignmentId)
        .then(res => {
          if (res.data) {
            const data = res.data;
            const fetchedItems = data.items || [];
            setItems(fetchedItems);
            setCheckedItems(new Array(fetchedItems.length).fill(false));
            // Only show real delivery instructions from backend
            const instr = data.delivery_address?.instructions || data.delivery_instructions || null;
            setDeliveryInstructions(instr || null);
          }
        })
        .catch(err => {
          console.error('VerifyPickup fetch error:', err);
          setFetchError(true);
        });
    }
  }, [activeAssignmentId]);

  const allItemsChecked = items.length > 0 && !checkedItems.includes(false);

  const handleConfirmPickup = async () => {
    if (!activeAssignmentId) return;
    setLoading(true);
    try {
      const res = await pickupOrder(activeAssignmentId);
      // Update store from backend response
      if (res.data) {
        setActiveAssignment({ ...res.data, status: 'PICKED_UP' });
      }
      navigation.replace('CustomerNavigation');
    } catch (err) {
      console.error('Pickup confirmation failed:', err);
      const detail = err?.response?.data?.detail || 'Could not confirm pickup. Please try again.';
      Alert.alert('Pickup Failed', detail);
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (index) => {
    const newChecked = [...checkedItems];
    newChecked[index] = !newChecked[index];
    setCheckedItems(newChecked);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — no hardcoded "Ready in 2 min" */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Verify Pickup</Text>
          <Text style={styles.subtitle}>Order #{activeOrderId || 'Unknown'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Items to collect */}
        <Text style={styles.sectionTitle}>ITEMS TO COLLECT</Text>
        <View style={styles.itemsContainer}>
          {fetchError ? (
            <Text style={styles.errorText}>Could not load items. Please proceed carefully.</Text>
          ) : items.length === 0 ? (
            <ActivityIndicator color="#ff471a" style={{ marginTop: 20 }} />
          ) : (
            items.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.itemRow, checkedItems[index] && styles.itemRowChecked]}
                onPress={() => toggleCheck(index)}
                activeOpacity={0.7}
              >
                <View style={styles.itemInfo}>
                  <Text style={styles.itemQuantity}>{item.quantity}×</Text>
                  <Text style={styles.itemText}>{item.name}</Text>
                </View>
                <Ionicons
                  name={checkedItems[index] ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={checkedItems[index] ? '#ff471a' : '#d1d5db'}
                />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Real delivery instructions — only shown if backend provides them */}
        {deliveryInstructions ? (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>DELIVERY INSTRUCTIONS</Text>
            <Text style={styles.instructionsText}>{deliveryInstructions}</Text>
          </View>
        ) : null}

        {/* Photo Upload Placeholder */}
        <TouchableOpacity style={styles.photoUploadBtn}>
          <Ionicons name="camera-outline" size={20} color="#6b7280" style={{ marginRight: 8 }} />
          <Text style={styles.photoUploadText}>Take box photo to verify</Text>
        </TouchableOpacity>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          <Ionicons
            name={allItemsChecked ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={allItemsChecked ? '#05a660' : '#9ca3af'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.progressText, allItemsChecked && styles.progressTextDone]}>
            {checkedItems.filter(Boolean).length} / {items.length} items verified
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.btnConfirm,
            !allItemsChecked && styles.btnConfirmDisabled,
          ]}
          onPress={handleConfirmPickup}
          disabled={loading || !allItemsChecked}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.btnConfirmText}>Confirm Pickup & Start Trip</Text>
          )}
        </TouchableOpacity>
        {!allItemsChecked && items.length > 0 && (
          <Text style={styles.hintText}>Check all items before confirming pickup</Text>
        )}
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
  title: { fontSize: 22, fontWeight: '900', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  scrollContent: { padding: 20 },

  sectionTitle: { fontSize: 12, fontWeight: '900', color: '#111', marginBottom: 12, letterSpacing: 0.5 },

  itemsContainer: { marginBottom: 24 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  itemRowChecked: {
    borderColor: '#ff471a',
    backgroundColor: '#fff8f6',
  },
  itemInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 16 },
  itemQuantity: { fontSize: 14, fontWeight: '800', color: '#ff471a', marginRight: 8, minWidth: 28 },
  itemText: { fontSize: 13, fontWeight: '500', color: '#111', flex: 1 },
  errorText: { color: '#ef4444', fontSize: 13, marginTop: 10 },

  instructionsCard: {
    backgroundColor: '#fff8f0',
    borderWidth: 1,
    borderColor: '#ffe4cc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  instructionsTitle: { fontSize: 10, fontWeight: '900', color: '#d97706', marginBottom: 8 },
  instructionsText: { fontSize: 13, color: '#b45309', lineHeight: 20 },

  photoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  photoUploadText: { color: '#6b7280', fontWeight: 'bold', fontSize: 13 },

  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  progressTextDone: { color: '#05a660', fontWeight: '700' },

  footer: { padding: 20, paddingBottom: 30 },
  btnConfirm: {
    backgroundColor: '#05a660',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#05a660',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnConfirmDisabled: {
    backgroundColor: '#d1d5db',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnConfirmText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  hintText: { color: '#9ca3af', fontSize: 12, textAlign: 'center', marginTop: 10 },
});
