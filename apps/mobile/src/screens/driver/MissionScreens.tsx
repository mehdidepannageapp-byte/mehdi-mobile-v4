import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { io, type Socket } from 'socket.io-client';
import { AppScreen, Card, Field, Header, Money, OptionCard, Pill, PrimaryButton, SecondaryButton, SectionTitle, ToggleRow, ui } from '../../components/ui';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { Booking, BookingStatus, RootStackParamList } from '../../types';
import { issueLabel } from '../client/HomeScreens';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export function MissionOfferScreen({ navigation, route }: Props<'MissionOffer'>) {
  const [booking, setBooking] = useState<Booking | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  async function accept() { try { setLoading(true); await api.updateStatus(route.params.bookingId, 'DRIVER_EN_ROUTE'); navigation.replace('DriverNavigation', { bookingId: route.params.bookingId }); } finally { setLoading(false); } }
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement de la mission…</Text></AppScreen>;
  return <AppScreen><Header title="Nouvelle mission" subtitle="Répondez rapidement" onBack={() => navigation.goBack()} /><View style={styles.bell}><Ionicons name="notifications" size={44} color={colors.bg} /></View><Card style={{ borderColor: colors.yellow }}><View style={styles.between}><Pill label="NOUVELLE DEMANDE" tone="yellow" /><Money cents={booking.estimatedPriceCents} size={22} /></View><Text style={styles.title}>{issueLabel(booking.issueType)}</Text><Info icon="location" text={booking.pickupAddress} />{booking.serviceType === 'ON_SITE_REPAIR' ? <Info icon="build" text="Réparation sur place" /> : <Info icon="navigate" text={`${(booking.distanceKm ?? 0).toFixed(1)} km de transport`} />}<Info icon="person" text={booking.client?.firstName ?? 'Client'} /><Info icon="bicycle" text={booking.vehicle ? `${booking.vehicle.brand} ${booking.vehicle.model}` : 'Moto'} /></Card><PrimaryButton title="Accepter la mission" tone="green" onPress={accept} loading={loading} /><PrimaryButton title="Refuser" tone="red" onPress={() => navigation.navigate('RefusalDelay', { bookingId: route.params.bookingId })} /></AppScreen>;
}

const refusalDelays: Array<{ minutes: 30 | 60 | 90; title: string; subtitle: string }> = [
  { minutes: 30, title: 'Dans 30 minutes', subtitle: 'Proposer un rendez-vous très prochain' },
  { minutes: 60, title: 'Dans 1 heure', subtitle: 'Proposer un rendez-vous dans l’heure' },
  { minutes: 90, title: 'Dans 1h30', subtitle: 'Proposer un rendez-vous un peu plus tard' },
];

export function RefusalDelayScreen({ navigation, route }: Props<'RefusalDelay'>) {
  const [selected, setSelected] = useState<30 | 60 | 90 | null>(null);
  const [loading, setLoading] = useState(false);
  async function confirm() {
    if (!selected) return;
    try { setLoading(true); await api.refuse(route.params.bookingId, selected); navigation.replace('DriverHome'); }
    finally { setLoading(false); }
  }
  return <AppScreen><Header title="Proposer un créneau" subtitle="Dans combien de temps pouvez-vous intervenir ?" onBack={() => navigation.goBack()} />
    {refusalDelays.map((delay) => <OptionCard key={delay.minutes} icon="time" title={delay.title} subtitle={delay.subtitle} selected={selected === delay.minutes} onPress={() => setSelected(delay.minutes)} />)}
    <Text style={ui.muted}>Le client verra l’heure précise et devra confirmer ce rendez-vous.</Text>
    <PrimaryButton title="Envoyer la proposition" tone="red" onPress={confirm} loading={loading} disabled={!selected} />
  </AppScreen>;
}

