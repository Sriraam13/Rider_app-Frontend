import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useRiderStore from '../store/useRiderStore';

export default function MyDocumentsScreen({ navigation }) {
  const { documents, updateDocuments } = useRiderStore();
  const [loadingKey, setLoadingKey] = useState(null);

  const handlePickImage = async (docKey) => {
    // Ask the user if they want to take a photo or pick from gallery
    Alert.alert(
      "Upload Document",
      "Choose an option to upload your document",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.granted === false) {
              alert("You've refused to allow this app to access your camera!");
              return;
            }
            setLoadingKey(docKey);
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.7,
            });
            setLoadingKey(null);
            if (!result.canceled) {
              updateDocuments({ [docKey]: result.assets[0].uri });
            }
          }
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.granted === false) {
              alert("You've refused to allow this app to access your photos!");
              return;
            }
            setLoadingKey(docKey);
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              quality: 0.7,
            });
            setLoadingKey(null);
            if (!result.canceled) {
              updateDocuments({ [docKey]: result.assets[0].uri });
            }
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
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
    alignItems: 'center',
    marginBottom: 12,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
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
