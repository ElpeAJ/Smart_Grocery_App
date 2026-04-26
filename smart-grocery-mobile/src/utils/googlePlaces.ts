import { GOOGLE_MAPS_API_KEY, GOOGLE_PLACES_ENABLED } from '../config';

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const ACCRA_LOCATION_BIAS = {
  circle: {
    center: {
      latitude: 5.66,
      longitude: -0.08,
    },
    radius: 60000,
  },
};

export type GooglePlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
};

export type GooglePlaceDetails = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

function createPlacesSessionToken() {
  return `gh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function googlePlacesRequest<T>(
  endpoint: string,
  options: RequestInit,
  fieldMask: string
): Promise<T> {
  const response = await fetch(`${GOOGLE_PLACES_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': fieldMask,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Places request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
};

type PlaceDetailsResponse = {
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

export async function fetchGooglePlaceSuggestions(
  input: string,
  sessionToken: string
): Promise<GooglePlaceSuggestion[]> {
  if (!GOOGLE_PLACES_ENABLED || input.trim().length < 3) {
    return [];
  }

  const payload = {
    input,
    includedRegionCodes: ['gh'],
    locationBias: ACCRA_LOCATION_BIAS,
    languageCode: 'en',
    sessionToken,
  };

  const data = await googlePlacesRequest<AutocompleteResponse>(
    '/places:autocomplete',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
  );

  return (data.suggestions ?? [])
    .map((entry) => {
      const prediction = entry.placePrediction;
      if (!prediction?.placeId) {
        return null;
      }

      return {
        placeId: prediction.placeId,
        primaryText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
        fullText: prediction.text?.text ?? '',
      } satisfies GooglePlaceSuggestion;
    })
    .filter((item): item is GooglePlaceSuggestion => Boolean(item));
}

export async function fetchGooglePlaceDetails(
  placeId: string,
  sessionToken: string
): Promise<GooglePlaceDetails | null> {
  if (!GOOGLE_PLACES_ENABLED || !placeId.trim()) {
    return null;
  }

  const data = await googlePlacesRequest<PlaceDetailsResponse>(
    `/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en&regionCode=GH`,
    {
      method: 'GET',
    },
    'formattedAddress,location'
  );

  if (
    !data.location ||
    typeof data.location.latitude !== 'number' ||
    typeof data.location.longitude !== 'number'
  ) {
    return null;
  }

  return {
    formattedAddress: data.formattedAddress ?? '',
    latitude: data.location.latitude,
    longitude: data.location.longitude,
  };
}

export { createPlacesSessionToken };
