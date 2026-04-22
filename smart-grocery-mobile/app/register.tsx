import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/context/AuthContext';
import { BASE_URL } from '../src/config';
import { triggerLightHaptic, triggerSuccessHaptic } from '../src/utils/haptics';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert('Missing details', 'Fill in your name, email, and password.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Weak password', 'Use at least 8 characters for your password.');
      return;
    }

    await triggerLightHaptic();
    setSubmitting(true);
    const result = await register({ fullName, email, password });
    setSubmitting(false);

    if (!result.success) {
      Alert.alert('Registration failed', result.error);
      return;
    }

    await triggerSuccessHaptic();
    Alert.alert('Account created', 'You can log in with your new account now.');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Fresh start</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Set up your profile to start shopping, tracking deliveries, and saving your preferred store.</Text>
        <Text style={styles.debugText}>Backend: {BASE_URL}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            placeholder="you@example.com"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            placeholder="At least 8 characters"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>{submitting ? 'Creating account...' : 'Register'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={async () => {
            await triggerLightHaptic();
            router.push('/login');
          }}
        >
          <Text style={styles.secondaryText}>Already have an account? Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    backgroundColor: '#0F5A35',
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
  },
  eyebrow: {
    color: '#C7F9CC',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#E7FBE8',
    lineHeight: 22,
    marginBottom: 10,
    marginTop: 10,
  },
  debugText: {
    fontSize: 12,
    color: '#D6F5D9',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#0F172A',
  },
  button: {
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryCta: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#2563EB',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
});
