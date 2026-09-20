import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { io, type Socket } from 'socket.io-client';
import { AppScreen, Card, Header, Money, Pill, PrimaryButton, SecondaryButton, ui } from '../../components/ui';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { Booking, RootStackParamList } from '../../types';
import { issueLabel, labelStatus } from './HomeScreens';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export function SearchingScreen({ navigation, route }: Props<'Searching'>) {
  const { setActive } = useBooking(); const [seconds, setSeconds] = useState(0); const [booking, setBooking] = useState<Booking | null>(null);
  useEffect(() => { const poll = async () => { const current = await api.booking(route.params.bookingId); setBooking(current); setActive(current); if (!['SEARCHING', 'PAYMENT_PENDING'].includes(current.status)) navigation.replace('ClientTracking', { bookingId: current.id }); }; void poll(); const timer = setInterval(() => { setSeconds((s) => s + 5); void poll(); }, 5000); return () => clearInterval(timer); }, [route.params.bookingId]);
  async function schedule() { await api.cancel(route.params.bookingId, 'Reprogrammation demandée'); navigation.replace('Schedule'); }
  return <AppScreen scroll={false}><Header title="Recherche en cours" subtitle={booking?.reference} onBack={() => navigation.navigate('ClientHome')} /><View style={styles.searchArea}><View style={styles.radar}><View style={styles.radar2}><View style={styles.radar3}><Ionicons name="bicycle" size={35} color={colors.yellow} /></View></View></View><Text style={styles.title}>Nous contactons le dépanneur</Text><Text style={styles.center}>La demande est relancée automatiquement toutes les 2 minutes jusqu’à ce qu’il soit disponible.</Text><Pill label={`${Math.floor(seconds / 60)} min ${seconds % 60} s`} tone="yellow" /></View>
    <Card><View style={styles.row}><Ionicons name="checkmark-circle" color={colors.green} size={20} /><Text style={styles.itemText}>Demande et paiement validés</Text></View><View style={styles.row}><Ionicons name="sync" color={colors.yellow} size={20} /><Text style={styles.itemText}>Relance automatique active</Text></View><View style={styles.row}><Ionicons name="notifications" color={colors.muted} size={20} /><Text style={styles.itemText}>Vous serez averti immédiatement</Text></View></Card>
    <SecondaryButton title="Programmer pour plus tard" icon="calendar" onPress={schedule} /><SecondaryButton title="Annuler la demande" danger onPress={() => api.cancel(route.params.bookingId).then(() => navigation.replace('ClientHome'))} />
  </AppScreen>;
}

export function ClientTrackingScreen({ navigation, route }: Props<'ClientTracking'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null); const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null); const socket = useRef<Socket | null>(null);
  useEffect(() => { const load = async () => { const data = await api.booking(route.params.bookingId); setBooking(data); if (data.status === 'COMPLETED') navigation.replace('ClientCompleted', { bookingId: data.id }); }; void load(); const poll = setInterval(load, 5000); socket.current = io(API_URL, { auth: { token } }); socket.current.emit('booking:join', route.params.bookingId); socket.current.on('location:updated', setDriverLocation); return () => { clearInterval(poll); socket.current?.disconnect(); }; }, [route.params.bookingId]);
  if (!booking) return <AppScreen scroll={false}><View style={styles.searchArea}><Text style={ui.muted}>Chargement du suivi…</Text></View></AppScreen>;
  const lat = driverLocation?.latitude ?? booking.pickupLatitude; const lng = driverLocation?.longitude ?? booking.pickupLongitude;
  return <AppScreen><Header title="Suivi en direct" subtitle={booking.reference} onBack={() => navigation.navigate('ClientHome')} /><View style={styles.mapWrap}><MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: .08, longitudeDelta: .08 }}><Marker coordinate={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }} title="Votre position" pinColor={colors.red} />{driverLocation ? <Marker coordinate={driverLocation} title="Dépanneur"><View style={styles.driverMarker}><Ionicons name="construct" color={colors.bg} size={19} /></View></Marker> : null}</MapView><View style={styles.mapStatus}><Pill label={labelStatus(booking.status)} tone="green" /></View></View>
    <Card><View style={styles.driver}><View style={styles.driverAvatar}><Text style={styles.driverLetter}>M</Text></View><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{booking.driver?.firstName ?? 'Votre dépanneur'}</Text><Text style={ui.muted}>Professionnel Mehdi Dépannage • ★ 4,9</Text></View></View><View style={styles.actions}><SecondaryButton title="Message" icon="chatbubble" onPress={() => navigation.navigate('Chat', { bookingId: booking.id })} /></View></Card>
    <Timeline status={booking.status} />
  </AppScreen>;
}

function Timeline({ status }: { status: string }) { const steps = [['DRIVER_EN_ROUTE', 'Dépanneur en route'], ['DRIVER_ARRIVED', 'Dépanneur sur place'], ['PICKED_UP', 'Moto prise en charge'], ['IN_TRANSIT', 'Transport en cours'], ['DELIVERED', 'Moto livrée']]; const order = steps.findIndex((x) => x[0] === status); return <Card>{steps.map((step, i) => <View key={step[0]} style={styles.timelineRow}><View style={[styles.timelineDot, i <= order && { backgroundColor: colors.green, borderColor: colors.green }]}>{i <= order ? <Ionicons name="checkmark" color={colors.bg} size={13} /> : null}</View><Text style={[styles.itemText, i > order && { color: colors.muted }]}>{step[1]}</Text></View>)}</Card>; }

