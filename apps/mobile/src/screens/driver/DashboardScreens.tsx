import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomMenu } from '../../components/BottomMenu';
import { AppScreen, Brand, Card, Empty, Header, Money, OptionCard, Pill, PrimaryButton, SecondaryButton, SectionTitle, ToggleRow, ui } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { Booking, RootStackParamList, Unavailability } from '../../types';
import { Chip } from '../client/RequestScreens';
import { issueLabel, labelStatus } from '../client/HomeScreens';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
type Dashboard = Awaited<ReturnType<typeof api.driverDashboard>>;

export function DriverHomeScreen({ navigation }: Props<'DriverHome'>) {
  const { user } = useAuth(); const [dashboard, setDashboard] = useState<Dashboard | null>(null); const [online, setOnline] = useState(Boolean(user?.isAvailable)); const [loading, setLoading] = useState(false);
  const load = useCallback(() => api.driverDashboard().then((data) => { setDashboard(data); setOnline(Boolean(data.user.isAvailable)); }), []);
  useEffect(() => { void load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
  async function toggle(value: boolean) { try { setLoading(true); setOnline(value); await api.driverAvailability(value); await load(); } catch (e) { setOnline(!value); Alert.alert('Impossible', e instanceof Error ? e.message : 'Réessayez.'); } finally { setLoading(false); } }
  const active = dashboard?.active;
  return <AppScreen><View style={styles.top}><Brand compact /><Pill label={online ? 'EN LIGNE' : 'HORS LIGNE'} tone={online ? 'green' : 'red'} /></View><View><Text style={styles.greeting}>Bonjour {user?.firstName ?? 'Mehdi'}</Text><Text style={ui.muted}>Espace professionnel</Text></View>
    <ToggleRow title={online ? 'Vous êtes disponible' : 'Vous êtes indisponible'} subtitle={online ? 'Vous pouvez recevoir une nouvelle mission' : 'Activez-vous pour recevoir les demandes'} value={online} onValueChange={toggle} />
    {active ? <ActiveMission booking={active} navigation={navigation} /> : <View style={styles.waiting}><View style={styles.onlineCircle}><Ionicons name={online ? 'radio' : 'pause'} size={48} color={online ? colors.green : colors.muted} /></View><Text style={styles.waitTitle}>{online ? 'En attente d’une mission' : 'Vous êtes hors ligne'}</Text><Text style={styles.center}>{online ? 'La prochaine demande vous sera envoyée automatiquement.' : 'Aucune nouvelle demande ne sera envoyée.'}</Text></View>}
    <View style={styles.stats}><Card style={styles.stat}><Text style={ui.muted}>Ce mois</Text><Money cents={dashboard?.stats.monthRevenueCents ?? 0} size={22} /></Card><Card style={styles.stat}><Text style={ui.muted}>Missions</Text><Text style={styles.statNumber}>{dashboard?.stats.completedCount ?? 0}</Text></Card></View>
    <BottomMenu navigation={navigation} role="driver" active="home" />
  </AppScreen>;
}

function ActiveMission({ booking, navigation }: { booking: Booking; navigation: { navigate: (...args: any[]) => void } }) {
  if (booking.status === 'PROPOSED') {
    return <Card style={{ borderColor: colors.yellow }}><View style={styles.between}><Pill label={labelStatus(booking.status)} tone="yellow" /><Money cents={booking.estimatedPriceCents} size={19} /></View><Text style={ui.optionTitle}>{issueLabel(booking.issueType)}</Text><Text style={ui.muted}>{booking.pickupAddress}</Text><Text style={ui.muted}>En attente de la réponse du client au créneau proposé.</Text></Card>;
  }
  const next = booking.status === 'ASSIGNED' ? 'MissionOffer' : booking.status === 'DRIVER_EN_ROUTE' ? 'DriverNavigation' : booking.status === 'DRIVER_ARRIVED' ? 'DriverArrival' : booking.status === 'PICKED_UP' || booking.status === 'IN_TRANSIT' ? 'Transport' : 'Delivery';
  const go = () => navigation.navigate(next, { bookingId: booking.id });
  return <Card style={{ borderColor: booking.status === 'ASSIGNED' ? colors.yellow : colors.green }}><View style={styles.between}><Pill label={labelStatus(booking.status)} tone={booking.status === 'ASSIGNED' ? 'yellow' : 'green'} /><Money cents={booking.estimatedPriceCents} size={19} /></View><Text style={ui.optionTitle}>{issueLabel(booking.issueType)}</Text><Text style={ui.muted}>{booking.pickupAddress}</Text><PrimaryButton title={booking.status === 'ASSIGNED' ? 'Voir la nouvelle mission' : 'Continuer la mission'} onPress={go} tone={booking.status === 'ASSIGNED' ? 'yellow' : 'green'} /></Card>;
}

export function DriverHistoryScreen({ navigation }: Props<'DriverHistory'>) {
  const [items, setItems] = useState<Booking[]>([]); useEffect(() => { api.bookings().then(setItems); }, []);
  return <AppScreen><Header title="Historique des missions" subtitle={`${items.length} mission${items.length > 1 ? 's' : ''}`} onBack={() => navigation.goBack()} />{items.length ? items.map((b) => <Card key={b.id}><View style={styles.between}><Pill label={labelStatus(b.status)} tone={b.status === 'COMPLETED' ? 'green' : b.status === 'CANCELLED' ? 'red' : 'yellow'} /><Text style={ui.muted}>{new Date(b.createdAt).toLocaleDateString('fr-FR')}</Text></View><Text style={ui.optionTitle}>{issueLabel(b.issueType)}</Text><Text style={ui.muted}>{b.pickupAddress}</Text><Money cents={b.finalPriceCents ?? b.estimatedPriceCents} size={20} /></Card>) : <Empty icon="file-tray-outline" title="Aucune mission" text="Vos missions apparaîtront ici." />}</AppScreen>;
}

export function DriverEarningsScreen({ navigation }: Props<'DriverEarnings'>) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null); useEffect(() => { api.driverDashboard().then(setDashboard); }, []);
  return <AppScreen><Header title="Mes revenus" subtitle="Compte rendu" /><Card style={styles.revenue}><Text style={ui.muted}>CHIFFRE DU MOIS</Text><Money cents={dashboard?.stats.monthRevenueCents ?? 0} size={40} /><Pill label={`${dashboard?.stats.completedCount ?? 0} missions réalisées`} tone="green" /></Card><View style={styles.stats}><Card style={styles.stat}><Text style={ui.muted}>Revenu total</Text><Money cents={dashboard?.stats.totalRevenueCents ?? 0} size={21} /></Card><Card style={styles.stat}><Text style={ui.muted}>Moyenne</Text><Money cents={dashboard?.stats.completedCount ? Math.round(dashboard.stats.totalRevenueCents / dashboard.stats.completedCount) : 0} size={21} /></Card></View><SectionTitle>Activité</SectionTitle><Card><View style={styles.chart}>{[38, 55, 42, 76, 62, 88, 69].map((h, i) => <View key={i} style={[styles.bar, { height: h }]} />)}</View><Text style={[ui.muted, { textAlign: 'center' }]}>Aperçu des 7 derniers jours</Text></Card><OptionCard icon="time" title="Historique des missions" onPress={() => navigation.navigate('DriverHistory')} /><BottomMenu navigation={navigation} role="driver" active="earnings" /></AppScreen>;
}

