import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';

export default function SettingsScreen({ navigation }) {
  const { settings, updateSettings } = useRiderStore();

  const renderSettingItem = (icon, title, subtitle, value, onValueChange, isToggle = true) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIconContainer}>
        <Ionicons name={icon} size={24} color="#4b5563" />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      {isToggle ? (
        <Switch
          trackColor={{ false: '#e5e7eb', true: '#fca5a5' }}
          thumbColor={value ? '#ff471a' : '#f9fafb'}
          onValueChange={onValueChange}
          value={value}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
        <View style={styles.settingsCard}>
          {renderSettingItem(
            "notifications-outline",
            "Push Notifications",
            "Receive alerts for new orders",
            settings.pushNotifications,
            (val) => updateSettings({ pushNotifications: val })
          )}
          {renderSettingItem(
            "flash-outline",
            "Auto-Accept Orders",
            "Automatically accept incoming deliveries",
            settings.autoAccept,
            (val) => updateSettings({ autoAccept: val })
          )}
          {renderSettingItem(
            "moon-outline",
            "Dark Theme",
            "Use dark mode for the app interface",
            settings.darkTheme,
            (val) => updateSettings({ darkTheme: val })
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>APP INFO</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.settingItem} onPress={() => alert('App version 1.0.0')}>
            <View style={styles.settingIconContainer}>
              <Ionicons name="information-circle-outline" size={24} color="#4b5563" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>App Version</Text>
              <Text style={styles.settingSubtitle}>1.0.0 (Build 42)</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={() => alert('Terms of Service')}>
            <View style={styles.settingIconContainer}>
              <Ionicons name="document-text-outline" size={24} color="#4b5563" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={() => alert('Privacy Policy')}>
            <View style={styles.settingIconContainer}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#4b5563" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingIconContainer: {
    marginRight: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
});
