/**
 * EarningsTab.js
 *
 * MaitreD Rider Earnings & Benefits Dashboard:
 *
 * Clean Split of Rs. 60 Customer Delivery Fee:
 *  - Rider Take-Home: Rs. 45
 *  - ESI, PF & Insurance: Rs. 12
 *  - Platform Fee: Rs. 3 (Rs. 1 per km)
 *
 * Tips from customer are 100% credited to the rider.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryHistory, getEarningsSummary } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import {
  DELIVERY_FEE,
  RIDER_EARNING,
  ESI_PF_INSURANCE,
  PLATFORM_FEE,
  formatRupees,
} from '../services/riderPayoutLogic';

export default function EarningsTab() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [stats, setStats]           = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [histRes, statsRes] = await Promise.all([
        getDeliveryHistory(),
        getEarningsSummary(),
      ]);
      const data = Array.isArray(histRes.data) ? histRes.data : [];
      // Only DELIVERED orders are relevant for earnings
      setDeliveries(data.filter(d => d.status === 'DELIVERED'));
      if (statsRes?.data) setStats(statsRes.data);
    } catch (err) {
      console.error('EarningsTab fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Helper: get numeric earnings for a delivery (fallback to standard 45 + tip)
  const getEarning = (d) => {
    if (d.earnings != null && !isNaN(d.earnings) && d.earnings > 0) {
      return parseFloat(d.earnings);
    }
    // Standard MaitreD delivery payout
    const tip = d.tip_amount ? parseFloat(d.tip_amount) : 0;
    return RIDER_EARNING + tip;
  };

  // Today / this week sums from the stats endpoint (most accurate)
  const todayEarnings   = stats?.today_earnings != null ? parseFloat(stats.today_earnings) : null;
  const weekEarnings    = stats?.this_week_earnings != null ? parseFloat(stats.this_week_earnings) : null;
  const todayCount      = stats?.deliveries_today ?? 0;

  // All-time earnings from history
  const allTimeEarnings = deliveries.reduce((sum, d) => sum + getEarning(d), 0);
  const totalBenefitsAccumulated = deliveries.length * ESI_PF_INSURANCE;

  // Group by date for the list
  const byDate = {};
  deliveries.forEach(d => {
    const dt = d.delivered_at || d.assigned_at;
    const key = dt
      ? new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recent Deliveries';
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(d);
  });
  const dateGroups = Object.entries(byDate).sort((a, b) => {
    const aDate = new Date(a[0]);
    const bDate = new Date(b[0]);
    return isNaN(aDate) || isNaN(bDate) ? 0 : bDate - aDate;
  });

  if (loading) {
    return <ActivityIndicator color="#05a660" style={{ marginTop: 50 }} />;
  }

  return (
    <FlatList
      data={dateGroups}
      keyExtractor={([date]) => date}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#05a660']} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Earnings & Benefits</Text>

          {/* Clean Split Explanation Banner */}
          <View style={styles.splitBanner}>
            <View style={styles.splitBannerHeader}>
              <Ionicons name="pie-chart" size={16} color="#15803d" style={{ marginRight: 6 }} />
              <Text style={styles.splitBannerTitle}>MaitreD Delivery Fee Clean Split (₹{DELIVERY_FEE})</Text>
            </View>
            <View style={styles.splitPillsRow}>
              <View style={[styles.splitPill, { backgroundColor: '#dcfce7' }]}>
                <Text style={[styles.splitPillVal, { color: '#166534' }]}>₹{RIDER_EARNING}</Text>
                <Text style={[styles.splitPillLbl, { color: '#166534' }]}>Take-Home</Text>
              </View>
              <Text style={styles.splitPlus}>+</Text>
              <View style={[styles.splitPill, { backgroundColor: '#e0f2fe' }]}>
                <Text style={[styles.splitPillVal, { color: '#0369a1' }]}>₹{ESI_PF_INSURANCE}</Text>
                <Text style={[styles.splitPillLbl, { color: '#0369a1' }]}>ESI & PF</Text>
              </View>
              <Text style={styles.splitPlus}>+</Text>
              <View style={[styles.splitPill, { backgroundColor: '#f3f4f6' }]}>
                <Text style={[styles.splitPillVal, { color: '#4b5563' }]}>₹{PLATFORM_FEE}</Text>
                <Text style={[styles.splitPillLbl, { color: '#4b5563' }]}>Platform Fee</Text>
              </View>
            </View>
          </View>

          {/* Detailed Earnings & Fee Breakdown Card */}
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownHeader}>
              <Ionicons name="calculator-outline" size={18} color="#05a660" style={{ marginRight: 6 }} />
              <Text style={styles.breakdownTitle}>PAYOUT ACCUMULATION BREAKDOWN</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Take-Home (Rider Fee):</Text>
              <Text style={styles.breakdownValueTakeHome}>
                ₹{(stats?.take_home_charge != null ? stats.take_home_charge : deliveries.length * RIDER_EARNING).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>ESI & PF Fund:</Text>
              <Text style={styles.breakdownValueEsi}>
                ₹{(stats?.esi_pf_charge != null ? stats.esi_pf_charge : deliveries.length * ESI_PF_INSURANCE).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Platform Fee:</Text>
              <Text style={styles.breakdownValuePlatform}>
                ₹{(stats?.platform_fee_charge != null ? stats.platform_fee_charge : deliveries.length * PLATFORM_FEE).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownTotalLabel}>Total Delivery Fees ({deliveries.length} orders):</Text>
              <Text style={styles.breakdownTotalValue}>
                ₹{(deliveries.length * DELIVERY_FEE).toFixed(2)}
              </Text>
            </View>
            <Text style={styles.breakdownFootnote}>
              ₹60 per delivery (₹45 Take-Home + ₹12 ESI/PF + ₹3 Platform Fee).
            </Text>
          </View>

          {/* Summary cards */}
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { backgroundColor: '#05a660' }]}>
              <Text style={styles.summaryCardLabel}>Today Take-Home</Text>
              <Text style={styles.summaryCardValue}>
                {todayEarnings != null ? `₹${todayEarnings.toFixed(2)}` : `₹${(todayCount * RIDER_EARNING).toFixed(2)}`}
              </Text>
              <Text style={styles.summaryCardSub}>{todayCount} deliveries</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: '#0369a1' }]}>
              <Text style={styles.summaryCardLabel}>This Week</Text>
              <Text style={styles.summaryCardValue}>
                {weekEarnings != null ? `₹${weekEarnings.toFixed(2)}` : `₹${(deliveries.length * RIDER_EARNING).toFixed(2)}`}
              </Text>
              <Text style={styles.summaryCardSub}>{deliveries.length} deliveries</Text>
            </View>
          </View>

          {/* Benefits / ESI, PF & Insurance Card */}
          <View style={styles.benefitsCard}>
            <View style={styles.benefitsHeader}>
              <View style={styles.benefitsIconBox}>
                <Ionicons name="shield-checkmark" size={22} color="#0284c7" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.benefitsLabel}>BENEFITS & INSURANCE FUND</Text>
                <Text style={styles.benefitsValue}>₹{totalBenefitsAccumulated.toFixed(2)}</Text>
              </View>
              <View style={styles.benefitsBadge}>
                <Text style={styles.benefitsBadgeText}>₹{ESI_PF_INSURANCE}/delivery</Text>
              </View>
            </View>
            <Text style={styles.benefitsSub}>
              Accumulated from {deliveries.length} completed deliveries. Includes Employee State Insurance (ESI), Provident Fund (PF), and accident insurance.
            </Text>
          </View>

          {/* All-time Take-Home card */}
          <View style={styles.allTimeCard}>
            <Text style={styles.allTimeLabel}>ALL-TIME TAKE-HOME PAYOUT</Text>
            <Text style={styles.allTimeValue}>₹{allTimeEarnings.toFixed(2)}</Text>
            <Text style={styles.allTimeSub}>
              Direct earnings credited to rider account ({deliveries.length} total deliveries).
            </Text>
          </View>

          <Text style={styles.historyLabel}>DELIVERY HISTORY</Text>
        </>
      }
      renderItem={({ item: [date, rows] }) => {
        const dayTotal = rows.reduce((s, d) => s + getEarning(d), 0);

        return (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayDate}>{date}</Text>
              <Text style={styles.dayEarning}>
                ₹{dayTotal.toFixed(2)}
              </Text>
            </View>
            {rows.map((delivery, i) => {
              const earned = getEarning(delivery);
              return (
                <View key={delivery.id ?? i} style={styles.deliveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deliveryId}>{delivery.display_order_id || `Order #${delivery.order_id}`}</Text>
                    {delivery.restaurant_name ? (
                      <Text style={styles.deliveryRestaurant}>{delivery.restaurant_name}</Text>
                    ) : null}
                    <Text style={styles.deliveryTime}>
                      {delivery.delivered_at
                        ? new Date(delivery.delivered_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                        : delivery.assigned_at
                          ? new Date(delivery.assigned_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                          : 'Delivered'}
                    </Text>
                    <View style={styles.splitMiniBadge}>
                      <Text style={styles.splitMiniText}>
                        ₹{RIDER_EARNING} Take-Home · ₹{ESI_PF_INSURANCE} ESI/PF · ₹{PLATFORM_FEE} Platform
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.deliveryEarning}>
                      ₹{earned.toFixed(2)}
                    </Text>
                    <Text style={styles.deliveryNetLabel}>Net Payout</Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={56} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No completed deliveries yet</Text>
          <Text style={styles.emptySubText}>
            Your earnings (₹45 Take-Home + ₹12 ESI/PF + ₹3 Platform Fee per order) will appear here after your first delivery.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 110, flexGrow: 1, backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 14 },

  splitBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  splitBannerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  splitBannerTitle: { fontSize: 13, fontWeight: '900', color: '#166534' },
  splitPillsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  splitPill: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center' },
  splitPillVal: { fontSize: 15, fontWeight: '900' },
  splitPillLbl: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  splitPlus: { marginHorizontal: 4, fontSize: 14, fontWeight: 'bold', color: '#9ca3af' },

  breakdownCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  breakdownValueTakeHome: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16a34a',
  },
  breakdownValueEsi: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284c7',
  },
  breakdownValuePlatform: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 8,
  },
  breakdownTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  breakdownTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  breakdownFootnote: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 6,
    lineHeight: 15,
  },

  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, borderRadius: 16, padding: 16 },
  summaryCardLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  summaryCardValue: { color: '#fff', fontSize: 24, fontWeight: '900' },
  summaryCardSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4 },

  benefitsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  benefitsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  benefitsIconBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  benefitsLabel: { fontSize: 11, fontWeight: '900', color: '#0369a1', letterSpacing: 0.5 },
  benefitsValue: { fontSize: 26, fontWeight: '900', color: '#0284c7', marginTop: 2 },
  benefitsBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  benefitsBadgeText: { fontSize: 11, fontWeight: '800', color: '#0369a1' },
  benefitsSub: { fontSize: 11, color: '#64748b', lineHeight: 16 },

  allTimeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: '#f3f4f6',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  allTimeLabel: { fontSize: 11, fontWeight: '900', color: '#6b7280', letterSpacing: 0.5, marginBottom: 6 },
  allTimeValue: { fontSize: 28, fontWeight: '900', color: '#05a660', marginBottom: 4 },
  allTimeSub: { fontSize: 11, color: '#9ca3af', lineHeight: 16 },

  historyLabel: {
    fontSize: 12, fontWeight: '900', color: '#6b7280',
    letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase',
  },

  dayGroup: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  dayDate: { fontSize: 14, fontWeight: '800', color: '#374151' },
  dayEarning: { fontSize: 16, fontWeight: '900', color: '#05a660' },

  deliveryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  deliveryId: { fontSize: 14, fontWeight: '700', color: '#111' },
  deliveryRestaurant: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  deliveryTime: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  splitMiniBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  splitMiniText: { fontSize: 10, color: '#4b5563', fontWeight: '700' },
  deliveryEarning: { fontSize: 16, fontWeight: '900', color: '#05a660', marginLeft: 12 },
  deliveryNetLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginTop: 2 },

  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { color: '#374151', marginTop: 14, fontSize: 17, fontWeight: '700' },
  emptySubText: { color: '#9ca3af', marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
