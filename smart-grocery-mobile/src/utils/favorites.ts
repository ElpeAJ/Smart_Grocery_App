import AsyncStorage from '@react-native-async-storage/async-storage';

function getFavoritesStorageKey(userId?: number | null) {
  return userId ? `favorite_products:${userId}` : 'favorite_products:guest';
}

export async function loadFavoriteProductIds(userId?: number | null) {
  try {
    const storedValue = await AsyncStorage.getItem(getFavoritesStorageKey(userId));
    return storedValue ? (JSON.parse(storedValue) as number[]) : [];
  } catch {
    return [];
  }
}

export async function saveFavoriteProductIds(favoriteIds: number[], userId?: number | null) {
  await AsyncStorage.setItem(getFavoritesStorageKey(userId), JSON.stringify(favoriteIds));
}