export function DriverNavigationScreen({ navigation, route }: Props<'DriverNavigation'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null);
  useDriverLocation(route.params.bookingId, token);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  if (!booking) return <AppScreen><Text style={ui.muted}>Préparation de l’itinéraire…</Text></AppScreen>;
  const mission = booking;
  async function openNavigation(preferWaze: boolean) { const lat = mission.pickupLatitude; const lng = mission.pickupLongitude; const waze = `waze://?ll=${lat},${lng}&navigate=yes`; const apple = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`; const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`; if (preferWaze && await Linking.canOpenURL(waze)) return Linking.openURL(waze); return Linking.openURL(Platform.OS === 'ios' ? apple : google); }
  return <AppScreen><Header title="Vers le client" subtitle={booking.reference} onBack={() => navigation.navigate('DriverHome')} /><View style={styles.map}><MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude, latitudeDelta: .08, longitudeDelta: .08 }}><Marker coordinate={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }} title="Client" /></MapView></View><Card><Info icon="location" text={booking.pickupAddress} /><Info icon="person" text={booking.client?.firstName ?? 'Client'} /></Card><PrimaryButton title="Démarrer avec Waze" icon="navigate" onPress={() => openNavigation(true)} /><SecondaryButton title={Platform.OS === 'ios' ? 'Ouvrir dans Plans' : 'Ouvrir dans Google Maps'} icon="map" onPress={() => openNavigation(false)} /><SecondaryButton title="Message au client" icon="chatbubble" onPress={() => navigation.navigate('Chat', { bookingId: booking.id })} /><PrimaryButton title="Je suis arrivé" tone="green" onPress={async () => { await api.updateStatus(booking.id, 'DRIVER_ARRIVED'); navigation.replace('DriverArrival', { bookingId: booking.id }); }} /></AppScreen>;
}

export function DriverArrivalScreen({ navigation, route }: Props<'DriverArrival'>) {
  const [booking, setBooking] = useState<Booking | null>(null);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  const onSite = booking?.serviceType === 'ON_SITE_REPAIR';
  async function confirmArrival() {
    // Si la mission n'a pas fini de charger, on attend la vraie valeur pour ne jamais aiguiller
    // une réparation sur place vers le flux transport (ou l'inverse) par défaut optimiste.
    const current = booking ?? await api.booking(route.params.bookingId);
    if (current.serviceType === 'ON_SITE_REPAIR') navigation.navigate('OnSiteRepair', { bookingId: route.params.bookingId });
    else navigation.navigate('PickupPhotos', { bookingId: route.params.bookingId });
  }
  return <AppScreen scroll={false} style={{ justifyContent: 'space-between' }}><Header title="Arrivée sur place" subtitle="Confirmez la prise en charge" onBack={() => navigation.goBack()} /><View style={styles.center}><View style={styles.pin}><Ionicons name="location" size={55} color={colors.yellow} /></View><Text style={styles.title}>Vous êtes arrivé sur place</Text><Text style={styles.centerText}>Prévenez le client dans la messagerie si vous ne le trouvez pas.</Text></View><View style={{ gap: 10 }}><SecondaryButton title="Contacter dans l’application" icon="chatbubble" onPress={() => navigation.navigate('Chat', { bookingId: route.params.bookingId })} /><SecondaryButton title="Le client est absent" danger icon="alert-circle" onPress={() => navigation.navigate('DriverAbsence', { bookingId: route.params.bookingId })} /><PrimaryButton title="Confirmer l’arrivée" onPress={confirmArrival} /></View></AppScreen>;
}

export function PickupPhotosScreen({ navigation, route }: Props<'PickupPhotos'>) {
  const [photos, setPhotos] = useState<string[]>([]); const [loading, setLoading] = useState(false);
  async function pick() { const result = await ImagePicker.launchCameraAsync({ quality: .75 }); if (!result.canceled) setPhotos((old) => [...old, result.assets[0]!.uri]); }
  async function next() { try { setLoading(true); for (const uri of photos) await api.uploadPhoto(route.params.bookingId, 'PICKUP', uri); await api.updateStatus(route.params.bookingId, 'PICKED_UP'); navigation.replace('Transport', { bookingId: route.params.bookingId }); } finally { setLoading(false); } }
  return <AppScreen><Header title="Prise en charge" subtitle="Photos facultatives" onBack={() => navigation.goBack()} /><Text style={ui.muted}>Photographiez la moto si vous souhaitez documenter son état avant chargement. Cette étape peut être ignorée.</Text><View style={styles.photos}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}<Pressable onPress={pick} style={styles.photoAdd}><Ionicons name="camera" size={31} color={colors.yellow} /><Text style={styles.yellow}>Prendre une photo</Text></Pressable></View><PrimaryButton title={photos.length ? 'Valider et charger la moto' : 'Continuer sans photo'} onPress={next} loading={loading} /></AppScreen>;
}

