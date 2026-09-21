import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStripe } from '@stripe/stripe-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { io, type Socket } from 'socket.io-client';
import { AppScreen, Card, Field, Header, Money, Pill, PrimaryButton, SecondaryButton, ui } from '../../components/ui';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { Booking, RootStackParamList } from '../../types';
import { issueLabel, labelStatus } from './HomeScreens';
import { Chip } from './RequestScreens';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

// B08 : bouton d'appel direct, avec confirmation et contrôle de la présence d'un numéro.
function callNumber(phone: string | undefined, label: string) {
  if (!phone) { Alert.alert('Numéro indisponible', `Le numéro de ${label} n’est pas renseigné.`); return; }
  Alert.alert(`Appeler ${label} ?`, phone, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Appeler', onPress: () => { void Linking.openURL(`tel:${phone}`); } },
  ]);
}

export function SearchingScreen({ navigation, route }: Props<'Searching'>) {
  const { setActive } = useBooking(); const [seconds, setSeconds] = useState(0); const [booking, setBooking] = useState<Booking | null>(null);
  useEffect(() => { const poll = async () => { try { const current = await api.booking(route.params.bookingId); setBooking(current); setActive(current); if (current.status === 'PROPOSED') navigation.replace('Proposal', { bookingId: current.id }); else if (!['SEARCHING', 'PAYMENT_PENDING'].includes(current.status)) navigation.replace('ClientTracking', { bookingId: current.id }); } catch { /* transitoire : le prochain sondage réessaiera */ } }; void poll(); const timer = setInterval(() => { setSeconds((s) => s + 5); void poll(); }, 5000); return () => clearInterval(timer); }, [route.params.bookingId]);
  async function schedule() { await api.cancel(route.params.bookingId, 'Reprogrammation demandée'); navigation.replace('Schedule'); }
  return <AppScreen scroll={false}><Header title="Recherche en cours" subtitle={booking?.reference} onBack={() => navigation.navigate('ClientHome')} /><View style={styles.searchArea}><View style={styles.radar}><View style={styles.radar2}><View style={styles.radar3}><Ionicons name="bicycle" size={35} color={colors.yellow} /></View></View></View><Text style={styles.title}>Nous contactons le dépanneur</Text><Text style={styles.center}>La demande est relancée automatiquement toutes les 2 minutes jusqu’à ce qu’il soit disponible.</Text><Pill label={`${Math.floor(seconds / 60)} min ${seconds % 60} s`} tone="yellow" /></View>
    <Card><View style={styles.row}><Ionicons name="checkmark-circle" color={colors.green} size={20} /><Text style={styles.itemText}>Demande et paiement validés</Text></View><View style={styles.row}><Ionicons name="sync" color={colors.yellow} size={20} /><Text style={styles.itemText}>Relance automatique active</Text></View><View style={styles.row}><Ionicons name="notifications" color={colors.muted} size={20} /><Text style={styles.itemText}>Vous serez averti immédiatement</Text></View></Card>
    <SecondaryButton title="Programmer pour plus tard" icon="calendar" onPress={schedule} /><SecondaryButton title="Annuler la demande" danger onPress={() => api.cancel(route.params.bookingId).then(() => navigation.replace('ClientHome')).catch((e) => Alert.alert('Annulation impossible', e instanceof Error ? e.message : 'Réessayez.'))} />
  </AppScreen>;
}

