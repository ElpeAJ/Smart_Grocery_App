import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import ProductArtwork from '../../src/components/ProductArtwork';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Product, ProductCategory, Store, UserProfile } from '../../src/types/api';
import { getCategoryTheme } from '../../src/utils/catalog';
import { formatCedi } from '../../src/utils/currency';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../src/utils/haptics';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

type ShopListItem =
  | { key: 'sticky-search'; type: 'sticky-search' }
  | { key: 'categories'; type: 'categories' }
  | { key: 'most-shopped'; type: 'most-shopped' }
  | { key: 'products-header'; type: 'products-header' }
  | { key: `product-${number}`; type: 'product'; product: Product };

function ProductCard({
  item,
  desiredQuantity,
  submittingId,
  onChangeDesiredQuantity,
  onAddToCart,
}: {
  item: Product;
  desiredQuantity: number;
  submittingId: number | null;
  onChangeDesiredQuantity: (product: Product, delta: number) => void;
  onAddToCart: (product: Product) => void;
}) {
  const disabled = item.status !== 'in_stock' || submittingId === item.id;
  const categoryTheme = getCategoryTheme(item.category?.name);

  return (
    <View style={styles.productCard}>
      <ProductArtwork
        imageUrl={item.image_url}
        categoryName={item.category?.name}
        productName={item.name}
        variant="card"
      />
      <View style={styles.productContent}>
        <View style={styles.productTopRow}>
          <View style={styles.productTextWrap}>
            <Text style={styles.productName}>{item.name}</Text>
            <Text style={styles.productDescription} numberOfLines={2}>
              {item.description || 'Fresh grocery item'}
            </Text>
            <Text
              style={[
                styles.categoryPill,
                {
                  backgroundColor: categoryTheme.backgroundColor,
                  color: categoryTheme.textColor,
                },
              ]}
            >
              {item.category?.name || 'Uncategorized'}
            </Text>
          </View>
          <Text style={styles.productPrice}>{formatCedi(item.price)}</Text>
        </View>
        <Text style={styles.stockText}>
          {item.status === 'in_stock' ? `${item.stock_quantity} in stock` : 'Out of stock'}
        </Text>
        <View style={styles.productBottomRow}>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={async () => {
                await triggerLightHaptic();
                onChangeDesiredQuantity(item, -1);
              }}
              disabled={desiredQuantity <= 1}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{desiredQuantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={async () => {
                await triggerLightHaptic();
                onChangeDesiredQuantity(item, 1);
              }}
              disabled={desiredQuantity >= item.stock_quantity}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <Pressable
            onPress={async () => {
              await triggerLightHaptic();
              router.push(`/product/${item.id}`);
            }}
          >
            <Text style={styles.detailsLink}>View details</Text>
          </Pressable>
        </View>
        <TouchableOpacity
          style={[styles.addButton, disabled && styles.buttonDisabled]}
          onPress={() => onAddToCart(item)}
          disabled={disabled}
        >
          <Text style={styles.addButtonText}>{submittingId === item.id ? 'Adding...' : 'Add to Cart'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ShopScreen() {
  const flatListRef = useRef<FlatList<ShopListItem>>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mostShoppedProducts, setMostShoppedProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [savingStore, setSavingStore] = useState(false);
  const [desiredQuantities, setDesiredQuantities] = useState<Record<number, number>>({});
  const [productsSectionOffset, setProductsSectionOffset] = useState(0);
  const { user } = useAuth();
  const role = user?.role;

  const submitSearch = () =>
    fetchShopData(selectedStoreId, selectedCategoryId, searchTerm, {
      jumpToResults: true,
    });

  const fetchShopData = useCallback(async (
    storeId = selectedStoreId,
    categoryId = selectedCategoryId,
    search = searchTerm,
    options?: { jumpToResults?: boolean }
  ) => {
    try {
      const [storesResponse, categoriesResponse, profileResponse, productsResponse, mostShoppedResponse] =
        await Promise.all([
          api.get<Store[]>('/stores/'),
          api.get<ProductCategory[]>('/categories/'),
          api.get<UserProfile>('/profile/me'),
          api.get<Product[]>('/products/', {
            params: {
              store_id: storeId ?? undefined,
              category_id: categoryId ?? undefined,
              q: search.trim() || undefined,
              in_stock_only: true,
            },
          }),
          api.get<Product[]>('/products/most-shopped', {
            params: {
              store_id: storeId ?? undefined,
              limit: 6,
            },
          }),
        ]);

      setStores(storesResponse.data);
      setCategories(categoriesResponse.data);
      setProfile(profileResponse.data);
      setProducts(productsResponse.data);
      setMostShoppedProducts(mostShoppedResponse.data);

      if (selectedStoreId === null && profileResponse.data.preferred_store_id) {
        setSelectedStoreId(profileResponse.data.preferred_store_id);
      }

      if (options?.jumpToResults) {
        requestAnimationFrame(() => {
          const productsHeaderRowIndex = search.trim()
            ? 1
            : categoryId === null
              ? 3
              : 2;

          if (productsHeaderRowIndex >= 0) {
            flatListRef.current?.scrollToIndex({
              index: productsHeaderRowIndex,
              animated: true,
              viewPosition: 0,
            });
            return;
          }

          flatListRef.current?.scrollToOffset({
            offset: Math.max(0, productsSectionOffset - 8),
            animated: true,
          });
        });
      }
    } catch {
      Alert.alert('Could not load products', 'Check your API URL and backend server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [productsSectionOffset, searchTerm, selectedCategoryId, selectedStoreId]);

  useEffect(() => {
    fetchShopData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        fetchShopData(selectedStoreId, selectedCategoryId, searchTerm);
      }
    }, [fetchShopData, loading, searchTerm, selectedCategoryId, selectedStoreId])
  );

  useEffect(() => {
    if (!loading) {
      fetchShopData(selectedStoreId, selectedCategoryId, searchTerm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, selectedCategoryId]);

  const changeDesiredQuantity = (product: Product, delta: number) => {
    setDesiredQuantities((currentQuantities) => {
      const currentValue = currentQuantities[product.id] ?? 1;
      const nextValue = Math.min(product.stock_quantity, Math.max(1, currentValue + delta));
      return { ...currentQuantities, [product.id]: nextValue };
    });
  };

  const savePreferredStore = async (storeId: number | null) => {
    await triggerLightHaptic();
    setSelectedStoreId(storeId);
    setSavingStore(true);

    try {
      const response = await api.put<UserProfile>('/profile/me', {
        phone_number: profile?.phone_number ?? null,
        delivery_address: profile?.delivery_address ?? null,
        preferred_store_id: storeId,
      });
      setProfile(response.data);
    } catch (error: any) {
      Alert.alert('Could not save store', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSavingStore(false);
    }
  };

  const addToCart = async (product: Product) => {
    await triggerLightHaptic();
    setSubmittingId(product.id);
    const quantity = desiredQuantities[product.id] ?? 1;

    try {
      await api.post('/cart/items', { product_id: product.id, quantity });
      await triggerSuccessHaptic();
      Alert.alert('Added to cart', `${product.name} x${quantity} was added to your cart.`);
    } catch (error: any) {
      Alert.alert('Could not add item', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSubmittingId(null);
    }
  };

  const activeStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );
  const hasActiveSearch = searchTerm.trim().length > 0;

  const heroStats = useMemo(
    () => [
      {
        label: activeStore ? 'Store' : 'Stores',
        value: activeStore ? activeStore.name : `${stores.length || 0}`,
      },
      {
        label: activeCategory ? 'Category' : 'Categories',
        value: activeCategory ? activeCategory.name : `${categories.length || 0}`,
      },
      {
        label: 'In stock',
        value: `${products.length}`,
      },
    ],
    [activeCategory, activeStore, categories.length, products.length, stores.length]
  );

  const listItems = useMemo<ShopListItem[]>(() => {
    const items: ShopListItem[] = [{ key: 'sticky-search', type: 'sticky-search' }];

    if (!hasActiveSearch) {
      items.push({ key: 'categories', type: 'categories' });
    }

    if (!selectedCategoryId && !hasActiveSearch) {
      items.push({ key: 'most-shopped', type: 'most-shopped' });
    }

    items.push({ key: 'products-header', type: 'products-header' });
    items.push(...products.map((product) => ({ key: `product-${product.id}` as const, type: 'product' as const, product })));

    return items;
  }, [hasActiveSearch, products, selectedCategoryId]);

  if (loading) {
    return <LoadingScreen label="Loading products..." />;
  }

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.type === 'sticky-search') {
            return (
              <View style={styles.filterCardStickyShell}>
                <View style={styles.filterCard}>
                  <Text style={styles.sectionTitle}>Search and store</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search groceries"
                    value={searchTerm}
                    onChangeText={(value) => {
                      setSearchTerm(value);

                      if (!value.trim()) {
                        fetchShopData(selectedStoreId, selectedCategoryId, '', { jumpToResults: false });
                        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      }
                    }}
                    onSubmitEditing={submitSearch}
                    returnKeyType="search"
                  />
                  {hasActiveSearch ? (
                    <View style={styles.searchBanner}>
                      <Text style={styles.searchBannerLabel}>Search active</Text>
                      <Text style={styles.searchBannerText} numberOfLines={2}>
                        Showing results for: {searchTerm.trim()}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.filterLabel}>Preferred store {savingStore ? '(saving...)' : ''}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {[{ id: -1, name: 'All stores', location: '' }, ...stores].map((storeItem) => {
                      const isAllStores = storeItem.id === -1;
                      const isActive = isAllStores ? selectedStoreId === null : selectedStoreId === storeItem.id;

                      return (
                        <TouchableOpacity
                          key={storeItem.id}
                          style={[styles.chip, isActive && styles.chipActive]}
                          onPress={() => savePreferredStore(isAllStores ? null : storeItem.id)}
                        >
                          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{storeItem.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            );
          }

          if (item.type === 'categories') {
            return (
              <View style={styles.headerWrap}>
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitleLarge}>Shop by category</Text>
                    <Text style={styles.sectionHint}>Tap a card to focus the catalog</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryCardsRow}>
                    {[{ id: -1, name: 'All categories' }, ...categories].map((categoryItem) => {
                      const isAllCategories = categoryItem.id === -1;
                      const isActive = isAllCategories ? selectedCategoryId === null : selectedCategoryId === categoryItem.id;
                      const theme = getCategoryTheme(categoryItem.name);

                      return (
                        <TouchableOpacity
                          key={categoryItem.id}
                          style={[
                            styles.categoryCard,
                            { backgroundColor: theme.backgroundColor, borderColor: isActive ? theme.accentColor : 'transparent' },
                          ]}
                          onPress={async () => {
                            await triggerLightHaptic();
                            setSelectedCategoryId(isAllCategories ? null : categoryItem.id);
                          }}
                        >
                          <View style={[styles.categoryEmojiBadge, { backgroundColor: theme.accentColor }]}>
                            <Text style={styles.categoryEmoji}>{theme.emoji}</Text>
                          </View>
                          <Text style={[styles.categoryCardTitle, { color: theme.textColor }]} numberOfLines={2}>
                            {categoryItem.name}
                          </Text>
                          <Text style={[styles.categoryCardMeta, { color: theme.accentColor }]}>
                            {isActive ? 'Viewing now' : 'Open category'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            );
          }

          if (item.type === 'most-shopped') {
            return (
              <View style={styles.headerWrap}>
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitleLarge}>Most shopped</Text>
                    <Text style={styles.sectionHint}>Customer favorites</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularRow}>
                    {mostShoppedProducts.length ? (
                      mostShoppedProducts.map((popularItem) => (
                        <TouchableOpacity
                          key={popularItem.id}
                          style={styles.popularCard}
                          onPress={() => router.push(`/product/${popularItem.id}`)}
                        >
                          <ProductArtwork
                            imageUrl={popularItem.image_url}
                            categoryName={popularItem.category?.name}
                            productName={popularItem.name}
                            variant="mini"
                          />
                          <Text style={styles.popularName} numberOfLines={1}>
                            {popularItem.name}
                          </Text>
                          <Text style={styles.popularCategory}>{popularItem.category?.name || 'Groceries'}</Text>
                          <Text style={styles.popularPrice}>{formatCedi(popularItem.price)}</Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={styles.emptyPopularText}>No purchase data yet.</Text>
                    )}
                  </ScrollView>
                </View>
              </View>
            );
          }

          if (item.type === 'products-header') {
            return (
              <View
                style={styles.productsHeader}
                onLayout={(event) => {
                  setProductsSectionOffset(event.nativeEvent.layout.y);
                }}
              >
                <View>
                  <Text style={styles.productsTitle}>
                    {hasActiveSearch
                      ? `Search results for "${searchTerm.trim()}"`
                      : activeCategory
                        ? activeCategory.name
                        : 'Available Products'}
                  </Text>
                  <Text style={styles.productsMeta}>
                    {products.length} {products.length === 1 ? 'item' : 'items'} ready to shop
                  </Text>
                  {hasActiveSearch ? (
                    <Text style={styles.searchResultsMeta}>Results narrowed by your current search.</Text>
                  ) : null}
                </View>
              </View>
            );
          }

          return (
            <ProductCard
              item={item.product}
              desiredQuantity={desiredQuantities[item.product.id] ?? 1}
              submittingId={submittingId}
              onChangeDesiredQuantity={changeDesiredQuantity}
              onAddToCart={addToCart}
            />
          );
        }}
        contentContainerStyle={styles.listContent}
        stickyHeaderIndices={[1]}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          flatListRef.current?.scrollToOffset({
            offset: Math.max(0, index * averageItemLength),
            animated: true,
          });

          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0,
            });
          }, 120);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchShopData();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Fresh picks nearby</Text>
              <Text style={styles.title}>Smart Grocery</Text>
              <Text style={styles.subtitle}>Welcome back, {user?.full_name || user?.email}</Text>
              <Text style={styles.helperText}>
                {activeStore
                  ? `Shopping from ${activeStore.name} in ${activeStore.location}`
                  : 'Choose a preferred store to keep your groceries local and fast.'}
              </Text>
              <View style={styles.heroFooter}>
                <Text style={styles.heroFooterText}>
                  {activeCategory ? `Browsing ${activeCategory.name}` : 'Browse by category or start with the most shopped items below.'}
                </Text>
              </View>
              <View style={styles.heroStatsRow}>
                {heroStats.map((stat) => (
                  <View key={stat.label} style={styles.heroStatCard}>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>
                      {stat.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={styles.emptyTitle}>No products available right now.</Text>
            <Text style={styles.emptyText}>
              Try another category, another store, or clear the search to see more products.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
  },
  listContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 28,
  },
  headerWrap: {
    gap: 16,
  },
  filterCardStickyShell: {
    backgroundColor: '#F6F6F0',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 18,
    marginBottom: 4,
    zIndex: 2,
  },
  heroCard: {
    backgroundColor: '#0F5A35',
    borderRadius: 28,
    padding: 22,
  },
  eyebrow: {
    color: '#C7F9CC',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#E7FBE8',
  },
  helperText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#D6F5D9',
  },
  heroFooter: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  heroFooterText: {
    color: '#F5FBEF',
    fontWeight: '600',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 12,
  },
  heroStatLabel: {
    color: '#C7F9CC',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  heroStatValue: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterLabel: {
    marginTop: 14,
    marginBottom: 10,
    color: '#475569',
    fontWeight: '600',
  },
  searchBanner: {
    marginTop: 12,
    backgroundColor: '#ECFCCB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchBannerLabel: {
    color: '#4D7C0F',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  searchBannerText: {
    marginTop: 6,
    color: '#365314',
    fontWeight: '600',
  },
  chipRow: {
    gap: 10,
  },
  chip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: '#1D4ED8',
  },
  chipText: {
    color: '#334155',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  sectionBlock: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },
  sectionTitleLarge: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHint: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 12,
  },
  categoryCardsRow: {
    gap: 12,
  },
  categoryCard: {
    width: 156,
    borderRadius: 22,
    padding: 16,
    borderWidth: 2,
  },
  categoryEmojiBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 22,
  },
  categoryCardTitle: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  categoryCardMeta: {
    marginTop: 12,
    fontWeight: '700',
    fontSize: 12,
  },
  popularRow: {
    gap: 12,
  },
  popularCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 10,
  },
  popularName: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  popularCategory: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  popularPrice: {
    marginTop: 8,
    color: '#16A34A',
    fontWeight: '800',
  },
  emptyPopularText: {
    color: '#64748B',
  },
  productsHeader: {
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  productsTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  productsMeta: {
    marginTop: 4,
    color: '#64748B',
  },
  searchResultsMeta: {
    marginTop: 6,
    color: '#4D7C0F',
    fontWeight: '600',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
  },
  productContent: {
    padding: 16,
  },
  productTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  productTextWrap: {
    flex: 1,
  },
  productName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  productDescription: {
    marginTop: 6,
    fontSize: 14,
    color: '#475569',
  },
  categoryPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#EEF2FF',
    color: '#3730A3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16A34A',
  },
  stockText: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  productBottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  quantityButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  quantityValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  detailsLink: {
    color: '#2563EB',
    fontWeight: '700',
  },
  addButton: {
    marginTop: 16,
    backgroundColor: '#16A34A',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#64748B',
  },
});
