import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';
import { getVehicleInfo, updateVehicleInfo } from '../services/api';

const VEHICLE_TYPES = ['Bike', 'Scooter', 'Electric Vehicle', 'Bicycle'];
const OWNERSHIP_TYPES = ['Own', 'Rented', 'Leased'];
const FUEL_TYPES = ['Petrol', 'Electric', 'CNG', 'Other'];

export default function VehicleInfoScreen({ navigation }) {
  const { riderId } = useRiderStore();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    vehicle_type: 'Bike',
    vehicle_ownership: 'Own',
    vehicle_number: '',
    vehicle_brand: '',
    vehicle_model: '',
    fuel_type: 'Petrol',
    vehicle_color: ''
  });

  const [expandedField, setExpandedField] = useState(null);

  useEffect(() => {
    fetchVehicleInfo();
  }, []);

  const fetchVehicleInfo = async () => {
    try {
      setLoading(true);
      const res = await getVehicleInfo();
      if (res.data && Object.keys(res.data).length > 0) {
        setFormData(prev => ({ ...prev, ...res.data }));
      }
    } catch (err) {
      console.error('Failed to load vehicle info', err);
      setError('Could not load vehicle details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      // Validation
      if (formData.vehicle_type !== 'Bicycle') {
        if (!formData.vehicle_number || formData.vehicle_number.trim().length < 5) {
          setError('Please enter a valid vehicle registration number');
          setSaving(false);
          return;
        }
      }

      await updateVehicleInfo(formData);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to save vehicle info', err);
      setError('Failed to save vehicle information.');
    } finally {
      setSaving(false);
    }
  };

  const handleTextChange = (field, value) => {
    if (field === 'vehicle_number') {
      value = value.toUpperCase();
    }
    setFormData({ ...formData, [field]: value });
  };

  const isBicycle = formData.vehicle_type === 'Bicycle';

  const renderDropdown = (label, field, options) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={styles.dropdownButton}
        onPress={() => setExpandedField(expandedField === field ? null : field)}
      >
        <Text style={styles.dropdownText}>{formData[field] || 'Select'}</Text>
        <Ionicons name={expandedField === field ? "chevron-up" : "chevron-down"} size={20} color="#6b7280" />
      </TouchableOpacity>
      
      {expandedField === field && (
        <View style={styles.dropdownOptions}>
          {options.map(opt => (
            <TouchableOpacity 
              key={opt}
              style={styles.dropdownOption}
              onPress={() => {
                setFormData({ ...formData, [field]: opt });
                setExpandedField(null);
              }}
            >
              <Text style={[styles.dropdownOptionText, formData[field] === opt && styles.dropdownOptionTextSelected]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderInput = (label, field, placeholder) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={formData[field]}
        onChangeText={(text) => handleTextChange(field, text)}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
      />
    </View>
  );

  const renderDocumentCard = (title, status, dateLabel, dateValue) => (
    <View style={styles.documentCard}>
      <View style={styles.documentHeader}>
        <Text style={styles.documentTitle}>{title}</Text>
        <TouchableOpacity style={styles.uploadBtn}>
          <Text style={styles.uploadBtnText}>Upload / View</Text>
          <Ionicons name="chevron-forward" size={16} color="#05a660" />
        </TouchableOpacity>
      </View>
      {dateValue && <Text style={styles.documentExpiry}>{dateLabel}: {dateValue}</Text>}
      <View style={styles.statusRow}>
        <Ionicons name="checkmark-circle" size={16} color="#05a660" />
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff471a" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Information</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>VEHICLE DETAILS</Text>
          
          {renderDropdown('Vehicle Type', 'vehicle_type', VEHICLE_TYPES)}
          {renderDropdown('Vehicle Ownership', 'vehicle_ownership', OWNERSHIP_TYPES)}
          
          {!isBicycle && renderInput('Vehicle Number', 'vehicle_number', 'e.g. TN 09 AB 1234')}
          
          {renderInput('Brand', 'vehicle_brand', 'e.g. Honda')}
          {renderInput('Model', 'vehicle_model', 'e.g. Activa 6G')}
          
          {!isBicycle && renderDropdown('Fuel Type', 'fuel_type', FUEL_TYPES)}
          
          {renderInput('Vehicle Color', 'vehicle_color', 'e.g. Black')}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>VEHICLE DOCUMENTS</Text>
          
          {!isBicycle && renderDocumentCard('Registration Certificate (RC)', 'Verified', null, null)}
          {!isBicycle && renderDocumentCard('Vehicle Insurance', 'Verified', 'Expiry', '18 Aug 2027')}
          {!isBicycle && renderDocumentCard('Pollution Certificate (PUC)', 'Verified', 'Expiry', '10 Feb 2027')}
          {isBicycle && <Text style={styles.noteText}>No documents required for Bicycle.</Text>}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>VEHICLE PHOTO</Text>
          <View style={styles.photoCard}>
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={40} color="#9ca3af" />
              <Text style={styles.photoPlaceholderText}>No photo uploaded</Text>
            </View>
            <TouchableOpacity style={styles.uploadPhotoBtn}>
              <Text style={styles.uploadPhotoBtnText}>Upload / Change Photo</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Vehicle Details</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  keyboardView: {
    flex: 1,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#111',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
  },
  dropdownText: {
    fontSize: 15,
    color: '#111',
  },
  dropdownOptions: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#4b5563',
  },
  dropdownOptionTextSelected: {
    color: '#ff471a',
    fontWeight: 'bold',
  },
  documentCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadBtnText: {
    fontSize: 13,
    color: '#05a660',
    fontWeight: '600',
    marginRight: 4,
  },
  documentExpiry: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#05a660',
    fontWeight: '500',
    marginLeft: 6,
  },
  noteText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  photoCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  photoPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoPlaceholderText: {
    color: '#9ca3af',
    marginTop: 8,
    fontSize: 13,
  },
  uploadPhotoBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  uploadPhotoBtnText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#ff471a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnDisabled: {
    backgroundColor: '#fca5a5',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
