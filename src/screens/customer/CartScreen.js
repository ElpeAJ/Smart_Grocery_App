import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import CustomButton from '../../components/CustomButton';
import api from '../../api/client';

const CartScreen = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders/');
      // Filter pending orders (cart items)
      const cartOrders = response.data.filter(order => order.status === 'pending');
      setOrders(cartOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    setProcessing(true);
    try {
      await api.put(`/orders/${orderId}`, { status: newStatus });
      Alert.alert('Success', `Order ${newStatus} successfully!`);
      fetchOrders(); // Refresh the list
    } catch (error) {
      Alert.alert('Error', 'Failed to update order status.');
    } finally {
      setProcessing(false);
    }
  };

  const renderOrderItem = ({ item }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>Order #{item.id}</Text>
        <Text style={styles.orderDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.orderStatus}>
        <Text style={[
          styles.statusText,
          item.status === 'pending' ? styles.pendingStatus : styles.completedStatus
        ]}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
      </View>

      {item.status === 'pending' && (
        <View style={styles.actionButtons}>
          <CustomButton
            title="Process Order"
            onPress={() => updateOrderStatus(item.id, 'processing')}
            loading={processing}
            style={styles.actionButton}
          />
          <CustomButton
            title="Cancel Order"
            onPress={() => updateOrderStatus(item.id, 'cancelled')}
            variant="danger"
            loading={processing}
            style={styles.actionButton}
          />
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading cart...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Cart</Text>

      <FlatList
        data={orders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.orderList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Your cart is empty</Text>
            <Text style={styles.emptySubtext}>Add some products to get started!</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    paddingBottom: 10,
  },
  orderList: {
    padding: 10,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
  },
  orderStatus: {
    marginBottom: 15,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    textAlign: 'center',
  },
  pendingStatus: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  completedStatus: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});

export default CartScreen;