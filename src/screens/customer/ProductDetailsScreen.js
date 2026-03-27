import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import CustomButton from '../../components/CustomButton';
import api from '../../api/client';

const ProductDetailsScreen = ({ route, navigation }) => {
  const { product } = route.params;
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const addToCart = async () => {
    if (product.status !== 'in_stock') {
      Alert.alert('Out of Stock', 'This product is currently out of stock.');
      return;
    }

    setLoading(true);
    try {
      // Create order with single item
      const orderData = {
        user_id: 1, // This should come from auth context
        items: [{
          product_id: product.id,
          quantity: quantity,
          unit_price: product.price,
        }]
      };

      const response = await api.post('/orders/', orderData);
      Alert.alert(
        'Success',
        'Product added to cart successfully!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to add product to cart. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = (change) => {
    const newQuantity = quantity + change;
    if (newQuantity >= 1 && newQuantity <= product.stock_quantity) {
      setQuantity(newQuantity);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <Text style={styles.placeholderImage}>🛒</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productPrice}>${product.price}</Text>

        <View style={styles.statusContainer}>
          <Text style={[
            styles.statusText,
            product.status === 'in_stock' ? styles.inStock : styles.outOfStock
          ]}>
            {product.status === 'in_stock' ? 'In Stock' : 'Out of Stock'}
          </Text>
          {product.status === 'in_stock' && (
            <Text style={styles.stockQuantity}>
              {product.stock_quantity} available
            </Text>
          )}
        </View>

        {product.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionTitle}>Description</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        )}

        {product.status === 'in_stock' && (
          <View style={styles.quantityContainer}>
            <Text style={styles.quantityTitle}>Quantity</Text>
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateQuantity(-1)}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>

              <Text style={styles.quantityText}>{quantity}</Text>

              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateQuantity(1)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.totalContainer}>
          <Text style={styles.totalText}>
            Total: ${(product.price * quantity).toFixed(2)}
          </Text>
        </View>

        <CustomButton
          title="Add to Cart"
          onPress={addToCart}
          loading={loading}
          disabled={product.status !== 'in_stock'}
          style={styles.addToCartButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageContainer: {
    height: 250,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderImage: {
    fontSize: 80,
  },
  content: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  productPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 15,
  },
  statusContainer: {
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  inStock: {
    color: '#28a745',
  },
  outOfStock: {
    color: '#dc3545',
  },
  stockQuantity: {
    fontSize: 14,
    color: '#666',
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  descriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  quantityContainer: {
    marginBottom: 20,
  },
  quantityTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: 'center',
  },
  totalContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  totalText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addToCartButton: {
    marginBottom: 20,
  },
});

export default ProductDetailsScreen;