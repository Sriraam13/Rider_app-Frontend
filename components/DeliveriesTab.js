/**
 * DeliveriesTab.js
 *
 * Shows rider delivery history with filter tabs:
 *   All | Completed | Cancelled
 *
 * Earning display:
 *   DELIVERED  → ₹{delivery_distance_km × 15} if distance available,
 *                else "Earning unavailable"
 *   CANCELLED / FAILED / REJECTED → ₹0
 *   Active / Pending → "In Progress"
 *
 * Note: `delivery_distance_km` is not persisted in the DB schema.
 * Historical rows without it will show "Earning unavailable".
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl, SectionList, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryHistory } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { calculateEarning, RATE_PER_KM } from '../services/routingService';

const TERMINAL_STATUSES = ['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
const ACTIVE_STATUSES   = ['ACCEPTED', 'GOING_TO_RESTAURANT', 'ARRIVED_AT_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'];
const PENDING_STATUSES  = ['PENDING', 'ASSIGNED'];
const CANCELLED_LIKE    = ['CANCELLED', 'FAILED', 'REJECTED'];

// Filter tabs
const FILTER_TABS = [
  { key: 'ALL',       label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

function statusColor(status) {
  if (status === 'DELIVERED') return { bg: '#e6f7f1', text: '#05a660' };
  if (ACTIVE_STATUSES.includes(status)) return { bg: '#fff3ed', text: '#ff471a' };
  if (PENDING_STATUSES.includes(status)) return { bg: '#fef9c3', text: '#b45309' };
  if (CANCELLED_LIKE.includes(status)) return { bg: '#fee2e2', text: '#dc2626' };
  return { bg: '#f3f4f6', text: '#6b7280' };
}

function statusLabel(status) {
  const map = {
    PENDING: 'Pending',
    ASSIGNED: 'Assigned',
    ACCEPTED: 'Accepted',
    GOING_TO_RESTAURANT: 'Going to Restaurant',
    ARRIVED_AT_RESTAURANT: 'At Restaurant',
    PICKED_UP: 'Picked Up',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    ARRIVED_AT_CUSTOMER: 'At Customer',
    DELIVERED: 'Delivered ✓',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    FAILED: 'Failed',
  };
  return map[status] || status;
}

function DeliveryCard({ item }) {
  const color = statusColor(item.status);
  const isCompleted = item.status === 'DELIVERED';
  const isCancelledLike = CANCELLED_LIKE.includes(item.status);

  // Earning display — uses API-returned distance (or null if not persisted)
  let earningDisplay;
  if (isCompleted) {
    if (item.delivery_distance_km != null && !isNaN(item.delivery_distance_km) && item.delivery_distance_km > 0) {
      const earned = calculateEarning(item.delivery_distance_km);
      earningDisplay = (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.earningsText}>₹{earned}</Text>
          <Text style={styles.earningsRate}>{Number(item.delivery_distance_km).toFixed(1)} km × ₹{RATE_PER_KM}</Text>
        </View>
      );
    } else {
      earningDisplay = <Text style={styles.earningsUnavailable}>Earning unavailable</Text>;
    }
  } else if (isCancelledLike) {
    earningDisplay = <Text style={styles.earningsZero}>₹0</Text>;
  } else {
    earningDisplay = (
      <Text style={styles.activeLabel}>In Progress</Text>
    );
  }

  return (
    <View style={[
      styles.card,
      isCompleted && styles.cardDelivered,
      isCancelledLike && styles.cardCancelled,
    ]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.orderId}>{item.display_order_id || `Order #${item.order_id}`}</Text>
          {item.restaurant_name ? (
            <Text style={styles.restaurantText} numberOfLines={1}>
              <Ionicons name="restaurant-outline" size={11} color="#9ca3af" /> {item.restaurant_name}
            </Text>
          ) : null}
          {item.customer_name ? (
            <Text style={styles.customerText} numberOfLines={1}>
              <Ionicons name="person-outline" size={11} color="#9ca3af" /> {item.customer_name}
            </Text>
          ) : null}
        </View>
        <View style={[styles.statusPill, { backgroundColor: color.bg }]}>
          <Text style={[styles.statusText, { color: color.text }]}>
            {statusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color="#9ca3af" style={{ marginRight: 4 }} />
          <Text style={styles.dateText}>
            {item.assigned_at
              ? new Date(item.assigned_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              : '--'}
          </Text>
          {item.items_count ? (
            <Text style={styles.itemsCount}> · {item.items_count} item{item.items_count !== 1 ? 's' : ''}</Text>
          ) : null}
        </View>

        {earningDisplay}
      </View>

      {item.delivered_at && item.status === 'DELIVERED' ? (
        <Text style={styles.deliveredAt}>
          Delivered {new Date(item.delivered_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      ) : null}

      {/* Reason label for cancelled/failed/rejected */}
      {isCancelledLike && (
        <Text style={styles.cancelReason}>
          {item.status === 'REJECTED' ? 'Rejected by rider' : item.status === 'FAILED' ? 'Delivery failed' : 'Cancelled'}
        </Text>
      )}
    </View>
  );
}

