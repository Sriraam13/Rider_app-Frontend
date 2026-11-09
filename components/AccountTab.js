import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Switch, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { 
  getRiderMe, 
  getVehicleInfo, 
  getRiderBankDetails, 
  getRiderDocuments, 
  updateRiderStatus 
} from '../services/api';

export default function AccountTab() {
  const navigation = useNavigation();
  const riderProfile = useRiderStore(s => s.riderProfile);
  const logoutRider = useRiderStore(s => s.logoutRider);
  const [isOnline, setIsOnline] = useState(riderProfile?.is_online || false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Profile completion sub-states
  const [statusDetails, setStatusDetails] = useState({
    vehicleInfo: false,
    bankDetails: false,
    documents: false,
    percentage: 0,
    isComplete: false,
  });

  const fetchAllAccountDetails = async () => {
    try {
      const [meRes, vehRes, bankRes, docsRes] = await Promise.allSettled([
        getRiderMe(),
        getVehicleInfo(),
        getRiderBankDetails(),
        getRiderDocuments(),
      ]);

      let hasVehicle = false;
      if (vehRes.status === 'fulfilled' && vehRes.value?.data) {
        const v = vehRes.value.data;
        hasVehicle = !!(v.vehicle_type && (v.vehicle_type.toLowerCase() === 'bicycle' || (v.vehicle_number && v.vehicle_number.trim().length >= 3)));
      }

      let hasBank = false;
      if (bankRes.status === 'fulfilled' && bankRes.value?.data) {
        const b = bankRes.value.data;
        hasBank = !!(b.account_number && b.account_number.trim().length >= 4 && b.ifsc_code);
      }

      let hasDocs = false;
      if (docsRes.status === 'fulfilled' && docsRes.value?.data) {
        const d = docsRes.value.data;
        const hasLicense = !!d.license;
        const hasId = !!(d.aadhaar_front || d.pan_card);
        hasDocs = hasLicense && hasId;
      }

      if (meRes.status === 'fulfilled' && meRes.value?.data) {
        const me = meRes.value.data;
        setIsOnline(me.is_online || false);
        useRiderStore.getState().loginRider(me, useRiderStore.getState().token);
      }

      const completedCount = (hasVehicle ? 1 : 0) + (hasBank ? 1 : 0) + (hasDocs ? 1 : 0);
      let percentage = 0;
      if (completedCount === 1) percentage = 33;
      else if (completedCount === 2) percentage = 67;
      else if (completedCount === 3) percentage = 100;

      setStatusDetails({
        vehicleInfo: hasVehicle,
        bankDetails: hasBank,
        documents: hasDocs,
        percentage,
        isComplete: percentage === 100,
      });
    } catch (e) {
      console.warn('Error fetching account details:', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAllAccountDetails();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllAccountDetails();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logoutRider();
  };

  const ListItem = ({ icon, title, subtitle, badgeText, badgeType, isLogout, onPress }) => (
    <TouchableOpacity style={[styles.listItem, isLogout && styles.listItemLogout]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.listItemLeft}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name={icon} 
            size={20} 
            color={isLogout ? "#e11d48" : "#374151"} 
          />
        </View>
        <View style={styles.listItemTexts}>
          <Text style={[styles.listItemTitle, isLogout && styles.logoutText]}>{title}</Text>
          {subtitle ? <Text style={styles.listItemSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.listItemRight}>
        {badgeText && (
          <View style={[styles.itemBadge, badgeType === 'success' ? styles.itemBadgeSuccess : styles.itemBadgeWarning]}>
            <Text style={[styles.itemBadgeText, badgeType === 'success' ? styles.itemBadgeTextSuccess : styles.itemBadgeTextWarning]}>
              {badgeText}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={isLogout ? "#e11d48" : "#9ca3af"} />
      </View>
    </TouchableOpacity>
  );

  const { percentage, isComplete, vehicleInfo, bankDetails, documents } = statusDetails;

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff471a']} />
      }
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        {riderProfile?.profile_image ? (
          <Image source={{ uri: riderProfile.profile_image }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={36} color="#ff471a" />
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{riderProfile?.name || 'MaitreD Rider'}</Text>
          <Text style={styles.phone}>{riderProfile?.phone || '+91 ----------'}</Text>
          
          <View style={styles.headerBadgesRow}>
            {/* Duty status badge */}
            <View style={[styles.statusBadge, isOnline ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
              <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
              <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextOffline]}>
                {isOnline ? 'ON DUTY' : 'OFF DUTY'}
              </Text>
            </View>

            {/* Profile completion mini badge */}
            <View style={[styles.statusBadge, isComplete ? styles.completionBadgeFull : styles.completionBadgePartial]}>
              <Ionicons 
                name={isComplete ? "shield-checkmark" : "alert-circle"} 
                size={12} 
                color={isComplete ? "#05a660" : "#d97706"} 
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.statusText, isComplete ? styles.completionTextFull : styles.completionTextPartial]}>
                {isComplete ? 'VERIFIED (100%)' : `${percentage}% COMPLETED`}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── PROFILE COMPLETION STATUS CARD ─────────────────────────────── */}
      <View style={[styles.completionCard, isComplete && styles.completionCardSuccess]}>
        <View style={styles.completionCardHeader}>
          <View style={styles.completionTitleRow}>
            <Ionicons 
              name={isComplete ? "checkmark-circle" : "sparkles"} 
              size={20} 
              color={isComplete ? "#05a660" : "#ff471a"} 
              style={{ marginRight: 8 }}
            />
            <Text style={styles.completionCardTitle}>
              {isComplete ? 'Profile 100% Completed' : percentage === 0 ? 'Onboarding Pending (0%)' : `Profile ${percentage}% Completed`}
            </Text>
          </View>
          <Text style={[styles.completionPercentText, isComplete && styles.completionPercentSuccess]}>
            {percentage}%
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${percentage}%` }, isComplete && styles.progressBarFillSuccess]} />
        </View>

        <Text style={styles.completionCardSubtitle}>
          {isComplete 
            ? 'Your profile is fully verified and eligible to receive customer delivery requests.'
            : percentage === 0
            ? 'Please add your vehicle, bank details, and documents to start receiving delivery orders.'
            : 'Complete the remaining onboarding steps to start accepting delivery orders.'}
        </Text>

        {/* Actionable Step Chips */}
        <View style={styles.chipsContainer}>
          <TouchableOpacity 
            style={[styles.stepChip, vehicleInfo ? styles.stepChipDone : styles.stepChipPending]}
            onPress={() => navigation.navigate('VehicleInfo')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={vehicleInfo ? "checkmark-circle" : "add-circle-outline"} 
              size={14} 
              color={vehicleInfo ? "#05a660" : "#ea580c"} 
            />
            <Text style={vehicleInfo ? styles.stepChipTextDone : styles.stepChipTextPending}>
              {vehicleInfo ? 'Vehicle Info' : '+ Vehicle'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.stepChip, bankDetails ? styles.stepChipDone : styles.stepChipPending]}
            onPress={() => navigation.navigate('BankDetails')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={bankDetails ? "checkmark-circle" : "add-circle-outline"} 
              size={14} 
              color={bankDetails ? "#05a660" : "#ea580c"} 
            />
            <Text style={bankDetails ? styles.stepChipTextDone : styles.stepChipTextPending}>
              {bankDetails ? 'Bank Linked' : '+ Bank'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.stepChip, documents ? styles.stepChipDone : styles.stepChipPending]}
            onPress={() => navigation.navigate('MyDocuments')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={documents ? "checkmark-circle" : "cloud-upload-outline"} 
              size={14} 
              color={documents ? "#05a660" : "#ea580c"} 
            />
            <Text style={documents ? styles.stepChipTextDone : styles.stepChipTextPending}>
              {documents ? 'Documents' : '+ Documents'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Duty Status Toggle */}
      <View style={styles.dutyCard}>
        <View style={styles.dutyTexts}>
          <Text style={styles.dutyTitle}>Duty Status</Text>
          <Text style={styles.dutySubtitle}>Slide to toggle receiving delivery requests</Text>
        </View>
        <Switch
          trackColor={{ false: '#d1d5db', true: '#22c55e' }}
          thumbColor={'#ffffff'}
          ios_backgroundColor="#d1d5db"
          onValueChange={async () => {
            const newValue = !isOnline;
            setIsOnline(newValue);
            if (riderProfile?.id) {
              try {
                await updateRiderStatus(riderProfile.id, newValue);
              } catch (err) {
                setIsOnline(!newValue);
                alert("Failed to update status");
              }
            }
          }}
          value={isOnline}
        />
      </View>

      {/* Account Details Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>ACCOUNT ONBOARDING DETAILS</Text>
        
        <ListItem 
          icon="document-text-outline" 
          title="My Documents" 
          subtitle="Driving License, PAN Card, Aadhaar" 
          badgeText={documents ? "Saved" : "Action Needed"}
          badgeType={documents ? "success" : "warning"}
          onPress={() => navigation.navigate('MyDocuments')}
        />
        
        <ListItem 
          icon="card-outline" 
          title="Bank Details" 
          subtitle="Linked Account for Weekly Payouts" 
          badgeText={bankDetails ? "Linked" : "Required"}
          badgeType={bankDetails ? "success" : "warning"}
          onPress={() => navigation.navigate('BankDetails')}
        />
        
        <ListItem 
          icon="car-sport-outline" 
          title="Vehicle Info" 
          subtitle="Two-Wheeler Details & Registration" 
          badgeText={vehicleInfo ? "Configured" : "Required"}
          badgeType={vehicleInfo ? "success" : "warning"}
          onPress={() => navigation.navigate('VehicleInfo')}
        />
      </View>

      {/* Support & App Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>SUPPORT & APP</Text>
        <ListItem 
          icon="help-circle-outline" 
          title="Support" 
          subtitle="Help Center & Active Disputes" 
          onPress={() => alert('Support helpline is available 24/7.')}
        />
        <ListItem 
          icon="settings-outline" 
          title="Settings" 
          subtitle="Preferences & Notification Options" 
          onPress={() => navigation.navigate('Settings')}
        />
        <TouchableOpacity style={[styles.listItem, styles.listItemLogout]} onPress={handleLogout}>
          <View style={styles.listItemLeft}>
            <View style={[styles.iconContainer, { backgroundColor: 'transparent' }]}>
              <Ionicons name="log-out-outline" size={24} color="#e11d48" />
            </View>
            <View style={styles.listItemTexts}>
              <Text style={[styles.listItemTitle, styles.logoutText]}>Logout</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#e11d48" />
        </TouchableOpacity>
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#fafafa',
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  avatar: { 
    width: 68, 
    height: 68, 
    borderRadius: 34, 
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  name: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#111827',
    marginBottom: 2,
  },
  phone: { 
    fontSize: 13, 
    color: '#6b7280', 
    marginBottom: 6,
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeOnline: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeOffline: {
    backgroundColor: '#f3f4f6',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusDotOnline: {
    backgroundColor: '#16a34a',
  },
  statusDotOffline: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusTextOnline: {
    color: '#16a34a',
  },
  statusTextOffline: {
    color: '#6b7280',
  },
  completionBadgeFull: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  completionBadgePartial: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  completionTextFull: {
    color: '#05a660',
  },
  completionTextPartial: {
    color: '#d97706',
  },

  // ── Profile Completion Status Card Styles ──
  completionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#fed7aa',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  completionCardSuccess: {
    borderColor: '#bbf7d0',
    shadowColor: '#22c55e',
  },
  completionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  completionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completionCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  completionPercentText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ea580c',
  },
  completionPercentSuccess: {
    color: '#05a660',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#f97316',
    borderRadius: 4,
  },
  progressBarFillSuccess: {
    backgroundColor: '#05a660',
  },
  completionCardSubtitle: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 17,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  stepChipDone: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  stepChipPending: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  stepChipTextDone: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
    marginLeft: 4,
  },
  stepChipTextPending: {
    fontSize: 11,
    fontWeight: '600',
    color: '#c2410c',
    marginLeft: 4,
  },

  // ── Duty Card Styles ──
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dutyTexts: {
    flex: 1,
    paddingRight: 16,
  },
  dutyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  dutySubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  listItemLogout: {
    backgroundColor: '#fff1f2',
    borderColor: '#ffe4e6',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  listItemTexts: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  itemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  itemBadgeSuccess: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  itemBadgeWarning: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  itemBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemBadgeTextSuccess: {
    color: '#16a34a',
  },
  itemBadgeTextWarning: {
    color: '#ea580c',
  },
  logoutText: {
    color: '#e11d48',
    fontWeight: '700',
  }
});
