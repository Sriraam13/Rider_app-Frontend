import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';

export default function DeliveryCompleteScreen({ navigation, route }) {
  const { clearActiveAssignment, setAvailability } = useRiderStore();
  const { orderData, deliveryDistanceKm, earnedAmount } = route.params || {};
  const RATE_PER_KM = 15;

  const handleBackToHome = () => {
    clearActiveAssignment();
    setAvailability(true);
    navigation.replace('Dashboard');
  };

  // Use real earnings values only — no fabrication
  const totalAmount = orderData?.total_amount ? parseFloat(orderData.total_amount) : null;
  const tipAmount = orderData?.tip_amount ? parseFloat(orderData.tip_amount) : null;

  return (
    <View style={styles.container}>
      {/* Top Green Section */}
      <View style={styles.topSection}>
        <SafeAreaView>
          <View style={styles.header}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark-outline" size={32} color="white" />
            </View>
            <Text style={styles.successTitle}>Delivery Complete!</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Order Summary Card */}
        <View style={[styles.card, styles.totalEarnedHighlight]}>
          <Text style={styles.totalEarnedLabel}>Order Total</Text>
          <Text style={styles.totalEarnedValue}>
            {totalAmount != null ? `Rs. ${totalAmount.toFixed(2)}` : '--'}
          </Text>
        </View>

        {/* Tip */}
        <View style={styles.rowCard}>
          <Text style={styles.rowCardLabel}>Customer Tip</Text>
          <Text style={styles.todayTotalValue}>
            {tipAmount != null ? `Rs. ${tipAmount.toFixed(2)}` : '--'}
          </Text>
        </View>

        {/* Delivery Earning */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="wallet" size={18} color="#05a660" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>DELIVERY EARNING</Text>
          </View>

          {deliveryDistanceKm != null ? (
            <>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Distance (restaurant → customer)</Text>
                <Text style={styles.breakdownAmount}>{Number(deliveryDistanceKm).toFixed(1)} km</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Rate</Text>
                <Text style={styles.breakdownAmount}>₹{RATE_PER_KM}/km</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { fontWeight: '900', color: '#111', fontSize: 15 }]}>Earned</Text>
                <Text style={[styles.breakdownAmount, { fontSize: 20, color: '#05a660' }]}>
                  ₹{earnedAmount ?? Math.round(Number(deliveryDistanceKm) * RATE_PER_KM)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', lineHeight: 20 }}>
              Distance unavailable — Earning unavailable.{`\n`}Your earnings will be reflected in your history.
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.btnHome} onPress={handleBackToHome}>
          <Text style={styles.btnHomeText}>Back to Home</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  
  topSection: { backgroundColor: '#05a660', paddingBottom: 30, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 10 },
  checkCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '900', color: 'white' },
  
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20 },
  
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  
  totalEarnedHighlight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 24 },
  totalEarnedLabel: { fontSize: 16, fontWeight: '900', color: '#111' },
  totalEarnedValue: { fontSize: 20, fontWeight: '900', color: '#05a660' },
  
  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#111', marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  breakdownLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  breakdownAmount: { fontSize: 13, fontWeight: '900', color: '#111' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  
  rowCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rowCardLabel: { fontSize: 14, fontWeight: '900', color: '#111' },
  
  ratingBox: { flexDirection: 'row', alignItems: 'center' },
  ratingValue: { fontSize: 14, fontWeight: 'bold', color: '#f59e0b' },
  
  todayTotalValue: { fontSize: 16, fontWeight: '900', color: '#ff471a' },
  
  btnHome: { backgroundColor: '#ff471a', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  btnHomeText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
