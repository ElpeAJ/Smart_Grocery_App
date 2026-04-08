import React, { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import ProductArtwork from '../../src/components/ProductArtwork';
import { useAuth } from '../../src/context/AuthContext';
import type { Product } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../src/utils/haptics';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const role = user?.role;
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) {
        Alert.alert('Missing product', 'No product id was provided.');
        router.back();
        return;
      }

      try {
        const response = await api.get<Product>(`/products/${id}`);
        setProduct(response.data);
      } catch (error: any) {
        Alert.alert('Could not load product', error.response?.data?.detail || 'Please try again.');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const addToCart = async () => {
    if (!product) {
      return;
    }

    await triggerLightHaptic();
    setAdding(true);

    try {
      await api.post('/cart/items', { product_id: product.id, quantity });

      await triggerSuccessHaptic();
      Alert.alert('Added to cart', `${product.name} was added to your cart.`);
    } catch (error: any) {
      Alert.alert('Could not add item', error.response?.data?.detail || 'Please try again.');
    } finally {
      setAdding(false);
    }
  };

  if (loading || !product) {
    return <LoadingScreen label="Loading product..." />;
  }

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  const inStock = product.status === 'in_stock';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={async () => {
            await triggerLightHaptic();
            router.back();
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <ProductArtwork
          imageUrl={product.image_url}
          categoryName={product.category?.name}
          productName={product.name}
          variant="hero"
        />

        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>{formatCedi(product.price)}</Text>
        <Text style={[styles.stock, !inStock && styles.outOfStock]}>
          {inStock ? `${product.stock_quantity} available` : 'Out of stock'}
        </Text>
        <Text style={styles.categoryText}>{product.category?.name || 'Groceries'}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{product.description || 'Fresh grocery item ready for purchase.'}</Text>
        </View>

        {inStock ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quantity</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={async () => {
                  await triggerLightHaptic();
                  setQuantity((current) => Math.max(1, current - 1));
                }}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={async () => {
                  await triggerLightHaptic();
                  setQuantity((current) => Math.min(product.stock_quantity, current + 1));
                }}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={styles.total}>Total: {formatCedi(product.price * quantity)}</Text>

        <TouchableOpacity
          style={[styles.addButton, (!inStock || adding) && styles.disabledButton]}
          onPress={addToCart}
          disabled={!inStock || adding}
        >
          <Text style={styles.addButtonText}>{adding ? 'Adding...' : 'Add to Cart'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 12,
  },
  backText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryText: {
    marginBottom: 20,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#ECFCCB',
    color: '#3F6212',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 8,
  },
  stock: {
    fontSize: 15,
    color: '#166534',
    marginTop: 8,
  },
  outOfStock: {
    color: '#B91C1C',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  quantityValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  total: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 24,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 20,
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
