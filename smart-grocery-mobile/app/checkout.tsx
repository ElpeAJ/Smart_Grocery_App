import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import api from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import type {
  Cart,
  DeliveryWindow,
  Order,
  PaymentVerificationResponse,
  SavedPaymentMethod,
  UserProfile,
} from '../src/types/api';
import { formatCedi } from '../src/utils/currency';
import { triggerLightHaptic, triggerSuccessHaptic } from '../src/utils/haptics';
import { getHomeRouteForRole, isCustomerRole } from '../src/utils/roles';

// Checkout is where online payment hands off to Paystack.
// The app creates the order through our backend first, then opens the hosted
// Paystack page only when the selected payment method is card or mobile money.
export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    pickedAddress?: string;
    pickedLatitude?: string;
    pickedLongitude?: string;
  }>();
  const { user } = useAuth();
  const role = user?.role;
  const hasReturnedPickedLocation = Boolean(params.pickedLatitude && params.pickedLongitude);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickedLatitude, setPickedLatitude] = useState<number | null>(null);
  const [pickedLongitude, setPickedLongitude] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'mobile_money' | 'card'>('cash_on_delivery');
  const [deliveryWindows, setDeliveryWindows] = useState<DeliveryWindow[]>([]);
  const [selectedDeliveryWindowKey, setSelectedDeliveryWindowKey] = useState('');
  const [deliveryWindowMenuOpen, setDeliveryWindowMenuOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const selectedDeliveryWindow =
    deliveryWindows.find((window) => window.key === selectedDeliveryWindowKey) ?? null;
  const cartItems = useMemo(() => cart?.items ?? [], [cart]);
  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );

  const handleDeliveryAddressChange = (value: string) => {
    setDeliveryAddress(value);
    setPickedLatitude(null);
    setPickedLongitude(null);
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [profileResponse, windowsResponse, cartResponse, savedMethodsResponse] = await Promise.all([
          api.get<UserProfile>('/profile/me'),
          api.get<DeliveryWindow[]>('/cart/delivery-windows'),
          api.get<Cart>('/cart/'),
          api.get<SavedPaymentMethod[]>('/payments/saved-methods'),
        ]);
        if (!hasReturnedPickedLocation && profileResponse.data.delivery_address) {
          setDeliveryAddress(profileResponse.data.delivery_address);
        }
        if (!hasReturnedPickedLocation) {
          setPickedLatitude(profileResponse.data.delivery_latitude ?? null);
          setPickedLongitude(profileResponse.data.delivery_longitude ?? null);
        }
        setDeliveryWindows(windowsResponse.data);
        setSelectedDeliveryWindowKey(windowsResponse.data[0]?.key ?? '');
        setCart(cartResponse.data);
        setSavedPaymentMethods(savedMethodsResponse.data);
      } catch {
        // Keep checkout usable even if the profile request fails.
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [hasReturnedPickedLocation]);

  useEffect(() => {
    if (params.pickedAddress) {
      setDeliveryAddress(params.pickedAddress);
    }
    if (params.pickedLatitude && params.pickedLongitude) {
      const latitude = Number(params.pickedLatitude);
      const longitude = Number(params.pickedLongitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        setPickedLatitude(latitude);
        setPickedLongitude(longitude);
      }
    }
  }, [params.pickedAddress, params.pickedLatitude, params.pickedLongitude]);

  const placeOrder = async () => {
    if (deliveryAddress.trim().length < 5) {
      Alert.alert('Missing address', 'Enter a full delivery address before placing the order.');
      return;
    }

    if (!selectedDeliveryWindowKey) {
      Alert.alert('Choose a delivery window', 'Select an available delivery timeframe before placing the order.');
      return;
    }

    await triggerLightHaptic();
    setPlacingOrder(true);

    try {
      let deliveryLatitude: number | null = null;
      let deliveryLongitude: number | null = null;

      try {
        const geocoded = await Location.geocodeAsync(deliveryAddress.trim());
        if (geocoded[0]) {
          deliveryLatitude = geocoded[0].latitude;
          deliveryLongitude = geocoded[0].longitude;
        }
      } catch {
        // Keep checkout usable even if address geocoding fails.
      }

      if (pickedLatitude !== null && pickedLongitude !== null) {
        deliveryLatitude = pickedLatitude;
        deliveryLongitude = pickedLongitude;
      }

      await api.put('/profile/me', {
        delivery_address: deliveryAddress.trim(),
        delivery_latitude: deliveryLatitude,
        delivery_longitude: deliveryLongitude,
      });

      const checkoutResponse = await api.post<Order>('/cart/checkout', {
        delivery_address: deliveryAddress.trim(),
        delivery_latitude: deliveryLatitude,
        delivery_longitude: deliveryLongitude,
        payment_method: paymentMethod,
        delivery_window_key: selectedDeliveryWindowKey,
      });

      const createdOrder = checkoutResponse.data;

      if (createdOrder.payment?.method === 'cash_on_delivery') {
        await triggerSuccessHaptic();
        Alert.alert(
          'Order placed',
          `Your order was placed successfully. Share cash code ${createdOrder.payment.cash_confirmation_code ?? '------'} with the driver after paying on delivery.`
        );
        router.replace('/(tabs)/orders');
        return;
      }

      if (createdOrder.payment?.authorization_url && createdOrder.payment.reference) {
        // We intentionally use Paystack's hosted checkout page here instead of
        // collecting card details directly in the app.
        const callbackUrl = Linking.createURL('/payments/paystack');
        const authResult = await WebBrowser.openAuthSessionAsync(
          createdOrder.payment.authorization_url,
          callbackUrl,
          { preferEphemeralSession: true }
        );

        if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
          Alert.alert(
            'Payment pending',
            'The order was created, but card payment has not been confirmed yet. You can verify it from your next payment attempt.'
          );
          router.replace('/(tabs)/orders');
          return;
        }

        const verificationResponse = await api.post<PaymentVerificationResponse>(
          `/payments/orders/${createdOrder.id}/verify-paystack`
        );

        if (!verificationResponse.data.verified) {
          Alert.alert('Payment pending', verificationResponse.data.detail);
          router.replace('/(tabs)/orders');
          return;
        }

        const refreshedSavedMethods = await api.get<SavedPaymentMethod[]>('/payments/saved-methods');
        setSavedPaymentMethods(refreshedSavedMethods.data);
      }

      await triggerSuccessHaptic();
      Alert.alert('Payment confirmed', 'Your grocery order has been placed and paid successfully.');
      router.replace('/(tabs)/orders');
    } catch (error: any) {
      Alert.alert('Checkout failed', error.response?.data?.detail || 'Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

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

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Final step</Text>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.subtitle}>Confirm how and where you want your groceries delivered.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.windowPolicyTitle}>Delivery timing</Text>
          <Text style={styles.windowPolicyText}>
            Public orders run from 8:00 AM to 8:00 PM, while staff shifts allow delivery windows up to 10:00 PM.
          </Text>

          <Text style={styles.label}>Delivery Window</Text>
          <View style={styles.deliveryWindowDropdownWrap}>
            <TouchableOpacity
              style={[
                styles.deliveryWindowDropdownButton,
                deliveryWindowMenuOpen && styles.deliveryWindowDropdownButtonOpen,
              ]}
              onPress={async () => {
                await triggerLightHaptic();
                setDeliveryWindowMenuOpen((current) => !current);
              }}
            >
              <View style={styles.deliveryWindowDropdownCopy}>
                <Text style={styles.deliveryWindowDropdownLabel}>
                  {selectedDeliveryWindow?.label ?? 'Select a delivery slot'}
                </Text>
                <Text style={styles.deliveryWindowDropdownHint}>Scheduled slot</Text>
              </View>
              <Text style={styles.deliveryWindowDropdownChevron}>
                {deliveryWindowMenuOpen ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {deliveryWindowMenuOpen ? (
              <View style={styles.deliveryWindowDropdownMenu}>
                {deliveryWindows.map((window) => {
                  const active = selectedDeliveryWindowKey === window.key;
                  return (
                    <TouchableOpacity
                      key={window.key}
                      style={[styles.deliveryWindowOption, active && styles.deliveryWindowOptionActive]}
                      onPress={async () => {
                        await triggerLightHaptic();
                        setSelectedDeliveryWindowKey(window.key);
                        setDeliveryWindowMenuOpen(false);
                      }}
                    >
                      <Text style={[styles.deliveryWindowOptionLabel, active && styles.deliveryWindowOptionLabelActive]}>
                        {window.label}
                      </Text>
                      <Text style={[styles.deliveryWindowOptionHint, active && styles.deliveryWindowOptionHintActive]}>
                        Scheduled slot
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Delivery Address</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="House number, street, area, city"
            multiline
            numberOfLines={2}
            value={deliveryAddress}
            onChangeText={handleDeliveryAddressChange}
          />
          <View style={styles.mapPickerRow}>
            <TouchableOpacity
              style={styles.mapPickerButton}
              onPress={async () => {
                await triggerLightHaptic();
                router.push({
                  pathname: '/map-picker',
                  params: {
                    address: deliveryAddress,
                    latitude: pickedLatitude !== null ? String(pickedLatitude) : undefined,
                    longitude: pickedLongitude !== null ? String(pickedLongitude) : undefined,
                    returnTo: 'checkout',
                  },
                });
              }}
            >
              <Text style={styles.mapPickerButtonText}>Pick on map</Text>
            </TouchableOpacity>
            {pickedLatitude !== null && pickedLongitude !== null ? (
              <Text style={styles.mapPickedText}>Map point confirmed</Text>
            ) : (
              <Text style={styles.mapPickedText}>No map pin saved yet</Text>
            )}
          </View>
          {loadingProfile ? <Text style={styles.helperText}>Loading saved address...</Text> : null}

          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.paymentOptions}>
            {[
              ['mobile_money', 'Mobile Money', 'phone-portrait-outline'],
              ['card', 'Card', 'card-outline'],
              ['cash_on_delivery', 'Cash on Delivery', 'cash-outline'],
            ].map(([value, label, icon]) => {
              const active = paymentMethod === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.paymentChip, active && styles.paymentChipActive]}
                  onPress={async () => {
                    await triggerLightHaptic();
                    setPaymentMethod(value as typeof paymentMethod);
                  }}
                >
                  <Ionicons
                    name={icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={active ? '#166534' : '#64748B'}
                  />
                  <Text style={[styles.paymentChipText, active && styles.paymentChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentMethod === 'card' ? (
            <View style={styles.savedMethodsSection}>
              <Text style={styles.savedMethodsTitle}>Saved payment methods</Text>
              <Text style={styles.savedMethodsHelper}>
                SmartGrocery uses Paystack’s secure hosted payment page for card entry. Any reusable card Paystack returns after a successful payment will appear here for future checkout improvements.
              </Text>
              {savedPaymentMethods.length ? (
                savedPaymentMethods.map((method) => (
                  <View key={method.id} style={styles.savedMethodRow}>
                    <View style={styles.savedMethodCopy}>
                      <Text style={styles.savedMethodLabel}>
                        {method.brand || 'Saved card'} {method.last4 ? `•••• ${method.last4}` : ''}
                      </Text>
                      <Text style={styles.savedMethodMeta}>
                        {method.bank || 'Paystack'}
                        {method.exp_month && method.exp_year ? ` · exp ${method.exp_month}/${method.exp_year}` : ''}
                      </Text>
                    </View>
                    {method.is_default ? <Text style={styles.savedMethodBadge}>Default</Text> : null}
                  </View>
                ))
              ) : (
                <View style={styles.savedMethodEmpty}>
                  <Ionicons name="card-outline" size={18} color="#64748B" />
                  <Text style={styles.savedMethodEmptyText}>
                    No saved cards yet. Your first successful card payment will populate this list.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {cart ? (
            <View style={styles.checkoutTotalsCard}>
              <Text style={styles.checkoutTotalsTitle}>Order pricing</Text>
              <View style={styles.checkoutTotalsRow}>
                <Text style={styles.checkoutTotalsLabel}>Subtotal</Text>
                <Text style={styles.checkoutTotalsValue}>{formatCedi(cart.subtotal_amount ?? 0)}</Text>
              </View>
              <View style={styles.checkoutTotalsRow}>
                <Text style={styles.checkoutTotalsLabel}>VAT</Text>
                <Text style={styles.checkoutTotalsValue}>{formatCedi(cart.tax_total ?? 0)}</Text>
              </View>
              <View style={[styles.checkoutTotalsRow, styles.checkoutTotalsRowStrong]}>
                <Text style={styles.checkoutTotalsStrongLabel}>Total to pay</Text>
                <Text style={styles.checkoutTotalsStrongValue}>{formatCedi(cart.total_amount ?? 0)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.reviewButton, !cartItems.length && styles.reviewButtonDisabled]}
          onPress={async () => {
            await triggerLightHaptic();
            setReviewModalOpen(true);
          }}
          disabled={!cartItems.length}
        >
          <View style={styles.reviewButtonContent}>
            <Ionicons name="receipt-outline" size={18} color="#0F172A" />
            <Text style={styles.reviewButtonText}>Review Items ({cartItemCount})</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, placingOrder && styles.buttonDisabled]}
          onPress={placeOrder}
          disabled={placingOrder}
        >
          <Text style={styles.buttonText}>{placingOrder ? 'Placing order...' : 'Place Order'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={reviewModalOpen}
        onRequestClose={() => setReviewModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Items in this order</Text>
                <Text style={styles.modalSubtitle}>{cartItemCount} items ready for checkout</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await triggerLightHaptic();
                  setReviewModalOpen(false);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {cartItems.map((item) => (
                <View key={item.id} style={styles.modalItemCard}>
                  <View style={styles.modalItemTopRow}>
                    <View style={styles.modalItemCopy}>
                      <Text style={styles.modalItemName}>{item.product.name}</Text>
                      <Text style={styles.modalItemMeta}>
                        {item.quantity} x {formatCedi(item.product.price)}
                      </Text>
                      <Text style={styles.modalItemTaxMeta}>
                        {item.product.tax_status === 'tax_exempt' ? 'Tax exempt raw food' : `VAT ${formatCedi(item.line_tax)}`}
                      </Text>
                    </View>
                    <Text style={styles.modalItemTotal}>
                      {formatCedi(item.line_total)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalTotalsCard}>
              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>Subtotal</Text>
                <Text style={styles.modalTotalValue}>{formatCedi(cart?.subtotal_amount ?? 0)}</Text>
              </View>
              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>VAT</Text>
                <Text style={styles.modalTotalValue}>{formatCedi(cart?.tax_total ?? 0)}</Text>
              </View>
              <View style={[styles.modalTotalRow, styles.modalTotalRowStrong]}>
                <Text style={styles.modalTotalStrongLabel}>Estimated total</Text>
                <Text style={styles.modalTotalStrongValue}>{formatCedi(cart?.total_amount ?? 0)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={async () => {
                await triggerLightHaptic();
                setReviewModalOpen(false);
              }}
            >
              <Text style={styles.modalDoneButtonText}>Back to Checkout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
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
  heroCard: {
    backgroundColor: '#0F5A35',
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
  },
  eyebrow: {
    color: '#C7F9CC',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#E7FBE8',
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  windowPolicyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  windowPolicyText: {
    color: '#475569',
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  deliveryWindowDropdownWrap: {
    marginBottom: 16,
    gap: 10,
  },
  deliveryWindowDropdownButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deliveryWindowDropdownButtonOpen: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
  },
  deliveryWindowDropdownCopy: {
    flex: 1,
  },
  deliveryWindowDropdownLabel: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 16,
  },
  deliveryWindowDropdownHint: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  deliveryWindowDropdownChevron: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '800',
  },
  deliveryWindowDropdownMenu: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  deliveryWindowOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  deliveryWindowOptionActive: {
    backgroundColor: '#DBEAFE',
  },
  deliveryWindowOptionLabel: {
    color: '#0F172A',
    fontWeight: '700',
  },
  deliveryWindowOptionLabelActive: {
    color: '#1D4ED8',
  },
  deliveryWindowOptionHint: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  deliveryWindowOptionHintActive: {
    color: '#1D4ED8',
  },
  helperText: {
    marginTop: -8,
    marginBottom: 12,
    fontSize: 12,
    color: '#64748B',
  },
  mapPickerRow: {
    marginTop: -6,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapPickerButton: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mapPickerButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  mapPickedText: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 78,
    maxHeight: 96,
    textAlignVertical: 'top',
  },
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentChipActive: {
    backgroundColor: '#ECFCCB',
  },
  paymentChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  paymentChipTextActive: {
    color: '#166534',
  },
  savedMethodsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  savedMethodsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  savedMethodsHelper: {
    color: '#64748B',
    lineHeight: 19,
  },
  savedMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  savedMethodCopy: {
    flex: 1,
    gap: 3,
  },
  savedMethodLabel: {
    color: '#0F172A',
    fontWeight: '700',
  },
  savedMethodMeta: {
    color: '#64748B',
    fontSize: 13,
  },
  savedMethodBadge: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  savedMethodEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
  },
  savedMethodEmptyText: {
    flex: 1,
    color: '#64748B',
    lineHeight: 19,
  },
  checkoutTotalsCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  checkoutTotalsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  checkoutTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkoutTotalsRowStrong: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  checkoutTotalsLabel: {
    color: '#64748B',
    fontWeight: '600',
  },
  checkoutTotalsValue: {
    color: '#0F172A',
    fontWeight: '700',
  },
  checkoutTotalsStrongLabel: {
    color: '#0F172A',
    fontWeight: '800',
  },
  checkoutTotalsStrongValue: {
    color: '#166534',
    fontWeight: '800',
  },
  reviewButton: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewButtonDisabled: {
    opacity: 0.6,
  },
  reviewButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#16A34A',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '72%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    marginTop: 4,
    color: '#64748B',
    fontWeight: '600',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    marginTop: 18,
  },
  modalScrollContent: {
    gap: 10,
    paddingBottom: 12,
  },
  modalItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
  },
  modalItemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalItemCopy: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalItemMeta: {
    marginTop: 4,
    color: '#64748B',
  },
  modalItemTaxMeta: {
    marginTop: 4,
    color: '#92400E',
    fontWeight: '600',
  },
  modalItemTotal: {
    color: '#16A34A',
    fontWeight: '800',
  },
  modalTotalsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  modalTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTotalLabel: {
    color: '#475569',
    fontWeight: '700',
  },
  modalTotalValue: {
    color: '#0F172A',
    fontWeight: '700',
  },
  modalTotalRowStrong: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalTotalStrongLabel: {
    color: '#0F172A',
    fontWeight: '800',
  },
  modalTotalStrongValue: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  modalDoneButton: {
    backgroundColor: '#ECFCCB',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalDoneButtonText: {
    color: '#166534',
    fontWeight: '800',
  },
});
