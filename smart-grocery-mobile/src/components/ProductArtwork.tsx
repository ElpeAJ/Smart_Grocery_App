import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { getProductTheme, type ProductArtworkKind } from '../utils/catalog';

type ProductArtworkProps = {
  imageUrl?: string | null;
  categoryName?: string | null;
  productName: string;
  variant?: 'card' | 'hero' | 'mini' | 'list';
};

const LOCAL_PRODUCT_IMAGE_RULES: { keywords: string[]; asset: number }[] = [
  {
    keywords: ['ginger drink'],
    asset: require('../../assets/products/ghana/ginger-drink-can.png'),
  },
  {
    keywords: ['sobolo', 'zobo ginger blend'],
    asset: require('../../assets/products/ghana/sobolo-bottle.png'),
  },
  {
    keywords: ['ginger tea'],
    asset: require('../../assets/products/ghana/ginger-tea-box.png'),
  },
  {
    keywords: ['gari'],
    asset: require('../../assets/products/ghana/gari-bag.png'),
  },
  {
    keywords: ['plantain bunch'],
    asset: require('../../assets/products/ghana/plantain-bunch.png'),
  },
  {
    keywords: ['yam tubers pack', 'yam'],
    asset: require('../../assets/products/ghana/yam-tubers.png'),
  },
  {
    keywords: ['cassava bag', 'cassava'],
    asset: require('../../assets/products/ghana/cassava-roots.png'),
  },
  {
    keywords: ['kontomire bunch', 'kontomire'],
    asset: require('../../assets/products/ghana/kontomire-bunch.png'),
  },
  {
    keywords: ['palm oil'],
    asset: require('../../assets/products/ghana/palm-oil-bottle.png'),
  },
  {
    keywords: ['plantain chips pack'],
    asset: require('../../assets/products/ghana/plantain-chips-pack.png'),
  },
  {
    keywords: ['tomato paste tin', 'chopped tomatoes tin', 'tomato mix sachet'],
    asset: require('../../assets/products/ghana/tomato-paste-tin.png'),
  },
  {
    keywords: ['sachet water bag'],
    asset: require('../../assets/products/ghana/sachet-water-bag.png'),
  },
  {
    keywords: ['milo refill 500g', 'milo cereal duo'],
    asset: require('../../assets/products/ghana/cocoa-malt-refill.png'),
  },
  {
    keywords: ['sardines tin', 'tinned sardines', 'tuna chunks tin', 'tuna in oil tin', 'tinned mackerel'],
    asset: require('../../assets/products/ghana/sardines-tin.png'),
  },
];

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesWholeKeyword(name: string, keyword: string) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeForRegex(keyword)}([^a-z0-9]|$)`, 'i');
  return pattern.test(name);
}

function getLocalProductImage(productName: string) {
  const lowerName = productName.toLowerCase();
  return (
    LOCAL_PRODUCT_IMAGE_RULES.find((rule) =>
      rule.keywords.some((keyword) => matchesWholeKeyword(lowerName, keyword))
    )?.asset ?? null
  );
}

export default function ProductArtwork({
  imageUrl,
  categoryName,
  productName,
  variant = 'card',
}: ProductArtworkProps) {
  const theme = getProductTheme(categoryName, productName);
  const localAsset = getLocalProductImage(productName);
  const isHero = variant === 'hero';
  const isMini = variant === 'mini';
  const isList = variant === 'list';
  const sizeStyle =
    isHero
      ? styles.heroFrame
      : isMini
        ? styles.miniFrame
        : isList
          ? styles.listFrame
          : styles.cardFrame;

  if (imageUrl || localAsset) {
    return (
      <View style={[styles.frame, sizeStyle, { backgroundColor: theme.backgroundColor }]}>
        <Image
          source={imageUrl ? { uri: imageUrl } : localAsset}
          style={styles.image}
          contentFit={imageUrl ? 'cover' : 'contain'}
          transition={150}
        />
      </View>
    );
  }

  return (
    <View style={[styles.frame, sizeStyle, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.washTop, { backgroundColor: theme.secondaryColor }]} />
      <View style={[styles.glowLarge, { backgroundColor: theme.secondaryColor }]} />
      <View style={[styles.glowMedium, { backgroundColor: theme.accentColor }]} />
      <View style={[styles.glowSmall, { backgroundColor: theme.accentColor }]} />
      {theme.artworkKind === 'emoji' ? (
        <Text
          style={[
            styles.visualWatermark,
            isHero
              ? styles.visualWatermarkHero
              : isMini
                ? styles.visualWatermarkMini
                : isList
                  ? styles.visualWatermarkList
                : undefined,
            { color: `${theme.accentColor}22` },
          ]}
        >
          {theme.emoji}
        </Text>
      ) : null}
      <View
        style={[
          styles.stageShadow,
          isHero
            ? styles.stageShadowHero
            : isMini
              ? styles.stageShadowMini
              : isList
                ? styles.stageShadowList
                : styles.stageShadowCard,
          { backgroundColor: `${theme.accentColor}20` },
        ]}
      />
      {renderArtwork(theme.artworkKind, theme.emoji, theme.accentColor, isHero, isMini, isList)}
      <View style={styles.bottomAccentRow}>
        <View style={[styles.bottomAccent, { backgroundColor: `${theme.accentColor}26` }]} />
        <View style={[styles.bottomAccentShort, { backgroundColor: `${theme.accentColor}40` }]} />
      </View>
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
  listFrame: {
    width: '100%',
    height: 128,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  washTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '54%',
    opacity: 0.2,
  },
  glowLarge: {
    position: 'absolute',
    right: -28,
    top: -14,
    width: 132,
    height: 132,
    borderRadius: 66,
    opacity: 0.42,
  },
  glowMedium: {
    position: 'absolute',
    left: -26,
    bottom: 42,
    width: 98,
    height: 98,
    borderRadius: 49,
    opacity: 0.24,
  },
  glowSmall: {
    position: 'absolute',
    right: 18,
    bottom: 30,
    width: 42,
    height: 42,
    borderRadius: 21,
    opacity: 0.16,
  },
  visualWatermark: {
    position: 'absolute',
    right: -6,
    top: -6,
    fontSize: 86,
    lineHeight: 96,
    transform: [{ rotate: '-10deg' }],
  },
  visualWatermarkHero: {
    fontSize: 136,
    lineHeight: 152,
  },
  visualWatermarkMini: {
    fontSize: 72,
    lineHeight: 80,
  },
  visualWatermarkList: {
    fontSize: 92,
    lineHeight: 104,
    right: 8,
    top: -10,
  },
  stageShadow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.18,
  },
  stageShadowCard: {
    bottom: 28,
    width: 44,
    height: 14,
    alignSelf: 'center',
  },
  stageShadowHero: {
    bottom: 34,
    width: 88,
    height: 22,
    alignSelf: 'center',
  },
  stageShadowMini: {
    bottom: 20,
    width: 40,
    height: 12,
    alignSelf: 'center',
  },
  stageShadowList: {
    bottom: 22,
    width: 44,
    height: 14,
    alignSelf: 'center',
  },
  visualEmoji: {
    position: 'absolute',
    fontSize: 68,
    lineHeight: 78,
  },
  visualEmojiHero: {
    fontSize: 122,
    lineHeight: 136,
  },
  visualEmojiMini: {
    fontSize: 72,
    lineHeight: 82,
  },
  visualEmojiList: {
    fontSize: 64,
    lineHeight: 74,
  },
  visualEmojiCardPosition: {
    alignSelf: 'center',
    bottom: 38,
  },
  visualEmojiHeroPosition: {
    alignSelf: 'center',
    bottom: 48,
  },
  visualEmojiMiniPosition: {
    alignSelf: 'center',
    bottom: 28,
  },
  visualEmojiListPosition: {
    alignSelf: 'center',
    bottom: 28,
  },
  packageBase: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  packageCard: {
    width: 72,
    height: 86,
  },
  packageMini: {
    width: 66,
    height: 78,
  },
  packageList: {
    width: 76,
    height: 82,
  },
  packageHero: {
    width: 108,
    height: 126,
  },
  canBody: {
    width: '70%',
    height: '86%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  canRimTop: {
    width: '88%',
    height: 5,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    opacity: 0.95,
  },
  canRimBottom: {
    width: '88%',
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D9E2EC',
    opacity: 0.75,
  },
  canLabel: {
    width: '62%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#FFF8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canLabelDot: {
    width: '42%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  bottleCap: {
    width: 16,
    height: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#D97706',
    marginBottom: 2,
  },
  bottleNeck: {
    width: 20,
    height: 16,
    borderRadius: 8,
    opacity: 0.92,
  },
  bottleBody: {
    width: '66%',
    height: '72%',
    borderRadius: 22,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  bottleLabel: {
    width: '54%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: '#FFF8EC',
    opacity: 0.92,
  },
  cartonBody: {
    width: '72%',
    height: '84%',
    borderRadius: 14,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cartonTopFold: {
    position: 'absolute',
    top: -6,
    right: 8,
    width: 20,
    height: 16,
    backgroundColor: '#FFF8EC',
    opacity: 0.88,
    transform: [{ skewY: '-18deg' }],
  },
  cartonLabel: {
    width: '58%',
    height: '34%',
    borderRadius: 10,
    backgroundColor: '#FFF8EC',
    opacity: 0.9,
  },
  boxBody: {
    width: '72%',
    height: '64%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  boxLabel: {
    width: '62%',
    height: '26%',
    borderRadius: 8,
    backgroundColor: '#FFF8EC',
    opacity: 0.9,
  },
  sachetBody: {
    width: '70%',
    height: '84%',
    borderRadius: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: 'hidden',
  },
  sachetHighlight: {
    position: 'absolute',
    left: '18%',
    top: '14%',
    width: '24%',
    height: '58%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF75',
  },
  bottomAccentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomAccent: {
    width: 40,
    height: 6,
    borderRadius: 999,
  },
  bottomAccentShort: {
    width: 18,
    height: 6,
    borderRadius: 999,
  },
});

function renderArtwork(
  artworkKind: ProductArtworkKind,
  emoji: string,
  accentColor: string,
  isHero: boolean,
  isMini: boolean,
  isList: boolean
) {
  const positionStyle = isHero
    ? styles.visualEmojiHeroPosition
    : isMini
      ? styles.visualEmojiMiniPosition
      : isList
        ? styles.visualEmojiListPosition
        : styles.visualEmojiCardPosition;

  if (artworkKind === 'emoji') {
    return (
      <Text
        style={[
          styles.visualEmoji,
          isHero ? styles.visualEmojiHero : isMini ? styles.visualEmojiMini : isList ? styles.visualEmojiList : undefined,
          positionStyle,
        ]}
      >
        {emoji}
      </Text>
    );
  }

  const packageSize = isHero ? styles.packageHero : isMini ? styles.packageMini : isList ? styles.packageList : styles.packageCard;

  if (artworkKind === 'can') {
    return (
      <View style={[styles.packageBase, packageSize, positionStyle]}>
        <View style={[styles.canBody, { backgroundColor: accentColor }]}>
          <View style={styles.canRimTop} />
          <View style={styles.canLabel}>
            <View style={styles.canLabelDot} />
          </View>
          <View style={styles.canRimBottom} />
        </View>
      </View>
    );
  }

  if (artworkKind === 'bottle') {
    return (
      <View style={[styles.packageBase, packageSize, positionStyle]}>
        <View style={styles.bottleCap} />
        <View style={[styles.bottleNeck, { backgroundColor: accentColor }]} />
        <View style={[styles.bottleBody, { backgroundColor: accentColor }]}>
          <View style={styles.bottleLabel} />
        </View>
      </View>
    );
  }

  if (artworkKind === 'carton') {
    return (
      <View style={[styles.packageBase, packageSize, positionStyle]}>
        <View style={[styles.cartonBody, { backgroundColor: accentColor }]}>
          <View style={styles.cartonTopFold} />
          <View style={styles.cartonLabel} />
        </View>
      </View>
    );
  }

  if (artworkKind === 'box') {
    return (
      <View style={[styles.packageBase, packageSize, positionStyle]}>
        <View style={[styles.boxBody, { backgroundColor: accentColor }]}>
          <View style={styles.boxLabel} />
        </View>
      </View>
    );
  }

  if (artworkKind === 'sachet') {
    return (
      <View style={[styles.packageBase, packageSize, positionStyle]}>
        <View style={[styles.sachetBody, { backgroundColor: accentColor }]}>
          <View style={styles.sachetHighlight} />
        </View>
      </View>
    );
  }

  return null;
}
