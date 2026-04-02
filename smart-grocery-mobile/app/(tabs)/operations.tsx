import React, { useEffect, useState } from 'react';
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
import type { Order, Store } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { canHandleOperations, getHomeRouteForRole } from '../../src/utils/roles';

const VISIBLE_STATUSES: Order['status'][] = ['pending', 'accepted', 'picking'];

function formatOrderStatus(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'picking':
      return 'Picking';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
  }
}

export default function OperationsScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const [orders, setOrders] = useState<Order[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);

  const canReleaseToDelivery = role === 'admin' || role === 'manager' || role === 'staff';

  const loadOperations = async () => {
    try {
      const [ordersResponse, storesResponse] = await Promise.all([
        api.get<Order[]>('/orders/'),
        api.get<Store[]>('/stores/'),
      ]);

      const visibleOrders = ordersResponse.data
        .filter((order) => VISIBLE_STATUSES.includes(order.status))
        .sort(
          (firstOrder, secondOrder) =>
            new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
        );

      setOrders(visibleOrders);
      setStores(storesResponse.data);
    } catch (error: any) {
      Alert.alert('Could not load operations', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOperations();
  }, []);

  const toggleItemPicked = async (orderItemId: number, picked: boolean) => {
    setBusyItemId(orderItemId);

    try {
      const response = await api.put<Order>(`/orders/items/${orderItemId}/pick`, { picked });
      setOrders((currentOrders) =>
        currentOrders.map((order) => (order.id === response.data.id ? response.data : order))
      );
    } catch (error: any) {
      Alert.alert('Could not update picked item', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyItemId(null);
    }
  };

  const releaseToDelivery = async (orderId: number) => {
    setBusyOrderId(orderId);

    try {
      await api.put(`/orders/${orderId}/status`, null, { params: { status: 'out_for_delivery' } });
      await loadOperations();
    } catch (error: any) {
      Alert.alert('Could not release order', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return <LoadingScreen label="Loading operations..." />;
  }

  if (!canHandleOperations(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadOperations();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Operations Queue</Text>
            <Text style={styles.subtitle}>
              Pick orders item by item, confirm accuracy, and release complete orders to delivery.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active orders right now.</Text>
            <Text style={styles.emptyText}>New customer orders will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const expanded = expandedOrderId === item.id;
          const orderTotal = item.items.reduce(
            (sum, orderItem) => sum + orderItem.quantity * orderItem.unit_price,
            0
          );
          const storeName =
            item.store_name || stores.find((store) => store.id === item.store_id)?.name || 'Unassigned';
          const isReadyForDelivery = item.all_items_picked;

          return (
            <View style={[styles.card, isReadyForDelivery && styles.readyCard]}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setExpandedOrderId(expanded ? null : item.id)}
              >
                <View style={styles.cardText}>
                  <Text style={styles.orderTitle}>Order #{item.id}</Text>
                  <Text style={styles.metaText}>Customer: {item.customer_name || `Customer #${item.user_id}`}</Text>
                  <Text style={styles.metaText}>Status: {formatOrderStatus(item.status)}</Text>
                  <Text style={styles.metaText}>Store: {storeName}</Text>
                  <Text style={styles.metaText}>Created: {new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <View style={styles.summaryWrap}>
                  <Text style={styles.totalText}>{formatCedi(orderTotal)}</Text>
                  <Text style={[styles.expandText, isReadyForDelivery && styles.readyExpandText]}>
                    {expanded ? 'Hide' : 'Open'}
                  </Text>
                </View>
              </TouchableOpacity>

              {expanded ? (
                <View style={styles.expandedContent}>
                  <Text style={styles.sectionTitle}>Items to pick</Text>
                  {item.items.map((orderItem) => (
                    <View key={orderItem.id} style={styles.itemRow}>
                      <View style={styles.itemTextWrap}>
                        <Text style={styles.itemTitle}>
                          {orderItem.product_name || `Product #${orderItem.product_id}`}
                        </Text>
                        <Text style={styles.itemMeta}>
                          {orderItem.quantity} x {formatCedi(orderItem.unit_price)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.pickButton, orderItem.is_picked && styles.pickButtonActive]}
                        onPress={() => toggleItemPicked(orderItem.id, !orderItem.is_picked)}
                        disabled={busyItemId === orderItem.id || item.status === 'out_for_delivery'}
                      >
                        <Text style={[styles.pickButtonText, orderItem.is_picked && styles.pickButtonTextActive]}>
                          {busyItemId === orderItem.id
                            ? 'Saving...'
                            : orderItem.is_picked
                              ? 'Picked'
                              : 'Mark Picked'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <Text style={styles.progressText}>
                    {item.items.filter((orderItem) => orderItem.is_picked).length} of {item.items.length} items picked
                  </Text>

                  {isReadyForDelivery ? (
                    <View style={styles.readyBanner}>
                      <Text style={styles.readyBannerText}>Fully picked and waiting for delivery handoff.</Text>
                    </View>
                  ) : null}

                  {isReadyForDelivery && canReleaseToDelivery ? (
                    <TouchableOpacity
                      style={[styles.releaseButton, busyOrderId === item.id && styles.disabledButton]}
                      onPress={() => releaseToDelivery(item.id)}
                      disabled={busyOrderId === item.id}
                    >
                      <Text style={styles.releaseButtonText}>
                        {busyOrderId === item.id ? 'Sending...' : 'Ready for Delivery'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {!isReadyForDelivery ? (
                    <Text style={styles.readyText}>Pick every item to unlock delivery handoff.</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
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
  readyCard: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardText: {
    flex: 1,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  metaText: {
    marginTop: 6,
    color: '#475569',
  },
  summaryWrap: {
    alignItems: 'flex-end',
  },
  totalText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16A34A',
  },
  expandText: {
    marginTop: 8,
    color: '#2563EB',
    fontWeight: '700',
  },
  readyExpandText: {
    color: '#166534',
  },
  expandedContent: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 14,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemMeta: {
    marginTop: 4,
    color: '#475569',
  },
  pickButton: {
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pickButtonActive: {
    backgroundColor: '#DCFCE7',
  },
  pickButtonText: {
    color: '#166534',
    fontWeight: '700',
  },
  pickButtonTextActive: {
    color: '#166534',
  },
  progressText: {
    marginTop: 6,
    color: '#475569',
  },
  readyBanner: {
    marginTop: 12,
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readyBannerText: {
    color: '#166534',
    fontWeight: '700',
  },
  releaseButton: {
    marginTop: 14,
    backgroundColor: '#1D4ED8',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  releaseButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  readyText: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
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
