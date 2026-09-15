import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Modal, Switch, Platform, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import useRiderStore from '../store/useRiderStore';
import { setOnlineStatus, setAvailability, getAvailableOrders, acceptAvailableOrder, acceptAssignment, rejectAssignment, getCurrentDelivery, getRiderMe, getEarningsSummary, setTokenGetter } from '../services/api';
import { startLocationTracking, stopLocationTracking, getCurrentLocation, getAddressFromCoords } from '../services/location';
import { playOrderRingNotification } from '../services/sound';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MapView, Marker, PROVIDER_GOOGLE } from '../components/WebSafeMap';
import * as Notifications from 'expo-notifications';

import DeliveriesTab from '../components/DeliveriesTab';
import EarningsTab from '../components/EarningsTab';
import AccountTab from '../components/AccountTab';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const pushEnabled = useRiderStore.getState().settings?.pushNotifications !== false;
      return {
        shouldShowAlert: pushEnabled,
        shouldPlaySound: pushEnabled,
        shouldSetBadge: pushEnabled,
      };
    },
  });
} catch (e) {
  console.log('Notifications handler not supported in Expo Go');
}

export default function DashboardScreen({ navigation }) {
  const { 
    riderId, riderProfile, isOnline, isAvailable, 
    setOnlineStatus: setLocalOnlineStatus, setAvailability: setLocalAvailability,
    setActiveAssignment, activeAssignmentId 
  } = useRiderStore();
  
  const [showOrder, setShowOrder] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [showNotificationMessage, setShowNotificationMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('Home');
  const [countdown, setCountdown] = useState(24);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const [isRejectingOrder, setIsRejectingOrder] = useState(false);
  
  // Local state for earnings and profile data
  const [earningsData, setEarningsData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Track notified assignments to prevent spam
  const [notifiedAssignments, setNotifiedAssignments] = useState(new Set());

  // Location UI State
  const [mapRegion, setMapRegion] = useState(null);
  const [locationText, setLocationText] = useState('Locating your position...');
  const [isLocating, setIsLocating] = useState(true);

  const pollingRef = useRef(null);

  const handleFindLocation = async () => {
    try {
      setIsLocating(true);
      const coords = await getCurrentLocation();
      setMapRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      const address = await getAddressFromCoords(coords.latitude, coords.longitude);
      setLocationText(address);
    } catch (err) {
      console.error("Couldn't get location:", err);
      setLocationText('Location unavailable');
    } finally {
      setIsLocating(false);
    }
  };

  // Fetch initial profile & stats
  const fetchProfileAndStats = async () => {
      try {
          const meRes = await getRiderMe();
          if (meRes.data) setProfileData(meRes.data);
          const earnRes = await getEarningsSummary();
          if (earnRes.data) setEarningsData(earnRes.data);
      } catch (e) { console.error(e); }
  };

  const onRefresh = async () => {
      setRefreshing(true);
      await fetchProfileAndStats();
      await handleFindLocation();
      setRefreshing(false);
  };

  // Route rider to the correct screen based on current delivery status
  const routeByStatus = (assignment, nav) => {
    const status = assignment?.status;
    if (!status) return;
    if (status === 'ACCEPTED' || status === 'GOING_TO_RESTAURANT') {
      nav.navigate('RestaurantRoute');
    } else if (status === 'ARRIVED_AT_RESTAURANT') {
      nav.navigate('VerifyPickup');
    } else if (status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY') {
      nav.navigate('CustomerNavigation');
    } else if (status === 'ARRIVED_AT_CUSTOMER') {
      nav.navigate('CompleteDelivery');
    }
    // DELIVERED / REJECTED / CANCELLED / FAILED → stay on Dashboard
  };

  useEffect(() => {
    // Auth guard — redirect to Login if not authenticated
    if (!riderId) {
      navigation.replace('Login');
      return;
    }

    // Re-register token getter from persisted store so API calls work after app restart
    const { token } = useRiderStore.getState();
    if (token) {
      setTokenGetter(() => token);
    }

    // Request push notification permissions safely
    const requestPermissions = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('Notification permissions not granted');
        }
      } catch (err) {
        console.log('Notifications not supported in Expo Go');
      }
    };
    requestPermissions();

    fetchProfileAndStats();

    // Check if rider already has an active delivery — route to correct screen by status
    const checkCurrentAndInit = async () => {
      try {
        const res = await getCurrentDelivery();
        const assignment = res.data?.current_assignment || (res.data?.assignment_id ? res.data : null);
        if (assignment && !['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(assignment.status)) {
          setActiveAssignment(assignment);
          routeByStatus(assignment, navigation);
          return; // don't start polling if active delivery
        }
      } catch (err) {
        console.error('Failed to init dashboard', err);
      }
      // No active delivery — start polling for new requests
      startPolling();
    };
    checkCurrentAndInit();

    // Auto-fetch location on mount
    handleFindLocation();

    return () => {
      stopPolling();
    };
  }, [riderId]);

  // Restart polling when online/availability status changes
  useEffect(() => {
    if (riderId) {
      stopPolling();
      if (isOnline && isAvailable && !activeAssignmentId) {
        startPolling();
      }
    }
  }, [isOnline, isAvailable, activeAssignmentId]);

  const startPolling = () => {
    if (pollingRef.current) return; // guard against duplicate intervals
    pollingRef.current = setInterval(async () => {
      try {
        const res = await getAvailableOrders();
        const requests = res.data?.delivery_requests || res.data || [];
        const requestsArray = (Array.isArray(requests) ? requests : []).filter(
          req => !req.order_type || req.order_type.toUpperCase() === 'DELIVERY'
        );
        if (requestsArray.length > 0) {
          const req = requestsArray[0];
          const normalizedReq = {
            ...req,
            order_type: req.order_type || 'DELIVERY',
            display_order_id: req.display_order_id || (req.order_id ? `ORD-${String(req.order_id).padStart(6, '0')}` : 'ORDER'),
            customer_name: req.customer_name || req.delivery_address?.contact_name || null,
            customer_phone: req.customer_phone || req.delivery_address?.contact_phone || null,
            customer_address: req.customer_address || req.delivery_address?.address_line || req.delivery_address?.full_address || null,
            restaurant_name: req.restaurant_name || req.restaurant?.name || null,
            restaurant_address: req.restaurant_address || req.restaurant?.address || null,
            restaurant: req.restaurant,
            items: req.items || [],
            items_count: req.items_count || req.items?.length || 0,
            // Real values only — no fallbacks
            estimated_earnings: req.estimated_earnings || null,
            tip_amount: req.tip_amount || null,
            pickup_distance: req.pickup_distance || null,
            drop_distance: req.drop_distance || null,
            drop_duration: req.drop_duration || null,
          };
          setPendingRequest(normalizedReq);
          setShowNotificationMessage(true);

          setNotifiedAssignments(prev => {
            if (!prev.has(normalizedReq.assignment_id)) {
              playOrderRingNotification(normalizedReq);
              setShowOrder(true);
              const next = new Set(prev);
              next.add(normalizedReq.assignment_id);
              return next;
            }
            return prev;
          });
        } else {
          setPendingRequest(null);
        }
      } catch (err) {
        // Network errors must not create fake requests
        console.error('Failed to fetch delivery requests', err);
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const toggleOnline = async (value) => {
    try {
      await setOnlineStatus(riderId, value);
      setLocalOnlineStatus(value);
      if (!value) {
        setLocalAvailability(false);
        stopLocationTracking();
      } else {
        await setAvailability(riderId, true);
        setLocalAvailability(true);
        startLocationTracking();
      }
    } catch (err) {
      console.error('Failed to toggle online status', err);
    }
  };

  const handleAcceptOrder = async () => {
    if (!pendingRequest) return;
    setIsAcceptingOrder(true);
    try {
      await acceptAssignment(pendingRequest.assignment_id);
      setActiveAssignment(pendingRequest);
      setShowOrder(false);
      setShowNotificationMessage(false);
      setPendingRequest(null);
      setLocalAvailability(false);
      navigation.navigate('RestaurantRoute');
    } catch (err) {
      console.error('Failed to accept order', err);
      setShowOrder(false);
    } finally {
      setIsAcceptingOrder(false);
    }
  };
  
  const handleRejectOrder = async () => {
    if (!pendingRequest) {
      setShowOrder(false);
      return;
    }
    setIsRejectingOrder(true);
    try {
      await rejectAssignment(pendingRequest.assignment_id);
      setShowOrder(false);
      setShowNotificationMessage(false);
      setPendingRequest(null);
    } catch (err) {
      console.error('Failed to reject order', err);
      setShowOrder(false);
    } finally {
      setIsRejectingOrder(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* New Order Modal matching wireframe */}
      <Modal visible={showOrder && !!pendingRequest} transparent={true} animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => {
            setShowOrder(false);
            setShowNotificationMessage(true);
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {/* Header: Dot + NEW ORDER ASSIGNMENT */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <View style={styles.statusDotRed} />
                <Text style={styles.modalTitle}>NEW ORDER ASSIGNMENT</Text>
              </View>
            </View>
            {/* Route Box: Pickup & Drop */}
            <View style={styles.routeCard}>
              {/* Pickup Point */}
              <View style={styles.routePointRow}>
                <Ionicons name="location-outline" size={22} color="#ff3815" style={styles.routeIcon} />
                <View style={styles.routeTextCol}>
                  <Text style={styles.routeSubLabel}>
                    PICKUP{pendingRequest?.pickup_distance ? ` (${pendingRequest.pickup_distance.includes('away') ? pendingRequest.pickup_distance : `${pendingRequest.pickup_distance} away`})` : ''}
                  </Text>
                  <Text style={styles.routeTitle} numberOfLines={1}>
                    {pendingRequest?.restaurant_name || 'Restaurant'}
                  </Text>
                </View>
              </View>

              {/* Dotted Divider */}
              <View style={styles.dottedDivider} />

              {/* Drop Point */}
              <View style={styles.routePointRow}>
                <Ionicons name="location-outline" size={22} color="#05a660" style={styles.routeIcon} />
                <View style={styles.routeTextCol}>
                  <Text style={styles.routeSubLabel}>
                    DROP{pendingRequest?.drop_distance ? ` (${pendingRequest.drop_distance}${pendingRequest.drop_duration ? `, ${pendingRequest.drop_duration}` : ''})` : ''}
                  </Text>
                  <Text style={styles.routeTitle} numberOfLines={1}>
                    {pendingRequest?.customer_address || pendingRequest?.delivery_address || 'Customer Location'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Financials: Estimated Earnings & Includes Tip */}
            <View style={styles.earningsTipRow}>
              <View>
                <Text style={styles.financialLabel}>ESTIMATED EARNINGS</Text>
                <Text style={styles.earningsGreenAmount}>
                  {pendingRequest?.estimated_earnings != null
                    ? `Rs. ${parseFloat(pendingRequest.estimated_earnings).toFixed(2)}`
                    : '--'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.financialLabel}>INCLUDES TIP</Text>
                <Text style={styles.tipOrangeAmount}>
                  {pendingRequest?.tip_amount != null
                    ? `Rs. ${parseFloat(pendingRequest.tip_amount).toFixed(2)}`
                    : '--'}
                </Text>
              </View>
            </View>

            {/* Items and Order Value Meta */}
            <View style={styles.orderMetaRow}>
              <Ionicons name="receipt-outline" size={17} color="#4b5563" style={{ marginRight: 6 }} />
              <Text style={styles.orderMetaText}>
                {pendingRequest?.items_count || pendingRequest?.items?.length || 0} Items
                {pendingRequest?.total_amount ? ` • Order Val: Rs. ${Number(pendingRequest.total_amount).toFixed(0)}` : ''}
              </Text>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity 
              style={styles.btnAccept} 
              onPress={handleAcceptOrder}
              disabled={isAcceptingOrder || isRejectingOrder}
              activeOpacity={0.88}
            >
              {isAcceptingOrder ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.btnAcceptText}>Accept Delivery</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.btnDecline} 
              onPress={handleRejectOrder}
              disabled={isAcceptingOrder || isRejectingOrder}
              activeOpacity={0.88}
            >
              {isRejectingOrder ? (
                <ActivityIndicator color="#6b7280" />
              ) : (
                <Text style={styles.btnDeclineText}>Decline & Pass Order</Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {activeTab === 'Home' && (
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff471a']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.profileSection}>
            {profileData?.profile_image || riderProfile?.profile_image ? (
              <Image source={{ uri: profileData?.profile_image || riderProfile?.profile_image }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={24} color="#9ca3af" />
              </View>
            )}
            <View>
              <Text style={styles.greeting}>Hi {profileData?.name || riderProfile?.name || 'Rajesh'}!</Text>
              <View style={styles.statusBadgeGreen}>
                <View style={styles.statusDotGreen} />
                <Text style={styles.statusTextGreen}>ONLINE</Text>
              </View>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', zIndex: 10 }}>
            <TouchableOpacity 
              style={styles.notificationBtn}
              onPress={() => {
                if (pendingRequest) {
                  setShowOrder(true);
                } else {
                  navigation.navigate('Notifications');
                }
              }}
            >
              <Ionicons name="notifications-outline" size={24} color="#000" />
              {pendingRequest && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>1</Text>
                </View>
              )}
            </TouchableOpacity>
            
            {showNotificationMessage && pendingRequest && (
              <TouchableOpacity 
                style={styles.messageBubble} 
                onPress={() => setShowOrder(true)}
                activeOpacity={0.9}
              >
                <View style={styles.messageBubbleArrow} />
                <Text style={styles.messageBubbleTitle}>New Order #{pendingRequest.display_order_id} 🍔</Text>
                <Text style={styles.messageBubbleText} numberOfLines={1}>
                  {pendingRequest.customer_name ? `${pendingRequest.customer_name} • ` : ''}Tap to view & accept
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Toggle Bar */}
        <View style={styles.waitingBar}>
          <Switch 
            value={isOnline} 
            onValueChange={toggleOnline} 
            trackColor={{ false: '#d1d5db', true: '#05a660' }}
            thumbColor="#fff"
          />
          <Text style={styles.waitingText}>
            {isOnline ? 'Available - Waiting for orders' : 'Offline - Not receiving orders'}
          </Text>
        </View>

        {/* Today's Earnings Highlight */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsContent}>
            <Text style={styles.earningsLabel}>TODAY'S EARNINGS</Text>
            <Text style={styles.earningsAmount}>Rs. {earningsData?.today_earnings || '0.00'}</Text>
            <View style={styles.deliveriesBadge}>
              <Text style={styles.deliveriesText}>{earningsData?.deliveries_today || 0} Deliveries</Text>
            </View>
          </View>
          <Image
            source={require('../assets/rider_banner.jpg')}
            style={styles.earningsImage}
            resizeMode="cover"
          />
        </View>

        {/* Current Location Duty */}
        <View style={styles.locationCard}>
          <View style={styles.locationHeaderRow}>
            <Text style={styles.locationCardTitle}>Your Current Duty Location</Text>
            <TouchableOpacity style={styles.btnSettings}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.mapContainer}>
             {mapRegion ? (
               <MapView
                 provider={PROVIDER_GOOGLE}
                 style={styles.map}
                 region={mapRegion}
               >
                  <Marker
                    coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                    title="Your Location"
                  >
                    <Ionicons name="location" size={40} color="#ff471a" />
                  </Marker>
               </MapView>
             ) : (
               <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e5e7eb' }]}>
                 <ActivityIndicator size="large" color="#ff471a" />
                 <Text style={{ marginTop: 10, color: '#6b7280' }}>Fetching GPS...</Text>
               </View>
             )}
             <TouchableOpacity style={styles.locateBtn} onPress={handleFindLocation} disabled={isLocating}>
               {isLocating ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#fff" />}
             </TouchableOpacity>
          </View>

          <View style={styles.locationFooter}>
            <Ionicons name="location-outline" size={16} color="#ff471a" style={{marginTop: 2}}/>
            <Text style={styles.locationAddressText} numberOfLines={2}>{locationText}</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Rides</Text>
            <Text style={styles.statValue}>{earningsData?.total_rides || 0}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Rating</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.statValue}>{earningsData?.rating || '0.0'}</Text>
                <Ionicons name="star" size={16} color="#111" style={{marginLeft: 4, marginTop: 2}}/>
            </View>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>Rs. {earningsData?.this_week_earnings || '0.00'}</Text>
          </View>
        </View>
      </ScrollView>
      )}

      {activeTab === 'Deliveries' && <DeliveriesTab />}
      {activeTab === 'Earnings' && <EarningsTab />}
      {activeTab === 'Account' && <AccountTab />}

      {/* Bottom Tab Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('Home')}>
          <Ionicons name="home" size={24} color={activeTab === 'Home' ? '#ff471a' : '#6b7280'} />
          <Text style={[styles.tabText, { color: activeTab === 'Home' ? '#ff471a' : '#6b7280' }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('Deliveries')}>
          <Ionicons name="cube-outline" size={24} color={activeTab === 'Deliveries' ? '#ff471a' : '#6b7280'} />
          <Text style={[styles.tabText, { color: activeTab === 'Deliveries' ? '#ff471a' : '#6b7280' }]}>Deliveries</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('Earnings')}>
          <Ionicons name="trending-up" size={24} color={activeTab === 'Earnings' ? '#ff471a' : '#6b7280'} />
          <Text style={[styles.tabText, { color: activeTab === 'Earnings' ? '#ff471a' : '#6b7280' }]}>Earnings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('Account')}>
          <Ionicons name="person-outline" size={24} color={activeTab === 'Account' ? '#ff471a' : '#6b7280'} />
          <Text style={[styles.tabText, { color: activeTab === 'Account' ? '#ff471a' : '#6b7280' }]}>Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10 },
  scrollContent: { padding: 20, paddingTop: 10, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  profileSection: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 12 },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  statusBadgeGreen: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f7f1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginTop: 4, alignSelf: 'flex-start' },
  statusDotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#057a55', marginRight: 4 },
  statusTextGreen: { color: '#057a55', fontSize: 11, fontWeight: 'bold' },
  notificationBtn: { padding: 8, backgroundColor: 'white', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, position: 'relative' },
  notificationBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ff471a', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
  notificationBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  
  messageBubble: { position: 'absolute', top: 50, right: 0, backgroundColor: '#111', padding: 12, borderRadius: 12, width: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5, zIndex: 100 },
  messageBubbleArrow: { position: 'absolute', top: -6, right: 15, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#111' },
  messageBubbleTitle: { color: 'white', fontWeight: 'bold', fontSize: 13, marginBottom: 2 },
  messageBubbleText: { color: '#ccc', fontSize: 11 },
  
  waitingBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  waitingText: { color: '#6b7280', marginLeft: 8, fontWeight: '600', fontSize: 14 },
  
  earningsCard: { backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 20, flexDirection: 'row', overflow: 'hidden', minHeight: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3, position: 'relative' },
  earningsContent: { padding: 20, flex: 1, zIndex: 2 },
  earningsLabel: { color: '#4b5563', fontWeight: 'bold', fontSize: 11, marginBottom: 8, letterSpacing: 0.5 },
  earningsAmount: { fontSize: 32, fontWeight: '800', color: '#ff471a', marginBottom: 12 },
  deliveriesBadge: { backgroundColor: '#ff471a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  deliveriesText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  earningsImage: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '48%', height: '100%', borderTopRightRadius: 16, borderBottomRightRadius: 16 },

  locationCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  locationCardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  mapContainer: { height: 130, borderRadius: 12, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  map: { width: '100%', height: '100%' },
  locateBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#111', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  mapRings: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ffeee6', justifyContent: 'center', alignItems: 'center' },
  distanceBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  distanceText: { fontSize: 11, fontWeight: 'bold', color: '#111', marginLeft: 4 },
  locationFooter: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  locationFooterText: { color: '#6b7280', fontSize: 12, marginLeft: 6 },
  locationAddressText: { color: '#6b7280', fontSize: 12, marginLeft: 6, flex: 1, flexWrap: 'wrap' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statBox: { backgroundColor: 'white', padding: 16, borderRadius: 12, flex: 1, marginHorizontal: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  statLabel: { color: '#6b7280', fontSize: 12, marginBottom: 8 },
  statValue: { color: '#111', fontSize: 18, fontWeight: 'bold' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText: { fontSize: 11, marginTop: 4, color: '#6b7280' },

  // Wireframe Modal styles
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0, 0, 0, 0.55)', 
    justifyContent: 'center', 
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: { 
    backgroundColor: '#ffffff', 
    borderRadius: 24, 
    padding: 20, 
    shadowColor: '#ff4d15', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 18, 
    elevation: 10, 
    borderWidth: 1.5, 
    borderColor: '#ff4d15',
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
  },
  modalTitleContainer: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  statusDotRed: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#ff3815', 
    marginRight: 8,
  },
  modalTitle: { 
    color: '#ff3815', 
    fontWeight: '900', 
    fontSize: 14, 
    letterSpacing: 0.4,
  },
  timerPill: { 
    backgroundColor: '#ffede7', 
    paddingHorizontal: 12, 
    paddingVertical: 4, 
    borderRadius: 12,
  },
  timerText: { 
    color: '#ff3815', 
    fontWeight: '800', 
    fontSize: 12,
  },
  progressBarContainer: { 
    height: 3, 
    backgroundColor: '#f1f3f5', 
    borderRadius: 2, 
    marginTop: 14, 
    marginBottom: 16, 
    overflow: 'hidden',
  },
  progressBarFill: { 
    height: 3, 
    backgroundColor: '#ff3815', 
    borderRadius: 2,
  },
  
  routeCard: { 
    backgroundColor: '#f8f9fa', 
    borderRadius: 16, 
    padding: 14, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: '#f1f3f5',
  },
  routePointRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  routeIcon: { 
    marginRight: 10,
  },
  routeTextCol: { 
    flex: 1,
  },
  routeSubLabel: { 
    color: '#6b7280', 
    fontSize: 11, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    marginBottom: 2,
  },
  routeTitle: { 
    color: '#111827', 
    fontSize: 15, 
    fontWeight: '800',
  },
  dottedDivider: { 
    borderBottomWidth: 1, 
    borderStyle: 'dotted', 
    borderColor: '#d1d5db', 
    marginVertical: 10, 
    marginLeft: 32,
  },
  
  earningsTipRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end', 
    marginBottom: 14,
  },
  financialLabel: { 
    color: '#6b7280', 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 0.5, 
    marginBottom: 3, 
    textTransform: 'uppercase',
  },
  earningsGreenAmount: { 
    color: '#00a651', 
    fontSize: 26, 
    fontWeight: '900',
  },
  tipOrangeAmount: { 
    color: '#ff3815', 
    fontSize: 15, 
    fontWeight: '800',
  },
  
  orderMetaRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 18,
  },
  orderMetaText: { 
    color: '#374151', 
    fontSize: 13, 
    fontWeight: '600',
  },
  
  btnAccept: { 
    backgroundColor: '#00a651', 
    paddingVertical: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginBottom: 10, 
    shadowColor: '#00a651', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 6, 
    elevation: 3,
  },
  btnAcceptText: { 
    color: '#ffffff', 
    fontWeight: '800', 
    fontSize: 16,
  },
  btnDecline: { 
    backgroundColor: '#f3f4f6', 
    paddingVertical: 16, 
    borderRadius: 14, 
    alignItems: 'center',
  },
  btnDeclineText: { 
    color: '#4b5563', 
    fontWeight: '700', 
    fontSize: 15,
  },
});
