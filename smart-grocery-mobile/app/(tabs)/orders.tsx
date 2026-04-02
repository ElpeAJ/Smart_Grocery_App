import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Order } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
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
      const response = await api.get<Order[]>('/orders/my-orders');
      const sortedOrders = [...response.data].sort(
        (firstOrder, secondOrder) =>
          new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
      );
      setOrders(sortedOrders);
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
        const response = await api.get<Order[]>('/orders/my-orders');
        const sortedOrders = [...response.data].sort(
          (firstOrder, secondOrder) =>
            new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
        );
        setOrders(sortedOrders);
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
            <Text style={styles.orderTitle}>
              {`Order ${orders.length - index}`}
            </Text>
            <Text style={styles.orderMeta}>Reference: #{item.id}</Text>
            <Text style={styles.orderMeta}>Status: {formatOrderStatus(item.status)}</Text>
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
});
