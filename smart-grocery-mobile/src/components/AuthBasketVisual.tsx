import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AuthBasketVisual() {
  const emptyOpacity = useRef(new Animated.Value(1)).current;
  const fullOpacity = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(emptyOpacity, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(fullOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(900),
        Animated.parallel([
          Animated.timing(emptyOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(fullOpacity, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(1200),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -3,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );

    fadeLoop.start();
    floatLoop.start();

    return () => {
      fadeLoop.stop();
      floatLoop.stop();
    };
  }, [emptyOpacity, floatY, fullOpacity]);

  return (
    <View style={styles.wrap}>
      <View style={styles.glow} />
      <Animated.View style={[styles.basketShell, { transform: [{ translateY: floatY }] }]}>
        <Animated.View style={[styles.basketLayer, { opacity: emptyOpacity }]}>
          <Ionicons name="basket-outline" size={34} color="#14532D" />
        </Animated.View>
        <Animated.View style={[styles.basketLayer, styles.fullBasketLayer, { opacity: fullOpacity }]}>
          <View style={styles.groceryGroup}>
            <View style={[styles.groceryDot, styles.orangeDot]} />
            <View style={[styles.groceryDot, styles.greenDot]} />
            <View style={[styles.groceryDot, styles.redDot]} />
            <View style={[styles.groceryLeaf, styles.leftLeaf]} />
            <View style={[styles.groceryLeaf, styles.rightLeaf]} />
          </View>
          <Ionicons name="basket" size={34} color="#14532D" />
        </Animated.View>
      </Animated.View>
      <View style={styles.fruitChip}>
        <Ionicons name="leaf-outline" size={16} color="#FFFFFF" />
      </View>
      <View style={styles.sparkChip}>
        <Ionicons name="sparkles-outline" size={14} color="#14532D" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-end',
    width: 84,
    height: 84,
    marginBottom: 8,
  },
  glow: {
    position: 'absolute',
    inset: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  basketShell: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basketLayer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBasketLayer: {
    overflow: 'visible',
  },
  groceryGroup: {
    position: 'absolute',
    top: 9,
    width: 34,
    height: 18,
  },
  groceryDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  orangeDot: {
    left: 2,
    top: 2,
    backgroundColor: '#F59E0B',
  },
  greenDot: {
    left: 13,
    top: 0,
    backgroundColor: '#16A34A',
  },
  redDot: {
    right: 1,
    top: 3,
    backgroundColor: '#EF4444',
  },
  groceryLeaf: {
    position: 'absolute',
    width: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#15803D',
    top: -1,
  },
  leftLeaf: {
    left: 3,
    transform: [{ rotate: '-30deg' }],
  },
  rightLeaf: {
    right: 2,
    transform: [{ rotate: '30deg' }],
  },
  fruitChip: {
    position: 'absolute',
    left: 2,
    top: 18,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkChip: {
    position: 'absolute',
    right: 0,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
