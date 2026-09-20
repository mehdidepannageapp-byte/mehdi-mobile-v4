import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { EAS_PROJECT_ID } from '../config';
import { api, setApiToken } from '../services/api';
import type { User } from '../types';

type AuthValue = {
  user: User | null; token: string | null; loading: boolean;
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string, firstName?: string): Promise<void>;
  demo(role: 'client' | 'driver'): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const STORAGE_KEY = 'mehdi.auth';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async (raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as { token: string; user: User };
      setApiToken(saved.token); setToken(saved.token); setUser(saved.user);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || !EAS_PROJECT_ID) return;
    (async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== 'granted') return;
        if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('missions', { name: 'Missions', importance: Notifications.AndroidImportance.HIGH });
        const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
        const updated = await api.updateMe({ pushToken });
        setUser(updated);
      } catch { /* la configuration push sera ajoutée avant publication */ }
    })();
  }, [user?.id]);

  async function persist(session: { token: string; user: User }) {
    setApiToken(session.token); setToken(session.token); setUser(session.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  const value = useMemo<AuthValue>(() => ({
    user, token, loading,
    requestOtp: api.requestOtp,
    verifyOtp: async (phone, code, firstName) => persist(await api.verifyOtp(phone, code, firstName)),
    demo: async (role) => persist(await api.demo(role)),
    logout: async () => { setApiToken(null); setToken(null); setUser(null); await AsyncStorage.removeItem(STORAGE_KEY); },
    refresh: async () => setUser(await api.me()),
  }), [user, token, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider manquant');
  return value;
}
