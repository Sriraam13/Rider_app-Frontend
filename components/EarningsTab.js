/**
 * EarningsTab.js
 *
 * Displays rider earnings history.
 *
 * Since the database schema has no `earnings` or `delivery_distance_km` column,
 * historical earnings shown here depend on `delivery_distance_km` being returned
 * by the backend's getDeliveryHistory() endpoint.
 *
 * For current DB schema: `delivery_distance_km` is NOT persisted.
 * Historical orders that lack this field will show "Earning unavailable".
 *
 * Only DELIVERED assignments are counted towards earnings.
 * CANCELLED / FAILED / REJECTED contribute ₹0 and are excluded from totals.
 *
 * Earning formula: Math.round(delivery_distance_km × ₹15)
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl, SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryHistory } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { calculateEarning, RATE_PER_KM } from '../services/routingService';

export default function EarningsTab() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveries, setDeliveries] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await getDeliveryHistory();
      const data = Array.isArray(res.data) ? res.data : [];
      // Only DELIVERED orders are relevant for earnings
      const delivered = data.filter(d => d.status === 'DELIVERED');
      setDeliveries(delivered);
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

  // Only count rows where actual distance is available
  const rowsWithDistance = deliveries.filter(
    d => d.delivery_distance_km != null && !isNaN(d.delivery_distance_km) && d.delivery_distance_km > 0
  );

  // Today / this week
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const todayDeliveries = deliveries.filter(d => {
    const dt = d.delivered_at ? new Date(d.delivered_at) : null;
    return dt && dt >= todayStart;
  });
  const weekDeliveries = deliveries.filter(d => {
    const dt = d.delivered_at ? new Date(d.delivered_at) : null;
    return dt && dt >= weekStart;
  });

  const sumEarnings = (list) =>
    list.reduce((sum, d) => {
      if (d.delivery_distance_km != null && !isNaN(d.delivery_distance_km)) {
        return sum + calculateEarning(d.delivery_distance_km);
      }
      return sum;
    }, 0);

  const todayEarnings = sumEarnings(todayDeliveries);
  const weekEarnings  = sumEarnings(weekDeliveries);
  const allTimeEarnings = sumEarnings(rowsWithDistance);

  // Group by date for the list
  const byDate = {};
  deliveries.forEach(d => {
    const dt = d.delivered_at || d.assigned_at;
    const key = dt ? new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
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

          {/* Summary cards */}
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { backgroundColor: '#05a660' }]}>
              <Text style={styles.summaryCardLabel}>Today</Text>
              <Text style={styles.summaryCardValue}>
                {todayDeliveries.some(d => d.delivery_distance_km != null) ? `₹${todayEarnings}` : '—'}
              </Text>
              <Text style={styles.summaryCardSub}>{todayDeliveries.length} deliveries</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: '#0369a1' }]}>
              <Text style={styles.summaryCardLabel}>This Week</Text>
              <Text style={styles.summaryCardValue}>
                {weekDeliveries.some(d => d.delivery_distance_km != null) ? `₹${weekEarnings}` : '—'}
              </Text>
              <Text style={styles.summaryCardSub}>{weekDeliveries.length} deliveries</Text>
            </View>
          </View>

          {allTimeEarnings > 0 ? (
            <View style={styles.allTimeCard}>
              <Text style={styles.allTimeLabel}>All-Time Earnings</Text>
              <Text style={styles.allTimeValue}>₹{allTimeEarnings}</Text>
              <Text style={styles.allTimeSub}>from {rowsWithDistance.length} of {deliveries.length} deliveries with available distance</Text>
            </View>
          ) : (
            deliveries.length > 0 ? (
              <View style={styles.allTimeCard}>
                <Text style={styles.allTimeLabel}>All-Time Earnings</Text>
                <Text style={styles.earningUnavailable}>
                  Earning unavailable
                </Text>
                <Text style={styles.allTimeSub}>
                  Route distance not recorded for past deliveries.{'\n'}Future deliveries will show ₹{RATE_PER_KM}/km earnings.
                </Text>
              </View>
            ) : null
          )}

          <Text style={styles.historyLabel}>HISTORY</Text>
        </>
      }
      renderItem={({ item: [date, rows] }) => {
        const dayEarning = sumEarnings(rows);
        const hasDistance = rows.some(d => d.delivery_distance_km != null && d.delivery_distance_km > 0);

        return (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayDate}>{date}</Text>
              <Text style={[styles.dayEarning, !hasDistance && { color: '#9ca3af' }]}>
                {hasDistance ? `₹${dayEarning}` : 'Earning unavailable'}
              </Text>
            </View>
            {rows.map((delivery, i) => {
              const earned = delivery.delivery_distance_km != null && delivery.delivery_distance_km > 0
                ? calculateEarning(delivery.delivery_distance_km)
                : null;

              return (
                <View key={delivery.id ?? i} style={styles.deliveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deliveryId}>{delivery.display_order_id || `Order #${delivery.order_id}`}</Text>
                    {delivery.restaurant_name ? (
                      <Text style={styles.deliveryRestaurant}>{delivery.restaurant_name}</Text>
                    ) : null}
                    {delivery.delivery_distance_km != null ? (
                      <Text style={styles.deliveryDistance}>
                        {Number(delivery.delivery_distance_km).toFixed(1)} km × ₹{RATE_PER_KM}/km
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.deliveryEarning, earned == null && { color: '#9ca3af' }]}>
                    {earned != null ? `₹${earned}` : '—'}
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
  deliveryDistance: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  deliveryEarning: { fontSize: 16, fontWeight: '900', color: '#05a660', marginLeft: 12 },

  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { color: '#374151', marginTop: 14, fontSize: 17, fontWeight: '700' },
  emptySubText: { color: '#9ca3af', marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
