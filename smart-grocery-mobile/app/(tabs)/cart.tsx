import React, { useEffect, useState } from 'react';
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
import type { Cart } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

export default function CartScreen() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { user } = useAuth();
  const role = user?.role;

  const fetchCart = async () => {
    try {
      const response = await api.get<Cart>('/cart/');
      setCart(response.data);
    } catch (error: any) {
      Alert.alert('Could not load cart', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId: number, quantity: number) => {
    setUpdatingItemId(itemId);

    try {
      const response = await api.put<Cart>(`/cart/items/${itemId}`, { quantity });
      setCart(response.data);
    } catch (error: any) {
      Alert.alert('Could not update cart', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const clearCart = async () => {
    setClearing(true);

    try {
      const response = await api.delete<Cart>('/cart/');
      setCart(response.data);
    } catch (error: any) {
      Alert.alert('Could not clear cart', error.response?.data?.detail || 'Please try again.');
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return <LoadingScreen label="Loading cart..." />;
  }

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  const items = cart?.items ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Your Cart</Text>
          <Text style={styles.subtitle}>Adjust quantities before checkout.</Text>
        </View>
        {items.length ? (
          <TouchableOpacity onPress={clearCart} disabled={clearing} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>{clearing ? 'Clearing...' : 'Clear'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchCart();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={styles.emptyTitle}>Your cart is empty.</Text>
            <Text style={styles.emptyText}>Add groceries from the Shop tab to get started.</Text>
          </View>
        }
        ListFooterComponent={
          items.length ? (
            <View style={styles.footer}>
              <Text style={styles.total}>Total: {formatCedi(cart?.total_amount ?? 0)}</Text>
              <TouchableOpacity style={styles.checkoutButton} onPress={() => router.push('/checkout')}>
                <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const disabled = updatingItemId === item.id;

          return (
            <View style={styles.card}>
              <Text style={styles.productName}>{item.product.name}</Text>
              <Text style={styles.productDescription}>
                {item.product.description || 'Fresh grocery item'}
              </Text>
              <Text style={styles.price}>{formatCedi(item.product.price)}</Text>

              <View style={styles.quantityRow}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                  disabled={disabled}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.quantityValue}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, item.quantity + 1)}
                  disabled={disabled || item.quantity >= item.product.stock_quantity}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.subtotal}>
                Subtotal: {formatCedi(item.quantity * item.product.price)}
              </Text>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  clearButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  clearButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  productDescription: {
    marginTop: 6,
    color: '#475569',
  },
  price: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '700',
    color: '#16A34A',
  },
  quantityRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  quantityButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  quantityValue: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtotal: {
    marginTop: 14,
    textAlign: 'center',
    fontWeight: '600',
    color: '#334155',
  },
  footer: {
    paddingTop: 6,
    gap: 14,
  },
  total: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  checkoutButton: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  centerContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
  },
});
