import { Platform } from 'react-native';

const defaultApiBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8002' : 'http://127.0.0.1:8002';
//  Platform.OS === 'android' ? 'http://10.0.2.2:8002' : 'http://172.20.10.2:8003';

const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || defaultApiBaseUrl;

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/docs$/, '');

export const BASE_URL = normalizedApiBaseUrl;
export const API_BASE_URL = normalizedApiBaseUrl;