export function ClientCompletedScreen({ navigation, route }: Props<'ClientCompleted'>) {
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(''); const [sent, setSent] = useState(false);
  async function submit() { await api.review(route.params.bookingId, rating, comment || undefined); setSent(true); }
  return <AppScreen><View style={styles.success}><View style={styles.successIcon}><Ionicons name="checkmark" size={55} color={colors.white} /></View><Text style={styles.title}>Intervention terminée !</Text><Text style={styles.center}>Votre moto est arrivée à destination en toute sécurité.</Text></View>
    <Card style={{ alignItems: 'center' }}><Text style={ui.optionTitle}>Notez le service</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)}><Ionicons name={n <= rating ? 'star' : 'star-outline'} color={colors.yellow} size={34} /></Pressable>)}</View>{!sent ? <><Pressable style={styles.comment} onPress={() => setComment(comment || 'Service rapide et professionnel.')}><Text style={ui.muted}>{comment || 'Ajouter un commentaire (facultatif)'}</Text></Pressable><PrimaryButton title="Envoyer mon avis" onPress={submit} /></> : <Pill label="Avis envoyé, merci !" tone="green" />}</Card>
    <PrimaryButton title="Voir la facture" icon="receipt" onPress={() => navigation.navigate('Invoice', { bookingId: route.params.bookingId })} /><SecondaryButton title="Retour à l’accueil" onPress={() => navigation.navigate('ClientHome')} />
  </AppScreen>;
}

export function InvoiceScreen({ navigation, route }: Props<'Invoice'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null); const [downloading, setDownloading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking); }, []);
  async function download() { if (!booking || !token) return; try { setDownloading(true); const path = `${FileSystem.cacheDirectory}${booking.invoice?.number ?? booking.reference}.pdf`; const result = await FileSystem.downloadAsync(`${API_URL}/bookings/${booking.id}/invoice.pdf`, path, { headers: { Authorization: `Bearer ${token}` } }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Votre facture Mehdi Dépannage' }); } catch (e) { Alert.alert('Facture indisponible', e instanceof Error ? e.message : 'Réessayez.'); } finally { setDownloading(false); } }
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement…</Text></AppScreen>;
  return <AppScreen><Header title="Facture" subtitle={booking.invoice?.number ?? booking.reference} onBack={() => navigation.goBack()} /><Card style={styles.invoice}><Text style={styles.invoiceBrand}>MEHDI DÉPANNAGE</Text><Text style={ui.muted}>{new Date(booking.completedAt ?? booking.createdAt).toLocaleDateString('fr-FR')}</Text><View style={styles.invoiceLine} /><Text style={ui.optionTitle}>{issueLabel(booking.issueType)}</Text><Text style={ui.muted}>{booking.pickupAddress}</Text><Ionicons name="arrow-down" color={colors.muted} size={18} /><Text style={ui.muted}>{booking.destinationAddress}</Text><View style={styles.invoiceLine} /><Text style={ui.muted}>TOTAL TTC</Text><Money cents={booking.finalPriceCents ?? booking.estimatedPriceCents} size={36} /><Pill label="PAYÉ" tone="green" /></Card><PrimaryButton title="Télécharger / partager le PDF" icon="download" onPress={download} loading={downloading} /><SecondaryButton title="Retour à l’historique" onPress={() => navigation.navigate('ClientHistory')} /></AppScreen>;
}

const styles = StyleSheet.create({
  searchArea: { flex: 1, minHeight: 300, justifyContent: 'center', alignItems: 'center', gap: 15 }, radar: { width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: '#5A4A00', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151509' }, radar2: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: '#8A7000', alignItems: 'center', justifyContent: 'center' }, radar3: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontWeight: '900', fontSize: 24, textAlign: 'center' }, center: { color: colors.muted, lineHeight: 20, textAlign: 'center', maxWidth: 300 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, itemText: { color: colors.text, fontWeight: '600', flex: 1 },
  mapWrap: { height: 280, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }, mapStatus: { position: 'absolute', top: 12, left: 12 }, driverMarker: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.yellow, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, driver: { flexDirection: 'row', alignItems: 'center', gap: 12 }, driverAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, driverLetter: { color: colors.yellow, fontSize: 20, fontWeight: '900' }, actions: { marginTop: 4 }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 }, timelineDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  success: { alignItems: 'center', gap: 12, marginVertical: 20 }, successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, stars: { flexDirection: 'row', gap: 5 }, comment: { backgroundColor: colors.bg, borderRadius: 10, padding: 14, width: '100%' }, invoice: { alignItems: 'center', paddingVertical: 28 }, invoiceBrand: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, invoiceLine: { height: 1, backgroundColor: colors.border, width: '100%', marginVertical: 12 },
});
