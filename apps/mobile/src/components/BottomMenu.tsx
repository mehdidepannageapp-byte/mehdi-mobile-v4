import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function BottomMenu({ navigation, role, active }: { navigation: { navigate: (...args: any[]) => void }; role: 'client' | 'driver'; active: string }) {
  const items = role === 'client'
    ? [{ key: 'home', label: 'Accueil', icon: 'home' as const, screen: 'ClientHome' as const }, { key: 'history', label: 'Historique', icon: 'time' as const, screen: 'ClientHistory' as const }, { key: 'profile', label: 'Profil', icon: 'person' as const, screen: 'ClientProfile' as const }]
    : [{ key: 'home', label: 'Missions', icon: 'navigate' as const, screen: 'DriverHome' as const }, { key: 'earnings', label: 'Revenus', icon: 'wallet' as const, screen: 'DriverEarnings' as const }, { key: 'profile', label: 'Profil', icon: 'person' as const, screen: 'DriverProfile' as const }];
  return <View style={styles.bar}>{items.map((item) => <Pressable key={item.key} style={styles.item} onPress={() => navigation.navigate(item.screen)}><Ionicons name={item.icon} size={22} color={active === item.key ? colors.yellow : colors.muted} /><Text style={[styles.label, active === item.key && { color: colors.yellow }]}>{item.label}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, marginHorizontal: -24, marginBottom: -24, marginTop: 'auto', paddingBottom: 12, paddingTop: 10 }, item: { flex: 1, alignItems: 'center', gap: 3 }, label: { color: colors.muted, fontSize: 11, fontWeight: '700' } });
