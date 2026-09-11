import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useRiderStore from '../store/useRiderStore';

export default function BankDetailsScreen({ navigation }) {
  const { bankDetails, updateBankDetails } = useRiderStore();
  
  const [formData, setFormData] = useState({
    accountName: bankDetails.accountName || '',
    accountNumber: bankDetails.accountNumber || '',
    ifsc: bankDetails.ifsc || '',
    bankName: bankDetails.bankName || '',
  });

  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    // Simulate network delay
    setTimeout(() => {
      updateBankDetails(formData);
      setSaving(false);
      navigation.goBack();
    }, 800);
  };

  const renderInput = (label, field, placeholder, isSecure = false, autoCapitalize = 'words') => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={formData[field]}
        onChangeText={(text) => setFormData({ ...formData, [field]: text })}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        secureTextEntry={isSecure}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bank Details</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>LINKED BANK ACCOUNT</Text>

          <View style={styles.formCard}>
            {renderInput('Bank Name', 'bankName', 'e.g. HDFC Bank')}
            {renderInput('Account Holder Name', 'accountName', 'e.g. John Doe')}
            {renderInput('Account Number', 'accountNumber', 'e.g. 123456789012', true, 'none')}
            {renderInput('IFSC Code', 'ifsc', 'e.g. HDFC0001234', false, 'characters')}
          </View>

          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Bank Details</Text>}
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
  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
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
  saveBtn: {
    backgroundColor: '#ff471a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
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
