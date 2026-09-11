import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import useRiderStore from '../store/useRiderStore';
import { authLogin, setTokenGetter, getRiderMe } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('+919876543211');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginRider = useRiderStore((state) => state.loginRider);

  const handleLogin = async () => {
    if (!phone) {
      setError('Please enter a phone number');
      return;
    }

    try {
      setLoading(true);
      setError('');
      // Send phone + default password (OTP: 1234)
      const response = await authLogin(phone.trim(), '1234');
      const { token, rider } = response.data;
      if (rider && rider.id) {
        // Register the token getter so all future requests are authenticated
        setTokenGetter(() => token);
        // Fetch full profile from /me endpoint
        const meRes = await getRiderMe();
        loginRider(meRes.data, token);
        navigation.replace('Dashboard');
      } else {
        setError('Login failed. Please check your phone number.');
      }
    } catch (err) {
      console.error('Login error:', err?.response?.data || err.message);
      const detail = err?.response?.data?.detail || 'Network error or rider account not found.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Data Udipi</Text>
          <Text style={styles.subtitle}>Rider Partner App</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1234567890"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ff471a',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff471a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#ff471a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
