import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import api from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { BASE_URL } from '../../src/config';
import type { Store, UserProfile } from '../../src/types/api';

export default function ProfileScreen() {
  const params = useLocalSearchParams<{
    pickedAddress?: string;
    pickedLatitude?: string;
    pickedLongitude?: string;
  }>();
  const { user, logout } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickedLatitude, setPickedLatitude] = useState<number | null>(null);
  const [pickedLongitude, setPickedLongitude] = useState<number | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleDeliveryAddressChange = (value: string) => {
    setDeliveryAddress(value);
    setPickedLatitude(null);
    setPickedLongitude(null);
  };

  const loadProfile = useCallback(async () => {
    try {
      const [storesResponse, profileResponse] = await Promise.all([
        api.get<Store[]>('/stores/'),
        api.get<UserProfile>('/profile/me'),
      ]);

      setStores(storesResponse.data);
      setProfile(profileResponse.data);
      setPhoneNumber(profileResponse.data.phone_number ?? '');
      setDeliveryAddress(profileResponse.data.delivery_address ?? '');
      setPickedLatitude(profileResponse.data.delivery_latitude ?? null);
      setPickedLongitude(profileResponse.data.delivery_longitude ?? null);
      setSelectedStoreId(profileResponse.data.preferred_store_id ?? null);
    } catch (error: any) {
      Alert.alert('Could not load profile', error.response?.data?.detail || 'Please try again.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  useFocusEffect(
    useCallback(() => {
      if (params.pickedAddress) {
        setDeliveryAddress(params.pickedAddress);
      }
      if (params.pickedLatitude && params.pickedLongitude) {
        const latitude = Number(params.pickedLatitude);
        const longitude = Number(params.pickedLongitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setPickedLatitude(latitude);
          setPickedLongitude(longitude);
        }
      }
    }, [params.pickedAddress, params.pickedLatitude, params.pickedLongitude])
  );

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    try {
      let deliveryLatitude: number | null = null;
      let deliveryLongitude: number | null = null;

      if (deliveryAddress.trim()) {
        try {
          const geocoded = await Location.geocodeAsync(deliveryAddress.trim());
          if (geocoded[0]) {
            deliveryLatitude = geocoded[0].latitude;
            deliveryLongitude = geocoded[0].longitude;
          }
        } catch {
          // Keep profile save usable even if geocoding fails.
        }
      }

      if (pickedLatitude !== null && pickedLongitude !== null) {
        deliveryLatitude = pickedLatitude;
        deliveryLongitude = pickedLongitude;
      }

      const response = await api.put<UserProfile>('/profile/me', {
        phone_number: phoneNumber.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        delivery_latitude: deliveryLatitude,
        delivery_longitude: deliveryLongitude,
        preferred_store_id: selectedStoreId,
      });
      setProfile(response.data);
      setPickedLatitude(response.data.delivery_latitude ?? null);
      setPickedLongitude(response.data.delivery_longitude ?? null);
      Alert.alert('Profile saved', 'Your contact and store preferences have been updated.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => null}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>ACCOUNT AND DELIVERY</Text>
              <Text style={styles.title}>Profile</Text>
              <Text style={styles.subtitle}>
                Keep your contact details, saved address, and preferred store ready for faster checkout.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={17} color="#64748B" />
                <View style={styles.infoContent}>
                  <Text style={styles.label}>Name</Text>
                  <Text style={styles.value}>{user?.full_name || 'Unknown user'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={17} color="#64748B" />
                <View style={styles.infoContent}>
                  <Text style={styles.label}>Email</Text>
                  <Text style={styles.value}>{user?.email || 'No email loaded'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark-outline" size={17} color="#64748B" />
                <View style={styles.infoContent}>
                  <Text style={styles.label}>Role</Text>
                  <Text style={styles.value}>{user?.role || 'customer'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="server-outline" size={17} color="#64748B" />
                <View style={styles.infoContent}>
                  <Text style={styles.label}>API</Text>
                  <Text style={styles.value}>{BASE_URL}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery Details</Text>

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 024 123 4567"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />

              <Text style={styles.label}>Saved Address</Text>
              <TextInput
                style={[styles.input, styles.addressInput]}
                placeholder="House number, street, area, city"
                value={deliveryAddress}
                onChangeText={handleDeliveryAddressChange}
                multiline
              />
              <View style={styles.mapPickerRow}>
                <TouchableOpacity
                  style={styles.mapPickerButton}
                  onPress={() =>
                    router.push({
                      pathname: '/map-picker',
                      params: {
                        address: deliveryAddress,
                        latitude: pickedLatitude !== null ? String(pickedLatitude) : undefined,
                        longitude: pickedLongitude !== null ? String(pickedLongitude) : undefined,
                        returnTo: 'profile',
                      },
                    })
                  }
                >
                  <Text style={styles.mapPickerButtonText}>Pick on map</Text>
                </TouchableOpacity>
                {pickedLatitude !== null && pickedLongitude !== null ? (
                  <Text style={styles.mapPickedText}>Map point confirmed</Text>
                ) : (
                  <Text style={styles.mapPickedText}>No map pin saved yet</Text>
                )}
              </View>

              <Text style={styles.label}>Preferred Store</Text>
              <FlatList
                data={[{ id: -1, name: 'No preference', location: '' }, ...stores]}
                horizontal
                keyExtractor={(item) => item.id.toString()}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storePicker}
                renderItem={({ item }) => {
                  const isNone = item.id === -1;
                  const active = isNone ? selectedStoreId === null : selectedStoreId === item.id;

                  return (
                    <TouchableOpacity
                      style={[styles.storeChip, active && styles.storeChipActive]}
                      onPress={() => setSelectedStoreId(isNone ? null : item.id)}
                    >
                      <Text style={[styles.storeChipText, active && styles.storeChipTextActive]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity
                style={[styles.primaryButton, savingProfile && styles.disabledButton]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <Text style={styles.primaryButtonText}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
              {profile?.preferred_store ? (
                <Text style={styles.helperText}>
                  Preferred store: {profile.preferred_store.name} in {profile.preferred_store.location}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity style={styles.button} onPress={handleLogout}>
              <View style={styles.actionButtonInner}>
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={styles.buttonText}>Logout</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/help')}
            >
              <View style={styles.actionButtonInner}>
                <Ionicons name="help-circle-outline" size={18} color="#1E3A8A" />
                <Text style={styles.secondaryText}>Help & Support</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                Alert.alert(
                  'Current setup',
                  'The live app now supports preferred stores, saved delivery details, and role-based operations.'
                )
              }
            >
              <View style={styles.actionButtonInner}>
                <Ionicons name="pulse-outline" size={18} color="#1E3A8A" />
                <Text style={styles.secondaryText}>App Status</Text>
              </View>
            </TouchableOpacity>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#1F5C3F',
    borderRadius: 28,
    padding: 22,
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#163C2C',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  eyebrow: {
    color: '#CFE9D8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#D7E9DE',
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    color: '#0F172A',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addressInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  mapPickerRow: {
    marginTop: 8,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapPickerButton: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  mapPickerButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  mapPickedText: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  storePicker: {
    gap: 10,
    paddingVertical: 4,
  },
  storeChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  storeChipActive: {
    backgroundColor: '#1D4ED8',
  },
  storeChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  storeChipTextActive: {
    color: '#fff',
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  helperText: {
    marginTop: 10,
    color: '#475569',
  },
  button: {
    backgroundColor: '#DC2626',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#1E3A8A',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  infoContent: {
    flex: 1,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