export function ProposalScreen({ navigation, route }: Props<'Proposal'>) {
  const { setActive } = useBooking(); const [booking, setBooking] = useState<Booking | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { const poll = async () => { try { const current = await api.booking(route.params.bookingId); setBooking(current); setActive(current); if (current.status === 'CANCELLED') navigation.replace('ClientHome'); else if (current.status !== 'PROPOSED') navigation.replace('ClientTracking', { bookingId: current.id }); } catch { /* transitoire : le prochain sondage réessaiera */ } }; void poll(); const timer = setInterval(poll, 5000); return () => clearInterval(timer); }, [route.params.bookingId]);
  async function accept() { try { setLoading(true); await api.acceptProposal(route.params.bookingId); navigation.replace('ClientHome'); } finally { setLoading(false); } }
  async function decline() { try { setLoading(true); await api.cancel(route.params.bookingId, 'Créneau proposé refusé'); navigation.replace('ClientHome'); } finally { setLoading(false); } }
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement…</Text></AppScreen>;
  const proposedDate = booking.proposedFor ? new Date(booking.proposedFor).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  return <AppScreen scroll={false} style={{ justifyContent: 'space-between' }}><Header title="Nouveau créneau proposé" subtitle={booking.reference} onBack={() => navigation.navigate('ClientHome')} />
    <View style={styles.searchArea}><Ionicons name="calendar" size={62} color={colors.yellow} /><Text style={styles.title}>Le dépanneur n’est pas disponible immédiatement</Text><Text style={styles.center}>Il propose de venir à :</Text><Card style={{ alignItems: 'center' }}><Text style={ui.optionTitle}>{proposedDate}</Text></Card></View>
    <View style={{ gap: 10 }}><PrimaryButton title="Accepter ce rendez-vous" tone="green" onPress={accept} loading={loading} /><SecondaryButton title="Refuser et annuler la demande" danger onPress={decline} /></View>
  </AppScreen>;
}

export function ClientTrackingScreen({ navigation, route }: Props<'ClientTracking'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null); const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null); const socket = useRef<Socket | null>(null);
  useEffect(() => { const load = async () => { try { const data = await api.booking(route.params.bookingId); setBooking(data); if (data.status === 'COMPLETED') navigation.replace('ClientCompleted', { bookingId: data.id }); } catch { /* transitoire : le prochain sondage réessaiera */ } }; void load(); const poll = setInterval(load, 5000); socket.current = io(API_URL, { auth: { token } }); socket.current.emit('booking:join', route.params.bookingId); socket.current.on('location:updated', setDriverLocation); return () => { clearInterval(poll); socket.current?.disconnect(); }; }, [route.params.bookingId]);
  if (!booking) return <AppScreen scroll={false}><View style={styles.searchArea}><Text style={ui.muted}>Chargement du suivi…</Text></View></AppScreen>;
  const lat = driverLocation?.latitude ?? booking.pickupLatitude; const lng = driverLocation?.longitude ?? booking.pickupLongitude;
  return <AppScreen><Header title="Suivi en direct" subtitle={booking.reference} onBack={() => navigation.navigate('ClientHome')} /><View style={styles.mapWrap}><MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: .08, longitudeDelta: .08 }}><Marker coordinate={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }} title="Votre position" pinColor={colors.red} />{driverLocation ? <Marker coordinate={driverLocation} title="Dépanneur"><View style={styles.driverMarker}><Ionicons name="construct" color={colors.bg} size={19} /></View></Marker> : null}</MapView><View style={styles.mapStatus}><Pill label={labelStatus(booking.status)} tone="green" /></View></View>
    <Card><View style={styles.driver}><View style={styles.driverAvatar}><Text style={styles.driverLetter}>M</Text></View><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{booking.driver?.firstName ?? 'Votre dépanneur'}</Text><Text style={ui.muted}>Professionnel Mehdi Dépannage • ★ 4,9</Text></View></View><View style={styles.actionsRow}><SecondaryButton title="Message" icon="chatbubble" onPress={() => navigation.navigate('Chat', { bookingId: booking.id })} /><SecondaryButton title="Appeler" icon="call" onPress={() => callNumber(booking.driver?.phone, 'votre dépanneur')} /></View></Card>
    {booking.status === 'SCHEDULED' ? <SecondaryButton title="Modifier le rendez-vous" icon="calendar" onPress={() => navigation.navigate('AppointmentChange', { bookingId: booking.id })} /> : null}
    {(booking.status === 'PICKED_UP' || booking.status === 'IN_TRANSIT') ? <SecondaryButton title="Demander l’annulation" danger icon="close-circle" onPress={() => navigation.navigate('PostPickupCancellation', { bookingId: booking.id })} /> : null}
    {booking.status === 'DELIVERED' && booking.paymentMethod === 'CASH' ? <SecondaryButton title="Payer par carte" icon="card" onPress={() => navigation.navigate('PaymentFallback', { bookingId: booking.id })} /> : null}
    <Timeline status={booking.status} />
  </AppScreen>;
}

