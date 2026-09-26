import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useRiderStore from '../store/useRiderStore';
import { getRiderDocuments, updateRiderDocuments } from '../services/api';

export default function MyDocumentsScreen({ navigation }) {
  const { documents, updateDocuments } = useRiderStore();
  const [loadingKey, setLoadingKey] = useState(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const response = await getRiderDocuments();
        if (response.data && Object.keys(response.data).length > 0) {
          updateDocuments({
            aadhaarFront: response.data.aadhaar_front || null,
            aadhaarBack: response.data.aadhaar_back || null,
            pan: response.data.pan_card || null,
            license: response.data.license || null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch documents:', error);
      }
    };
    fetchDocs();
  }, []);

  const handlePickImage = async (docKey) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        
        setLoadingKey(docKey);
        // Map frontend docKey to backend payload key
        const keyMap = {
          aadhaarFront: 'aadhaar_front',
          aadhaarBack: 'aadhaar_back',
          pan: 'pan_card',
          license: 'license'
        };
        
        await updateRiderDocuments({
          [keyMap[docKey]]: imageUri
        });
        
        updateDocuments({ [docKey]: imageUri });
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      Alert.alert('Error', 'Failed to upload document. Please try again.');
    } finally {
      setLoadingKey(null);
    }
  };

  const renderDocumentCard = (title, docKey) => {
    const isUploaded = !!documents[docKey];
    const isLoading = loadingKey === docKey;

    return (
      <View style={styles.documentCard}>
        <View style={styles.documentHeader}>
          <Text style={styles.documentTitle}>{title}</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => handlePickImage(docKey)}>
            <Text style={styles.uploadBtnText}>{isUploaded ? 'Update Photo' : 'Take Photo / Upload'}</Text>
            <Ionicons name="camera-outline" size={16} color="#05a660" />
          </TouchableOpacity>
        </View>
        
        {isLoading ? (
          <ActivityIndicator color="#ff471a" style={{ marginVertical: 10 }} />
        ) : isUploaded ? (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: documents[docKey] }} style={styles.imagePreview} />
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={16} color="#05a660" />
              <Text style={styles.statusText}>Uploaded locally</Text>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>No photo uploaded</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Documents</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>PERSONAL DOCUMENTS</Text>
        
        {renderDocumentCard('Aadhaar Card (Front)', 'aadhaarFront')}
        {renderDocumentCard('Aadhaar Card (Back)', 'aadhaarBack')}
        {renderDocumentCard('PAN Card', 'pan')}
        {renderDocumentCard('Driving License', 'license')}
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
  documentCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  uploadBtnText: {
    fontSize: 12,
    color: '#05a660',
    fontWeight: '600',
    marginRight: 4,
  },
  imagePreviewContainer: {
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  placeholderBox: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    marginTop: 8,
  },
  placeholderText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    fontSize: 13,
    color: '#05a660',
    fontWeight: '500',
    marginLeft: 6,
  },
});
