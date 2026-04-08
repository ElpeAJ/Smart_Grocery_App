import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { getProductTheme } from '../utils/catalog';

type ProductArtworkProps = {
  imageUrl?: string | null;
  categoryName?: string | null;
  productName: string;
  variant?: 'card' | 'hero' | 'mini';
};

export default function ProductArtwork({
  imageUrl,
  categoryName,
  productName,
  variant = 'card',
}: ProductArtworkProps) {
  const theme = getProductTheme(categoryName, productName);
  const sizeStyle =
    variant === 'hero'
      ? styles.heroFrame
      : variant === 'mini'
        ? styles.miniFrame
        : styles.cardFrame;

  if (imageUrl) {
    return (
      <View style={[styles.frame, sizeStyle, { backgroundColor: theme.backgroundColor }]}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      </View>
    );
  }

  return (
    <View style={[styles.frame, sizeStyle, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.badge, { backgroundColor: theme.accentColor }]}>
        <Text style={styles.badgeText}>{theme.emoji}</Text>
      </View>
      <Text style={[styles.placeholderTitle, { color: theme.textColor }]} numberOfLines={2}>
        {productName}
      </Text>
      <Text style={[styles.placeholderCategory, { color: theme.accentColor }]} numberOfLines={1}>
        {categoryName || 'Groceries'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 22,
    justifyContent: 'flex-end',
    padding: 14,
  },
  cardFrame: {
    width: '100%',
    height: 156,
  },
  heroFrame: {
    width: '100%',
    height: 250,
  },
  miniFrame: {
    width: 148,
    height: 132,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  placeholderCategory: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
  },
});
