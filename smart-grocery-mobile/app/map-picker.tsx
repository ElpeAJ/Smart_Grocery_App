import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { GOOGLE_PLACES_ENABLED } from '../src/config';
import {
  createPlacesSessionToken,
  fetchGooglePlaceDetails,
  fetchGooglePlaceSuggestions,
  type GooglePlaceSuggestion,
} from '../src/utils/googlePlaces';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const NativeMaps = Platform.OS === 'web' ? null : require('react-native-maps');
const NativeMapView = NativeMaps?.default as any;
const NativeMarker = NativeMaps?.Marker as any;

const GREATER_ACCRA_REGION: Region = {
  latitude: 5.66,
  longitude: -0.08,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

const GHANA_BOUNDS = {
  minLatitude: 4.4,
  maxLatitude: 11.3,
  minLongitude: -3.4,
  maxLongitude: 1.5,
};

function isWithinGhana(latitude: number, longitude: number) {
  return (
    latitude >= GHANA_BOUNDS.minLatitude &&
    latitude <= GHANA_BOUNDS.maxLatitude &&
    longitude >= GHANA_BOUNDS.minLongitude &&
    longitude <= GHANA_BOUNDS.maxLongitude
  );
}

function normalizeGhanaAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('ghana')) {
    return trimmed;
  }
  if (lower.includes('greater accra') || lower.includes('accra')) {
    return `${trimmed}, Ghana`;
  }
  return `${trimmed}, Greater Accra, Ghana`;
}

