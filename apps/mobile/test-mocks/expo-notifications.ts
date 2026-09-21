import { vi } from 'vitest';

export const setNotificationHandler = vi.fn();
export const requestPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
export const setNotificationChannelAsync = vi.fn();
export const getExpoPushTokenAsync = vi.fn().mockResolvedValue({ data: 'expo-push-token' });
export const AndroidImportance = { HIGH: 4 };
