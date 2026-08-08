import { Platform } from 'react-native';

type ApiTarget = 'local' | 'render';

// Google Maps/Places and backend target selection both come from env vars so
// we can switch between local demo mode and hosted mode without rewriting code.
const defaultLocalApiBaseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:8002' : 'http://127.0.0.1:8002';

const explicitApiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const localApiBaseUrl = process.env.EXPO_PUBLIC_LOCAL_API_URL?.trim() || defaultLocalApiBaseUrl;
const renderApiBaseUrl = process.env.EXPO_PUBLIC_RENDER_API_URL?.trim() || '';
const requestedApiTarget = process.env.EXPO_PUBLIC_API_TARGET?.trim().toLowerCase();

const resolvedApiTarget: ApiTarget =
  requestedApiTarget === 'render' && renderApiBaseUrl ? 'render' : 'local';

const rawApiBaseUrl =
  explicitApiBaseUrl ||
  (resolvedApiTarget === 'render' ? renderApiBaseUrl : localApiBaseUrl);

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/docs$/, '');

export const BASE_URL = normalizedApiBaseUrl;
export const API_BASE_URL = normalizedApiBaseUrl;
export const API_TARGET = explicitApiBaseUrl ? 'custom' : resolvedApiTarget;
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
export const GOOGLE_PLACES_ENABLED = GOOGLE_MAPS_API_KEY.length > 0;