export default function MapPickerScreen() {
  const params = useLocalSearchParams<{
    address?: string;
    latitude?: string;
    longitude?: string;
    returnTo?: string;
  }>();
  const mapRef = useRef<any>(null);
  const regionRef = useRef<Region>(GREATER_ACCRA_REGION);
  const placesSessionTokenRef = useRef(createPlacesSessionToken());
  const initialLatitude = params.latitude ? Number(params.latitude) : null;
  const initialLongitude = params.longitude ? Number(params.longitude) : null;
  const [address, setAddress] = useState(params.address ?? '');
  const [pinCoords, setPinCoords] = useState<{ latitude: number; longitude: number } | null>(
    Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude)
      ? { latitude: initialLatitude as number, longitude: initialLongitude as number }
      : null
  );
  const [loading, setLoading] = useState(true);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false);
  const [infoText, setInfoText] = useState(
    'The map starts in Greater Accra. Search, use your current location, or tap the map to confirm the delivery point.'
  );

  const initialRegion = useMemo(() => {
    if (pinCoords) {
      return {
        latitude: pinCoords.latitude,
        longitude: pinCoords.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };
    }

    return GREATER_ACCRA_REGION;
  }, [pinCoords]);
  const [mapRegion, setMapRegion] = useState<Region>(initialRegion);

  useEffect(() => {
    setMapRegion(initialRegion);
    regionRef.current = initialRegion;
  }, [initialRegion]);

  useEffect(() => {
    const loadInitialPin = async () => {
      try {
        if (pinCoords) {
          setLoading(false);
          return;
        }

        if (address.trim()) {
          try {
            const geocoded = await Location.geocodeAsync(normalizeGhanaAddress(address));
            const ghanaResult = geocoded.find((item) => isWithinGhana(item.latitude, item.longitude));
            if (ghanaResult) {
              setPinCoords({
                latitude: ghanaResult.latitude,
                longitude: ghanaResult.longitude,
              });
              setInfoText('We placed the pin from the typed Ghana address. Adjust it if needed.');
            } else if (geocoded.length > 0) {
              setInfoText(
                'That address search returned a place outside Ghana, so we ignored it. Please refine the address or tap the correct point manually.'
              );
            }
          } catch {
            // Keep map usable even if geocode fails.
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadInitialPin();
  }, [address, pinCoords]);

  useEffect(() => {
    if (!mapRef.current || !pinCoords) {
      return;
    }

    const nextRegion = {
      latitude: pinCoords.latitude,
      longitude: pinCoords.longitude,
      latitudeDelta: Math.min(regionRef.current.latitudeDelta, 0.02),
      longitudeDelta: Math.min(regionRef.current.longitudeDelta, 0.02),
    };
    setMapRegion(nextRegion);
    regionRef.current = nextRegion;
    mapRef.current.animateToRegion(nextRegion, 300);
  }, [pinCoords]);

  useEffect(() => {
    if (!GOOGLE_PLACES_ENABLED || address.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);

    const timeoutId = setTimeout(async () => {
      try {
        const nextSuggestions = await fetchGooglePlaceSuggestions(
          address.trim(),
          placesSessionTokenRef.current
        );
        if (!cancelled) {
          setSuggestions(nextSuggestions);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [address]);

  const adjustZoom = (direction: 'in' | 'out') => {
    const multiplier = direction === 'in' ? 0.5 : 2;
    const nextRegion = {
      ...regionRef.current,
      latitudeDelta: Math.min(Math.max(regionRef.current.latitudeDelta * multiplier, 0.0025), 0.5),
      longitudeDelta: Math.min(Math.max(regionRef.current.longitudeDelta * multiplier, 0.0025), 0.5),
    };
    setMapRegion(nextRegion);
    regionRef.current = nextRegion;
    mapRef.current?.animateToRegion(nextRegion, 200);
  };

  const updateFromAddress = async () => {
    if (!address.trim()) {
      Alert.alert('Add an address', 'Enter an address first before searching for it on the map.');
      return;
    }

    try {
      setSearchingAddress(true);
      const geocoded = await Location.geocodeAsync(normalizeGhanaAddress(address));
      const ghanaResult = geocoded.find((item) => isWithinGhana(item.latitude, item.longitude));
      if (!ghanaResult) {
        if (geocoded[0]) {
          Alert.alert(
            'Outside Ghana result ignored',
            'That search resolved to a place outside Ghana, so we did not use it. Try a more specific Accra-area address or tap the map manually.'
          );
        } else {
          Alert.alert(
            'Address not found',
            'We could not place that Ghana address on the map. Try adjusting the text or tap manually.'
          );
        }
        return;
      }

      setPinCoords({
        latitude: ghanaResult.latitude,
        longitude: ghanaResult.longitude,
      });
      setInfoText('Address located in Ghana. You can still tap the map to fine-tune the delivery point.');
    } catch {
      Alert.alert('Could not search address', 'Please try again.');
    } finally {
      setSearchingAddress(false);
    }
  };

  const useCurrentLocation = async () => {
    try {
      setUsingCurrentLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access so we can place the pin from your current position.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = currentPosition.coords;
      if (!isWithinGhana(latitude, longitude)) {
        Alert.alert(
          'Current location appears outside Ghana',
          'We did not use that location because it appears to be outside Ghana. For this app, please tap the correct point on the map or search a Ghana address.'
        );
        setInfoText(
          'Current device location appears outside Ghana, so the map stayed centered in Greater Accra.'
        );
        return;
      }

      setPinCoords({ latitude, longitude });
      setInfoText('We placed the pin from your current Ghana location. Adjust it if the delivery point is slightly different.');
    } catch {
      Alert.alert('Could not get current location', 'Please try again.');
    } finally {
      setUsingCurrentLocation(false);
    }
  };

  const applyGoogleSuggestion = async (suggestion: GooglePlaceSuggestion) => {
    try {
      setLoadingSuggestions(true);
      const details = await fetchGooglePlaceDetails(
        suggestion.placeId,
        placesSessionTokenRef.current
      );
      if (!details || !isWithinGhana(details.latitude, details.longitude)) {
        Alert.alert(
          'Could not use suggestion',
          'That address suggestion did not return a usable Ghana map point. Please try another suggestion or the fallback search button.'
        );
        return;
      }

      setAddress(details.formattedAddress || suggestion.fullText || suggestion.primaryText);
      setPinCoords({
        latitude: details.latitude,
        longitude: details.longitude,
      });
      setSuggestions([]);
      setInfoText('Google address suggestion applied. You can still tap the map to fine-tune the delivery point.');
      placesSessionTokenRef.current = createPlacesSessionToken();
    } catch {
      Alert.alert('Could not load place details', 'Please try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleMapPress = (event: any) => {
    setPinCoords(event.nativeEvent.coordinate);
    setInfoText('Delivery point updated from the map pin.');
  };

  const confirmLocation = () => {
    if (!pinCoords) {
      Alert.alert('Pick a location', 'Tap the map to choose the delivery point first.');
      return;
    }

    const returnTo = params.returnTo === 'profile' ? '/(tabs)/profile' : '/checkout';
    router.replace({
      pathname: returnTo,
      params: {
        pickedAddress: address,
        pickedLatitude: String(pinCoords.latitude),
        pickedLongitude: String(pinCoords.longitude),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pick Delivery Location</Text>
        <Text style={styles.subtitle}>Confirm the exact map point you want the driver to use.</Text>
      </View>

      <View style={styles.controlsCard}>
        <Text style={styles.label}>Delivery address</Text>
        <TextInput
          style={[styles.input, styles.addressInput]}
          value={address}
          onChangeText={(value) => {
            setAddress(value);
          }}
          placeholder="House number, street, area, city"
          multiline
        />
        {GOOGLE_PLACES_ENABLED && suggestions.length > 0 ? (
          <View style={styles.suggestionsCard}>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.placeId}
                style={styles.suggestionRow}
                onPress={() => applyGoogleSuggestion(suggestion)}
              >
                <Text style={styles.suggestionPrimary}>{suggestion.primaryText}</Text>
                {suggestion.secondaryText ? (
                  <Text style={styles.suggestionSecondary}>{suggestion.secondaryText}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {GOOGLE_PLACES_ENABLED && loadingSuggestions ? (
          <Text style={styles.helperText}>Loading Ghana address suggestions...</Text>
        ) : null}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, searchingAddress && styles.disabledButton]}
            onPress={updateFromAddress}
            disabled={searchingAddress}
          >
            <Text style={styles.secondaryButtonText}>
              {searchingAddress ? 'Searching...' : 'Find this address on map'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, usingCurrentLocation && styles.disabledButton]}
            onPress={useCurrentLocation}
            disabled={usingCurrentLocation}
          >
            <Text style={styles.secondaryButtonText}>
              {usingCurrentLocation ? 'Locating...' : 'Use my current location'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>{infoText}</Text>
      </View>

      <View style={styles.mapWrap}>
        {NativeMapView ? (
          <>
            <NativeMapView
              ref={(instance: any) => {
                mapRef.current = instance;
              }}
              style={styles.map}
              initialRegion={initialRegion}
              region={mapRegion}
              onPress={handleMapPress}
              onRegionChangeComplete={(region: Region) => {
                setMapRegion(region);
                regionRef.current = region;
              }}
              zoomEnabled
              zoomTapEnabled
              scrollEnabled
              rotateEnabled
              pitchEnabled
            >
              {pinCoords ? (
                <NativeMarker
                  coordinate={pinCoords}
                  draggable
                  onDragEnd={(event: any) => setPinCoords(event.nativeEvent.coordinate)}
                  title="Delivery point"
                  description="This is where the driver will head."
                />
              ) : null}
            </NativeMapView>
            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton} onPress={() => adjustZoom('in')}>
                <Text style={styles.zoomButtonText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={() => adjustZoom('out')}>
                <Text style={styles.zoomButtonText}>-</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.webMapFallback}>
            <Text style={styles.webMapFallbackTitle}>Map preview is available on mobile only</Text>
            <Text style={styles.webMapFallbackText}>
              The web build still supports address search and location confirmation, but the interactive
              React Native map is hidden on desktop so the manager web app can load cleanly.
            </Text>
            <Text style={styles.webMapFallbackText}>
              Use the search tools above, or open this screen in the mobile app for pin-drop map editing.
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={confirmLocation} disabled={loading}>
        <Text style={styles.primaryButtonText}>Use This Delivery Point</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    gap: 8,
  },
  backText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#64748B',
    lineHeight: 20,
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    gap: 10,
    shadowColor: '#A68E65',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
  },
  addressInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  secondaryButton: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  helperText: {
    color: '#64748B',
    lineHeight: 19,
  },
  suggestionsCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  suggestionPrimary: {
    color: '#0F172A',
    fontWeight: '700',
  },
  suggestionSecondary: {
    color: '#64748B',
    marginTop: 4,
    fontSize: 12,
  },
  mapWrap: {
    flex: 1,
    minHeight: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#DCEBDF',
    shadowColor: '#A68E65',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  map: {
    flex: 1,
  },
  webMapFallback: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
    gap: 10,
  },
  webMapFallbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  webMapFallbackText: {
    color: '#475569',
    lineHeight: 21,
  },
  zoomControls: {
    position: 'absolute',
    right: 14,
    top: 14,
    gap: 10,
  },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  zoomButtonText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
