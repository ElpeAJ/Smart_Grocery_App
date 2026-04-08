import React, { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Order, OrderChatSummary } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

function getChatLabel(summary?: OrderChatSummary) {
  if (!summary?.has_messages) {
    return 'Start Chat';
  }

  if (summary.unread_count > 0) {
    return 'Reply to Store';
  }

  return 'Open Chat';
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [chatSummaries, setChatSummaries] = useState<Record<number, OrderChatSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const role = user?.role;

  const formatOrderStatus = (status: Order['status']) => {
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
  };

  const fetchOrders = async () => {
    try {
      const [ordersResult, chatResult] = await Promise.allSettled([
        api.get<Order[]>('/orders/my-orders'),
        api.get<OrderChatSummary[]>('/order-chats/summary'),
      ]);
      if (ordersResult.status !== 'fulfilled') {
        throw ordersResult.reason;
      }

      const ordersResponse = ordersResult.value;
      const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
      const sortedOrders = [...ordersResponse.data].sort(
        (firstOrder, secondOrder) =>
          new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
      );
      setOrders(sortedOrders);
      setChatSummaries(
        Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
      );
    } catch (error: any) {
      Alert.alert('Could not load orders', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const [ordersResult, chatResult] = await Promise.allSettled([
          api.get<Order[]>('/orders/my-orders'),
          api.get<OrderChatSummary[]>('/order-chats/summary'),
        ]);
        if (ordersResult.status !== 'fulfilled') {
          throw ordersResult.reason;
        }

        const ordersResponse = ordersResult.value;
        const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
        const sortedOrders = [...ordersResponse.data].sort(
          (firstOrder, secondOrder) =>
            new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
        );
        setOrders(sortedOrders);
        setChatSummaries(
          Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
        );
      } catch (error: any) {
        Alert.alert('Could not load orders', error.response?.data?.detail || 'Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    loadOrders();
  }, []);

  if (loading) {
    return <LoadingScreen label="Loading orders..." />;
  }

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Your Order History</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchOrders();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text>No orders yet.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            {(() => {
              const chatSummary = chatSummaries[item.id];

              return (
                <>
            <Text style={styles.orderTitle}>
              {`Order ${orders.length - index}`}
            </Text>
            <Text style={styles.orderMeta}>Reference: #{item.id}</Text>
            <Text style={styles.orderMeta}>Status: {formatOrderStatus(item.status)}</Text>
            {item.delivery_window_label ? (
              <Text style={styles.orderMeta}>Delivery window: {item.delivery_window_label}</Text>
            ) : null}
            <Text style={styles.orderMeta}>
              Created: {new Date(item.created_at).toLocaleString()}
            </Text>
            <Text style={styles.sectionTitle}>Items</Text>
            {item.items.map((orderItem) => (
              <Text key={orderItem.id} style={styles.itemText}>
                {orderItem.product_name || `Product #${orderItem.product_id}`}: {orderItem.quantity} x{' '}
                {formatCedi(orderItem.unit_price)}
              </Text>
            ))}
            {!['delivered', 'cancelled'].includes(item.status) ? (
              <>
                {chatSummary?.has_messages ? (
                  <Text style={styles.chatMeta}>
                    {chatSummary.unread_count > 0
                      ? `${chatSummary.unread_count} new ${chatSummary.unread_count === 1 ? 'store message' : 'store messages'}`
                      : `Last update from ${chatSummary.last_sender_role === 'customer' ? 'you' : 'store team'}`}
                  </Text>
                ) : (
                  <Text style={styles.chatMeta}>No conversation yet about this order.</Text>
                )}
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => router.push(`/order-chat/${item.id}`)}
                >
                  <Text style={styles.chatButtonText}>{getChatLabel(chatSummary)}</Text>
                  {chatSummary?.unread_count ? (
                    <View style={styles.chatBadge}>
                      <Text style={styles.chatBadgeText}>{chatSummary.unread_count}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </>
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
    paddingTop: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 20,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  orderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#166534',
  },
  orderMeta: {
    marginTop: 6,
    color: '#475569',
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemText: {
    marginBottom: 6,
    color: '#334155',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chatButton: {
    marginTop: 14,
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
    marginTop: 14,
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
});
