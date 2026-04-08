import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { BASE_URL } from '../../src/config';
import type { Store, UserProfile } from '../../src/types/api';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [storesResponse, profileResponse] = await Promise.all([
          api.get<Store[]>('/stores/'),
          api.get<UserProfile>('/profile/me'),
        ]);

        setStores(storesResponse.data);
        setProfile(profileResponse.data);
        setPhoneNumber(profileResponse.data.phone_number ?? '');
        setDeliveryAddress(profileResponse.data.delivery_address ?? '');
        setSelectedStoreId(profileResponse.data.preferred_store_id ?? null);
      } catch (error: any) {
        Alert.alert('Could not load profile', error.response?.data?.detail || 'Please try again.');
      }
    };

    loadProfile();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    try {
      const response = await api.put<UserProfile>('/profile/me', {
        phone_number: phoneNumber.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        preferred_store_id: selectedStoreId,
      });
      setProfile(response.data);
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
            <Text style={styles.title}>Profile</Text>

            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{user?.full_name || 'Unknown user'}</Text>

              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email || 'No email loaded'}</Text>

              <Text style={styles.label}>Role</Text>
              <Text style={styles.value}>{user?.role || 'customer'}</Text>

              <Text style={styles.label}>API</Text>
              <Text style={styles.value}>{BASE_URL}</Text>
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
                onChangeText={setDeliveryAddress}
                multiline
              />

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
              <Text style={styles.buttonText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/help')}
            >
              <Text style={styles.secondaryText}>Help & Support</Text>
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
              <Text style={styles.secondaryText}>App Status</Text>
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E3A8A',
    marginTop: 20,
    marginBottom: 16,
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
    marginTop: 8,
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
  disabledButton: {
    opacity: 0.7,
  },
});
