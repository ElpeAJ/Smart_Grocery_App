import React, { useCallback, useEffect, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
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
import type { Order, OrderChatSummary, Store } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../src/utils/haptics';
import { canHandleOperations, getHomeRouteForRole } from '../../src/utils/roles';

const STAFF_VISIBLE_STATUSES: Order['status'][] = ['pending', 'accepted', 'picking'];
const MANAGER_VISIBLE_STATUSES: Order['status'][] = ['pending', 'accepted', 'picking', 'awaiting_review'];

function formatOrderStatus(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'picking':
      return 'Picking';
    case 'awaiting_review':
      return 'Awaiting review';
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
  const [chatSummaries, setChatSummaries] = useState<Record<number, OrderChatSummary>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);

  const canSubmitForReview = role === 'staff' || role === 'admin' || role === 'manager';
  const canReleaseToDelivery = role === 'admin' || role === 'manager';

  const loadOperations = useCallback(async () => {
    try {
      const [ordersResult, storesResult, chatResult] = await Promise.allSettled([
        api.get<Order[]>('/orders/'),
        api.get<Store[]>('/stores/'),
        api.get<OrderChatSummary[]>('/order-chats/summary'),
      ]);

      if (ordersResult.status !== 'fulfilled') {
        throw ordersResult.reason;
      }

      const ordersResponse = ordersResult.value;
      const storesResponse = storesResult.status === 'fulfilled' ? storesResult.value : null;
      const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
      const allowedStatuses = role === 'staff' ? STAFF_VISIBLE_STATUSES : MANAGER_VISIBLE_STATUSES;

      const visibleOrders = ordersResponse.data
        .filter((order) => allowedStatuses.includes(order.status))
        .sort(
          (firstOrder, secondOrder) =>
            new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
        );

      setOrders(visibleOrders);
      setStores(storesResponse?.data ?? []);
      setChatSummaries(
        Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
      );
    } catch (error: any) {
      Alert.alert('Could not load operations', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      loadOperations();
    }, [loadOperations])
  );

  useEffect(() => {
    if (!canHandleOperations(role)) {
      return;
    }

    const intervalId = setInterval(() => {
      loadOperations();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [loadOperations, role]);

  const toggleItemPicked = async (orderItemId: number, picked: boolean) => {
    await triggerLightHaptic();
    setBusyItemId(orderItemId);

    try {
      const response = await api.put<Order>(`/orders/items/${orderItemId}/pick`, { picked });
      setOrders((currentOrders) =>
        currentOrders.map((order) => (order.id === response.data.id ? response.data : order))
      );
      await triggerSuccessHaptic();
    } catch (error: any) {
      Alert.alert('Could not update picked item', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyItemId(null);
    }
  };

  const submitForReview = async (orderId: number) => {
    await triggerLightHaptic();
    setBusyOrderId(orderId);

    try {
      await api.put(`/orders/${orderId}/status`, null, { params: { status: 'awaiting_review' } });
      await loadOperations();
      await triggerSuccessHaptic();
    } catch (error: any) {
      Alert.alert('Could not submit order', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const releaseToDelivery = async (orderId: number) => {
    await triggerLightHaptic();
    setBusyOrderId(orderId);

    try {
      await api.put(`/orders/${orderId}/status`, null, { params: { status: 'out_for_delivery' } });
      await loadOperations();
      await triggerSuccessHaptic();
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
              Pick orders item by item, submit completed picks for review, and let managers release approved orders to delivery.
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
          const chatSummary = chatSummaries[item.id];
          const expanded = expandedOrderId === item.id;
          const orderTotal = item.items.reduce(
            (sum, orderItem) => sum + orderItem.quantity * orderItem.unit_price,
            0
          );
          const storeName =
            item.store_name || stores.find((store) => store.id === item.store_id)?.name || 'Unassigned';
          const isReadyForReview = item.all_items_picked;
          const isAwaitingReview = item.status === 'awaiting_review';

          return (
            <View style={[styles.card, isReadyForReview && styles.readyCard]}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setExpandedOrderId(expanded ? null : item.id)}
              >
                <View style={styles.cardText}>
                  <Text style={styles.orderTitle}>Order #{item.id}</Text>
                  <Text style={styles.metaText}>Customer: {item.customer_name || `Customer #${item.user_id}`}</Text>
                  <Text style={styles.metaText}>Status: {formatOrderStatus(item.status)}</Text>
                  <Text style={styles.metaText}>Store: {storeName}</Text>
                  {item.delivery_window_label ? (
                    <Text style={styles.metaText}>Delivery window: {item.delivery_window_label}</Text>
                  ) : null}
                  <Text style={styles.metaText}>Created: {new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <View style={styles.summaryWrap}>
                  <Text style={styles.totalText}>{formatCedi(orderTotal)}</Text>
                  <Text style={[styles.expandText, isReadyForReview && styles.readyExpandText]}>
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

                  <Text style={styles.chatMeta}>
                    {!chatSummary?.has_messages
                      ? 'No customer conversation yet.'
                      : chatSummary.unread_count > 0
                        ? `${chatSummary.unread_count} new ${chatSummary.unread_count === 1 ? 'customer message' : 'customer messages'}`
                        : `Last update from ${chatSummary.last_sender_role === 'customer' ? 'customer' : 'store team'}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.chatButton}
                    onPress={() => router.push(`/order-chat/${item.id}`)}
                  >
                    <Text style={styles.chatButtonText}>
                      {!chatSummary?.has_messages
                        ? 'Start Chat'
                        : chatSummary.unread_count > 0
                          ? 'Reply to Customer'
                          : 'Open Chat'}
                    </Text>
                    {chatSummary?.unread_count ? (
                      <View style={styles.chatBadge}>
                        <Text style={styles.chatBadgeText}>{chatSummary.unread_count}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>

                  {isReadyForReview ? (
                    <View style={styles.readyBanner}>
                      <Text style={styles.readyBannerText}>
                        {isAwaitingReview
                          ? 'Fully picked and waiting for manager approval.'
                          : 'Fully picked and ready to be submitted for review.'}
                      </Text>
                    </View>
                  ) : null}

                  {isReadyForReview && !isAwaitingReview && canSubmitForReview ? (
                    <TouchableOpacity
                      style={[styles.releaseButton, busyOrderId === item.id && styles.disabledButton]}
                      onPress={() => submitForReview(item.id)}
                      disabled={busyOrderId === item.id}
                    >
                      <Text style={styles.releaseButtonText}>
                        {busyOrderId === item.id ? 'Sending...' : 'Mark Picking Complete'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {isAwaitingReview && canReleaseToDelivery ? (
                    <TouchableOpacity
                      style={[styles.releaseButton, busyOrderId === item.id && styles.disabledButton]}
                      onPress={() => releaseToDelivery(item.id)}
                      disabled={busyOrderId === item.id}
                    >
                      <Text style={styles.releaseButtonText}>
                        {busyOrderId === item.id ? 'Sending...' : 'Approve for Delivery'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {!isReadyForReview ? (
                    <Text style={styles.readyText}>Pick every item to unlock manager review.</Text>
                  ) : null}

                  {isAwaitingReview && role === 'staff' ? (
                    <Text style={styles.readyText}>
                      Waiting for manager or admin approval before driver assignment.
                    </Text>
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
  chatMeta: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
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
