/**
 * EarningsTab.js
 *
 * Displays rider earnings from:
 *  - Summary cards: /api/v1/rider/stats (today/week earnings from backend)
 *  - History list:  /api/v1/rider/deliveries/history (uses `earnings` field = delivery_fee + tip_amount)
 *
 * The backend calculates earnings when deliverOrder() is called with distance_km:
 *   earned = round(distance_km × ₹15, 2)
 *   This is stored as order.delivery_fee.
 *   Tip is added separately as order.tip_amount.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryHistory, getEarningsSummary } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

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

  // Helper: get numeric earnings for a delivery
  const getEarning = (d) => {
    if (d.earnings != null && !isNaN(d.earnings) && d.earnings > 0) {
      return parseFloat(d.earnings);
    }
    return null;
  };

  // Today / this week sums from the stats endpoint (most accurate)
  const todayEarnings   = stats?.today_earnings != null ? parseFloat(stats.today_earnings) : null;
  const weekEarnings    = stats?.this_week_earnings != null ? parseFloat(stats.this_week_earnings) : null;
  const todayCount      = stats?.deliveries_today ?? 0;

  // All-time earnings from history
  const allTimeEarnings = deliveries.reduce((sum, d) => {
    const e = getEarning(d);
    return e != null ? sum + e : sum;
  }, 0);
  const allTimeHasData = deliveries.some(d => getEarning(d) != null);

  // Group by date for the list
  const byDate = {};
  deliveries.forEach(d => {
    const dt = d.delivered_at || d.assigned_at;
    const key = dt
      ? new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';
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
          <Text style={styles.title}>Earnings</Text>

          {/* Summary cards — uses backend stats for accuracy */}
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { backgroundColor: '#05a660' }]}>
              <Text style={styles.summaryCardLabel}>Today</Text>
              <Text style={styles.summaryCardValue}>
                {todayEarnings != null ? `₹${todayEarnings.toFixed(2)}` : '₹0.00'}
              </Text>
              <Text style={styles.summaryCardSub}>{todayCount} deliveries</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: '#0369a1' }]}>
              <Text style={styles.summaryCardLabel}>This Week</Text>
              <Text style={styles.summaryCardValue}>
                {weekEarnings != null ? `₹${weekEarnings.toFixed(2)}` : '₹0.00'}
              </Text>
              <Text style={styles.summaryCardSub}>{deliveries.length} deliveries</Text>
            </View>
          </View>

          {/* All-time card */}
          <View style={styles.allTimeCard}>
            <Text style={styles.allTimeLabel}>ALL-TIME EARNINGS</Text>
            {allTimeHasData ? (
              <Text style={styles.allTimeValue}>₹{allTimeEarnings.toFixed(2)}</Text>
            ) : deliveries.length > 0 ? (
              <>
                <Text style={styles.earningUnavailable}>Not yet calculated</Text>
                <Text style={styles.allTimeSub}>
                  Earnings are recorded when you submit your delivery distance.{'\n'}
                  Future deliveries will show here automatically.
                </Text>
              </>
            ) : null}
          </View>

          <Text style={styles.historyLabel}>HISTORY</Text>
        </>
      }
      renderItem={({ item: [date, rows] }) => {
        const dayTotal = rows.reduce((s, d) => {
          const e = getEarning(d);
          return e != null ? s + e : s;
        }, 0);
        const dayHasData = rows.some(d => getEarning(d) != null);

        return (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayDate}>{date}</Text>
              <Text style={[styles.dayEarning, !dayHasData && { color: '#9ca3af' }]}>
                {dayHasData ? `₹${dayTotal.toFixed(2)}` : 'Pending'}
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
                          : '—'}
                    </Text>
                  </View>
                  <Text style={[styles.deliveryEarning, earned == null && { color: '#9ca3af' }]}>
                    {earned != null ? `₹${earned.toFixed(2)}` : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={56} color="#e5e7eb" />
          <Text style={styles.emptyTitle}>No completed deliveries yet</Text>
          <Text style={styles.emptySubText}>Your earnings will appear here after your first delivery</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 110, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 16 },

  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  summaryCard: { flex: 1, borderRadius: 16, padding: 16 },
  summaryCardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  summaryCardValue: { color: '#fff', fontSize: 26, fontWeight: '900' },
  summaryCardSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 },

  allTimeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: '#f3f4f6',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  allTimeLabel: { fontSize: 12, fontWeight: '900', color: '#6b7280', letterSpacing: 0.5, marginBottom: 6 },
  allTimeValue: { fontSize: 30, fontWeight: '900', color: '#05a660', marginBottom: 4 },
  earningUnavailable: { fontSize: 16, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
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
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  deliveryId: { fontSize: 14, fontWeight: '700', color: '#111' },
  deliveryRestaurant: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  deliveryTime: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  deliveryEarning: { fontSize: 16, fontWeight: '900', color: '#05a660', marginLeft: 12 },

  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { color: '#374151', marginTop: 14, fontSize: 17, fontWeight: '700' },
  emptySubText: { color: '#9ca3af', marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
