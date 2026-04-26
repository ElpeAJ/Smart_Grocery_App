import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';

import api from '../../../src/api/client';
import LoadingScreen from '../../../src/components/LoadingScreen';
import { GOOGLE_PLACES_ENABLED } from '../../../src/config';
import { useAuth } from '../../../src/context/AuthContext';
import type { Delivery } from '../../../src/types/api';
import {
  createPlacesSessionToken,
  fetchGooglePlaceDetails,
  fetchGooglePlaceSuggestions,
  type GooglePlaceSuggestion,
} from '../../../src/utils/googlePlaces';
import { fetchGoogleRoute } from '../../../src/utils/googleRoutes';
import { canHandleDeliveries, getHomeRouteForRole } from '../../../src/utils/roles';

const ACCRA_REGION = {
  latitude: 5.6037,
  longitude: -0.187,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const GHANA_BOUNDS = {
  minLatitude: 4.4,
  maxLatitude: 11.3,
  minLongitude: -3.4,
  maxLongitude: 1.5,
};

const ASSUMED_CITY_SPEED_KMH = 24;
const RESERVED_START_LABELS = ['Current driver location', 'Greater Accra start point'];

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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEta(minutes: number) {
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
}

function formatCoordinatePair(coords: { latitude: number; longitude: number }) {
  return `${coords.latitude},${coords.longitude}`;
}

export default function DeliveryMapScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const numericDeliveryId = Number(deliveryId);
  const { user } = useAuth();
  const role = user?.role;
  const mapRef = useRef<MapView | null>(null);
  const startSessionTokenRef = useRef(createPlacesSessionToken());
  const destinationSessionTokenRef = useRef(createPlacesSessionToken());
  const [loading, setLoading] = useState(true);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [startLabel, setStartLabel] = useState('');
  const [destinationLabel, setDestinationLabel] = useState('');
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const [loadingStartSuggestions, setLoadingStartSuggestions] = useState(false);
  const [loadingDestinationSuggestions, setLoadingDestinationSuggestions] = useState(false);
  const [startSuggestions, setStartSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [refreshingCurrentLocation, setRefreshingCurrentLocation] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);
  const [isEditingStart, setIsEditingStart] = useState(false);
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [googleRoutePolyline, setGoogleRoutePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [googleRouteDistanceKm, setGoogleRouteDistanceKm] = useState<number | null>(null);
  const [googleRouteEtaMinutes, setGoogleRouteEtaMinutes] = useState<number | null>(null);

  const loadDeliveryMap = useCallback(async () => {
    if (!Number.isFinite(numericDeliveryId)) {
      setLoading(false);
      return;
    }

    try {
      const deliveryResponse = await api.get<Delivery>(`/deliveries/${numericDeliveryId}`);
      const selectedDelivery = deliveryResponse.data ?? null;

      if (!selectedDelivery) {
        throw new Error('Delivery not found');
      }

      setDelivery(selectedDelivery);
      setDestinationLabel(selectedDelivery.delivery_address);
      setStartLabel(selectedDelivery.driver_name ? 'Driver location' : 'Current driver location');

      if (
        typeof selectedDelivery.driver_latitude === 'number' &&
        typeof selectedDelivery.driver_longitude === 'number' &&
        isWithinGhana(selectedDelivery.driver_latitude, selectedDelivery.driver_longitude)
      ) {
        setDriverCoords({
          latitude: selectedDelivery.driver_latitude,
          longitude: selectedDelivery.driver_longitude,
        });
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted' && role === 'driver') {
        setLocationMessage(
          'Location permission was not granted, so the route starts from Greater Accra until a Ghana start point is chosen.'
        );
        setStartLabel('Greater Accra start point');
      } else if (role === 'driver') {
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (isWithinGhana(currentPosition.coords.latitude, currentPosition.coords.longitude)) {
          setDriverCoords({
            latitude: currentPosition.coords.latitude,
            longitude: currentPosition.coords.longitude,
          });
          setStartLabel('Current driver location');
        } else {
          setDriverCoords({
            latitude: ACCRA_REGION.latitude,
            longitude: ACCRA_REGION.longitude,
          });
          setStartLabel('Greater Accra start point');
          setLocationMessage(
            'Current device location appears outside Ghana, so the route now starts from Greater Accra until you choose a Ghana start point.'
          );
        }
      } else if (!selectedDelivery.driver_latitude || !selectedDelivery.driver_longitude) {
        setStartLabel(selectedDelivery.driver_name ? `${selectedDelivery.driver_name} location unavailable` : 'Driver location unavailable');
      }

      if (
        typeof selectedDelivery.delivery_latitude === 'number' &&
        typeof selectedDelivery.delivery_longitude === 'number' &&
        isWithinGhana(selectedDelivery.delivery_latitude, selectedDelivery.delivery_longitude)
      ) {
        setDestinationCoords({
          latitude: selectedDelivery.delivery_latitude,
          longitude: selectedDelivery.delivery_longitude,
        });
      } else {
        try {
          const geocoded = await Location.geocodeAsync(normalizeGhanaAddress(selectedDelivery.delivery_address));
          const ghanaResult = geocoded.find((item) => isWithinGhana(item.latitude, item.longitude));
          if (ghanaResult) {
            setDestinationCoords({
              latitude: ghanaResult.latitude,
              longitude: ghanaResult.longitude,
            });
          } else {
            setLocationMessage(
              'We could not place the customer address inside Ghana yet, so the route stays centered in Greater Accra until you correct the destination.'
            );
          }
        } catch {
          setLocationMessage(
            'We could not place the customer address inside Ghana yet, so the route stays centered in Greater Accra until you correct the destination.'
          );
        }
      }
    } catch (error: any) {
      Alert.alert(
        'Could not load delivery map',
        error.response?.data?.detail || error.message || 'Please try again.'
      );
      router.back();
    } finally {
      setLoading(false);
    }
  }, [numericDeliveryId, role]);

  useFocusEffect(
    useCallback(() => {
      loadDeliveryMap();
    }, [loadDeliveryMap])
  );

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      if (role !== 'driver' || !delivery || delivery.driver_id !== user?.id || delivery.status !== 'on_the_way') {
        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 20,
        },
        (position) => {
          if (isWithinGhana(position.coords.latitude, position.coords.longitude)) {
            const nextCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setDriverCoords(nextCoords);
            setStartLabel('Current driver location');
            api.put(`/deliveries/${numericDeliveryId}/location`, {
              driver_latitude: nextCoords.latitude,
              driver_longitude: nextCoords.longitude,
            }).catch(() => {
              // Keep live tracking resilient if a background location ping fails.
            });
          }
        }
      );
    };

    startWatching();

    return () => {
      subscription?.remove();
    };
  }, [delivery, numericDeliveryId, role, user?.id]);

  useEffect(() => {
    if (
      role !== 'driver' ||
      !delivery ||
      delivery.driver_id !== user?.id ||
      delivery.status !== 'on_the_way' ||
      !driverCoords ||
      !isWithinGhana(driverCoords.latitude, driverCoords.longitude)
    ) {
      return;
    }

    api.put(`/deliveries/${numericDeliveryId}/location`, {
      driver_latitude: driverCoords.latitude,
      driver_longitude: driverCoords.longitude,
    }).catch(() => {
      // Keep the map usable even if a foreground location sync fails.
    });
  }, [delivery, driverCoords, numericDeliveryId, role, user?.id]);

  useEffect(() => {
    if (!delivery || role === 'driver') {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const deliveryResponse = await api.get<Delivery>(`/deliveries/${numericDeliveryId}`);
        const nextDelivery = deliveryResponse.data;
        setDelivery(nextDelivery);
        if (
          typeof nextDelivery.driver_latitude === 'number' &&
          typeof nextDelivery.driver_longitude === 'number' &&
          isWithinGhana(nextDelivery.driver_latitude, nextDelivery.driver_longitude)
        ) {
          setDriverCoords({
            latitude: nextDelivery.driver_latitude,
            longitude: nextDelivery.driver_longitude,
          });
          setStartLabel(nextDelivery.driver_name ? 'Driver location' : 'Current driver location');
        }
      } catch {
        // Keep the current view usable even if a polling request fails.
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [delivery, numericDeliveryId, role]);

  useEffect(() => {
    if (
      !GOOGLE_PLACES_ENABLED ||
      !startLabel.trim() ||
      RESERVED_START_LABELS.includes(startLabel) ||
      startLabel.trim().length < 3
    ) {
      setStartSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingStartSuggestions(true);

    const timeoutId = setTimeout(async () => {
      try {
        const nextSuggestions = await fetchGooglePlaceSuggestions(
          startLabel.trim(),
          startSessionTokenRef.current
        );
        if (!cancelled) {
          setStartSuggestions(nextSuggestions);
        }
      } catch {
        if (!cancelled) {
          setStartSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingStartSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [startLabel]);

  useEffect(() => {
    if (!GOOGLE_PLACES_ENABLED || destinationLabel.trim().length < 3) {
      setDestinationSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingDestinationSuggestions(true);

    const timeoutId = setTimeout(async () => {
      try {
        const nextSuggestions = await fetchGooglePlaceSuggestions(
          destinationLabel.trim(),
          destinationSessionTokenRef.current
        );
        if (!cancelled) {
          setDestinationSuggestions(nextSuggestions);
        }
      } catch {
        if (!cancelled) {
          setDestinationSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingDestinationSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [destinationLabel]);

  const initialRegion = useMemo(() => {
    if (driverCoords && destinationCoords) {
      return {
        latitude: (driverCoords.latitude + destinationCoords.latitude) / 2,
        longitude: (driverCoords.longitude + destinationCoords.longitude) / 2,
        latitudeDelta: Math.max(Math.abs(driverCoords.latitude - destinationCoords.latitude) * 1.8, 0.04),
        longitudeDelta: Math.max(Math.abs(driverCoords.longitude - destinationCoords.longitude) * 1.8, 0.04),
      };
    }

    if (destinationCoords) {
      return {
        latitude: destinationCoords.latitude,
        longitude: destinationCoords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    if (driverCoords) {
      return {
        latitude: driverCoords.latitude,
        longitude: driverCoords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    return ACCRA_REGION;
  }, [destinationCoords, driverCoords]);

  const routeMetrics = useMemo(() => {
    if (googleRouteDistanceKm !== null && googleRouteEtaMinutes !== null) {
      return {
        distanceKm: googleRouteDistanceKm,
        etaMinutes: googleRouteEtaMinutes,
      };
    }

    if (!driverCoords || !destinationCoords) {
      return null;
    }

    const distanceKm = getDistanceKm(driverCoords, destinationCoords);
    const etaMinutes = (distanceKm / ASSUMED_CITY_SPEED_KMH) * 60;

    return {
      distanceKm,
      etaMinutes,
    };
  }, [destinationCoords, driverCoords, googleRouteDistanceKm, googleRouteEtaMinutes]);

  useEffect(() => {
    if (!driverCoords || !destinationCoords || !GOOGLE_PLACES_ENABLED) {
      setGoogleRoutePolyline([]);
      setGoogleRouteDistanceKm(null);
      setGoogleRouteEtaMinutes(null);
      return;
    }

    let cancelled = false;

    const loadGoogleRoute = async () => {
      try {
        const route = await fetchGoogleRoute({
          origin: driverCoords,
          destination: destinationCoords,
        });

        if (cancelled || !route) {
          return;
        }

        setGoogleRoutePolyline(route.polylineCoords);
        setGoogleRouteDistanceKm(route.distanceMeters / 1000);
        setGoogleRouteEtaMinutes(route.durationSeconds / 60);
      } catch {
        if (!cancelled) {
          setGoogleRoutePolyline([]);
          setGoogleRouteDistanceKm(null);
          setGoogleRouteEtaMinutes(null);
        }
      }
    };

    loadGoogleRoute();

    return () => {
      cancelled = true;
    };
  }, [destinationCoords, driverCoords]);

  const recenterMap = useCallback(
    (mode: 'follow' | 'overview' = 'overview') => {
      if (!mapRef.current) {
        return;
      }

      if (mode === 'follow' && driverCoords) {
        mapRef.current.animateToRegion(
          {
            latitude: driverCoords.latitude,
            longitude: driverCoords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          350
        );
        return;
      }

      if (driverCoords && destinationCoords) {
        mapRef.current.fitToCoordinates([driverCoords, destinationCoords], {
          edgePadding: { top: 100, right: 60, bottom: 120, left: 60 },
          animated: true,
        });
        return;
      }

      if (driverCoords) {
        mapRef.current.animateToRegion(
          {
            latitude: driverCoords.latitude,
            longitude: driverCoords.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          },
          350
        );
        return;
      }

      if (destinationCoords) {
        mapRef.current.animateToRegion(
          {
            latitude: destinationCoords.latitude,
            longitude: destinationCoords.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          },
          350
        );
      }
    },
    [destinationCoords, driverCoords]
  );

  useEffect(() => {
    if (followDriver && driverCoords) {
      recenterMap('follow');
      return;
    }

    recenterMap('overview');
  }, [destinationCoords, driverCoords, followDriver, recenterMap]);

  const updateStartFromAddress = async () => {
    if (!startLabel.trim() || startLabel === 'Current driver location' || startLabel === 'Greater Accra start point') {
      Alert.alert('Enter a start point', 'Type a Ghana starting point first, or use the current location button.');
      return;
    }

    try {
      setSearchingStart(true);
      const geocoded = await Location.geocodeAsync(normalizeGhanaAddress(startLabel));
      const ghanaResult = geocoded.find((item) => isWithinGhana(item.latitude, item.longitude));
      if (!ghanaResult) {
        Alert.alert(
          'Start point not in Ghana',
          'That starting point could not be resolved inside Ghana. Try a more specific Greater Accra location.'
        );
        return;
      }

      setDriverCoords({ latitude: ghanaResult.latitude, longitude: ghanaResult.longitude });
      setLocationMessage(null);
    } catch {
      Alert.alert('Could not update start point', 'Please try again.');
    } finally {
      setSearchingStart(false);
    }
  };

  const updateDestinationFromAddress = async () => {
    if (!destinationLabel.trim()) {
      Alert.alert('Enter a destination', 'Type a Ghana destination first.');
      return;
    }

    try {
      setSearchingDestination(true);
      const geocoded = await Location.geocodeAsync(normalizeGhanaAddress(destinationLabel));
      const ghanaResult = geocoded.find((item) => isWithinGhana(item.latitude, item.longitude));
      if (!ghanaResult) {
        Alert.alert(
          'Destination not in Ghana',
          'That destination could not be resolved inside Ghana. Try a more specific Greater Accra address.'
        );
        return;
      }

      setDestinationCoords({ latitude: ghanaResult.latitude, longitude: ghanaResult.longitude });
      setLocationMessage(null);
    } catch {
      Alert.alert('Could not update destination', 'Please try again.');
    } finally {
      setSearchingDestination(false);
    }
  };

  const useCurrentDriverLocation = async () => {
    try {
      setRefreshingCurrentLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access so we can use the driver’s live Ghana location.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!isWithinGhana(currentPosition.coords.latitude, currentPosition.coords.longitude)) {
        Alert.alert(
          'Current location outside Ghana',
          'This device location appears to be outside Ghana, so it was not used. Keep the Greater Accra start point or type a Ghana start address.'
        );
        return;
      }

      setDriverCoords({
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      });
      setStartLabel('Current driver location');
      setLocationMessage(null);
      setFollowDriver(true);
    } catch {
      Alert.alert('Could not get current location', 'Please try again.');
    } finally {
      setRefreshingCurrentLocation(false);
    }
  };

  const openInGoogleMaps = async () => {
    if (!destinationCoords) {
      Alert.alert(
        'Destination missing',
        'Set or confirm the destination first before opening Google Maps.'
      );
      return;
    }

    const destinationParam = encodeURIComponent(formatCoordinatePair(destinationCoords));
    const originParam = driverCoords ? encodeURIComponent(formatCoordinatePair(driverCoords)) : '';
    const appUrl = driverCoords
      ? `comgooglemaps://?saddr=${originParam}&daddr=${destinationParam}&directionsmode=driving`
      : `comgooglemaps://?daddr=${destinationParam}&directionsmode=driving`;
    const webUrl = driverCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${destinationParam}&travelmode=driving`;

    try {
      const canOpenGoogleMapsApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpenGoogleMapsApp ? appUrl : webUrl);
    } catch {
      Alert.alert('Could not open Google Maps', 'Please try again.');
    }
  };

  const applyStartSuggestion = async (suggestion: GooglePlaceSuggestion) => {
    try {
      setLoadingStartSuggestions(true);
      const details = await fetchGooglePlaceDetails(
        suggestion.placeId,
        startSessionTokenRef.current
      );
      if (!details || !isWithinGhana(details.latitude, details.longitude)) {
        Alert.alert('Could not use suggestion', 'That suggestion did not return a usable Ghana start point.');
        return;
      }

      setStartLabel(details.formattedAddress || suggestion.fullText || suggestion.primaryText);
      setDriverCoords({
        latitude: details.latitude,
        longitude: details.longitude,
      });
      setStartSuggestions([]);
      setIsEditingStart(false);
      setLocationMessage(null);
      startSessionTokenRef.current = createPlacesSessionToken();
    } catch {
      Alert.alert('Could not load place details', 'Please try again.');
    } finally {
      setLoadingStartSuggestions(false);
    }
  };

  const applyDestinationSuggestion = async (suggestion: GooglePlaceSuggestion) => {
    try {
      setLoadingDestinationSuggestions(true);
      const details = await fetchGooglePlaceDetails(
        suggestion.placeId,
        destinationSessionTokenRef.current
      );
      if (!details || !isWithinGhana(details.latitude, details.longitude)) {
        Alert.alert('Could not use suggestion', 'That suggestion did not return a usable Ghana destination.');
        return;
      }

      setDestinationLabel(details.formattedAddress || suggestion.fullText || suggestion.primaryText);
      setDestinationCoords({
        latitude: details.latitude,
        longitude: details.longitude,
      });
      setDestinationSuggestions([]);
      setIsEditingDestination(false);
      setLocationMessage(null);
      destinationSessionTokenRef.current = createPlacesSessionToken();
    } catch {
      Alert.alert('Could not load place details', 'Please try again.');
    } finally {
      setLoadingDestinationSuggestions(false);
    }
  };

  const canViewThisDeliveryMap = canHandleDeliveries(role) || role === 'customer';

  if (!canViewThisDeliveryMap) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  if (loading) {
    return <LoadingScreen label="Loading delivery map..." />;
  }

  if (!delivery) {
    return <Redirect href="/deliveries" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Delivery Map</Text>
          <Text style={styles.subtitle}>
            Track the delivery route for order #{delivery.order_id} while the handoff is active.
          </Text>
        </View>

        <View style={styles.routeInputsCard}>
          <Text style={styles.routeIntroText}>
            Adjust the route if needed, then continue in Google Maps for the cleanest live navigation.
          </Text>
          <View style={styles.routeField}>
            <Text style={styles.routeFieldLabel}>Starting point</Text>
            <TextInput
              style={styles.routeFieldInput}
              value={startLabel}
              onChangeText={setStartLabel}
              onFocus={() => setIsEditingStart(true)}
              onBlur={() => setIsEditingStart(false)}
              onSubmitEditing={updateStartFromAddress}
              placeholder="Driver start location"
              returnKeyType="search"
            />
            {GOOGLE_PLACES_ENABLED && isEditingStart && startSuggestions.length > 0 ? (
              <View style={styles.suggestionsCard}>
                {startSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.placeId}
                    style={styles.suggestionRow}
                    onPress={() => applyStartSuggestion(suggestion)}
                  >
                    <Text style={styles.suggestionPrimary}>{suggestion.primaryText}</Text>
                    {suggestion.secondaryText ? (
                      <Text style={styles.suggestionSecondary}>{suggestion.secondaryText}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {GOOGLE_PLACES_ENABLED && isEditingStart && loadingStartSuggestions ? (
              <Text style={styles.inputHelperText}>Loading Ghana start suggestions...</Text>
            ) : null}
            {refreshingCurrentLocation ? (
              <Text style={styles.inputHelperText}>Refreshing current Ghana location...</Text>
            ) : null}
          </View>
          <View style={styles.routeField}>
            <Text style={styles.routeFieldLabel}>Destination</Text>
            <TextInput
              style={styles.routeFieldInput}
              value={destinationLabel}
              onChangeText={setDestinationLabel}
              onFocus={() => setIsEditingDestination(true)}
              onBlur={() => setIsEditingDestination(false)}
              onSubmitEditing={updateDestinationFromAddress}
              placeholder="Customer destination"
              multiline
            />
            {GOOGLE_PLACES_ENABLED && isEditingDestination && destinationSuggestions.length > 0 ? (
              <View style={styles.suggestionsCard}>
                {destinationSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.placeId}
                    style={styles.suggestionRow}
                    onPress={() => applyDestinationSuggestion(suggestion)}
                  >
                    <Text style={styles.suggestionPrimary}>{suggestion.primaryText}</Text>
                    {suggestion.secondaryText ? (
                      <Text style={styles.suggestionSecondary}>{suggestion.secondaryText}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {GOOGLE_PLACES_ENABLED && isEditingDestination && loadingDestinationSuggestions ? (
              <Text style={styles.inputHelperText}>Loading Ghana destination suggestions...</Text>
            ) : null}
          </View>
          <View style={styles.routeMetaRow}>
            <TouchableOpacity
              style={[styles.secondaryRouteButton, refreshingCurrentLocation && styles.disabledButton]}
              onPress={useCurrentDriverLocation}
              disabled={refreshingCurrentLocation}
            >
              <Text style={styles.secondaryRouteButtonText}>Use current location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.secondaryRouteButton,
                (searchingStart || searchingDestination) && styles.disabledButton,
              ]}
              onPress={async () => {
                await Promise.all([updateStartFromAddress(), updateDestinationFromAddress()]);
              }}
              disabled={searchingStart || searchingDestination}
            >
              <Text style={styles.secondaryRouteButtonText}>Refresh route</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.googleMapsButton} onPress={openInGoogleMaps}>
            <Text style={styles.googleMapsButtonText}>Open in Google Maps</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapWrap}>
          <MapView
            ref={(instance) => {
              mapRef.current = instance;
            }}
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation={false}
            onPanDrag={() => {
              if (followDriver) {
                setFollowDriver(false);
              }
            }}
          >
            {driverCoords ? (
              <Marker coordinate={driverCoords} title="Driver location" pinColor="#16A34A" />
            ) : null}
            {destinationCoords ? (
              <Marker
                coordinate={destinationCoords}
                title={delivery.customer_name || 'Customer address'}
                description={delivery.delivery_address}
                pinColor="#2563EB"
              />
            ) : null}
          {driverCoords && destinationCoords ? (
            <Polyline
              coordinates={googleRoutePolyline.length > 1 ? googleRoutePolyline : [driverCoords, destinationCoords]}
              strokeColor="#16A34A"
              strokeWidth={4}
              lineDashPattern={[1]}
            />
          ) : null}
          </MapView>
          <View style={styles.mapControls}>
            <TouchableOpacity
              style={[styles.mapControlButton, followDriver && styles.mapControlButtonActive]}
              onPress={() => {
                setFollowDriver(true);
                recenterMap('follow');
              }}
            >
              <Text style={[styles.mapControlButtonText, followDriver && styles.mapControlButtonTextActive]}>
                Follow driver
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mapControlButton}
              onPress={() => {
                setFollowDriver(false);
                recenterMap('overview');
              }}
            >
              <Text style={styles.mapControlButtonText}>Overview route</Text>
            </TouchableOpacity>
          </View>
          {routeMetrics ? (
            <View style={styles.routeBadge}>
              <View style={styles.routeMetric}>
                <Text style={styles.routeMetricValue}>{routeMetrics.distanceKm.toFixed(1)} km</Text>
                <Text style={styles.routeMetricLabel}>Distance</Text>
              </View>
              <View style={styles.routeBadgeDivider} />
              <View style={styles.routeMetric}>
                <Text style={styles.routeMetricValue}>{formatEta(routeMetrics.etaMinutes)}</Text>
                <Text style={styles.routeMetricLabel}>Estimated arrival</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.deliveryTitle}>Delivery #{delivery.id}</Text>
          <Text style={styles.detailText}>Customer: {delivery.customer_name || 'Unknown customer'}</Text>
          <Text style={styles.detailText}>Driver: {delivery.driver_name || 'Unassigned'}</Text>
          <Text style={styles.detailText}>Status: {delivery.status.replaceAll('_', ' ')}</Text>
          <Text style={styles.detailText}>Address: {delivery.delivery_address}</Text>
          {delivery.delivery_window_label ? (
            <Text style={styles.detailText}>Window: {delivery.delivery_window_label}</Text>
          ) : null}
          {routeMetrics ? (
            <Text style={styles.detailText}>
              Tracking: {routeMetrics.distanceKm.toFixed(1)} km remaining, ETA about{' '}
              {formatEta(routeMetrics.etaMinutes)}
            </Text>
          ) : null}
          {locationMessage ? <Text style={styles.infoText}>{locationMessage}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
  },
  content: {
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
  mapWrap: {
    height: 420,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#DCEBDF',
    shadowColor: '#A68E65',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  routeInputsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: '#A68E65',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  routeIntroText: {
    color: '#64748B',
    lineHeight: 20,
  },
  routeField: {
    gap: 6,
  },
  googleMapsButton: {
    marginTop: 4,
    backgroundColor: '#166534',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleMapsButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  inputHelperText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },
  routeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  routeFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  routeFieldInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
    fontWeight: '600',
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
  secondaryRouteButton: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#E8F0FE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryRouteButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    flexDirection: 'row',
    gap: 10,
  },
  mapControlButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  mapControlButtonActive: {
    backgroundColor: '#166534',
  },
  mapControlButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  mapControlButtonTextActive: {
    color: '#FFFFFF',
  },
  routeBadge: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  routeMetric: {
    flex: 1,
    gap: 4,
  },
  routeMetricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#166534',
  },
  routeMetricLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  routeBadgeDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 14,
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 8,
    shadowColor: '#A68E65',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  deliveryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 4,
  },
  detailText: {
    color: '#475569',
    lineHeight: 20,
  },
  infoText: {
    marginTop: 6,
    color: '#92400E',
    backgroundColor: '#FFF4DB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    lineHeight: 20,
  },
});