export default function DeliveriesTab() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allData, setAllData]       = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [totalDelivered, setTotalDelivered] = useState(0);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await getDeliveryHistory();
      const data = Array.isArray(res.data) ? res.data : [];
      setAllData(data);
      setTotalDelivered(data.filter(d => d.status === 'DELIVERED').length);
    } catch (err) {
      console.error('Failed to load delivery history', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  // Filter data based on active tab
  const filteredData = (() => {
    if (activeFilter === 'COMPLETED') return allData.filter(d => d.status === 'DELIVERED');
    if (activeFilter === 'CANCELLED') return allData.filter(d => CANCELLED_LIKE.includes(d.status));
    return allData; // ALL
  })();

  // Build sections for SectionList
  const sections = (() => {
    const active    = filteredData.filter(d => ACTIVE_STATUSES.includes(d.status) || PENDING_STATUSES.includes(d.status));
    const delivered = filteredData.filter(d => d.status === 'DELIVERED');
    const past      = filteredData.filter(d => CANCELLED_LIKE.includes(d.status));
    const built = [];
    if (active.length > 0)    built.push({ title: 'Active & Pending', data: active });
    if (delivered.length > 0) built.push({ title: 'Completed', data: delivered });
    if (past.length > 0)      built.push({ title: 'Past', data: past });
    return built;
  })();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#ff471a" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deliveries</Text>

      {/* Summary row */}
      {totalDelivered > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#05a660" style={{ marginRight: 4 }} />
            <Text style={styles.summaryText}>{totalDelivered} Delivered</Text>
          </View>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, activeFilter === tab.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, activeFilter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => (item.id ? item.id.toString() : Math.random().toString())}
        renderItem={({ item }) => <DeliveryCard item={item} />}
        renderSectionHeader={({ section: { title, data } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{data.length}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 20, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={56} color="#e5e7eb" />
            <Text style={styles.emptyTitle}>No deliveries found</Text>
            <Text style={styles.emptySubText}>Your delivery history will appear here</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff471a']} />
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  title: {
    fontSize: 24, fontWeight: '900', color: '#111',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4,
  },

  summaryRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingBottom: 10, flexWrap: 'wrap',
  },
  summaryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  summaryText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  // Filter tabs
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 14, gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterTabActive: {
    backgroundColor: '#ff471a', borderColor: '#ff471a',
  },
  filterTabText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  filterTabTextActive: { color: '#fff' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 16, paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13, fontWeight: '900', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionCount: {
    marginLeft: 8, backgroundColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  sectionCountText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },

  card: {
    backgroundColor: 'white', padding: 16, borderRadius: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: '#ff471a',
  },
  cardDelivered: { borderLeftColor: '#05a660' },
  cardCancelled: { borderLeftColor: '#dc2626' },

  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  orderId: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 3 },
  restaurantText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  customerText: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },

  cardBody: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { color: '#9ca3af', fontSize: 12 },
  itemsCount: { color: '#9ca3af', fontSize: 12 },

  earningsText: { color: '#05a660', fontWeight: '800', fontSize: 16 },
  earningsRate: { color: '#9ca3af', fontSize: 10, fontWeight: '600', marginTop: 1 },
  earningsUnavailable: { color: '#9ca3af', fontSize: 12, fontStyle: 'italic' },
  earningsZero: { color: '#dc2626', fontWeight: '700', fontSize: 14 },

  activeLabel: {
    color: '#ff471a', fontWeight: '700', fontSize: 12,
    backgroundColor: '#fff3ed', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  deliveredAt: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  cancelReason: { fontSize: 11, color: '#dc2626', marginTop: 4, fontStyle: 'italic' },

  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { color: '#374151', marginTop: 14, fontSize: 17, fontWeight: '700' },
  emptySubText: { color: '#9ca3af', marginTop: 6, fontSize: 13 },
});