export function TransportScreen({ navigation, route }: Props<'Transport'>) {
  const { token } = useAuth(); const [booking, setBooking] = useState<Booking | null>(null); const [started, setStarted] = useState(false); useDriverLocation(route.params.bookingId, token);
  useEffect(() => { api.booking(route.params.bookingId).then((b) => { setBooking(b); setStarted(b.status === 'IN_TRANSIT'); }).catch(() => undefined); }, []);
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement…</Text></AppScreen>;
  const mission = booking;
  async function openDestination() { const lat = mission.destinationLatitude; const lng = mission.destinationLongitude; const waze = `waze://?ll=${lat},${lng}&navigate=yes`; if (await Linking.canOpenURL(waze)) return Linking.openURL(waze); return Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`); }
  async function start() { await api.updateStatus(mission.id, 'IN_TRANSIT'); setStarted(true); await openDestination(); }
  const pendingCancellation = booking.postPickupCancellationRequests?.find((r) => r.status === 'PENDING');
  return <AppScreen><Header title="Chargement & transport" subtitle={booking.reference} onBack={() => navigation.navigate('DriverHome')} /><View style={styles.transportHero}><Ionicons name="car-sport" size={72} color={colors.yellow} /><Pill label={started ? 'TRANSPORT EN COURS' : 'MOTO CHARGÉE'} tone={started ? 'green' : 'yellow'} /></View>
    {pendingCancellation ? <Card style={{ borderColor: colors.red }}><View style={styles.between}><Pill label="DEMANDE DU CLIENT" tone="red" /><Ionicons name="chevron-forward" size={20} color={colors.text} /></View><Text style={ui.muted}>Le client souhaite annuler après la prise en charge.</Text><PrimaryButton title="Traiter la demande" tone="red" onPress={() => navigation.navigate('PostPickupCancellationDecision', { bookingId: booking.id })} /></Card> : null}
    <Card><Step done text="Dépanneur sur place" /><Step done text="Moto chargée" /><Step done={started} text="Transport vers la destination" /><Step text="Livraison au client / garage" /></Card><Card><Text style={ui.label}>DESTINATION</Text><Text style={ui.optionTitle}>{booking.destinationAddress}</Text></Card>{started ? <PrimaryButton title="Arrivé à destination" tone="green" onPress={() => navigation.navigate('Delivery', { bookingId: booking.id })} /> : <PrimaryButton title="Démarrer le transport" icon="navigate" onPress={start} />}<SecondaryButton title="Ajouter un supplément" icon="pricetag" onPress={() => navigation.navigate('ApplySurcharge', { bookingId: booking.id })} /><SecondaryButton title="Signaler un problème" danger icon="warning" onPress={() => navigation.navigate('ReportIncident', { bookingId: booking.id })} /></AppScreen>;
}

const incidentTypes = ['Panne pendant le transport', 'Problème avec le client', 'Accident / chute', 'Autre problème'];

// B03 : incident réellement persisté (remplace l'ancienne alerte locale factice).
export function ReportIncidentScreen({ navigation, route }: Props<'ReportIncident'>) {
  const [type, setType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!type) return;
    try {
      setLoading(true);
      await api.createIncident(route.params.bookingId, type, description.trim() || undefined);
      Alert.alert('Incident signalé', 'Le support a été averti.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez.');
    } finally { setLoading(false); }
  }
  return <AppScreen><Header title="Signaler un problème" subtitle="Décrivez la situation" onBack={() => navigation.goBack()} />
    {incidentTypes.map((t) => <OptionCard key={t} icon="warning" title={t} selected={type === t} onPress={() => setType(t)} tone="red" />)}
    <Field label="Détails (facultatif)" value={description} onChangeText={setDescription} placeholder="Précisez la situation…" multiline />
    <PrimaryButton title="Envoyer" tone="red" onPress={submit} loading={loading} disabled={!type} />
  </AppScreen>;
}

// B12 : après diagnostic sur place, le dépanneur clôture directement (pas d'étape de transport)
// ou bascule la mission vers un transport si la réparation s'avère impossible.
export function OnSiteRepairScreen({ navigation, route }: Props<'OnSiteRepair'>) {
  const [booking, setBooking] = useState<Booking | null>(null); const [cashReceived, setCashReceived] = useState(false); const [loading, setLoading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  async function complete() {
    try {
      setLoading(true);
      await api.updateStatus(route.params.bookingId, 'COMPLETED', { cashReceived: booking?.paymentMethod === 'CASH' ? cashReceived : undefined });
      navigation.replace('MissionSummary', { bookingId: route.params.bookingId });
    } catch (e) { Alert.alert('Mission non terminée', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  if (!booking) return <AppScreen><Text style={ui.muted}>Chargement…</Text></AppScreen>;
  return <AppScreen><Header title="Réparation sur place" subtitle="Diagnostic effectué" onBack={() => navigation.goBack()} /><View style={styles.success}><Ionicons name="build" size={72} color={colors.yellow} /><Text style={styles.title}>La réparation est-elle possible ici ?</Text></View>
    {booking.paymentMethod === 'CASH' ? <ToggleRow title="Paiement en espèces reçu" subtitle={`${(booking.estimatedPriceCents / 100).toFixed(2)} € remis par le client`} value={cashReceived} onValueChange={setCashReceived} /> : <Card><Info icon="card" text="Paiement par carte préautorisé" /></Card>}
    <PrimaryButton title="Réparation réussie" tone="green" icon="checkmark-circle" onPress={complete} loading={loading} disabled={booking.paymentMethod === 'CASH' && !cashReceived} />
    <SecondaryButton title="Transport nécessaire" icon="car-sport" onPress={() => navigation.navigate('ConvertToTransport', { bookingId: route.params.bookingId })} />
  </AppScreen>;
}

// B12 : bascule la mission vers un transport et recalcule le prix côté serveur.
export function ConvertToTransportScreen({ navigation, route }: Props<'ConvertToTransport'>) {
  const [destination, setDestination] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState('5');
  const [loading, setLoading] = useState(false);
  const [garages, setGarages] = useState<Awaited<ReturnType<typeof api.garages>>>([]);
  useEffect(() => { api.garages().then(setGarages).catch(() => undefined); }, []);
  const km = Number(distanceKm.replace(',', '.'));
  const validKm = Number.isFinite(km) && km > 0;
  async function confirm() {
    if (!destination || !validKm) return;
    try {
      setLoading(true);
      await api.convertToTransport(route.params.bookingId, destination, km);
      navigation.replace('PickupPhotos', { bookingId: route.params.bookingId });
    } catch (e) { Alert.alert('Conversion impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  return <AppScreen><Header title="Transporter la moto" subtitle="Choisissez la destination" onBack={() => navigation.goBack()} />
    {garages.map((g) => <OptionCard key={g.id} icon="business" title={g.name} subtitle={g.address} selected={destination?.address === g.address} onPress={() => setDestination({ address: g.address, latitude: g.latitude, longitude: g.longitude })} />)}
    <Field label="Distance estimée (km)" value={distanceKm} onChangeText={setDistanceKm} keyboardType="numeric" icon="navigate" />
    <PrimaryButton title="Confirmer le transport" onPress={confirm} loading={loading} disabled={!destination || !validKm} />
  </AppScreen>;
}

const contactMethods: Array<{ value: 'CALL' | 'MESSAGE'; icon: keyof typeof Ionicons.glyphMap; title: string }> = [
  { value: 'CALL', icon: 'call', title: 'Appeler le client' }, { value: 'MESSAGE', icon: 'chatbubble', title: 'Envoyer un message' },
];

// Déclaration d'absence (§2.x) : trace les tentatives de contact, puis facture 50% du devis si le
// client reste injoignable.
export function DriverAbsenceScreen({ navigation, route }: Props<'DriverAbsence'>) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [attempts, setAttempts] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then((b) => { setBooking(b); setAttempts(b.contactAttempts?.length ?? 0); }).catch(() => undefined); }, []);
  async function contact(method: 'CALL' | 'MESSAGE') {
    try {
      await api.contactAttempt(route.params.bookingId, method);
      setAttempts((n) => n + 1);
      if (method === 'CALL' && booking?.client?.phone) void Linking.openURL(`tel:${booking.client.phone}`);
      else if (method === 'MESSAGE') navigation.navigate('Chat', { bookingId: route.params.bookingId });
    } catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); }
  }
  async function declare() {
    if (!reason.trim()) return;
    try {
      setLoading(true);
      await api.declareAbsence(route.params.bookingId, reason.trim());
      Alert.alert('Absence déclarée', 'Des frais de 50% du devis ont été appliqués.', [{ text: 'OK', onPress: () => navigation.replace('DriverHome') }]);
    } catch (e) { Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  return <AppScreen><Header title="Client absent" subtitle="Tentez de le joindre avant de déclarer une absence" onBack={() => navigation.goBack()} />
    {contactMethods.map((m) => <OptionCard key={m.value} icon={m.icon} title={m.title} onPress={() => void contact(m.value)} />)}
    <Card><Text style={ui.muted}>{attempts} tentative{attempts > 1 ? 's' : ''} de contact enregistrée{attempts > 1 ? 's' : ''}.</Text></Card>
    <SectionTitle>Déclarer l’absence</SectionTitle>
    <Text style={ui.muted}>Des frais de 50% du devis accepté seront appliqués et la mission sera annulée.</Text>
    <Field label="Motif" value={reason} onChangeText={setReason} placeholder="Client injoignable après plusieurs tentatives…" multiline />
    <PrimaryButton title="Déclarer l’absence" tone="red" onPress={declare} loading={loading} disabled={!reason.trim()} />
  </AppScreen>;
}

const surchargeCategories: Array<{ value: 'DESTINATION_CHANGE' | 'EXTRA_DISTANCE' | 'NIGHT' | 'SUNDAY' | 'HOLIDAY'; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }> = [
  { value: 'DESTINATION_CHANGE', icon: 'location', title: 'Changement de destination', subtitle: 'Montant fixe de la grille' },
  { value: 'EXTRA_DISTANCE', icon: 'navigate', title: 'Distance supplémentaire', subtitle: 'Facturée au kilomètre de la grille' },
  { value: 'NIGHT', icon: 'moon', title: 'Supplément nuit', subtitle: 'Pourcentage du montant en cours' },
  { value: 'SUNDAY', icon: 'calendar', title: 'Supplément dimanche', subtitle: 'Pourcentage du montant en cours' },
  { value: 'HOLIDAY', icon: 'sparkles', title: 'Supplément jour férié', subtitle: 'Pourcentage du montant en cours' },
];

// Supplément appliqué strictement depuis la grille tarifaire (§2.5) : le montant est calculé et
// tracé côté serveur, jamais saisi librement.
export function ApplySurchargeScreen({ navigation, route }: Props<'ApplySurcharge'>) {
  const [category, setCategory] = useState<typeof surchargeCategories[number]['value'] | null>(null);
  const [extraKm, setExtraKm] = useState('2');
  const [loading, setLoading] = useState(false);
  const km = Number(extraKm.replace(',', '.'));
  const validKm = category !== 'EXTRA_DISTANCE' || (Number.isFinite(km) && km > 0);
  async function apply() {
    if (!category || !validKm) return;
    try {
      setLoading(true);
      await api.applySurcharge(route.params.bookingId, category, category === 'EXTRA_DISTANCE' ? km : undefined);
      Alert.alert('Supplément appliqué', 'Le client en a été informé.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  return <AppScreen><Header title="Ajouter un supplément" subtitle="Selon la grille tarifaire" onBack={() => navigation.goBack()} />
    {surchargeCategories.map((c) => <OptionCard key={c.value} icon={c.icon} title={c.title} subtitle={c.subtitle} selected={category === c.value} onPress={() => setCategory(c.value)} />)}
    {category === 'EXTRA_DISTANCE' ? <Field label="Kilomètres supplémentaires" value={extraKm} onChangeText={setExtraKm} keyboardType="numeric" icon="navigate" /> : null}
    <PrimaryButton title="Appliquer le supplément" onPress={apply} loading={loading} disabled={!category || !validKm} />
  </AppScreen>;
}

// Le client a demandé l'annulation après la prise en charge : le dépanneur accepte (avec une
// nouvelle destination, facturée via la grille) ou refuse et poursuit la livraison prévue.
export function PostPickupCancellationDecisionScreen({ navigation, route }: Props<'PostPickupCancellationDecision'>) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [destination, setDestination] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [garages, setGarages] = useState<Awaited<ReturnType<typeof api.garages>>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); api.garages().then(setGarages).catch(() => undefined); }, []);
  const request = booking?.postPickupCancellationRequests?.find((r) => r.status === 'PENDING');
  async function accept() {
    if (!request || !destination) return;
    try { setLoading(true); await api.acceptPostPickupCancellation(route.params.bookingId, request.id, destination); navigation.goBack(); }
    catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  async function reject() {
    if (!request) return;
    try { setLoading(true); await api.rejectPostPickupCancellation(route.params.bookingId, request.id); navigation.goBack(); }
    catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setLoading(false); }
  }
  if (!booking || !request) return <AppScreen><Header title="Demande du client" onBack={() => navigation.goBack()} /><Text style={ui.muted}>Aucune demande en attente.</Text></AppScreen>;
  return <AppScreen><Header title="Demande du client" subtitle="Annulation après prise en charge" onBack={() => navigation.goBack()} />
    <Card><Text style={ui.optionTitle}>{booking.client?.firstName ?? 'Le client'} souhaite annuler</Text>{request.reason ? <Text style={ui.muted}>{request.reason}</Text> : null}</Card>
    <SectionTitle>Accepter avec une nouvelle destination</SectionTitle>
    {garages.map((g) => <OptionCard key={g.id} icon="business" title={g.name} subtitle={g.address} selected={destination?.address === g.address} onPress={() => setDestination({ address: g.address, latitude: g.latitude, longitude: g.longitude })} />)}
    <Text style={ui.muted}>Un supplément « changement de destination » de la grille sera appliqué.</Text>
    <PrimaryButton title="Accepter et fixer la destination" tone="green" onPress={accept} loading={loading} disabled={!destination} />
    <SecondaryButton title="Refuser et poursuivre la livraison" danger onPress={reject} />
  </AppScreen>;
}

export function DeliveryScreen({ navigation, route }: Props<'Delivery'>) {
  const [photos, setPhotos] = useState<string[]>([]); const [loading, setLoading] = useState(false); const [booking, setBooking] = useState<Booking | null>(null); const [cashReceived, setCashReceived] = useState(false);
  useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  async function pick() { const result = await ImagePicker.launchCameraAsync({ quality: .75 }); if (!result.canceled) setPhotos((old) => [...old, result.assets[0]!.uri]); }
  async function finish() { try { setLoading(true); await api.updateStatus(route.params.bookingId, 'DELIVERED'); for (const uri of photos) await api.uploadPhoto(route.params.bookingId, 'DELIVERY', uri); await api.updateStatus(route.params.bookingId, 'COMPLETED', { cashReceived: booking?.paymentMethod === 'CASH' ? cashReceived : undefined }); navigation.replace('MissionSummary', { bookingId: route.params.bookingId }); } catch (e) { Alert.alert('Mission non terminée', e instanceof Error ? e.message : 'Réessayez.'); } finally { setLoading(false); } }
  return <AppScreen><Header title="Livraison" subtitle="Dernière étape" onBack={() => navigation.goBack()} /><View style={styles.success}><Ionicons name="checkmark-circle" size={88} color={colors.green} /><Text style={styles.title}>Moto livrée</Text><Text style={styles.centerText}>Confirmez que la moto est arrivée à la destination prévue.</Text></View>{booking?.paymentMethod === 'CASH' ? <ToggleRow title="Paiement en espèces reçu" subtitle={`${((booking.finalPriceCents ?? booking.estimatedPriceCents) / 100).toFixed(2)} € remis par le client`} value={cashReceived} onValueChange={setCashReceived} /> : <Card><Info icon="card" text="Paiement par carte préautorisé" /></Card>}<SectionTitle>Photo de livraison (obligatoire)</SectionTitle><Text style={ui.muted}>Au moins une photo est requise avant de clôturer la mission.</Text><View style={styles.photos}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}<Pressable onPress={pick} style={styles.photoAdd}><Ionicons name="camera" size={28} color={colors.yellow} /><Text style={styles.yellow}>Ajouter</Text></Pressable></View><PrimaryButton title="Terminer la mission" tone="green" onPress={finish} loading={loading} disabled={(booking?.paymentMethod === 'CASH' && !cashReceived) || photos.length === 0} /></AppScreen>;
}

export function MissionSummaryScreen({ navigation, route }: Props<'MissionSummary'>) {
  const [booking, setBooking] = useState<Booking | null>(null); useEffect(() => { api.booking(route.params.bookingId).then(setBooking).catch(() => undefined); }, []);
  return <AppScreen><View style={styles.success}><Ionicons name="checkmark-circle" size={88} color={colors.green} /><Text style={styles.title}>Mission terminée</Text><Text style={styles.centerText}>Le client a été informé et le paiement a été déclenché.</Text></View>{booking ? <Card><View style={styles.between}><Text style={ui.muted}>Mission</Text><Text style={ui.optionTitle}>{booking.reference}</Text></View><View style={styles.between}><Text style={ui.muted}>Montant</Text><Money cents={booking.finalPriceCents ?? booking.estimatedPriceCents} size={23} /></View><Info icon="receipt" text="Compte rendu et facture enregistrés" /><Info icon="images" text={`${booking.photos?.length ?? 0} photo(s) jointe(s)`} /></Card> : null}<PrimaryButton title="Retour aux missions" onPress={() => navigation.replace('DriverHome')} /></AppScreen>;
}

function useDriverLocation(bookingId: string, token: string | null) { const socket = useRef<Socket | null>(null); useEffect(() => { let subscription: Location.LocationSubscription | undefined; (async () => { const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') return; socket.current = io(API_URL, { auth: { token } }); socket.current.emit('booking:join', bookingId); subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 5000 }, (location) => socket.current?.emit('location:update', { bookingId, latitude: location.coords.latitude, longitude: location.coords.longitude, heading: location.coords.heading })); })(); return () => { subscription?.remove(); socket.current?.disconnect(); }; }, [bookingId, token]); }
function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { return <View style={styles.info}><Ionicons name={icon} size={20} color={colors.yellow} /><Text style={styles.infoText}>{text}</Text></View>; }
function Step({ text, done }: { text: string; done?: boolean }) { return <View style={styles.info}><Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={done ? colors.green : colors.muted} /><Text style={[styles.infoText, !done && { color: colors.muted }]}>{text}</Text></View>; }

const styles = StyleSheet.create({ bell: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, title: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }, info: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 31 }, infoText: { color: colors.text, flex: 1, fontWeight: '600' }, map: { height: 280, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, pin: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, centerText: { color: colors.muted, textAlign: 'center', lineHeight: 21 }, photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photo: { width: 95, height: 95, borderRadius: 12 }, photoAdd: { width: 120, height: 95, borderRadius: 12, borderWidth: 1, borderColor: colors.yellow, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 5 }, yellow: { color: colors.yellow, fontWeight: '700', fontSize: 12 }, transportHero: { alignItems: 'center', padding: 24, gap: 15 }, success: { alignItems: 'center', gap: 12, marginVertical: 20 } });
