import React, { useCallback, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { AppUser, Delivery } from '../../src/types/api';
import { canHandleDeliveries, getHomeRouteForRole } from '../../src/utils/roles';

function formatDeliveryStatus(status: Delivery['status']) {
  switch (status) {
    case 'assigned':
      return 'Assigned';
    case 'on_the_way':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
  }
}

export default function DeliveriesScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDeliveryId, setBusyDeliveryId] = useState<number | null>(null);

  const canAssignDrivers = role === 'admin' || role === 'manager';
  const canUpdateOwnDeliveries = role === 'driver';

  const loadDeliveries = useCallback(async () => {
    try {
      const deliveriesResponse = await api.get<Delivery[]>('/deliveries/');
      setDeliveries(deliveriesResponse.data);

      if (canAssignDrivers) {
        const usersResponse = await api.get<AppUser[]>('/users/');
        setDrivers(usersResponse.data.filter((candidate) => candidate.role === 'driver'));
      }
    } catch (error: any) {
      Alert.alert('Could not load deliveries', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAssignDrivers]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const assignDriver = async (deliveryId: number, driverId: number | null) => {
    setBusyDeliveryId(deliveryId);

    try {
      await api.put(`/deliveries/${deliveryId}/assign`, { driver_id: driverId });
      await loadDeliveries();
    } catch (error: any) {
      Alert.alert('Could not assign driver', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyDeliveryId(null);
    }
  };

  const updateDeliveryStatus = async (deliveryId: number, status: Delivery['status']) => {
    setBusyDeliveryId(deliveryId);

    try {
      await api.put(`/deliveries/${deliveryId}/status`, null, { params: { status } });
      await loadDeliveries();
    } catch (error: any) {
      Alert.alert('Could not update delivery', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyDeliveryId(null);
    }
  };

  if (loading) {
    return <LoadingScreen label="Loading deliveries..." />;
  }

  if (!canHandleDeliveries(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={deliveries}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDeliveries();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Deliveries</Text>
            <Text style={styles.subtitle}>
              Orders appear here only after operations marks them ready for delivery.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No deliveries ready right now.</Text>
            <Text style={styles.emptyText}>New checkouts will generate deliveries here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Delivery #{item.id}</Text>
              <Text style={styles.statusText}>{formatDeliveryStatus(item.status)}</Text>
            </View>
            <Text style={styles.metaText}>Order #{item.order_id}</Text>
            <Text style={styles.metaText}>
              Customer: {item.customer_name || 'Unknown customer'}
            </Text>
            <Text style={styles.metaText}>
              Store: {item.store_name || 'Unassigned'}
            </Text>
            <Text style={styles.metaText}>
              Order status: {item.order_status ? item.order_status.replaceAll('_', ' ') : 'Unknown'}
            </Text>
            <Text style={styles.metaText}>Address: {item.delivery_address}</Text>
            <Text style={styles.metaText}>
              Driver:{' '}
              {item.driver_name ||
                drivers.find((driver) => driver.id === item.driver_id)?.full_name ||
                (item.driver_id ? `Driver #${item.driver_id}` : 'Unassigned')}
            </Text>

            {canAssignDrivers ? (
              <>
                <Text style={styles.sectionTitle}>Assign driver</Text>
                <FlatList
                  data={[
                    {
                      id: 0,
                      full_name: 'Unassigned',
                      email: '',
                      role: 'driver' as const,
                    },
                    ...drivers,
                  ]}
                  horizontal
                  keyExtractor={(driver) => driver.id.toString()}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                  renderItem={({ item: driver }) => {
                    const isActive = driver.id === 0 ? item.driver_id === null : item.driver_id === driver.id;

                    return (
                      <TouchableOpacity
                        style={[styles.chip, isActive && styles.chipActive]}
                        onPress={() => assignDriver(item.id, driver.id === 0 ? null : driver.id)}
                        disabled={busyDeliveryId === item.id}
                      >
                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                          {driver.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            ) : null}

            {canUpdateOwnDeliveries ? (
              <View style={styles.actionRow}>
                {item.status === 'assigned' ? (
                  <TouchableOpacity
                    style={[styles.actionButton, busyDeliveryId === item.id && styles.disabledButton]}
                    onPress={() => updateDeliveryStatus(item.id, 'on_the_way')}
                    disabled={busyDeliveryId === item.id}
                  >
                    <Text style={styles.actionButtonText}>
                      {busyDeliveryId === item.id ? 'Saving...' : 'Start Delivery'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {item.status === 'on_the_way' ? (
                  <TouchableOpacity
                    style={[styles.actionButton, busyDeliveryId === item.id && styles.disabledButton]}
                    onPress={() => updateDeliveryStatus(item.id, 'delivered')}
                    disabled={busyDeliveryId === item.id}
                  >
                    <Text style={styles.actionButtonText}>
                      {busyDeliveryId === item.id ? 'Saving...' : 'Mark Delivered'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
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
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: '#475569',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  statusText: {
    color: '#166534',
    fontWeight: '700',
  },
  metaText: {
    marginTop: 6,
    color: '#475569',
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  chipRow: {
    gap: 10,
  },
  chip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: '#1D4ED8',
  },
  chipText: {
    color: '#334155',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  actionRow: {
    marginTop: 14,
    flexDirection: 'row',
  },
  actionButton: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 8,
    color: '#64748B',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