export function DriverProfileScreen({ navigation }: Props<'DriverProfile'>) {
  const { user, logout } = useAuth();
  return <AppScreen><Header title="Profil dépanneur" subtitle={user?.phone} /><Card style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarLetter}>{user?.firstName?.[0] ?? 'M'}</Text></View><Text style={styles.profileName}>{user?.firstName ?? 'Mehdi'}</Text><Pill label="COMPTE PROFESSIONNEL" tone="yellow" /></Card><SectionTitle>Réglages</SectionTitle><OptionCard icon="location" title="Zone d’intervention" subtitle="Toute l’Île-de-France" onPress={() => undefined} /><OptionCard icon="notifications" title="Notifications" subtitle="Missions, messages et rappels" onPress={() => undefined} /><OptionCard icon="calendar" title="Mes indisponibilités" subtitle="Missions prises hors application" onPress={() => navigation.navigate('DriverUnavailability')} /><OptionCard icon="document-text" title="Mes documents" subtitle="Assurance, permis, carte professionnelle" onPress={() => navigation.navigate('DriverDocuments')} /><OptionCard icon="help-circle" title="Support" onPress={() => navigation.navigate('Support')} /><SecondaryButton title="Se déconnecter" icon="log-out" onPress={logout} /><BottomMenu navigation={navigation} role="driver" active="profile" /></AppScreen>;
}

