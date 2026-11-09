import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { calculateDeliverySplit, formatRupees } from '../services/riderPayoutLogic';

export default function DeliveryCompleteScreen({ navigation, route }) {
  const { orderData, deliveryDistanceKm, split: incomingSplit } = route.params || {};

  const handleBackToHome = () => {
    navigation.replace('Dashboard');
  };

  const totalAmount = orderData?.total_amount ? parseFloat(orderData.total_amount) : null;
  const tipAmount = orderData?.tip_amount ? parseFloat(orderData.tip_amount) : 0;

  // Use passed split or calculate dynamically
  const split = incomingSplit || calculateDeliverySplit(deliveryDistanceKm, tipAmount);

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
            <Text style={styles.successSub}>Thank you for riding with MaitreD</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Total Rider Payout Highlight Card */}
        <View style={[styles.card, styles.payoutHighlightCard]}>
          <View>
            <Text style={styles.payoutHighlightLabel}>TOTAL RIDER PAYOUT</Text>
            <Text style={styles.payoutHighlightValue}>{formatRupees(split.totalRiderPayout)}</Text>
          </View>
          <View style={styles.creditedPill}>
            <Ionicons name="checkmark-circle" size={14} color="#05a660" style={{ marginRight: 4 }} />
            <Text style={styles.creditedPillText}>Credited</Text>
          </View>
        </View>

        {/* Clean Split Up Card */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="pie-chart-outline" size={18} color="#05a660" style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>DELIVERY FEE CLEAN SPLIT</Text>
          </View>

          <View style={styles.deliveryFeePaidBanner}>
            <Text style={styles.feePaidLabel}>Customer Paid Delivery Fee</Text>
            <Text style={styles.feePaidValue}>{formatRupees(split.deliveryFee)}</Text>
          </View>

          {/* Breakdown Items */}
          <View style={styles.splitRow}>
            <View style={styles.splitLeftCol}>
              <View style={[styles.dot, { backgroundColor: '#05a660' }]} />
              <View>
                <Text style={styles.splitTitle}>Rider Take-Home</Text>
                <Text style={styles.splitSub}>Direct net earning to your wallet</Text>
              </View>
            </View>
            <Text style={[styles.splitAmount, { color: '#05a660' }]}>{formatRupees(split.riderTakeHome)}</Text>
          </View>

          <View style={styles.splitRow}>
            <View style={styles.splitLeftCol}>
              <View style={[styles.dot, { backgroundColor: '#0369a1' }]} />
              <View>
                <Text style={styles.splitTitle}>ESI, PF & Insurance</Text>
                <Text style={styles.splitSub}>Healthcare, PF & accident coverage</Text>
              </View>
            </View>
            <Text style={[styles.splitAmount, { color: '#0369a1' }]}>{formatRupees(split.esiPfInsurance)}</Text>
          </View>

          <View style={styles.splitRow}>
            <View style={styles.splitLeftCol}>
              <View style={[styles.dot, { backgroundColor: '#6b7280' }]} />
              <View>
                <Text style={styles.splitTitle}>Platform Fee</Text>
                <Text style={styles.splitSub}>Rs. {split.platformFeePerKmRate} per km platform service charge</Text>
              </View>
            </View>
            <Text style={styles.splitAmount}>{formatRupees(split.platformFee)}</Text>
          </View>

          {/* Customer Tip if present */}
          {tipAmount > 0 && (
            <View style={[styles.splitRow, { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 }]}>
              <View style={styles.splitLeftCol}>
                <View style={[styles.dot, { backgroundColor: '#ff471a' }]} />
                <View>
                  <Text style={[styles.splitTitle, { color: '#ff471a' }]}>Customer Tip</Text>
                  <Text style={styles.splitSub}>100% directly given to rider</Text>
                </View>
              </View>
              <Text style={[styles.splitAmount, { color: '#ff471a' }]}>+{formatRupees(tipAmount)}</Text>
            </View>
          )}

          {deliveryDistanceKm != null && (
            <View style={styles.distanceFooter}>
              <Ionicons name="navigate-outline" size={13} color="#9ca3af" style={{ marginRight: 4 }} />
              <Text style={styles.distanceFooterText}>
                Trip distance: {Number(deliveryDistanceKm).toFixed(1)} km
              </Text>
            </View>
          )}
        </View>

        {/* Benefits Protection Notice Card */}
        <View style={styles.benefitNoticeCard}>
          <Ionicons name="shield-checkmark" size={24} color="#0369a1" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.benefitNoticeTitle}>Benefits & Insurance Protection</Text>
            <Text style={styles.benefitNoticeDesc}>
              {formatRupees(split.esiPfInsurance)} has been deposited into your dedicated ESI, PF, and Medical Insurance protection account for this delivery.
            </Text>
          </View>
        </View>

        {/* Order Details Mini Card */}
        <View style={styles.orderMetaCard}>
          <View style={styles.orderMetaRow}>
            <Text style={styles.orderMetaLabel}>Order Total Value</Text>
            <Text style={styles.orderMetaValue}>{totalAmount != null ? formatRupees(totalAmount) : '--'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btnHome} onPress={handleBackToHome} activeOpacity={0.88}>
          <Text style={styles.btnHomeText}>{route.params?.hasMoreOrders ? 'Deliver Next Order' : 'Back to Home'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  
  topSection: {
    backgroundColor: '#05a660',
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 6 },
  checkCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  successTitle: { fontSize: 24, fontWeight: '900', color: 'white' },
  successSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '600' },
  
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },
  
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  payoutHighlightCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  payoutHighlightLabel: { fontSize: 12, fontWeight: '900', color: '#166534', letterSpacing: 0.5 },
  payoutHighlightValue: { fontSize: 32, fontWeight: '900', color: '#15803d', marginTop: 2 },
  creditedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  creditedPillText: { fontSize: 12, fontWeight: '800', color: '#05a660' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#111', letterSpacing: 0.5 },

  deliveryFeePaidBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  feePaidLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  feePaidValue: { fontSize: 15, fontWeight: '900', color: '#111' },

  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  splitLeftCol: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  splitTitle: { fontSize: 14, fontWeight: '800', color: '#111' },
  splitSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  splitAmount: { fontSize: 16, fontWeight: '900', color: '#111' },

  distanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f9fafb',
  },
  distanceFooterText: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },

  benefitNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  benefitNoticeTitle: { fontSize: 13, fontWeight: '800', color: '#0369a1', marginBottom: 3 },
  benefitNoticeDesc: { fontSize: 11, color: '#0284c7', lineHeight: 16 },

  orderMetaCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  orderMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderMetaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  orderMetaValue: { fontSize: 14, fontWeight: '800', color: '#111' },

  btnHome: {
    backgroundColor: '#05a660',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#05a660',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnHomeText: { color: 'white', fontWeight: '900', fontSize: 16 },
});
