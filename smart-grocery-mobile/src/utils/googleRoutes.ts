import { GOOGLE_MAPS_API_KEY, GOOGLE_PLACES_ENABLED } from '../config';

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type GoogleRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  polylineCoords: RoutePoint[];
};

type ComputeRoutesResponse = {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
  }[];
};

function parseDurationSeconds(value?: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.endsWith('s') ? value.slice(0, -1) : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decodePolyline(encoded: string): RoutePoint[] {
  const coordinates: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += latitudeChange;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += longitudeChange;

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
}

export async function fetchGoogleRoute(params: {
  origin: RoutePoint;
  destination: RoutePoint;
}): Promise<GoogleRouteResult | null> {
  if (!GOOGLE_PLACES_ENABLED) {
    return null;
  }

  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: params.origin,
        },
      },
      destination: {
        location: {
          latLng: params.destination,
        },
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      polylineQuality: 'OVERVIEW',
      polylineEncoding: 'ENCODED_POLYLINE',
      languageCode: 'en-US',
      units: 'METRIC',
    }),
  });

  if (!response.ok) {
    throw new Error(`Routes API failed with status ${response.status}`);
  }

  const data = (await response.json()) as ComputeRoutesResponse;
  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline) {
    return null;
  }

  return {
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseDurationSeconds(route.duration),
    polylineCoords: decodePolyline(route.polyline.encodedPolyline),
  };
}
