import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import type { DeliveryWindow, UserProfile } from '../src/types/api';
import { getHomeRouteForRole, isCustomerRole } from '../src/utils/roles';

export default function CheckoutScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'mobile_money' | 'card'>('cash_on_delivery');
  const [deliveryWindows, setDeliveryWindows] = useState<DeliveryWindow[]>([]);
  const [selectedDeliveryWindowKey, setSelectedDeliveryWindowKey] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [profileResponse, windowsResponse] = await Promise.all([
          api.get<UserProfile>('/profile/me'),
          api.get<DeliveryWindow[]>('/cart/delivery-windows'),
        ]);
        if (profileResponse.data.delivery_address) {
          setDeliveryAddress(profileResponse.data.delivery_address);
        }
        setDeliveryWindows(windowsResponse.data);
        setSelectedDeliveryWindowKey(windowsResponse.data[0]?.key ?? '');
      } catch {
        // Keep checkout usable even if the profile request fails.
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const placeOrder = async () => {
    if (deliveryAddress.trim().length < 5) {
      Alert.alert('Missing address', 'Enter a full delivery address before placing the order.');
      return;
    }

    if (!selectedDeliveryWindowKey) {
      Alert.alert('Choose a delivery window', 'Select an available delivery timeframe before placing the order.');
      return;
    }

    setPlacingOrder(true);

    try {
      await api.put('/profile/me', {
        delivery_address: deliveryAddress.trim(),
      });

      await api.post('/cart/checkout', {
        delivery_address: deliveryAddress.trim(),
        payment_method: paymentMethod,
        delivery_window_key: selectedDeliveryWindowKey,
      });

      Alert.alert('Order placed', 'Your grocery order has been placed successfully.');
      router.replace('/(tabs)/orders');
    } catch (error: any) {
      Alert.alert('Checkout failed', error.response?.data?.detail || 'Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>Confirm how and where you want your groceries delivered.</Text>

        <View style={styles.card}>
          <Text style={styles.windowPolicyTitle}>Delivery timing</Text>
          <Text style={styles.windowPolicyText}>
            Public orders run from 8:00 AM to 8:00 PM, while staff shifts allow delivery windows up to 10:00 PM.
          </Text>

          <Text style={styles.label}>Delivery Window</Text>
          <View style={styles.deliveryWindowList}>
            {deliveryWindows.map((window) => {
              const active = selectedDeliveryWindowKey === window.key;
              return (
                <TouchableOpacity
                  key={window.key}
                  style={[styles.deliveryWindowCard, active && styles.deliveryWindowCardActive]}
                  onPress={() => setSelectedDeliveryWindowKey(window.key)}
                >
                  <Text style={[styles.deliveryWindowLabel, active && styles.deliveryWindowLabelActive]}>
                    {window.label}
                  </Text>
                  <Text style={[styles.deliveryWindowHint, active && styles.deliveryWindowHintActive]}>
                    Scheduled slot
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Delivery Address</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="House number, street, area, city"
            multiline
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
          />
          {loadingProfile ? <Text style={styles.helperText}>Loading saved address...</Text> : null}

          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.paymentOptions}>
            {[
              ['cash_on_delivery', 'Cash on Delivery'],
              ['mobile_money', 'Mobile Money'],
              ['card', 'Card'],
            ].map(([value, label]) => {
              const active = paymentMethod === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.paymentChip, active && styles.paymentChipActive]}
                  onPress={() => setPaymentMethod(value as typeof paymentMethod)}
                >
                  <Text style={[styles.paymentChipText, active && styles.paymentChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, placingOrder && styles.buttonDisabled]}
          onPress={placeOrder}
          disabled={placingOrder}
        >
          <Text style={styles.buttonText}>{placingOrder ? 'Placing order...' : 'Place Order'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 12,
  },
  backText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    color: '#475569',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  windowPolicyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  windowPolicyText: {
    color: '#475569',
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  deliveryWindowList: {
    gap: 10,
    marginBottom: 16,
  },
  deliveryWindowCard: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deliveryWindowCardActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
  },
  deliveryWindowLabel: {
    color: '#0F172A',
    fontWeight: '700',
  },
  deliveryWindowLabelActive: {
    color: '#1D4ED8',
  },
  deliveryWindowHint: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  deliveryWindowHintActive: {
    color: '#1D4ED8',
  },
  helperText: {
    marginTop: -8,
    marginBottom: 12,
    fontSize: 12,
    color: '#64748B',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  paymentChipActive: {
    backgroundColor: '#1D4ED8',
  },
  paymentChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  paymentChipTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
