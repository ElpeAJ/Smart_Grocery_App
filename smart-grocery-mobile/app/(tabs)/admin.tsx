import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { AppUser, Product, ProductCategory, Store } from '../../src/types/api';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../src/utils/haptics';
import { canManageCatalog, getHomeRouteForRole } from '../../src/utils/roles';

const ROLE_OPTIONS: AppUser['role'][] = ['customer', 'staff', 'manager', 'driver', 'admin'];

type AdminSection = 'store' | 'category' | 'product' | 'roles';
type TeamRoleGroup = AppUser['role'];
type AttentionIssue = 'missing_store' | 'uncategorized' | 'low_stock';

export default function AdminScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const listRef = useRef<FlatList<Product>>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [updatingProductId, setUpdatingProductId] = useState<number | null>(null);
  const [updatingPriceProductId, setUpdatingPriceProductId] = useState<number | null>(null);
  const [updatingImageProductId, setUpdatingImageProductId] = useState<number | null>(null);
  const [updatingCategoryProductId, setUpdatingCategoryProductId] = useState<number | null>(null);
  const [updatingStoreProductId, setUpdatingStoreProductId] = useState<number | null>(null);
  const [updatingCategoryNameId, setUpdatingCategoryNameId] = useState<number | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<number, string>>({});
  const [storeDrafts, setStoreDrafts] = useState<Record<number, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, string>>({});
  const [openSections, setOpenSections] = useState<Record<AdminSection, boolean>>({
    store: false,
    category: false,
    product: true,
    roles: false,
  });
  const [activeRoleGroup, setActiveRoleGroup] = useState<TeamRoleGroup>('staff');
  const [focusedCategoryName, setFocusedCategoryName] = useState<string | null>(null);
  const [workspaceOffsetY, setWorkspaceOffsetY] = useState<number | null>(null);

  const canAccessAdmin = canManageCatalog(role);
  const canManageRoles = role === 'admin';

  const metrics = useMemo(
    () => [
      { label: 'Stores', value: stores.length },
      { label: 'Products', value: products.length },
      { label: 'Categories', value: categories.length },
      { label: 'Drivers', value: users.filter((candidate) => candidate.role === 'driver').length },
    ],
    [categories.length, products.length, stores.length, users]
  );

  const filteredUsers = useMemo(
    () => users.filter((candidate) => candidate.role === activeRoleGroup),
    [activeRoleGroup, users]
  );

  const catalogSections = useMemo(() => {
    const grouped = new Map<string, Product[]>();

    products.forEach((product) => {
      const categoryNameValue = product.category?.name ?? 'Uncategorized';
      const existingGroup = grouped.get(categoryNameValue) ?? [];
      existingGroup.push(product);
      grouped.set(categoryNameValue, existingGroup);
    });

    return Array.from(grouped.entries())
      .sort(([firstName], [secondName]) => firstName.localeCompare(secondName))
      .map(([categoryNameValue, groupedProducts]) => ({
        key: `category-${categoryNameValue}`,
        title: categoryNameValue,
        count: groupedProducts.length,
        needsAttentionCount: groupedProducts.filter((product) => !product.store_id).length,
        products: groupedProducts.sort((firstProduct, secondProduct) =>
          firstProduct.name.localeCompare(secondProduct.name)
        ),
      }));
  }, [products]);

  const focusedCategory = useMemo(
    () => catalogSections.find((section) => section.title === focusedCategoryName) ?? null,
    [catalogSections, focusedCategoryName]
  );

  const needsAttentionProducts = useMemo(() => {
    return products
      .map((product) => {
        const issues: AttentionIssue[] = [];
        if (!product.store_id) {
          issues.push('missing_store');
        }
        if (!product.category) {
          issues.push('uncategorized');
        }
        if (product.stock_quantity <= 5) {
          issues.push('low_stock');
        }

        return { product, issues };
      })
      .filter((entry) => entry.issues.length > 0)
      .sort((firstEntry, secondEntry) => secondEntry.issues.length - firstEntry.issues.length);
  }, [products]);

  const attentionCounts = useMemo(
    () => ({
      missingStore: needsAttentionProducts.filter((entry) => entry.issues.includes('missing_store')).length,
      uncategorized: needsAttentionProducts.filter((entry) => entry.issues.includes('uncategorized')).length,
      lowStock: needsAttentionProducts.filter((entry) => entry.issues.includes('low_stock')).length,
    }),
    [needsAttentionProducts]
  );

  const loadCatalog = useCallback(async () => {
    try {
      const [storesResponse, productsResponse, categoriesResponse] = await Promise.all([
        api.get<Store[]>('/stores/'),
        api.get<Product[]>('/products/'),
        api.get<ProductCategory[]>('/categories/'),
      ]);

      setStores(storesResponse.data);
      setProducts(productsResponse.data);
      setCategories(categoriesResponse.data);
      setStockDrafts(
        Object.fromEntries(productsResponse.data.map((product) => [product.id, String(product.stock_quantity)]))
      );
      setPriceDrafts(
        Object.fromEntries(productsResponse.data.map((product) => [product.id, String(product.price)]))
      );
      setImageDrafts(
        Object.fromEntries(productsResponse.data.map((product) => [product.id, product.image_url ?? '']))
      );
      setStoreDrafts(
        Object.fromEntries(
          productsResponse.data.map((product) => [product.id, product.store_id ? String(product.store_id) : ''])
        )
      );
      setCategoryDrafts(
        Object.fromEntries(categoriesResponse.data.map((category) => [category.id, category.name]))
      );

      if (canManageRoles) {
        const usersResponse = await api.get<AppUser[]>('/users/');
        setUsers(usersResponse.data);
      }
    } catch (error: any) {
      Alert.alert('Could not load admin data', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManageRoles]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        loadCatalog();
      }
    }, [loadCatalog, loading])
  );

  useEffect(() => {
    if (!focusedCategoryName || workspaceOffsetY === null) {
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(workspaceOffsetY - 16, 0),
        animated: true,
      });
    });
  }, [focusedCategoryName, workspaceOffsetY]);

  const toggleSection = (section: AdminSection) => {
    setOpenSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section],
    }));
  };

  const createStore = async () => {
    if (!storeName.trim() || !storeLocation.trim()) {
      Alert.alert('Missing store details', 'Enter both store name and location.');
      return;
    }

    await triggerLightHaptic();
    setCreatingStore(true);
    try {
      await api.post('/stores/', {
        name: storeName.trim(),
        location: storeLocation.trim(),
      });
      setStoreName('');
      setStoreLocation('');
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Store created', 'Your new store is ready for products.');
    } catch (error: any) {
      Alert.alert('Could not create store', error.response?.data?.detail || 'Please try again.');
    } finally {
      setCreatingStore(false);
    }
  };

  const createCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('Missing category name', 'Enter a category name first.');
      return;
    }

    await triggerLightHaptic();
    setCreatingCategory(true);
    try {
      await api.post('/categories/', { name: categoryName.trim() });
      setCategoryName('');
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Category created', 'The new category is now ready to use.');
    } catch (error: any) {
      Alert.alert('Could not create category', error.response?.data?.detail || 'Please try again.');
    } finally {
      setCreatingCategory(false);
    }
  };

  const renameCategory = async (categoryId: number) => {
    const nextName = categoryDrafts[categoryId]?.trim();

    if (!nextName) {
      Alert.alert('Missing category name', 'Enter the corrected category name.');
      return;
    }

    await triggerLightHaptic();
    setUpdatingCategoryNameId(categoryId);
    try {
      await api.put(`/categories/${categoryId}`, { name: nextName });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Category updated', 'The category name has been updated.');
    } catch (error: any) {
      Alert.alert('Could not update category', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingCategoryNameId(null);
    }
  };

  const createProduct = async () => {
    const parsedPrice = Number(productPrice);
    const parsedStock = Number(productStock);

    if (!productName.trim()) {
      Alert.alert('Missing product name', 'Enter the product name.');
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert('Missing category', 'Choose a category for the product.');
      return;
    }

    if (!selectedStoreId) {
      Alert.alert('Missing store', 'Choose the store that will own this product.');
      return;
    }

    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a numeric price such as 20 or 20.5.');
      return;
    }

    if (Number.isNaN(parsedStock) || parsedStock < 0) {
      Alert.alert('Invalid stock', 'Enter a stock quantity of 0 or more.');
      return;
    }

    await triggerLightHaptic();
    setCreatingProduct(true);
    try {
      await api.post('/products/', {
        store_id: Number(selectedStoreId),
        category_id: Number(selectedCategoryId),
        name: productName.trim(),
        description: productDescription.trim() || null,
        price: parsedPrice,
        stock_quantity: parsedStock,
        image_url: productImageUrl.trim() || null,
      });
      setProductName('');
      setProductDescription('');
      setProductPrice('');
      setProductStock('');
      setProductImageUrl('');
      setSelectedStoreId('');
      setSelectedCategoryId('');
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Product created', 'The new product is now available in the catalog.');
    } catch (error: any) {
      Alert.alert('Could not create product', error.response?.data?.detail || 'Please try again.');
    } finally {
      setCreatingProduct(false);
    }
  };

  const updateStock = async (productId: number) => {
    const nextStock = Number(stockDrafts[productId]);

    if (Number.isNaN(nextStock) || nextStock < 0) {
      Alert.alert('Invalid stock', 'Enter a valid number for stock quantity.');
      return;
    }

    await triggerLightHaptic();
    setUpdatingProductId(productId);
    try {
      await api.put(`/inventory/${productId}/stock`, null, {
        params: { stock_quantity: nextStock },
      });
      await loadCatalog();
      await triggerSuccessHaptic();
    } catch (error: any) {
      Alert.alert('Could not update stock', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingProductId(null);
    }
  };

  const updatePrice = async (productId: number) => {
    const nextPrice = Number(priceDrafts[productId]);

    if (Number.isNaN(nextPrice) || nextPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than 0.');
      return;
    }

    await triggerLightHaptic();
    setUpdatingPriceProductId(productId);
    try {
      await api.put(`/products/${productId}/price`, { price: nextPrice });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Price updated', 'The product price has been updated.');
    } catch (error: any) {
      Alert.alert('Could not update price', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingPriceProductId(null);
    }
  };

  const updateImage = async (productId: number) => {
    await triggerLightHaptic();
    setUpdatingImageProductId(productId);
    try {
      await api.put(`/products/${productId}/image`, {
        image_url: imageDrafts[productId]?.trim() || null,
      });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Image updated', 'The product image has been updated.');
    } catch (error: any) {
      Alert.alert('Could not update image', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingImageProductId(null);
    }
  };

  const assignStore = async (productId: number) => {
    const nextStoreId = Number(storeDrafts[productId]);

    if (Number.isNaN(nextStoreId) || nextStoreId <= 0) {
      Alert.alert('Missing store', 'Choose a store before saving.');
      return;
    }

    await triggerLightHaptic();
    setUpdatingStoreProductId(productId);
    try {
      await api.put(`/products/${productId}/store`, { store_id: nextStoreId });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Store assigned', 'The product is now linked to a store.');
    } catch (error: any) {
      Alert.alert('Could not assign store', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingStoreProductId(null);
    }
  };

  const assignCategory = async (productId: number, categoryId: number) => {
    await triggerLightHaptic();
    setUpdatingCategoryProductId(productId);
    try {
      await api.put(`/products/${productId}/category`, { category_id: categoryId });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Category assigned', 'The product has been categorized.');
    } catch (error: any) {
      Alert.alert('Could not assign category', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingCategoryProductId(null);
    }
  };

  const updateUserRole = async (userId: number, nextRole: AppUser['role']) => {
    await triggerLightHaptic();
    setUpdatingUserId(userId);
    try {
      await api.put(`/users/${userId}/role`, { role: nextRole });
      await loadCatalog();
      await triggerSuccessHaptic();
      Alert.alert('Role updated', 'The user role has been updated.');
    } catch (error: any) {
      Alert.alert('Could not update role', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (!canAccessAdmin) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  if (loading) {
    return <LoadingScreen label="Loading admin tools..." />;
  }

  const renderProductManagementCard = (product: Product) => (
    <View key={product.id} style={[styles.productCard, !product.store_id && styles.unassignedProductCard]}>
      <Text style={styles.productTitle}>{product.name}</Text>
      <Text style={styles.productMeta}>Category: {product.category?.name || 'Uncategorized'}</Text>
      <Text style={styles.productMeta}>
        Store: {stores.find((store) => store.id === product.store_id)?.name || 'Unassigned'}
      </Text>
      {!product.store_id ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            This product is incomplete setup data until it is assigned to a store.
          </Text>
        </View>
      ) : null}
      <View style={styles.manageGrid}>
        <View style={styles.manageColumn}>
          <Text style={styles.manageLabel}>Price</Text>
          <View style={styles.manageRow}>
            <TextInput
              style={[styles.input, styles.manageInput]}
              keyboardType="decimal-pad"
              value={priceDrafts[product.id] ?? ''}
              onChangeText={(value) =>
                setPriceDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: value }))
              }
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                updatingPriceProductId === product.id && styles.disabledButton,
              ]}
              onPress={() => updatePrice(product.id)}
              disabled={updatingPriceProductId === product.id}
            >
              <Text style={styles.secondaryButtonText}>
                {updatingPriceProductId === product.id ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.manageColumn}>
          <Text style={styles.manageLabel}>Stock</Text>
          <View style={styles.manageRow}>
            <TextInput
              style={[styles.input, styles.manageInput]}
              keyboardType="number-pad"
              value={stockDrafts[product.id] ?? ''}
              onChangeText={(value) =>
                setStockDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: value }))
              }
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                updatingProductId === product.id && styles.disabledButton,
              ]}
              onPress={() => updateStock(product.id)}
              disabled={updatingProductId === product.id}
            >
              <Text style={styles.secondaryButtonText}>
                {updatingProductId === product.id ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.manageColumn}>
          <Text style={styles.manageLabel}>Image URL</Text>
          <View style={styles.manageRow}>
            <TextInput
              style={[styles.input, styles.manageInput]}
              value={imageDrafts[product.id] ?? ''}
              onChangeText={(value) =>
                setImageDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: value }))
              }
              autoCapitalize="none"
              placeholder="https://..."
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                updatingImageProductId === product.id && styles.disabledButton,
              ]}
              onPress={() => updateImage(product.id)}
              disabled={updatingImageProductId === product.id}
            >
              <Text style={styles.secondaryButtonText}>
                {updatingImageProductId === product.id ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!product.store_id ? (
          <View style={styles.manageColumn}>
            <Text style={styles.manageLabel}>Assign store</Text>
            <FlatList
              data={stores}
              horizontal
              keyExtractor={(store) => `store-${product.id}-${store.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.assignChips}
              renderItem={({ item: store }) => {
                const active = storeDrafts[product.id] === String(store.id);
                return (
                  <TouchableOpacity
                    style={[styles.assignChip, active && styles.chipActive]}
                    onPress={() =>
                      setStoreDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [product.id]: String(store.id),
                      }))
                    }
                  >
                    <Text style={[styles.assignChipText, active && styles.chipTextActive]}>
                      {store.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                updatingStoreProductId === product.id && styles.disabledButton,
              ]}
              onPress={() => assignStore(product.id)}
              disabled={updatingStoreProductId === product.id}
            >
              <Text style={styles.secondaryButtonText}>
                {updatingStoreProductId === product.id ? 'Saving...' : 'Assign Store'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {!product.category ? (
        <View style={styles.assignWrap}>
          <Text style={styles.assignLabel}>Assign category</Text>
          <FlatList
            data={categories}
            horizontal
            keyExtractor={(category) => `assign-${product.id}-${category.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.assignChips}
            renderItem={({ item: category }) => (
              <TouchableOpacity
                style={[
                  styles.assignChip,
                  updatingCategoryProductId === product.id && styles.disabledButton,
                ]}
                onPress={() => assignCategory(product.id, category.id)}
                disabled={updatingCategoryProductId === product.id}
              >
                <Text style={styles.assignChipText}>{category.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        data={focusedCategory?.products ?? []}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadCatalog();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <Text style={styles.title}>Admin Tools</Text>
            <Text style={styles.subtitle}>
              Manage stores, categories, products, stock, pricing, and team roles.
            </Text>

            <FlatList
              data={metrics}
              horizontal
              keyExtractor={(item) => item.label}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.metricsRow}
              renderItem={({ item }) => (
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{item.value}</Text>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>
              )}
            />

            <View style={styles.sectionCard}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('store')}>
                <View>
                  <Text style={styles.sectionHeaderTitle}>Create Store</Text>
                  <Text style={styles.sectionHeaderHint}>Add a new branch or pickup location.</Text>
                </View>
                <Text style={styles.sectionToggle}>{openSections.store ? 'Hide' : 'Open'}</Text>
              </TouchableOpacity>
              {openSections.store ? (
                <View style={styles.sectionBody}>
                  <TextInput
                    style={styles.input}
                    placeholder="Store name"
                    value={storeName}
                    onChangeText={setStoreName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Location"
                    value={storeLocation}
                    onChangeText={setStoreLocation}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, creatingStore && styles.disabledButton]}
                    onPress={createStore}
                    disabled={creatingStore}
                  >
                    <Text style={styles.primaryButtonText}>
                      {creatingStore ? 'Creating store...' : 'Create Store'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('category')}>
                <View>
                  <Text style={styles.sectionHeaderTitle}>Manage Categories</Text>
                  <Text style={styles.sectionHeaderHint}>Create new ones or fix spelling mistakes.</Text>
                </View>
                <Text style={styles.sectionToggle}>{openSections.category ? 'Hide' : 'Open'}</Text>
              </TouchableOpacity>
              {openSections.category ? (
                <View style={styles.sectionBody}>
                  <TextInput
                    style={styles.input}
                    placeholder="New category name"
                    value={categoryName}
                    onChangeText={setCategoryName}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, creatingCategory && styles.disabledButton]}
                    onPress={createCategory}
                    disabled={creatingCategory}
                  >
                    <Text style={styles.primaryButtonText}>
                      {creatingCategory ? 'Creating category...' : 'Add Category'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.manageListTitle}>Existing Categories</Text>
                  {categories.map((category) => (
                    <View key={category.id} style={styles.manageRow}>
                      <TextInput
                        style={[styles.input, styles.manageInput]}
                        value={categoryDrafts[category.id] ?? category.name}
                        onChangeText={(value) =>
                          setCategoryDrafts((currentDrafts) => ({ ...currentDrafts, [category.id]: value }))
                        }
                      />
                      <TouchableOpacity
                        style={[
                          styles.secondaryButton,
                          updatingCategoryNameId === category.id && styles.disabledButton,
                        ]}
                        onPress={() => renameCategory(category.id)}
                        disabled={updatingCategoryNameId === category.id}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {updatingCategoryNameId === category.id ? 'Saving...' : 'Save'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('product')}>
                <View>
                  <Text style={styles.sectionHeaderTitle}>Create Product</Text>
                  <Text style={styles.sectionHeaderHint}>Assign a store and category in one step.</Text>
                </View>
                <Text style={styles.sectionToggle}>{openSections.product ? 'Hide' : 'Open'}</Text>
              </TouchableOpacity>
              {openSections.product ? (
                <View style={styles.sectionBody}>
                  <TextInput
                    style={styles.input}
                    placeholder="Product name"
                    value={productName}
                    onChangeText={setProductName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Description"
                    value={productDescription}
                    onChangeText={setProductDescription}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Price"
                    keyboardType="decimal-pad"
                    value={productPrice}
                    onChangeText={setProductPrice}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Initial stock"
                    keyboardType="number-pad"
                    value={productStock}
                    onChangeText={setProductStock}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Image URL (optional)"
                    value={productImageUrl}
                    onChangeText={setProductImageUrl}
                    autoCapitalize="none"
                  />
                  <Text style={styles.helperLabel}>Category</Text>
                  <FlatList
                    data={categories}
                    horizontal
                    keyExtractor={(item) => item.id.toString()}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    renderItem={({ item }) => {
                      const active = selectedCategoryId === String(item.id);
                      return (
                        <TouchableOpacity
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedCategoryId(String(item.id))}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <Text style={styles.helperLabel}>Assign to store</Text>
                  <FlatList
                    data={stores.map((store) => ({ id: store.id, name: store.name }))}
                    horizontal
                    keyExtractor={(item) => item.id.toString()}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    renderItem={({ item }) => {
                      const active = selectedStoreId === String(item.id);

                      return (
                        <TouchableOpacity
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedStoreId(String(item.id))}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, creatingProduct && styles.disabledButton]}
                    onPress={createProduct}
                    disabled={creatingProduct}
                  >
                    <Text style={styles.primaryButtonText}>
                      {creatingProduct ? 'Creating product...' : 'Create Product'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.formHint}>
                    Every product must belong to a store before customers can shop it.
                  </Text>
                </View>
              ) : null}
            </View>

            {canManageRoles ? (
              <View style={styles.sectionCard}>
                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('roles')}>
                  <View>
                    <Text style={styles.sectionHeaderTitle}>Team Roles</Text>
                    <Text style={styles.sectionHeaderHint}>Review one role group at a time.</Text>
                  </View>
                  <Text style={styles.sectionToggle}>{openSections.roles ? 'Hide' : 'Open'}</Text>
                </TouchableOpacity>
                {openSections.roles ? (
                  <View style={styles.sectionBody}>
                    <FlatList
                      data={ROLE_OPTIONS}
                      horizontal
                      keyExtractor={(item) => item}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                      renderItem={({ item }) => {
                        const active = activeRoleGroup === item;
                        return (
                          <TouchableOpacity
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setActiveRoleGroup(item)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                          </TouchableOpacity>
                        );
                      }}
                    />

                    {filteredUsers.length ? (
                      filteredUsers.map((candidate) => (
                        <View key={candidate.id} style={styles.userCard}>
                          <Text style={styles.userName}>{candidate.full_name}</Text>
                          <Text style={styles.userMeta}>{candidate.email}</Text>
                          <FlatList
                            data={ROLE_OPTIONS}
                            horizontal
                            keyExtractor={(nextRole) => nextRole}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.rolePicker}
                            renderItem={({ item }) => {
                              const active = candidate.role === item;
                              return (
                                <TouchableOpacity
                                  style={[styles.roleChip, active && styles.roleChipActive]}
                                  onPress={() => updateUserRole(candidate.id, item)}
                                  disabled={updatingUserId === candidate.id}
                                >
                                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                                    {item}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }}
                          />
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyGroupText}>No users in this role yet.</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle}>Catalog by Category</Text>
              <Text style={styles.catalogMeta}>
                Start with issues first, then browse categories like a map of the catalog.
              </Text>
            </View>

            <View style={styles.attentionCard}>
              <View style={styles.attentionHeader}>
                <View>
                  <Text style={styles.attentionTitle}>Needs Attention</Text>
                  <Text style={styles.attentionSubtitle}>
                    Surface the products a new manager should probably fix first.
                  </Text>
                </View>
              </View>
              <View style={styles.attentionBadgeRow}>
                <View style={styles.attentionBadge}>
                  <Text style={styles.attentionBadgeValue}>{attentionCounts.missingStore}</Text>
                  <Text style={styles.attentionBadgeLabel}>No store</Text>
                </View>
                <View style={styles.attentionBadge}>
                  <Text style={styles.attentionBadgeValue}>{attentionCounts.uncategorized}</Text>
                  <Text style={styles.attentionBadgeLabel}>Uncategorized</Text>
                </View>
                <View style={styles.attentionBadge}>
                  <Text style={styles.attentionBadgeValue}>{attentionCounts.lowStock}</Text>
                  <Text style={styles.attentionBadgeLabel}>Low stock</Text>
                </View>
              </View>
              {needsAttentionProducts.length ? (
                <View style={styles.attentionList}>
                  {needsAttentionProducts.slice(0, 4).map(({ product, issues }) => (
                    <TouchableOpacity
                      key={`attention-${product.id}`}
                      style={styles.attentionProductRow}
                      onPress={() => setFocusedCategoryName(product.category?.name ?? 'Uncategorized')}
                    >
                      <View style={styles.attentionProductText}>
                        <Text style={styles.attentionProductTitle}>{product.name}</Text>
                        <Text style={styles.attentionProductMeta}>
                          {(product.category?.name ?? 'Uncategorized')} •{' '}
                          {stores.find((store) => store.id === product.store_id)?.name || 'Unassigned'}
                        </Text>
                      </View>
                      <View style={styles.attentionIssueWrap}>
                        {issues.map((issue) => (
                          <Text key={`${product.id}-${issue}`} style={styles.attentionIssueBadge}>
                            {issue === 'missing_store'
                              ? 'No store'
                              : issue === 'uncategorized'
                                ? 'No category'
                                : 'Low stock'}
                          </Text>
                        ))}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.attentionEmptyText}>No urgent catalog issues right now.</Text>
              )}
            </View>

            <View style={styles.categoryBrowserCard}>
              <View style={styles.categoryBrowserHeader}>
                <Text style={styles.categoryBrowserTitle}>Browse Categories</Text>
                <Text style={styles.categoryBrowserHint}>Tap a card to manage only that category.</Text>
              </View>
              <View style={styles.categoryGrid}>
                {catalogSections.map((item) => {
                  const active = focusedCategoryName === item.title;

                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.categoryGridCard, active && styles.categoryGridCardActive]}
                      onPress={() => setFocusedCategoryName(active ? null : item.title)}
                    >
                      <Text style={styles.categoryGridTitle}>{item.title}</Text>
                      <Text style={styles.categoryGridMeta}>{item.count} products</Text>
                      {item.needsAttentionCount ? (
                        <Text style={styles.categoryGridWarning}>
                          {item.needsAttentionCount} need attention
                        </Text>
                      ) : (
                        <Text style={styles.categoryGridHint}>Open workspace</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={styles.focusCard}
              onLayout={(event) => setWorkspaceOffsetY(event.nativeEvent.layout.y)}
            >
              <View style={styles.focusHeader}>
                <View>
                  <Text style={styles.focusTitle}>
                    {focusedCategory ? focusedCategory.title : 'Category Workspace'}
                  </Text>
                  <Text style={styles.focusSubtitle}>
                    {focusedCategory
                      ? `Managing ${focusedCategory.count} product${focusedCategory.count === 1 ? '' : 's'} in one focused view.`
                      : 'Choose a category card above to open a focused product workspace.'}
                  </Text>
                </View>
                {focusedCategory ? (
                  <TouchableOpacity onPress={() => setFocusedCategoryName(null)}>
                    <Text style={styles.sectionToggle}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          focusedCategory ? (
            <View style={styles.emptyContainer}>
              <Text>No products in this category yet.</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text>Select a category above to manage its products.</Text>
            </View>
          )
        }
        renderItem={({ item }) => renderProductManagementCard(item)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  listContent: {
    paddingBottom: 28,
  },
  headerContent: {
    padding: 20,
    gap: 16,
  },
  title: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
  },
  metricsRow: {
    gap: 10,
  },
  metricCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minWidth: 110,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  metricLabel: {
    marginTop: 4,
    color: '#334155',
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  sectionHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionHeaderHint: {
    marginTop: 4,
    color: '#64748B',
  },
  sectionToggle: {
    color: '#2563EB',
    fontWeight: '700',
  },
  sectionBody: {
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  helperLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
  },
  formHint: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 13,
  },
  chipRow: {
    gap: 10,
    marginBottom: 12,
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
  manageListTitle: {
    marginTop: 10,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  manageRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  manageInput: {
    flex: 1,
    marginBottom: 0,
  },
  userCard: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  userMeta: {
    marginTop: 4,
    color: '#64748B',
  },
  rolePicker: {
    gap: 8,
    marginTop: 10,
  },
  roleChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  roleChipActive: {
    backgroundColor: '#16A34A',
  },
  roleChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  emptyGroupText: {
    color: '#64748B',
    marginTop: 10,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  catalogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  catalogMeta: {
    color: '#64748B',
  },
  attentionCard: {
    backgroundColor: '#FFFDF7',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 14,
  },
  attentionHeader: {
    gap: 4,
  },
  attentionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#92400E',
  },
  attentionSubtitle: {
    color: '#A16207',
  },
  attentionBadgeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  attentionBadge: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 12,
  },
  attentionBadgeValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#92400E',
  },
  attentionBadgeLabel: {
    marginTop: 4,
    color: '#A16207',
    fontWeight: '600',
    fontSize: 12,
  },
  attentionList: {
    gap: 10,
  },
  attentionProductRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  attentionProductText: {
    gap: 4,
  },
  attentionProductTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  attentionProductMeta: {
    color: '#64748B',
  },
  attentionIssueWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attentionIssueBadge: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  attentionEmptyText: {
    color: '#A16207',
    fontWeight: '600',
  },
  categoryBrowserCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  categoryBrowserHeader: {
    gap: 4,
  },
  categoryBrowserTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  categoryBrowserHint: {
    color: '#64748B',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryGridCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 112,
  },
  categoryGridCardActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
  },
  categoryGridTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  categoryGridMeta: {
    marginTop: 8,
    color: '#475569',
    fontWeight: '600',
  },
  categoryGridWarning: {
    marginTop: 10,
    color: '#C2410C',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryGridHint: {
    marginTop: 10,
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  focusCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    padding: 18,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  focusSubtitle: {
    marginTop: 4,
    color: '#475569',
  },
  catalogDropdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 20,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE7F5',
  },
  catalogDropdownHeader: {
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FBFF',
  },
  catalogDropdownHeaderText: {
    flex: 1,
  },
  catalogEyebrow: {
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontSize: 11,
    fontWeight: '700',
  },
  catalogBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  catalogSummaryBadge: {
    backgroundColor: '#E0F2FE',
    color: '#075985',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
    fontSize: 12,
  },
  catalogWarningBadge: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
    fontSize: 12,
  },
  catalogChevronWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  catalogChevron: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
    color: '#2563EB',
  },
  catalogChevronLabel: {
    marginTop: 2,
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  catalogDropdownBody: {
    borderTopWidth: 1,
    borderTopColor: '#DCE7F5',
    backgroundColor: '#EEF4FB',
    paddingTop: 12,
    paddingBottom: 4,
  },
  categoryHeader: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  categoryHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  categoryHeaderMeta: {
    marginTop: 4,
    color: '#64748B',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  nestedProductCard: {
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  unassignedProductCard: {
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  productMeta: {
    marginTop: 6,
    color: '#475569',
  },
  manageGrid: {
    marginTop: 12,
    gap: 12,
  },
  manageColumn: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
  },
  manageLabel: {
    marginBottom: 8,
    fontWeight: '700',
    color: '#334155',
  },
  warningBanner: {
    marginTop: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningBannerText: {
    color: '#92400E',
    fontWeight: '700',
  },
  assignWrap: {
    marginTop: 12,
  },
  assignLabel: {
    marginBottom: 8,
    color: '#475569',
    fontWeight: '600',
  },
  assignChips: {
    gap: 8,
  },
  assignChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  assignChipText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
