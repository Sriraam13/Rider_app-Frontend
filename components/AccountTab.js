import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Switch, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { authLogout, updateRiderStatus } from '../services/api';
import { stopLocationTracking } from '../services/location';

export default function AccountTab() {
  const navigation = useNavigation();
  const { riderProfile, logoutRider } = useRiderStore();
  const [isOnline, setIsOnline] = useState(riderProfile?.is_online || true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Re-fetch rider profile (simulate network delay)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) { console.log(e) }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    try {
      await authLogout();
    } catch (e) {
      console.log('Logout error (ignoring)', e);
    }
    // Stop GPS tracking before clearing auth
    stopLocationTracking();
    logoutRider();
    navigation.replace('Login');
  };

  const ListItem = ({ icon, title, subtitle, isLogout, onPress }) => (
    <TouchableOpacity style={[styles.listItem, isLogout && styles.listItemLogout]} onPress={onPress}>
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
      <Ionicons name="chevron-forward" size={20} color={isLogout ? "#e11d48" : "#9ca3af"} />
    </TouchableOpacity>
  );

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
          <View style={[styles.avatar, { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={36} color="#9ca3af" />
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{riderProfile?.name || 'Rajesh Kumar'}</Text>
          <Text style={styles.phone}>{riderProfile?.phone || '+91 98765 43210'}</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            {isOnline ? <Text style={styles.statusText}>ON DUTY</Text> : <Text style={[styles.statusText, {color: "gray"}]}>OFF DUTY</Text>}
          </View>
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
              console.log("Status updated to", newValue);
            } catch (err) {
              setIsOnline(!newValue); // Revert on failure
              alert("Failed to update status");
            }
          }
        }}
          value={isOnline}
        />
      </View>

      {/* Account Details Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>ACCOUNT DETAILS</Text>
        <ListItem 
          icon="document-text-outline" 
          title="My Documents" 
          subtitle="Driving License, Pan Card, Aadhaar" 
          onPress={() => navigation.navigate('MyDocuments')}
        />
        <ListItem 
          icon="card-outline" 
          title="Bank Details" 
          subtitle="Linked Account for Weekly Payouts" 
          onPress={() => navigation.navigate('BankDetails')}
        />
        <ListItem 
          icon="car-sport-outline" 
          title="Vehicle Info" 
          subtitle="Two-Wheeler Details & Insurance" 
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
          onPress={() => alert('Coming Soon!')}
        />
        <ListItem 
          icon="settings-outline" 
          title="Settings" 
          subtitle="Preferences & Language Options" 
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
          <Ionicons name="chevron-forward" size={20} color="#e11d48" />
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
    paddingTop: 5, // Reduced padding to fix extra top space
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5, // Reduced margin
    marginBottom: 24,
  },
  avatar: { 
    width: 70, 
    height: 70, 
    borderRadius: 35, 
    marginRight: 16 
  },
  profileInfo: {
    flex: 1,
  },
  name: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#111',
    marginBottom: 4
  },
  phone: { 
    fontSize: 14, 
    color: '#6b7280', 
    marginBottom: 8 
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dutyTexts: {
    flex: 1,
    paddingRight: 16,
  },
  dutyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  dutySubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
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
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  listItemTexts: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
  },
  logoutText: {
    color: '#e11d48',
  }
});
