import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, router } from 'expo-router';
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
import type { AppUser, Delivery, OrderChatSummary } from '../../src/types/api';
import { canHandleDeliveries, getHomeRouteForRole } from '../../src/utils/roles';

type ManagerDeliveryFilter = 'all' | 'unassigned' | 'assigned' | 'on_the_way';

function formatDeliveryStatus(status: Delivery['status'], hasAssignedDriver: boolean) {
  switch (status) {
    case 'assigned':
      return hasAssignedDriver ? 'Assigned' : 'Unassigned';
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
  const [chatSummaries, setChatSummaries] = useState<Record<number, OrderChatSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDeliveryId, setBusyDeliveryId] = useState<number | null>(null);
  const [openPickerDeliveryId, setOpenPickerDeliveryId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<ManagerDeliveryFilter>('all');

  const canAssignDrivers = role === 'admin' || role === 'manager';
  const canUpdateOwnDeliveries = role === 'driver';

  const deliveryMetrics = useMemo(() => {
    const unassigned = deliveries.filter(
      (delivery) => delivery.status === 'assigned' && delivery.driver_id === null
    ).length;
    const assigned = deliveries.filter(
      (delivery) => delivery.status === 'assigned' && delivery.driver_id !== null
    ).length;
    const onTheWay = deliveries.filter((delivery) => delivery.status === 'on_the_way').length;

    return {
      unassigned,
      assigned,
      onTheWay,
      total: deliveries.length,
    };
  }, [deliveries]);

  const visibleDeliveries = useMemo(() => {
    const filtered = deliveries.filter((delivery) => {
      if (!canAssignDrivers) {
        return true;
      }

      switch (activeFilter) {
        case 'unassigned':
          return delivery.status === 'assigned' && delivery.driver_id === null;
        case 'assigned':
          return delivery.status === 'assigned' && delivery.driver_id !== null;
        case 'on_the_way':
          return delivery.status === 'on_the_way';
        case 'all':
        default:
          return true;
      }
    });

    return [...filtered].sort((firstDelivery, secondDelivery) => {
      const getPriority = (delivery: Delivery) => {
        if (delivery.status === 'assigned' && delivery.driver_id === null) {
          return 0;
        }
        if (delivery.status === 'assigned' && delivery.driver_id !== null) {
          return 1;
        }
        if (delivery.status === 'on_the_way') {
          return 2;
        }
        return 3;
      };

      const priorityDifference = getPriority(firstDelivery) - getPriority(secondDelivery);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return secondDelivery.id - firstDelivery.id;
    });
  }, [activeFilter, canAssignDrivers, deliveries]);

  const loadDeliveries = useCallback(async () => {
    try {
      const [deliveriesResult, chatResult] = await Promise.allSettled([
        api.get<Delivery[]>('/deliveries/'),
        api.get<OrderChatSummary[]>('/order-chats/summary'),
      ]);
      if (deliveriesResult.status !== 'fulfilled') {
        throw deliveriesResult.reason;
      }

      const deliveriesResponse = deliveriesResult.value;
      const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
      setDeliveries(deliveriesResponse.data);
      setChatSummaries(
        Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
      );

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
      setOpenPickerDeliveryId(null);
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
        data={visibleDeliveries}
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
              Orders appear here only after manager or admin approves a completed pick for delivery.
            </Text>
            {canAssignDrivers ? (
              <View style={styles.dashboardWrap}>
                <Text style={styles.dashboardTitle}>Delivery tracker</Text>
                <Text style={styles.dashboardHint}>Unassigned handoffs stay at the top for fast action.</Text>
                <FlatList
                  data={[
                    { key: 'all', label: 'All', value: deliveryMetrics.total },
                    { key: 'unassigned', label: 'Unassigned', value: deliveryMetrics.unassigned },
                    { key: 'assigned', label: 'Assigned', value: deliveryMetrics.assigned },
                    { key: 'on_the_way', label: 'On the way', value: deliveryMetrics.onTheWay },
                  ]}
                  horizontal
                  keyExtractor={(item) => item.key}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dashboardRow}
                  renderItem={({ item }) => {
                    const isActive = activeFilter === item.key;
                    return (
                      <TouchableOpacity
                        style={[styles.dashboardCard, isActive && styles.dashboardCardActive]}
                        onPress={() => setActiveFilter(item.key as ManagerDeliveryFilter)}
                      >
                        <Text style={[styles.dashboardValue, isActive && styles.dashboardValueActive]}>
                          {item.value}
                        </Text>
                        <Text style={[styles.dashboardLabel, isActive && styles.dashboardLabelActive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No deliveries ready right now.</Text>
            <Text style={styles.emptyText}>Approved handoffs from operations will appear here automatically.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {(() => {
              const chatSummary = chatSummaries[item.order_id];

              return (
                <>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Delivery #{item.id}</Text>
              <Text
                style={[
                  styles.statusText,
                  item.status === 'assigned' && item.driver_id === null && styles.statusTextMuted,
                ]}
              >
                {formatDeliveryStatus(item.status, item.driver_id !== null)}
              </Text>
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
            {item.delivery_window_label ? (
              <Text style={styles.metaText}>Delivery window: {item.delivery_window_label}</Text>
            ) : null}
            <Text style={styles.metaText}>Address: {item.delivery_address}</Text>
            <Text style={styles.metaText}>
              Driver:{' '}
              {item.driver_name ||
                drivers.find((driver) => driver.id === item.driver_id)?.full_name ||
                (item.driver_id ? `Driver #${item.driver_id}` : 'Unassigned')}
            </Text>

            {chatSummary?.has_messages ? (
              <Text style={styles.chatMeta}>
                {chatSummary.unread_count > 0
                  ? `${chatSummary.unread_count} new ${chatSummary.unread_count === 1 ? 'message' : 'messages'}`
                  : `Last update from ${
                      chatSummary.last_sender_role === 'customer'
                        ? 'customer'
                        : chatSummary.last_sender_role === 'driver'
                          ? 'driver'
                          : 'support team'
                    }`}
              </Text>
            ) : (
              <Text style={styles.chatMeta}>No delivery conversation yet.</Text>
            )}
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => router.push(`/order-chat/${item.order_id}`)}
            >
              <Text style={styles.chatButtonText}>
                {!chatSummary?.has_messages
                  ? 'Start Delivery Chat'
                  : chatSummary.unread_count > 0
                    ? 'Reply in Chat'
                    : 'Open Chat'}
              </Text>
              {chatSummary?.unread_count ? (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chatSummary.unread_count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            {canAssignDrivers ? (
              <>
                <Text style={styles.sectionTitle}>Assign driver</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() =>
                    setOpenPickerDeliveryId(openPickerDeliveryId === item.id ? null : item.id)
                  }
                  disabled={busyDeliveryId === item.id}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {item.driver_name ||
                      drivers.find((driver) => driver.id === item.driver_id)?.full_name ||
                      'Unassigned'}
                  </Text>
                  <Text style={styles.dropdownChevron}>
                    {openPickerDeliveryId === item.id ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {openPickerDeliveryId === item.id ? (
                  <View style={styles.dropdownMenu}>
                    {[
                      {
                        id: 0,
                        full_name: 'Unassigned',
                        email: '',
                        role: 'driver' as const,
                      },
                      ...drivers,
                    ].map((driver) => {
                      const isActive =
                        driver.id === 0 ? item.driver_id === null : item.driver_id === driver.id;

                      return (
                        <TouchableOpacity
                          key={`${item.id}-${driver.id}`}
                          style={[styles.dropdownOption, isActive && styles.dropdownOptionActive]}
                          onPress={() => assignDriver(item.id, driver.id === 0 ? null : driver.id)}
                          disabled={busyDeliveryId === item.id}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              isActive && styles.dropdownOptionTextActive,
                            ]}
                          >
                            {driver.full_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
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
                </>
              );
            })()}
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
  dashboardWrap: {
    marginTop: 18,
    gap: 10,
  },
  dashboardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  dashboardHint: {
    color: '#64748B',
    fontSize: 13,
  },
  dashboardRow: {
    gap: 10,
  },
  dashboardCard: {
    minWidth: 108,
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  dashboardCardActive: {
    backgroundColor: '#DBEAFE',
  },
  dashboardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#334155',
  },
  dashboardValueActive: {
    color: '#1D4ED8',
  },
  dashboardLabel: {
    marginTop: 4,
    color: '#475569',
    fontWeight: '600',
    fontSize: 12,
  },
  dashboardLabelActive: {
    color: '#1D4ED8',
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
  statusTextMuted: {
    color: '#64748B',
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
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  dropdownTriggerText: {
    color: '#0F172A',
    fontWeight: '600',
    flex: 1,
  },
  dropdownChevron: {
    color: '#64748B',
    fontWeight: '700',
  },
  dropdownMenu: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dropdownOptionActive: {
    backgroundColor: '#DBEAFE',
  },
  dropdownOptionText: {
    color: '#334155',
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: '#1D4ED8',
  },
  actionRow: {
    marginTop: 14,
    flexDirection: 'row',
  },
  chatMeta: {
    marginTop: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  chatButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  chatBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
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