const weekdays: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mer' }, { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' }, { value: 6, label: 'Sam' }, { value: 0, label: 'Dim' },
];
const dayOffsets = [{ d: 0, t: 'Aujourd’hui' }, { d: 1, t: 'Demain' }, { d: 2, t: 'Après-demain' }, { d: 7, t: 'Dans 7 jours' }];
const unavailabilityHours = [6, 8, 10, 12, 14, 16, 18, 20, 22];

export function DriverUnavailabilityScreen({ navigation }: Props<'DriverUnavailability'>) {
  const [items, setItems] = useState<Unavailability[]>([]);
  const [type, setType] = useState<'ONE_TIME' | 'RECURRING'>('ONE_TIME');
  const [dayOffset, setDayOffset] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(12);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => { api.unavailabilities().then(setItems); }, []);
  useEffect(() => { void load(); }, [load]);
  const valid = endHour > startHour;

  async function add() {
    if (!valid) return;
    try {
      setLoading(true);
      if (type === 'ONE_TIME') {
        const startAt = new Date(); startAt.setDate(startAt.getDate() + dayOffset); startAt.setHours(startHour, 0, 0, 0);
        const endAt = new Date(); endAt.setDate(endAt.getDate() + dayOffset); endAt.setHours(endHour, 0, 0, 0);
        await api.createUnavailability({ type: 'ONE_TIME', startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      } else {
        await api.createUnavailability({ type: 'RECURRING', weekday, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: `${String(endHour).padStart(2, '0')}:00` });
      }
      await load();
    } finally { setLoading(false); }
  }
  async function remove(id: string) { await api.deleteUnavailability(id); await load(); }

  const oneTime = items.filter((i) => i.type === 'ONE_TIME');
  const recurring = items.filter((i) => i.type === 'RECURRING');

  return <AppScreen><Header title="Mes indisponibilités" subtitle="Missions prises hors application" onBack={() => navigation.goBack()} />
    <OptionCard icon="calendar" title="Créneau ponctuel" subtitle="Une plage précise, une seule fois" selected={type === 'ONE_TIME'} onPress={() => setType('ONE_TIME')} />
    <OptionCard icon="repeat" title="Créneau récurrent" subtitle="Chaque semaine, jusqu’à suppression" selected={type === 'RECURRING'} onPress={() => setType('RECURRING')} />
    <Card>
      {type === 'ONE_TIME'
        ? <><Text style={ui.label}>Jour</Text><View style={styles.chips}>{dayOffsets.map((x) => <Chip key={x.d} text={x.t} active={dayOffset === x.d} onPress={() => setDayOffset(x.d)} />)}</View></>
        : <><Text style={ui.label}>Jour de la semaine</Text><View style={styles.chips}>{weekdays.map((w) => <Chip key={w.value} text={w.label} active={weekday === w.value} onPress={() => setWeekday(w.value)} />)}</View></>}
      <Text style={ui.label}>Début</Text><View style={styles.chips}>{unavailabilityHours.map((h) => <Chip key={h} text={`${h}h`} active={startHour === h} onPress={() => setStartHour(h)} />)}</View>
      <Text style={ui.label}>Fin</Text><View style={styles.chips}>{unavailabilityHours.map((h) => <Chip key={h} text={`${h}h`} active={endHour === h} onPress={() => setEndHour(h)} />)}</View>
      {!valid ? <Text style={styles.unavailError}>L’heure de fin doit être après le début.</Text> : null}
    </Card>
    <PrimaryButton title="Ajouter cette indisponibilité" onPress={add} loading={loading} disabled={!valid} />
    <SectionTitle>Créneaux ponctuels</SectionTitle>
    {oneTime.length ? oneTime.map((item) => <Card key={item.id}><View style={styles.between}><Text style={ui.optionTitle}>{item.startAt ? new Date(item.startAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text><Pressable onPress={() => remove(item.id)}><Ionicons name="trash" size={20} color={colors.red} /></Pressable></View>{item.endAt ? <Text style={ui.muted}>Jusqu’à {new Date(item.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text> : null}</Card>) : <Text style={ui.muted}>Aucun créneau ponctuel.</Text>}
    <SectionTitle>Créneaux récurrents</SectionTitle>
    {recurring.length ? recurring.map((item) => <Card key={item.id}><View style={styles.between}><Text style={ui.optionTitle}>{weekdays.find((w) => w.value === item.weekday)?.label ?? ''} · {item.startTime}–{item.endTime}</Text><Pressable onPress={() => remove(item.id)}><Ionicons name="trash" size={20} color={colors.red} /></Pressable></View></Card>) : <Text style={ui.muted}>Aucun créneau récurrent.</Text>}
  </AppScreen>;
}

export function DriverDocumentsScreen({ navigation }: Props<'DriverDocuments'>) {
  return <AppScreen><Header title="Mes documents" subtitle="Compte professionnel" onBack={() => navigation.goBack()} /><Document title="Permis de conduire" status="Validé" /><Document title="Assurance professionnelle" status="À compléter" pending /><Document title="Carte grise du véhicule" status="À compléter" pending /><Document title="RIB professionnel" status="À compléter" pending /><Text style={[ui.muted, { textAlign: 'center' }]}>Les documents seront validés manuellement lors de la mise en service du compte unique.</Text></AppScreen>;
}
function Document({ title, status, pending }: { title: string; status: string; pending?: boolean }) { return <Card><View style={styles.doc}><Ionicons name="document-text" size={25} color={pending ? colors.yellow : colors.green} /><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{title}</Text><Text style={ui.muted}>{status}</Text></View><Ionicons name={pending ? 'cloud-upload' : 'checkmark-circle'} size={22} color={pending ? colors.yellow : colors.green} /></View></Card>; }

const styles = StyleSheet.create({ top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, greeting: { color: colors.text, fontSize: 27, fontWeight: '900' }, waiting: { alignItems: 'center', justifyContent: 'center', minHeight: 250, gap: 12 }, onlineCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, waitTitle: { color: colors.text, fontSize: 20, fontWeight: '800' }, center: { color: colors.muted, textAlign: 'center' }, stats: { flexDirection: 'row', gap: 10 }, stat: { flex: 1 }, statNumber: { color: colors.text, fontWeight: '900', fontSize: 24 }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, revenue: { alignItems: 'center', paddingVertical: 28 }, chart: { height: 100, flexDirection: 'row', gap: 9, alignItems: 'flex-end', justifyContent: 'space-around' }, bar: { flex: 1, backgroundColor: colors.yellow, borderRadius: 5, maxWidth: 25 }, profile: { alignItems: 'center' }, avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: colors.yellow, fontSize: 30, fontWeight: '900' }, profileName: { color: colors.text, fontWeight: '900', fontSize: 23 }, doc: { flexDirection: 'row', alignItems: 'center', gap: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, unavailError: { color: colors.red, fontWeight: '700' } });
