import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Brand, Card, Empty, Field, Header, Money, OptionCard, Pill, PrimaryButton, SecondaryButton, SectionTitle, ui } from '../../components/ui';
import { BottomMenu } from '../../components/BottomMenu';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { colors, radius, spacing } from '../../theme';
import type { Booking, RootStackParamList } from '../../types';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
const activeStatuses = ['SEARCHING', 'PROPOSED', 'SCHEDULED', 'ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
// La proposition de créneau (après un refus) a son propre écran de décision, la recherche a le sien,
// tout le reste se suit sur l'écran de suivi classique.
function activeRoute(status: string): 'Searching' | 'Proposal' | 'ClientTracking' { return status === 'SEARCHING' ? 'Searching' : status === 'PROPOSED' ? 'Proposal' : 'ClientTracking'; }

export function ClientHomeScreen({ navigation }: Props<'ClientHome'>) {
  const { user } = useAuth(); const [active, setActive] = useState<Booking | null>(null); const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { const list = await api.bookings(); setActive(list.find((b) => activeStatuses.includes(b.status)) ?? null); } catch { /* ignoré : la prochaine actualisation réessaiera */ } finally { setRefreshing(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <AppScreen><View style={styles.top}><Brand compact /><View style={styles.avatar}><Text style={styles.avatarText}>{user?.firstName?.[0] ?? 'C'}</Text></View></View>
    <View><Text style={styles.greeting}>Bonjour {user?.firstName ?? ''}</Text><Text style={ui.muted}>Besoin d’aide pour votre moto ?</Text></View>
    {active ? <Card onPress={() => navigation.navigate(activeRoute(active.status), { bookingId: active.id })} style={styles.activeCard}><View style={styles.row}><Pill label={labelStatus(active.status)} tone="yellow" /><Ionicons name="chevron-forward" size={22} color={colors.text} /></View><Text style={ui.optionTitle}>{active.pickupAddress}</Text><Text style={ui.muted}>{active.reference}</Text></Card> : null}
    <Pressable style={styles.sos} onPress={() => navigation.navigate('LocationPermission')}><View style={styles.sosInner}><Text style={styles.sosTop}>SOS</Text><Text style={styles.sosMain}>DÉPANNAGE</Text><Text style={styles.sosSmall}>APPUYEZ ICI</Text></View></Pressable>
    <Text style={styles.help}>Une demande guidée en quelques étapes</Text>
    <View style={styles.quick}><Card style={styles.quickCard}><Ionicons name="shield-checkmark" color={colors.green} size={25} /><Text style={styles.quickText}>Paiement sécurisé</Text></Card><Card style={styles.quickCard}><Ionicons name="location" color={colors.yellow} size={25} /><Text style={styles.quickText}>Toute l’Île-de-France</Text></Card></View>
    <BottomMenu navigation={navigation} role="client" active="home" />
  </AppScreen>;
}

export function ClientHistoryScreen({ navigation }: Props<'ClientHistory'>) {
  const [items, setItems] = useState<Booking[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.bookings().then(setItems).catch(() => undefined).finally(() => setLoading(false)); }, []);
  return <AppScreen><Header title="Mes interventions" subtitle={`${items.length} demande${items.length > 1 ? 's' : ''}`} />
    {items.length === 0 && !loading ? <Empty icon="receipt-outline" title="Aucune intervention" text="Vos demandes et vos factures apparaîtront ici." /> : items.map((item) => <Card key={item.id} onPress={() => item.status === 'COMPLETED' ? navigation.navigate('Invoice', { bookingId: item.id }) : navigation.navigate(activeRoute(item.status), { bookingId: item.id })}><View style={styles.row}><Pill label={labelStatus(item.status)} tone={item.status === 'COMPLETED' ? 'green' : item.status === 'CANCELLED' ? 'red' : 'yellow'} /><Text style={ui.muted}>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text></View><Text style={ui.optionTitle}>{issueLabel(item.issueType)}</Text><Text style={ui.muted}>{item.pickupAddress} → {item.destinationAddress}</Text><Money cents={item.finalPriceCents ?? item.estimatedPriceCents} size={19} /></Card>)}
    <BottomMenu navigation={navigation} role="client" active="history" />
  </AppScreen>;
}

export function ClientProfileScreen({ navigation }: Props<'ClientProfile'>) {
  const { user, logout } = useAuth(); const [name, setName] = useState(user?.firstName ?? ''); const [email, setEmail] = useState(user?.email ?? ''); const [saving, setSaving] = useState(false);
  async function save() { try { setSaving(true); await api.updateMe({ firstName: name, email: email || null }); Alert.alert('Profil enregistré'); } catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); } finally { setSaving(false); } }
  function remove() { Alert.alert('Supprimer le compte ?', 'Vos données personnelles seront supprimées. Cette action est irréversible.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await api.deleteMe(); await logout(); } }]); }
  return <AppScreen><Header title="Mon profil" subtitle={user?.phone} />
    <Field label="Prénom" value={name} onChangeText={setName} icon="person" /><Field label="Email pour les factures" value={email} onChangeText={setEmail} placeholder="vous@exemple.fr" icon="mail" keyboardType="email-address" /><PrimaryButton title="Enregistrer" onPress={save} loading={saving} />
    <SectionTitle>Mon compte</SectionTitle><OptionCard icon="bicycle" title="Mes motos" subtitle="Ajouter ou modifier une moto" onPress={() => navigation.navigate('Vehicles')} /><OptionCard icon="notifications" title="Notifications" subtitle="Missions et suivi de l’intervention" onPress={() => navigation.navigate('Notifications')} /><OptionCard icon="help-circle" title="Support et FAQ" onPress={() => navigation.navigate('Support')} />
    <SecondaryButton title="Se déconnecter" icon="log-out" onPress={logout} /><SecondaryButton title="Supprimer mon compte" icon="trash" danger onPress={remove} />
    <BottomMenu navigation={navigation} role="client" active="profile" />
  </AppScreen>;
}

export function labelStatus(status: string) { return ({ SEARCHING: 'Recherche en cours', PROPOSED: 'Créneau proposé', SCHEDULED: 'Programmé', ASSIGNED: 'Dépanneur trouvé', DRIVER_EN_ROUTE: 'En route', DRIVER_ARRIVED: 'Sur place', PICKED_UP: 'Prise en charge', IN_TRANSIT: 'Transport', DELIVERED: 'Livrée', COMPLETED: 'Terminée', CANCELLED: 'Annulée', PAYMENT_PENDING: 'Paiement' } as Record<string, string>)[status] ?? status; }
export function issueLabel(issue: string) { return ({ ENGINE: 'Panne moteur', FLAT_TIRE: 'Crevaison', BATTERY: 'Batterie', ACCIDENT: 'Accident / chute', CHAIN: 'Problème de chaîne', OTHER: 'Autre problème' } as Record<string, string>)[issue] ?? issue; }

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, avatarText: { color: colors.yellow, fontWeight: '900' }, greeting: { color: colors.text, fontSize: 27, fontWeight: '900' },
  sos: { width: 210, height: 210, alignSelf: 'center', borderRadius: 105, backgroundColor: '#56151A', borderWidth: 1, borderColor: '#7D1B22', padding: 13, shadowColor: colors.red, shadowOpacity: .38, shadowRadius: 24 }, sosInner: { flex: 1, borderRadius: 100, backgroundColor: colors.red, borderWidth: 4, borderColor: '#FF626A', alignItems: 'center', justifyContent: 'center' }, sosTop: { color: colors.white, fontSize: 38, fontWeight: '900' }, sosMain: { color: colors.white, fontSize: 20, fontWeight: '900' }, sosSmall: { color: '#FFD9DB', fontSize: 10, marginTop: 5, fontWeight: '800' },
  help: { color: colors.text, textAlign: 'center', fontWeight: '700' }, quick: { flexDirection: 'row', gap: 10 }, quickCard: { flex: 1, alignItems: 'center' }, quickText: { color: colors.text, textAlign: 'center', fontWeight: '700', fontSize: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, activeCard: { borderColor: colors.yellow, backgroundColor: '#1C1A0E' },
});
