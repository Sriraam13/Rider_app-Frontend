import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, ActivityIndicator, Alert, Platform, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { getDeliveryRequests, acceptAssignment, rejectAssignment } from '../services/api';

// Timer removed as per request

// ── Order Assignment Card (matches reference design) ─────────────────────────
function OrderCard({ item, onAccept, onReject, accepting, rejecting }) {
  const earnings = item.estimated_earnings || ((item.total_amount || 0) * 0.1 + 35).toFixed(0);
  const tip = item.tip_amount || 0;
  const items = item.items || [];
  const itemCount = item.items_count || items.length || 0;
  const orderDisplayId = item.display_order_id || (item.order_id ? `ORD-${String(item.order_id).padStart(6, '0')}` : 'ORDER');
  const customerName = item.customer_name || item.delivery_address?.contact_name || 'Customer';
  const customerPhone = item.customer_phone || item.delivery_address?.contact_phone || '';
  const customerAddress = item.customer_address || item.delivery_address?.address_line || item.delivery_address?.full_address || 'Customer Location';
  const restaurantName = item.restaurant_name || item.restaurant?.name || 'Restaurant';
  const restaurantAddress = item.restaurant_address || item.restaurant?.address || '';

  return (
    <View style={card.wrapper}>
      {/* Header with Order ID */}
      <View style={card.header}>
        <View style={card.dot} />
        <View style={{ flex: 1 }}>
          <Text style={card.headerText}>NEW ORDER ASSIGNMENT</Text>
          <Text style={card.orderIdText}>#{orderDisplayId}</Text>
        </View>
      </View>

      {/* Customer Info Box */}
      <View style={card.customerBox}>
        <View style={card.customerRow}>
          <Ionicons name="person-circle" size={20} color="#ff471a" />
          <Text style={card.customerNameText} numberOfLines={1}>{customerName}</Text>
          {customerPhone ? (
            <View style={card.phoneTag}>
              <Ionicons name="call" size={12} color="#05a660" />
              <Text style={card.phoneTagText}>{customerPhone}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Route: Pickup -> Drop */}
      <View style={card.routeBlock}>
        {/* Pickup Restaurant */}
        <View style={card.routeRow}>
          <View style={[card.routeIcon, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="restaurant" size={16} color="#ff471a" />
          </View>
          <View style={card.routeInfo}>
            <Text style={card.routeLabel}>PICKUP RESTAURANT</Text>
            <Text style={card.routeName} numberOfLines={1}>{restaurantName}</Text>
            {restaurantAddress ? (
              <Text style={card.routeSubText} numberOfLines={1}>{restaurantAddress}</Text>
            ) : null}
          </View>
        </View>

        {/* Divider line */}
        <View style={card.routeLine} />

        {/* Drop Customer */}
        <View style={card.routeRow}>
          <View style={[card.routeIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="location" size={16} color="#05a660" />
          </View>
          <View style={card.routeInfo}>
            <Text style={card.routeLabel}>DELIVERY DESTINATION</Text>
            <Text style={card.routeName} numberOfLines={2}>{customerAddress}</Text>
          </View>
        </View>
      </View>

      {/* Ordered Items List */}
      <View style={card.itemsSection}>
        <Text style={card.itemsHeader}>ORDERED ITEMS ({itemCount})</Text>
        <View style={card.itemsList}>
          {items.length > 0 ? (
            items.map((dish, idx) => (
              <View key={idx} style={card.dishRow}>
                <Text style={card.dishQtyBadge}>{dish.quantity}x</Text>
                <Text style={card.dishName} numberOfLines={1}>{dish.name}</Text>
                {dish.price > 0 && (
                  <Text style={card.dishPrice}>Rs. {dish.total_price || (dish.price * dish.quantity)}</Text>
                )}
              </View>
            ))
          ) : (
            <View style={card.dishRow}>
              <Text style={card.dishQtyBadge}>{itemCount || 1}x</Text>
              <Text style={card.dishName}>Food Delivery Package</Text>
            </View>
          )}
        </View>
      </View>

      {/* Divider */}
      <View style={card.hr} />

      {/* Earnings & Order Value */}
      <View style={card.earningsRow}>
        <View>
          <Text style={card.earningsLabel}>ESTIMATED EARNINGS</Text>
          <Text style={card.earningsValue}>Rs. {earnings}</Text>
        </View>
        <View style={card.tipBlock}>
          <Text style={card.tipLabel}>ORDER VALUE</Text>
          <Text style={card.tipValue}>Rs. {item.total_amount || 0}</Text>
        </View>
      </View>

      {/* Buttons */}
      <TouchableOpacity
        style={card.acceptBtn}
        onPress={() => onAccept(item)}
        disabled={accepting || rejecting}
      >
        {accepting
          ? <ActivityIndicator color="#fff" />
          : <Text style={card.acceptBtnText}>Accept Delivery</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={card.declineBtn}
        onPress={() => onReject(item)}
        disabled={accepting || rejecting}
      >
        {rejecting
          ? <ActivityIndicator color="#888" />
          : <Text style={card.declineBtnText}>Decline & Pass Order</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const card = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#ff471a22',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff471a' },
  headerText: { fontSize: 10, fontWeight: '800', color: '#ff471a', letterSpacing: 0.5 },
  orderIdText: { fontSize: 15, fontWeight: '900', color: '#111' },

  customerBox: {
    backgroundColor: '#fafaf9',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0f0ef',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerNameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1917',
  },
  phoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  phoneTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },

  routeBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  routeLine: { width: 2, height: 16, backgroundColor: '#e5e7eb', marginLeft: 17, marginVertical: 2 },
  routeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  routeInfo: { flex: 1, paddingTop: 2 },
  routeLabel: { fontSize: 9, color: '#9ca3af', fontWeight: '800', letterSpacing: 0.5, marginBottom: 1 },
  routeName: { fontSize: 13, fontWeight: '700', color: '#111' },
  routeSubText: { fontSize: 11, color: '#6b7280', marginTop: 1 },

  itemsSection: {
    marginHorizontal: 16,
    marginTop: 6,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  itemsHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemsList: {
    gap: 6,
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dishQtyBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ff471a',
    backgroundColor: '#fff1ee',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  dishName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  dishPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
  },

  hr: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16, marginVertical: 10 },

  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  earningsLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  earningsValue: { fontSize: 20, fontWeight: '900', color: '#ff471a' },
  tipBlock: { alignItems: 'flex-end' },
  tipLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  tipValue: { fontSize: 16, fontWeight: '800', color: '#374151' },

  acceptBtn: {
    marginHorizontal: 16,
    backgroundColor: '#05a660',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#05a660',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  declineBtn: {
    marginHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  declineBtnText: { color: '#9ca3af', fontWeight: '600', fontSize: 13 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }) {
  const { setActiveAssignment, setAvailability: setLocalAvailability } = useRiderStore();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const bannerAnim = useRef(new Animated.Value(-80)).current;
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let interval;
    const fetchRequests = async () => {
      try {
        const res = await getDeliveryRequests();
        const fetched = res.data?.delivery_requests || res.data || [];
        const arr = (Array.isArray(fetched) ? fetched : []).filter(
          item => !item.order_type || item.order_type.toUpperCase() === 'DELIVERY'
        );
        setRequests(prev => {
          if (prev.length < arr.length && arr.length > 0) flashBanner();
          return arr;
        });
      } catch (e) {
        console.error('NotificationsScreen fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
    interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  const flashBanner = () => {
    setShowBanner(true);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(bannerAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
    ]).start(() => setShowBanner(false));
  };

  const handleAccept = async (item) => {
    setAcceptingId(item.assignment_id);
    try {
      await acceptAssignment(item.assignment_id);
      setActiveAssignment({
        ...item,
        assignment_id: item.assignment_id,
        order_id: item.order_id,
        restaurant_name: item.restaurant_name,
        restaurant_address: item.restaurant_address,
        restaurant: item.restaurant,
        customer_name: item.customer_name,
        customer_phone: item.customer_phone,
        customer_address: item.customer_address || item.delivery_address?.address_line,
        delivery_address: item.delivery_address,
        items: item.items,
        total_amount: item.total_amount,
        estimated_earnings: item.estimated_earnings,
        status: 'ACCEPTED',
      });
      setLocalAvailability(false);
      navigation.replace('RestaurantRoute');
    } catch (err) {
      console.error('Accept failed:', err);
      Alert.alert('Error', 'Could not accept delivery. Try again.');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = async (item) => {
    setRejectingId(item.assignment_id);
    try {
      await rejectAssignment(item.assignment_id);
      setRequests(prev => prev.filter(r => r.assignment_id !== item.assignment_id));
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* New request banner */}
      {showBanner && (
        <Animated.View style={[styles.banner, { transform: [{ translateY: bannerAnim }] }]}>
          <Ionicons name="notifications" size={18} color="#fff" />
          <Text style={styles.bannerText}>New Delivery Request!</Text>
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery Assignments</Text>
        {requests.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff471a" />
          <Text style={styles.loadingText}>Checking for deliveries…</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bicycle-outline" size={52} color="#d1d5db" />
          </View>
          <Text style={styles.emptyTitle}>No Assignments Yet</Text>
          <Text style={styles.emptySubtitle}>
            You'll be notified as soon as a delivery order is assigned to you.
            {'\n'}Make sure you're Online & Available.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>
            {requests.length} order{requests.length !== 1 ? 's' : ''} waiting for you
          </Text>
          {requests.map(item => (
            <OrderCard
              key={item.assignment_id}
              item={item}
              onAccept={handleAccept}
              onReject={handleReject}
              accepting={acceptingId === item.assignment_id}
              rejecting={rejectingId === item.assignment_id}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  banner: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: '#ff471a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#111' },
  badge: {
    backgroundColor: '#ff471a',
    minWidth: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#9ca3af' },

  emptyIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },

  scroll: { paddingTop: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 13, color: '#9ca3af', fontWeight: '600',
    paddingHorizontal: 20, marginBottom: 12,
  },
});
