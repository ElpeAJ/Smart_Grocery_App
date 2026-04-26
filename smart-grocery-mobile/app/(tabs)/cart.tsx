import React, { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  Alert,
  Animated,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Cart } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useState(() => new Animated.Value(0))[0];
  const [heroHeight, setHeroHeight] = useState(280);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { user } = useAuth();
  const role = user?.role;

  const fetchCart = useCallback(async () => {
    try {
      const response = await api.get<Cart>('/cart/');
      setCart(response.data);
    } catch (error: any) {
      Alert.alert('Could not load cart', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCart();
    }, [fetchCart])
  );

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
  const compactHeaderStart = Math.max(heroHeight - 24, 230);
  const compactHeaderEnd = compactHeaderStart + 72;
  const compactHeaderOpacity = scrollY.interpolate({
    inputRange: [compactHeaderStart, compactHeaderEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const compactHeaderTranslateY = scrollY.interpolate({
    inputRange: [compactHeaderStart, compactHeaderEnd],
    outputRange: [-20, 0],
    extrapolate: 'clamp',
  });

  const listHeader = (
    <View style={styles.header}>
      <View
        style={styles.heroCard}
        onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height + 24)}
      >
        <Text style={styles.eyebrow}>READY TO CHECK OUT</Text>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Your Cart</Text>
            <Text style={styles.subtitle}>Adjust quantities and make sure everything feels right before checkout.</Text>
          </View>
          {items.length ? (
            <TouchableOpacity onPress={clearCart} disabled={clearing} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>{clearing ? 'Clearing...' : 'Clear'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{items.length}</Text>
            <Text style={styles.heroStatLabel}>{items.length === 1 ? 'Cart item' : 'Cart items'}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{formatCedi(cart?.total_amount ?? 0)}</Text>
            <Text style={styles.heroStatLabel}>Estimated total</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.compactHeaderWrap,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            opacity: compactHeaderOpacity,
            transform: [{ translateY: compactHeaderTranslateY }],
          },
        ]}
      >
        <View style={styles.compactHeaderCard}>
          <View style={styles.compactHeaderText}>
            <Text style={styles.compactHeaderTitle}>Your Cart</Text>
            <Text style={styles.compactHeaderMeta}>
              {items.length} {items.length === 1 ? 'item' : 'items'} • {formatCedi(cart?.total_amount ?? 0)}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
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
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Estimated total</Text>
                <Text style={styles.total}>{formatCedi(cart?.total_amount ?? 0)}</Text>
                <Text style={styles.totalHint}>Delivery details and final scheduling will be confirmed on the next screen.</Text>
              </View>
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
              <View style={styles.cardTopRow}>
                <View style={styles.productBadge}>
                  <Text style={styles.productBadgeText}>
                    {item.product.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.productCopy}>
                  <Text style={styles.productName}>{item.product.name}</Text>
                  <Text style={styles.productDescription}>
                    {item.product.description || 'Fresh grocery item'}
                  </Text>
                </View>
                <View style={styles.priceBadge}>
                  <Text style={styles.price}>{formatCedi(item.product.price)}</Text>
                </View>
              </View>

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
    backgroundColor: '#F6F6F0',
  },
  header: {
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 2,
  },
  compactHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F6F6F0',
    zIndex: 20,
  },
  compactHeaderCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  compactHeaderText: {
    gap: 2,
  },
  compactHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },
  compactHeaderMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: '#1F5C3F',
    borderRadius: 28,
    padding: 22,
    gap: 18,
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
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#D7E9DE',
    lineHeight: 21,
  },
  clearButton: {
    backgroundColor: '#F3E8D7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  clearButtonText: {
    color: '#6D4C2F',
    fontWeight: '700',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  heroStat: {
    flex: 1,
    gap: 4,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: '#CFE9D8',
    fontSize: 12,
    fontWeight: '600',
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  listContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 14,
    shadowColor: '#A68E65',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  productBadge: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: '#F4E8C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBadgeText: {
    color: '#B56D17',
    fontSize: 20,
    fontWeight: '800',
  },
  productCopy: {
    flex: 1,
    gap: 6,
  },
  priceBadge: {
    backgroundColor: '#EAF6EE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  productDescription: {
    color: '#475569',
    lineHeight: 20,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: '#F8FAF8',
    borderRadius: 999,
    paddingVertical: 10,
  },
  quantityButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
    textAlign: 'center',
    fontWeight: '600',
    color: '#334155',
    backgroundColor: '#FFF8EB',
    borderRadius: 16,
    paddingVertical: 12,
  },
  footer: {
    paddingTop: 6,
    gap: 14,
  },
  totalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#A68E65',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  totalLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  total: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  totalHint: {
    textAlign: 'center',
    color: '#64748B',
    lineHeight: 20,
  },
  checkoutButton: {
    backgroundColor: '#16A34A',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  centerContainer: {
    backgroundColor: '#FFFFFF',
    marginTop: 8,
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A68E65',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
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