// Modification de rendez-vous (client) : propose un nouveau créneau, l'ancien reste valide tant
// que le dépanneur n'a pas tranché.
export function AppointmentChangeScreen({ navigation, route }: Props<'AppointmentChange'>) {
  const [day, setDay] = useState(1); const [hour, setHour] = useState(12); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false);
  async function submit() {
    try {
      setLoading(true);
      const date = new Date(); date.setDate(date.getDate() + day); date.setHours(hour, 0, 0, 0);
      await api.requestAppointmentChange(route.params.bookingId, date.toISOString());
      setSent(true);
    } catch (e) { Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  if (sent) return <AppScreen><Header title="Modifier le rendez-vous" onBack={() => navigation.goBack()} /><Card style={{ alignItems: 'center' }}><Ionicons name="checkmark-circle" size={48} color={colors.green} /><Text style={ui.optionTitle}>Demande envoyée</Text><Text style={ui.muted}>Le dépanneur doit encore l’accepter. Votre rendez-vous actuel reste valable en attendant.</Text></Card><SecondaryButton title="Retour" onPress={() => navigation.goBack()} /></AppScreen>;
  return <AppScreen><Header title="Modifier le rendez-vous" subtitle="Proposez un nouveau créneau" onBack={() => navigation.goBack()} />
    <Card><Text style={ui.label}>Jour</Text><View style={styles.chips}>{[{ d: 1, t: 'Demain' }, { d: 2, t: 'Après-demain' }, { d: 7, t: 'Dans 7 jours' }].map((x) => <Chip key={x.d} text={x.t} active={day === x.d} onPress={() => setDay(x.d)} />)}</View><Text style={ui.label}>Créneau souhaité</Text><View style={styles.chips}>{[9, 12, 15, 18].map((h) => <Chip key={h} text={`${h}h00`} active={hour === h} onPress={() => setHour(h)} />)}</View></Card>
    <Text style={ui.muted}>Le dépanneur doit accepter ce nouveau créneau. Votre rendez-vous actuel reste valable en attendant sa réponse.</Text>
    <PrimaryButton title="Envoyer la demande" onPress={submit} loading={loading} />
  </AppScreen>;
}

// Annulation après prise en charge (§2.6) : le client soumet une demande, le dépanneur décide.
export function PostPickupCancellationScreen({ navigation, route }: Props<'PostPickupCancellation'>) {
  const [reason, setReason] = useState(''); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false);
  async function submit() {
    try { setLoading(true); await api.requestPostPickupCancellation(route.params.bookingId, reason.trim() || undefined); setSent(true); }
    catch (e) { Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  if (sent) return <AppScreen><Header title="Demande d’annulation" onBack={() => navigation.goBack()} /><Card style={{ alignItems: 'center' }}><Ionicons name="checkmark-circle" size={48} color={colors.green} /><Text style={ui.optionTitle}>Demande envoyée</Text><Text style={ui.muted}>Le dépanneur va l’examiner. La livraison se poursuit normalement en attendant sa réponse.</Text></Card><SecondaryButton title="Retour" onPress={() => navigation.goBack()} /></AppScreen>;
  return <AppScreen><Header title="Demander l’annulation" subtitle="La moto a déjà été prise en charge" onBack={() => navigation.goBack()} />
    <Card><Text style={ui.muted}>Votre demande sera transmise au dépanneur, qui pourra l’accepter (avec une nouvelle destination) ou la refuser et poursuivre la livraison prévue.</Text></Card>
    <Field label="Motif (facultatif)" value={reason} onChangeText={setReason} placeholder="Expliquez votre demande…" multiline />
    <PrimaryButton title="Envoyer la demande" tone="red" onPress={submit} loading={loading} />
  </AppScreen>;
}

// Bascule espèces → carte (§2.x) : le client règle dans l'application quand il n'a pas assez
// d'espèces sur place, en réutilisant le même flux Stripe que la réservation initiale.
export function PaymentFallbackScreen({ navigation, route }: Props<'PaymentFallback'>) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  async function pay() {
    try {
      setLoading(true);
      const payment = await api.paymentFallback(route.params.bookingId);
      if (!payment.clientSecret.startsWith('demo_')) {
        const init = await initPaymentSheet({ merchantDisplayName: 'Mehdi Dépannage', paymentIntentClientSecret: payment.clientSecret, returnURL: 'mehdi-depannage://stripe-redirect', applePay: { merchantCountryCode: 'FR' }, googlePay: { merchantCountryCode: 'FR', testEnv: true }, style: 'alwaysDark' });
        if (init.error) throw new Error(init.error.message);
        const result = await presentPaymentSheet();
        if (result.error) throw new Error(result.error.message);
      }
      await api.confirmPaymentFallback(route.params.bookingId);
      navigation.goBack();
    } catch (e) { Alert.alert('Paiement impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  return <AppScreen><Header title="Payer par carte" subtitle="Espèces insuffisantes" onBack={() => navigation.goBack()} />
    <Card style={{ alignItems: 'center', paddingVertical: 24 }}><Ionicons name="card" size={48} color={colors.yellow} /><Text style={ui.optionTitle}>Réglez le solde par carte</Text><Text style={[ui.muted, { textAlign: 'center' }]}>Le dépanneur ne recevra plus d’espèces pour cette mission ; le paiement se termine ici, de façon sécurisée.</Text></Card>
    <PrimaryButton title="Payer par carte" icon="card" onPress={pay} loading={loading} />
  </AppScreen>;
}

function Timeline({ status }: { status: string }) { const steps = [['DRIVER_EN_ROUTE', 'Dépanneur en route'], ['DRIVER_ARRIVED', 'Dépanneur sur place'], ['PICKED_UP', 'Moto prise en charge'], ['IN_TRANSIT', 'Transport en cours'], ['DELIVERED', 'Moto livrée']]; const order = steps.findIndex((x) => x[0] === status); return <Card>{steps.map((step, i) => <View key={step[0]} style={styles.timelineRow}><View style={[styles.timelineDot, i <= order && { backgroundColor: colors.green, borderColor: colors.green }]}>{i <= order ? <Ionicons name="checkmark" color={colors.bg} size={13} /> : null}</View><Text style={[styles.itemText, i > order && { color: colors.muted }]}>{step[1]}</Text></View>)}</Card>; }

export function ClientCompletedScreen({ navigation, route }: Props<'ClientCompleted'>) {
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(''); const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  async function submit() {
    try { setSending(true); await api.review(route.params.bookingId, rating, comment.trim() || undefined); setSent(true); }
    catch (e) { Alert.alert('Avis non envoyé', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setSending(false); }
  }
  return <AppScreen><View style={styles.success}><View style={styles.successIcon}><Ionicons name="checkmark" size={55} color={colors.white} /></View><Text style={styles.title}>Intervention terminée !</Text><Text style={styles.center}>Votre moto est arrivée à destination en toute sécurité.</Text></View>
    <Card style={{ alignItems: 'center' }}><Text style={ui.optionTitle}>Notez le service</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)}><Ionicons name={n <= rating ? 'star' : 'star-outline'} color={colors.yellow} size={34} /></Pressable>)}</View>{!sent ? <><Field value={comment} onChangeText={setComment} placeholder="Ajouter un commentaire (facultatif)" multiline /><PrimaryButton title="Envoyer mon avis" onPress={submit} loading={sending} /></> : <Pill label="Avis envoyé, merci !" tone="green" />}</Card>
    <PrimaryButton title="Voir la facture" icon="receipt" onPress={() => navigation.navigate('Invoice', { bookingId: route.params.bookingId })} /><SecondaryButton title="Retour à l’accueil" onPress={() => navigation.navigate('ClientHome')} />
  </AppScreen>;
}

export function InvoiceScreen({ navigation, route }: Props<'Invoice'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null); const [downloading, setDownloading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  async function download() { if (!booking || !token) return; try { setDownloading(true); const path = `${FileSystem.cacheDirectory}${booking.invoice?.number ?? booking.reference}.pdf`; const result = await FileSystem.downloadAsync(`${API_URL}/bookings/${booking.id}/invoice.pdf`, path, { headers: { Authorization: `Bearer ${token}` } }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Votre facture Mehdi Dépannage' }); } catch (e) { Alert.alert('Facture indisponible', e instanceof Error ? e.message : 'Réessayez.'); } finally { setDownloading(false); } }
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement…</Text></AppScreen>;
  return <AppScreen><Header title="Facture" subtitle={booking.invoice?.number ?? booking.reference} onBack={() => navigation.goBack()} /><Card style={styles.invoice}><Text style={styles.invoiceBrand}>MEHDI DÉPANNAGE</Text><Text style={ui.muted}>{new Date(booking.completedAt ?? booking.createdAt).toLocaleDateString('fr-FR')}</Text><View style={styles.invoiceLine} /><Text style={ui.optionTitle}>{issueLabel(booking.issueType)}</Text><Text style={ui.muted}>{booking.pickupAddress}</Text><Ionicons name="arrow-down" color={colors.muted} size={18} /><Text style={ui.muted}>{booking.destinationAddress}</Text><View style={styles.invoiceLine} /><Text style={ui.muted}>TOTAL TTC</Text><Money cents={booking.finalPriceCents ?? booking.estimatedPriceCents} size={36} /><Pill label="PAYÉ" tone="green" /></Card><PrimaryButton title="Télécharger / partager le PDF" icon="download" onPress={download} loading={downloading} /><SecondaryButton title="Retour à l’historique" onPress={() => navigation.navigate('ClientHistory')} /></AppScreen>;
}

const styles = StyleSheet.create({
  searchArea: { flex: 1, minHeight: 300, justifyContent: 'center', alignItems: 'center', gap: 15 }, radar: { width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: '#5A4A00', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151509' }, radar2: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: '#8A7000', alignItems: 'center', justifyContent: 'center' }, radar3: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontWeight: '900', fontSize: 24, textAlign: 'center' }, center: { color: colors.muted, lineHeight: 20, textAlign: 'center', maxWidth: 300 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, itemText: { color: colors.text, fontWeight: '600', flex: 1 },
  mapWrap: { height: 280, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }, mapStatus: { position: 'absolute', top: 12, left: 12 }, driverMarker: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.yellow, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, driver: { flexDirection: 'row', alignItems: 'center', gap: 12 }, driverAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, driverLetter: { color: colors.yellow, fontSize: 20, fontWeight: '900' }, actions: { marginTop: 4 }, actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 }, timelineDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  success: { alignItems: 'center', gap: 12, marginVertical: 20 }, successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, stars: { flexDirection: 'row', gap: 5 }, comment: { backgroundColor: colors.bg, borderRadius: 10, padding: 14, width: '100%' }, invoice: { alignItems: 'center', paddingVertical: 28 }, invoiceBrand: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, invoiceLine: { height: 1, backgroundColor: colors.border, width: '100%', marginVertical: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
