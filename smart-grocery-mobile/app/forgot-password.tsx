import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../src/api/client';
import AuthBasketVisual from '../src/components/AuthBasketVisual';
import { triggerLightHaptic, triggerSuccessHaptic } from '../src/utils/haptics';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleResetPassword = async () => {
    if (!email.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Missing details', 'Enter your email and your new password twice.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Use a password with at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Make sure both password fields are identical.');
      return;
    }

    await triggerLightHaptic();
    setSubmitting(true);

    try {
      const response = await api.post<{ detail: string }>('/auth/forgot-password', {
        email: email.trim(),
        new_password: newPassword,
      });
      await triggerSuccessHaptic();
      Alert.alert('Password reset', response.data.detail, [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Reset failed', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <AuthBasketVisual />
        <Text style={styles.eyebrow}>Smart Grocery</Text>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          For the presentation build, a user can reset their password with email and a new password directly.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            Demo mode: production reset would normally use email or OTP verification.
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email address</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color="#64748B" />
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
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>New password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#64748B" />
            <TextInput
              placeholder="Enter a new password"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Confirm password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#64748B" />
            <TextInput
              placeholder="Repeat the new password"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleResetPassword}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>{submitting ? 'Resetting...' : 'Reset Password'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={async () => {
            await triggerLightHaptic();
            router.replace('/login');
          }}
        >
          <Text style={styles.secondaryText}>Back to login</Text>
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
    marginTop: 10,
    lineHeight: 22,
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
  infoBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    color: '#92400E',
    fontWeight: '700',
    lineHeight: 20,
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
  inputWrap: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
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
