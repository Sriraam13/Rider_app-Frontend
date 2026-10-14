import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useRiderStore from '../store/useRiderStore';
import { authLogin, authRegister, authSetPassword, getRiderMe } from '../services/api';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // Mode: 'login' | 'register' | 'reset'
  const [mode, setMode] = useState('login');

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Popup modal state for registration success
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredRiderName, setRegisteredRiderName] = useState('');

  // Keyboard and scroll reference
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loginRider = useRiderStore((state) => state.loginRider);

  const resetFormState = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');

      const response = await authLogin(phone.trim(), password.trim());
      const { access_token, token, rider } = response.data;
      const validToken = access_token || token;

      if (rider && validToken) {
        await loginRider(rider, validToken);
        try {
          const meRes = await getRiderMe();
          if (meRes.data) {
            await loginRider(meRes.data, validToken);
          }
        } catch (meErr) {
          // Fallback to initial rider profile
        }
        try {
          navigation?.replace?.('Dashboard');
        } catch (navErr) {
          // Handled by App.js conditional stack when isAuthenticated is true
        }
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 401
          ? 'Invalid phone number or password'
          : 'Unable to connect to server. Please try again.');
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');

      const response = await authRegister(name.trim(), phone.trim(), password.trim());
      const { access_token, token, rider } = response.data;
      const validToken = access_token || token;

      if (rider && validToken) {
        await loginRider(rider, validToken);
        try {
          const meRes = await getRiderMe();
          if (meRes.data) {
            await loginRider(meRes.data, validToken);
          }
        } catch (meErr) {}

        // Show popup modal upon successful registration
        const riderName = rider.name || name.trim();
        setRegisteredRiderName(riderName);
        setShowSuccessModal(true);
      } else {
        setSuccessMsg('Registration successful! Please sign in.');
        resetFormState('login');
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 403
          ? 'Phone number not registered. Please contact your administrator to onboard as a delivery partner.'
          : err?.response?.status === 400
          ? 'Account already registered with this phone number. Please sign in.'
          : 'Registration failed. Please check your details and try again.');
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!phone.trim()) {
      setError('Please enter your registered phone number');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a new password');
      return;
    }
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');

      const res = await authSetPassword(phone.trim(), password.trim(), name.trim() || null);
      setSuccessMsg(res.data?.message || 'Password updated successfully! Please sign in.');
      resetFormState('login');
    } catch (err) {
      const detail =
        err?.response?.data?.detail || 'Failed to update password. Please verify your phone number.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && styles.scrollContentKeyboard,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.card, keyboardVisible && styles.cardCompact]}>
          <View style={[styles.header, keyboardVisible && styles.headerCompact]}>
            {!keyboardVisible && (
              <View style={styles.logoBadge}>
                <Ionicons name="bicycle" size={36} color="#ff471a" />
              </View>
            )}
            <Text style={[styles.title, keyboardVisible && styles.titleCompact]}>Data Udipi</Text>
            <Text style={[styles.subtitle, keyboardVisible && styles.subtitleCompact]}>
              {mode === 'register'
                ? 'Rider Partner Sign Up'
                : mode === 'reset'
                ? 'Reset Password'
                : 'Rider Partner App'}
            </Text>
          </View>

          {/* Top Segmented Tabs: Sign In / Sign Up */}
          {mode !== 'reset' && (
            <View style={[styles.tabContainer, keyboardVisible && styles.tabContainerCompact]}>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
                onPress={() => resetFormState('login')}
              >
                <Text style={[styles.tabButtonText, mode === 'login' && styles.tabButtonTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'register' && styles.tabButtonActive]}
                onPress={() => resetFormState('register')}
              >
                <Text style={[styles.tabButtonText, mode === 'register' && styles.tabButtonTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" style={{ marginRight: 6 }} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {/* NAME FIELD (For Register and optionally Reset) */}
          {(mode === 'register' || mode === 'reset') && (
            <View style={[styles.inputGroup, keyboardVisible && styles.inputGroupCompact]}>
              <Text style={styles.label}>
                Rider Name {mode === 'reset' ? '(Optional)' : ''}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, keyboardVisible && styles.inputCompact]}
                  placeholder="Enter full name"
                  placeholderTextColor="#9ca3af"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* PHONE NUMBER FIELD */}
          <View style={[styles.inputGroup, keyboardVisible && styles.inputGroupCompact]}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, keyboardVisible && styles.inputCompact]}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#9ca3af"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* PASSWORD FIELD */}
          <View style={[styles.inputGroup, keyboardVisible && styles.inputGroupCompact]}>
            <Text style={styles.label}>
              {mode === 'login' ? 'Password' : 'Password (min 6 characters)'}
            </Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, keyboardVisible && styles.inputCompact]}
                placeholder={mode === 'login' ? 'Enter your password' : 'Create strong password'}
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* CONFIRM PASSWORD FIELD (Register or Reset mode) */}
          {(mode === 'register' || mode === 'reset') && (
            <View style={[styles.inputGroup, keyboardVisible && styles.inputGroupCompact]}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="checkmark-done-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, keyboardVisible && styles.inputCompact]}
                  placeholder="Re-enter password"
                  placeholderTextColor="#9ca3af"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ACTION BUTTON */}
          <TouchableOpacity
            style={[styles.button, keyboardVisible && styles.buttonCompact]}
            onPress={
              mode === 'login'
                ? handleLogin
                : mode === 'register'
                ? handleRegister
                : handleSetPassword
            }
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'login'
                  ? 'Sign In'
                  : mode === 'register'
                  ? 'Sign Up'
                  : 'Save New Password'}
              </Text>
            )}
          </TouchableOpacity>

          {/* FOOTER LINKS */}
          {mode === 'login' && (
            <TouchableOpacity
              style={[styles.toggleLink, keyboardVisible && styles.toggleLinkCompact]}
              onPress={() => resetFormState('register')}
            >
              <Text style={styles.toggleLinkText}>
                Don't have an account? <Text style={{ fontWeight: '800', textDecorationLine: 'underline' }}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          )}

          {mode === 'register' && (
            <TouchableOpacity
              style={[styles.toggleLink, keyboardVisible && styles.toggleLinkCompact]}
              onPress={() => resetFormState('login')}
            >
              <Text style={styles.toggleLinkText}>
                Already have an account? <Text style={{ fontWeight: '800', textDecorationLine: 'underline' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          )}

          {mode === 'reset' && (
            <TouchableOpacity
              style={[styles.toggleLink, keyboardVisible && styles.toggleLinkCompact]}
              onPress={() => resetFormState('login')}
            >
              <Text style={styles.toggleLinkText}>← Back to Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Registration Success Popup Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowSuccessModal(false);
          try { navigation?.replace?.('Dashboard'); } catch (e) {}
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="checkmark-circle" size={56} color="#10b981" />
            </View>
            <Text style={styles.modalTitle}>Registration Successful! 🎉</Text>
            <Text style={styles.modalSubtitle}>
              Welcome, <Text style={styles.modalHighlight}>{registeredRiderName}</Text>!
            </Text>
            <Text style={styles.modalDescription}>
              Your Rider Partner account has been successfully created and registered with Data Udipi.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowSuccessModal(false);
                try { navigation?.replace?.('Dashboard'); } catch (e) {}
              }}
            >
              <Text style={styles.modalButtonText}>Start Riding</Text>
              <Ionicons name="arrow-forward" size={18} color="white" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ff471a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  scrollContentKeyboard: {
    justifyContent: 'center',
    paddingVertical: 6,
    paddingBottom: 10,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  cardCompact: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  headerCompact: {
    marginBottom: 8,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff1ee',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ff471a',
    letterSpacing: 0.5,
  },
  titleCompact: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    fontWeight: '500',
  },
  subtitleCompact: {
    fontSize: 12,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabContainerCompact: {
    marginBottom: 12,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabButtonTextActive: {
    color: '#ff471a',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  successText: {
    color: '#065f46',
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputGroupCompact: {
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  inputCompact: {
    paddingVertical: 8,
    fontSize: 14,
  },
  eyeIcon: {
    padding: 6,
  },
  button: {
    backgroundColor: '#ff471a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#ff471a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonCompact: {
    paddingVertical: 11,
    marginTop: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleLink: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 6,
  },
  toggleLinkCompact: {
    marginTop: 8,
    paddingVertical: 4,
  },
  toggleLinkText: {
    color: '#ff471a',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalHighlight: {
    fontWeight: '700',
    color: '#ff471a',
  },
  modalDescription: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 22,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff471a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#ff471a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});

