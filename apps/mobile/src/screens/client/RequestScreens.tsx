import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStripe } from '@stripe/stripe-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Card, Field, Header, Money, OptionCard, Pill, PrimaryButton, SecondaryButton, SectionTitle, ui } from '../../components/ui';
import { useBooking } from '../../context/BookingContext';
import { api } from '../../services/api';
import { colors, radius, spacing } from '../../theme';
import type { Garage, IssueType, PaymentMethod, Place, RootStackParamList, ServiceType, Vehicle } from '../../types';
import { estimateRouteDistanceKm, isInServiceArea } from '../../utils/route';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export function LocationPermissionScreen({ navigation }: Props<'LocationPermission'>) {
  const { updateDraft } = useBooking(); const [loading, setLoading] = useState(false);
  async function locate() { try { setLoading(true); const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') { Alert.alert('Position refusée', 'Vous pourrez saisir votre adresse manuellement.'); navigation.navigate('IssueChoice'); return; } const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); const pickup = { latitude: current.coords.latitude, longitude: current.coords.longitude, address: 'Ma position actuelle' }; if (!isInServiceArea(pickup)) { updateDraft({ pickup: undefined, distanceKm: 0 }); Alert.alert('Position hors Île-de-France', 'Le simulateur iPhone peut être localisé aux États-Unis. Choisissez une adresse francilienne manuellement à l’étape du trajet.'); navigation.navigate('IssueChoice'); return; } const result = await Location.reverseGeocodeAsync(current.coords); const address = result[0]; updateDraft({ pickup: { ...pickup, address: [address?.streetNumber, address?.street, address?.postalCode, address?.city].filter(Boolean).join(' ') || pickup.address } }); navigation.navigate('IssueChoice'); } catch { Alert.alert('Position indisponible', 'Vous pourrez renseigner votre adresse manuellement.'); navigation.navigate('IssueChoice'); } finally { setLoading(false); } }
  return <AppScreen scroll={false} style={{ justifyContent: 'space-between' }}><Header title="Votre position" subtitle="Pour vous retrouver rapidement" onBack={() => navigation.goBack()} />
    <View style={styles.permission}><View style={styles.pinCircle}><Ionicons name="location" size={62} color={colors.yellow} /></View><Text style={styles.title}>Autoriser l’accès à votre position ?</Text><Text style={styles.centered}>Votre position permet de préremplir l’adresse de départ. Vous pourrez toujours la corriger.</Text></View>
    <View style={{ gap: 10 }}><PrimaryButton title="Autoriser la localisation" icon="locate" onPress={locate} loading={loading} /><SecondaryButton title="Saisir l’adresse manuellement" onPress={() => navigation.navigate('IssueChoice')} /></View>
  </AppScreen>;
}

const issues: Array<{ value: IssueType; icon: keyof typeof Ionicons.glyphMap; title: string }> = [
  { value: 'ENGINE', icon: 'warning', title: 'Panne moteur' }, { value: 'FLAT_TIRE', icon: 'disc', title: 'Crevaison' }, { value: 'BATTERY', icon: 'battery-dead', title: 'Batterie' },
  { value: 'ACCIDENT', icon: 'medkit', title: 'Accident / chute' }, { value: 'CHAIN', icon: 'link', title: 'Problème de chaîne' }, { value: 'OTHER', icon: 'ellipsis-horizontal', title: 'Autre problème' },
];
// B12 : la réparation sur place n'est proposée que pour ces pannes (§2.1). Pour les autres, la
// moto est transportée, sans qu'il soit nécessaire d'afficher le choix.
const onSiteRepairEligible: IssueType[] = ['BATTERY', 'FLAT_TIRE', 'CHAIN'];

export function IssueChoiceScreen({ navigation }: Props<'IssueChoice'>) {
  const { draft, updateDraft } = useBooking();
  const eligible = draft.issueType ? onSiteRepairEligible.includes(draft.issueType) : false;
  function chooseIssue(issueType: IssueType) { updateDraft({ issueType, serviceType: onSiteRepairEligible.includes(issueType) ? draft.serviceType : 'TRANSPORT' }); }
  return <AppScreen><Header title="Que se passe-t-il ?" subtitle="Étape 1 sur 4" onBack={() => navigation.goBack()} />{issues.map((issue) => <OptionCard key={issue.value} icon={issue.icon} title={issue.title} selected={draft.issueType === issue.value} onPress={() => chooseIssue(issue.value)} tone={issue.value === 'ACCIDENT' ? 'red' : 'yellow'} />)}
    {eligible ? <><SectionTitle>Comment intervenir ?</SectionTitle>
      <OptionCard icon="build" title="Réparation sur place" subtitle="Le dépanneur intervient là où se trouve la moto" selected={draft.serviceType === 'ON_SITE_REPAIR'} onPress={() => updateDraft({ serviceType: 'ON_SITE_REPAIR' })} />
      <OptionCard icon="car-sport" title="Transport" subtitle="La moto est transportée vers un garage ou une adresse" selected={draft.serviceType === 'TRANSPORT'} onPress={() => updateDraft({ serviceType: 'TRANSPORT' })} />
      {draft.serviceType === 'ON_SITE_REPAIR' ? <Text style={ui.muted}>Si la réparation s’avère impossible sur place, le dépanneur pourra basculer vers un transport ; le prix sera recalculé.</Text> : null}
    </> : null}
    <Field label="Décrivez le problème (facultatif)" value={draft.issueDescription ?? ''} onChangeText={(issueDescription) => updateDraft({ issueDescription })} placeholder="Bruit, voyant, circonstances…" multiline />
    <PrimaryButton title="Continuer" onPress={() => navigation.navigate('VehicleInfo')} disabled={!draft.issueType} />
  </AppScreen>;
}

export function VehicleInfoScreen({ navigation }: Props<'VehicleInfo'>) {
  const { draft, updateDraft } = useBooking(); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => { api.vehicles().then(setVehicles).catch(() => undefined); }, []);
  async function pick() { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: .75, selectionLimit: 4 }); if (!result.canceled) updateDraft({ photos: result.assets.map((a) => a.uri) }); }
  function chooseVehicle(vehicle: Vehicle) { updateDraft({ brand: vehicle.brand, model: vehicle.model, plate: vehicle.plate ?? '' }); }
  return <AppScreen><Header title="Votre moto" subtitle="Étape 2 sur 4" onBack={() => navigation.goBack()} />
    {vehicles.length ? <><SectionTitle>Motos enregistrées</SectionTitle>{vehicles.map((v) => <OptionCard key={v.id} icon="bicycle" title={`${v.brand} ${v.model}`} subtitle={v.plate} selected={draft.brand === v.brand && draft.model === v.model} onPress={() => chooseVehicle(v)} />)}</> : null}
    <Field label="Marque" value={draft.brand} onChangeText={(brand) => updateDraft({ brand })} placeholder="Yamaha" icon="bicycle" /><Field label="Modèle" value={draft.model} onChangeText={(model) => updateDraft({ model })} placeholder="MT-07" /><Field label="Immatriculation (facultatif)" value={draft.plate} onChangeText={(plate) => updateDraft({ plate: plate.toUpperCase() })} placeholder="AB-123-CD" />
    <SectionTitle>Photos facultatives</SectionTitle><Text style={ui.muted}>Elles peuvent aider le dépanneur à comprendre la situation, mais vous pouvez continuer sans photo.</Text>
    <View style={styles.photos}>{draft.photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}<Pressable style={styles.addPhoto} onPress={pick}><Ionicons name="camera" size={27} color={colors.yellow} /><Text style={styles.photoText}>Ajouter</Text></Pressable></View>
    <PrimaryButton title="Continuer" onPress={() => navigation.navigate('RouteChoice')} disabled={!draft.brand.trim() || !draft.model.trim()} />
  </AppScreen>;
}

export function AddressSearch({ label, value, onSelect, onClear, locate }: { label: string; value?: Place; onSelect: (place: Place) => void; onClear: () => void; locate?: () => void }) {
  const [query, setQuery] = useState(value?.address ?? ''); const [results, setResults] = useState<Array<{ id: string; description: string }>>([]);
  const clearedByTyping = useRef(false);
  useEffect(() => {
    if (clearedByTyping.current) { clearedByTyping.current = false; return; }
    setQuery(value?.address ?? '');
  }, [value?.address]);
  useEffect(() => { if (query.length < 3 || query === value?.address) { setResults([]); return; } let cancelled = false; const timer = setTimeout(() => api.places(query).then((items) => { if (!cancelled) setResults(items); }).catch(() => { if (!cancelled) setResults([]); }), 350); return () => { cancelled = true; clearTimeout(timer); }; }, [query, value?.address]);
  async function choose(id: string) { try { const place = await api.place(id); if (!place.inServiceArea || !isInServiceArea(place)) return Alert.alert('Zone non desservie', 'Cette adresse se situe en dehors de l’Île-de-France.'); onSelect(place); setQuery(place.address); setResults([]); } catch (e) { Alert.alert('Adresse introuvable', e instanceof Error ? e.message : 'Réessayez.'); } }
  function edit(text: string) { setQuery(text); if (value && text !== value.address) { clearedByTyping.current = true; onClear(); } }
  return <View style={{ gap: 8 }}><View style={styles.addressLabel}><Text style={ui.label}>{label}</Text>{locate ? <Pressable onPress={locate} style={styles.auto}><Ionicons name="locate" size={16} color={colors.yellow} /><Text style={styles.autoText}>Ma position</Text></Pressable> : null}</View><Field value={query} onChangeText={edit} placeholder="Commencez à taper l’adresse…" icon="location" />{results.length ? <Card style={{ padding: 0 }}>{results.map((r, i) => <Pressable key={r.id} onPress={() => void choose(r.id)} style={[styles.suggestion, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}><Ionicons name="pin" size={18} color={colors.yellow} /><Text style={styles.suggestionText}>{r.description}</Text></Pressable>)}</Card> : null}</View>;
}

// Garages partenaires proposés comme destination rapide (§ garages), en plus de la saisie libre
// d'adresse déjà disponible via AddressSearch.
export function GaragePicker({ onSelect }: { onSelect: (place: Place) => void }) {
  const [garages, setGarages] = useState<Garage[]>([]);
  useEffect(() => { api.garages().then(setGarages).catch(() => undefined); }, []);
  if (!garages.length) return null;
  return <View style={{ gap: 8 }}><Text style={ui.label}>Garages partenaires</Text>
    {garages.map((g) => <Pressable key={g.id} onPress={() => onSelect({ address: g.address, latitude: g.latitude, longitude: g.longitude })} style={styles.garage}><Ionicons name="business" size={20} color={colors.yellow} /><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{g.name}</Text><Text style={ui.muted}>{g.address}</Text></View></Pressable>)}
  </View>;
}

export function RouteChoiceScreen({ navigation }: Props<'RouteChoice'>) {
  const { draft, updateDraft } = useBooking(); const [locating, setLocating] = useState(false);
  const onSite = draft.serviceType === 'ON_SITE_REPAIR';
  const distanceKm = onSite ? 0 : estimateRouteDistanceKm(draft.pickup, draft.destination);
  async function locate() { try { setLocating(true); const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') return Alert.alert('Localisation refusée'); const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); const pickup = { latitude: current.coords.latitude, longitude: current.coords.longitude, address: 'Ma position actuelle' }; if (!isInServiceArea(pickup)) { updateDraft({ pickup: undefined, distanceKm: 0 }); Alert.alert('Position hors Île-de-France', 'Le simulateur iPhone peut être localisé aux États-Unis. Sélectionnez une adresse dans la liste ou changez la position simulée.'); return; } const addresses = await Location.reverseGeocodeAsync(current.coords); const a = addresses[0]; updateDraft({ pickup: { ...pickup, address: [a?.streetNumber, a?.street, a?.postalCode, a?.city].filter(Boolean).join(' ') || pickup.address }, distanceKm: 0 }); } catch { Alert.alert('Position indisponible', 'Veuillez sélectionner une adresse dans la liste.'); } finally { setLocating(false); } }
  const canContinue = onSite ? Boolean(draft.pickup) : distanceKm !== null;
  return <AppScreen><Header title="Trajet de la moto" subtitle="Étape 3 sur 4" onBack={() => navigation.goBack()} /><AddressSearch label="Adresse de prise en charge" value={draft.pickup} onSelect={(pickup) => updateDraft({ pickup, distanceKm: 0 })} onClear={() => updateDraft({ pickup: undefined, distanceKm: 0 })} locate={locate} />{locating ? <Text style={ui.muted}>Recherche de votre position…</Text> : null}
    {onSite ? <Card><Text style={ui.muted}>Réparation sur place : aucune adresse de destination n’est nécessaire, le dépanneur intervient directement à l’adresse de prise en charge.</Text></Card> : <>
      <AddressSearch label="Adresse de destination" value={draft.destination} onSelect={(destination) => updateDraft({ destination, distanceKm: 0 })} onClear={() => updateDraft({ destination: undefined, distanceKm: 0 })} />
      <GaragePicker onSelect={(destination) => updateDraft({ destination, distanceKm: 0 })} />
      {distanceKm !== null ? <Card><View style={styles.routeLine}><View style={styles.routeDot} /><View style={styles.routeBar} /><View style={[styles.routeDot, { backgroundColor: colors.red }]} /></View><View style={{ flex: 1, gap: 6 }}><Text style={ui.optionTitle}>Trajet estimé</Text><Text style={ui.muted}>{distanceKm.toFixed(1)} km • distance approximative, non vérifiée sur route</Text></View></Card> : draft.pickup && draft.destination ? <Card><Text style={styles.errorText}>Trajet invalide ou hors de la zone desservie. Corrigez les adresses.</Text></Card> : null}
    </>}
    <PrimaryButton title="Choisir la date" onPress={() => { if (canContinue) { updateDraft({ distanceKm: distanceKm ?? 0 }); navigation.navigate('Schedule'); } }} disabled={!canContinue} />
  </AppScreen>;
}

export function ScheduleScreen({ navigation }: Props<'Schedule'>) {
  const { draft, updateDraft } = useBooking(); const [later, setLater] = useState(Boolean(draft.scheduledFor)); const [day, setDay] = useState(1); const [hour, setHour] = useState(12);
  function next() { if (!later) updateDraft({ scheduledFor: undefined }); else { const date = new Date(); date.setDate(date.getDate() + day); date.setHours(hour, 0, 0, 0); updateDraft({ scheduledFor: date }); } navigation.navigate('Quote'); }
  return <AppScreen><Header title="Quand intervenir ?" subtitle="Étape 4 sur 4" onBack={() => navigation.goBack()} /><OptionCard icon="flash" title="Maintenant" subtitle="Recherche immédiate du dépanneur" selected={!later} onPress={() => setLater(false)} /><OptionCard icon="calendar" title="Plus tard" subtitle="Programmez le jour et l’heure" selected={later} onPress={() => setLater(true)} />
    {later ? <Card><Text style={ui.label}>Jour</Text><View style={styles.chips}>{[{ d: 1, t: 'Demain' }, { d: 2, t: 'Après-demain' }, { d: 7, t: 'Dans 7 jours' }].map((x) => <Chip key={x.d} text={x.t} active={day === x.d} onPress={() => setDay(x.d)} />)}</View><Text style={ui.label}>Créneau souhaité</Text><View style={styles.chips}>{[9, 12, 15, 18].map((h) => <Chip key={h} text={`${h}h00`} active={hour === h} onPress={() => setHour(h)} />)}</View></Card> : null}
    <PrimaryButton title="Voir mon devis" onPress={next} />
  </AppScreen>;
}

export function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && { color: colors.bg }]}>{text}</Text></Pressable>; }

type PricingGrid = { baseByIssueCents: Record<string, number>; perKmCents: number; nightSurchargeRate: number; weekendSurchargeRate: number };

export function QuoteScreen({ navigation }: Props<'Quote'>) {
  const { draft, setActive } = useBooking();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [amount, setAmount] = useState<number | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const onSite = draft.serviceType === 'ON_SITE_REPAIR';
  const distanceKm = onSite ? 0 : estimateRouteDistanceKm(draft.pickup, draft.destination);
  const invalidRoute = distanceKm === null;

  useEffect(() => { api.bookingsConfig().then((c) => setGrid(c.pricing)).catch(() => undefined); }, []);

  useEffect(() => {
    let cancelled = false;
    setAmount(null);
    setEstimateError(null);
    if (!draft.issueType || distanceKm === null) {
      setEstimateError('Trajet ou type de panne invalide. Revenez corriger les adresses.');
      return;
    }
    api.estimate({ issueType: draft.issueType, serviceType: draft.serviceType, distanceKm, scheduledFor: draft.scheduledFor?.toISOString() })
      .then((result) => {
        if (!Number.isFinite(result.amountCents) || result.amountCents < 0) throw new Error('Montant invalide reçu du serveur.');
        if (!cancelled) setAmount(result.amountCents);
      })
      .catch((error: unknown) => {
        if (!cancelled) setEstimateError(error instanceof Error ? error.message : 'Le devis n’a pas pu être calculé.');
      });
    return () => { cancelled = true; };
  }, [draft.issueType, distanceKm, draft.scheduledFor?.getTime(), retryCount]);

  // Ventilation informative (§2.5) : reflète la grille affichée au client. Le montant définitif
  // reste celui calculé par le serveur (amount) — jamais recalculé ni imposé par le mobile.
  const breakdown = (() => {
    if (!grid || !draft.issueType || distanceKm === null) return null;
    const date = draft.scheduledFor ?? new Date();
    const base = grid.baseByIssueCents[draft.issueType] ?? 0;
    const distance = Math.round(distanceKm * grid.perKmCents);
    const hour = date.getHours();
    const isNight = hour >= 20 || hour < 7;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const subtotal = base + distance;
    return {
      base, distance,
      night: isNight ? Math.round(subtotal * grid.nightSurchargeRate) : 0,
      weekend: isWeekend ? Math.round(subtotal * grid.weekendSurchargeRate) : 0,
    };
  })();

  async function pay() {
    if (loading) return;
    if (amount === null || !draft.issueType || !draft.pickup || (!onSite && !draft.destination) || invalidRoute) {
      Alert.alert('Devis indisponible', 'Corrigez le trajet ou réessayez de calculer le prix avant de confirmer.');
      return;
    }
    try {
      setLoading(true);
      const vehicle = await api.createVehicle({ brand: draft.brand, model: draft.model, plate: draft.plate || undefined });
      const booking = await api.createBooking({ issueType: draft.issueType, serviceType: draft.serviceType, issueDescription: draft.issueDescription, pickup: draft.pickup, destination: onSite ? undefined : draft.destination, distanceKm: onSite ? undefined : distanceKm, vehicleId: vehicle.id, scheduledFor: draft.scheduledFor?.toISOString(), paymentMethod });
      // Les photos sont facultatives : un échec de transfert ne doit pas recréer
      // une demande déjà enregistrée ni bloquer une mission en espèces.
      for (const uri of draft.photos) {
        try { await api.uploadPhoto(booking.id, 'CLIENT', uri); }
        catch (error) { console.warn('Photo facultative non envoyée', error); }
      }
      let confirmed = booking;
      if (paymentMethod === 'CARD') {
        const payment = await api.authorizePayment(booking.id);
        if (!payment.clientSecret.startsWith('demo_')) {
          const init = await initPaymentSheet({ merchantDisplayName: 'Mehdi Dépannage', paymentIntentClientSecret: payment.clientSecret, returnURL: 'mehdi-depannage://stripe-redirect', applePay: { merchantCountryCode: 'FR' }, googlePay: { merchantCountryCode: 'FR', testEnv: true }, style: 'alwaysDark' });
          if (init.error) throw new Error(init.error.message);
          const result = await presentPaymentSheet();
          if (result.error) throw new Error(result.error.message);
        }
        confirmed = await api.confirmPayment(booking.id);
      }
      setActive(confirmed);
      if (draft.scheduledFor) navigation.replace('ClientHome');
      else navigation.replace('Searching', { bookingId: booking.id });
    } catch (error) {
      Alert.alert('Demande impossible', error instanceof Error ? error.message : 'Réessayez.');
    } finally { setLoading(false); }
  }

  return <AppScreen><Header title="Votre devis" subtitle="Prix définitif, hors suppléments de la grille" onBack={() => navigation.goBack()} /><Card style={styles.quote}><Pill label="PRIX DÉFINITIF" tone="green" />{estimateError ? <Text style={styles.errorText}>{estimateError}</Text> : amount === null ? <Text style={ui.muted}>Calcul du montant…</Text> : <Money cents={amount} size={42} />}{paymentMethod === 'CARD' ? <Text style={styles.centered}>Le montant sera préautorisé maintenant et débité uniquement à la fin de l’intervention.</Text> : <Text style={styles.centered}>Vous réglerez le dépanneur en espèces à la fin de l’intervention. Aucune préautorisation bancaire.</Text>}{estimateError ? <SecondaryButton title={invalidRoute ? 'Corriger le trajet' : 'Réessayer le calcul'} onPress={() => invalidRoute ? navigation.navigate('RouteChoice') : setRetryCount((count) => count + 1)} /> : null}</Card>
    <Card><PriceRow label="Type d’intervention" value={issues.find((x) => x.value === draft.issueType)?.title ?? ''} /><PriceRow label="Formule" value={onSite ? 'Réparation sur place' : 'Transport'} /><PriceRow label="Distance estimée" value={onSite ? 'Sans objet (sur place)' : distanceKm === null ? 'À corriger' : `${distanceKm.toFixed(1)} km (approximatif)`} /><PriceRow label="Intervention" value={draft.scheduledFor ? draft.scheduledFor.toLocaleString('fr-FR') : 'Dès maintenant'} /></Card>
    {breakdown ? <Card><Text style={ui.label}>DÉTAIL DU CALCUL</Text><PriceRow label="Forfait selon la panne" value={(breakdown.base / 100).toFixed(2) + ' €'} /><PriceRow label={`Distance (${distanceKm?.toFixed(1)} km)`} value={(breakdown.distance / 100).toFixed(2) + ' €'} />{breakdown.night > 0 ? <PriceRow label="Supplément nuit" value={(breakdown.night / 100).toFixed(2) + ' €'} /> : null}{breakdown.weekend > 0 ? <PriceRow label="Supplément week-end" value={(breakdown.weekend / 100).toFixed(2) + ' €'} /> : null}<Text style={[ui.muted, { marginTop: 4 }]}>D’autres suppléments (changement de destination, distance ajoutée, jour férié) peuvent s’appliquer en cours de mission, toujours selon cette même grille et de façon traçable.</Text></Card> : null}
    <SectionTitle>Mode de paiement</SectionTitle><OptionCard icon="card" title="Carte bancaire" subtitle="Carte, Apple Pay ou Google Pay" selected={paymentMethod === 'CARD'} onPress={() => setPaymentMethod('CARD')} /><OptionCard icon="cash" title="Espèces" subtitle="À remettre au dépanneur à la livraison" selected={paymentMethod === 'CASH'} onPress={() => setPaymentMethod('CASH')} />
    {paymentMethod === 'CARD' ? <View style={styles.secure}><Ionicons name="lock-closed" color={colors.green} size={18} /><Text style={ui.muted}>Préautorisation sécurisée par Stripe</Text></View> : <Card><Text style={ui.muted}>Aucun débit ne sera effectué. Le dépanneur confirmera la réception des espèces à la fin de la mission.</Text></Card>}<PrimaryButton title={paymentMethod === 'CARD' ? 'Payer et confirmer' : 'Confirmer et payer en espèces'} icon={paymentMethod === 'CARD' ? 'card' : 'cash'} onPress={() => void pay()} loading={loading} disabled={amount === null || invalidRoute || Boolean(estimateError)} />
  </AppScreen>;
}
function PriceRow({ label, value }: { label: string; value: string }) { return <View style={styles.priceRow}><Text style={ui.muted}>{label}</Text><Text style={styles.priceValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  permission: { alignItems: 'center', gap: 16 }, pinCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontWeight: '900', fontSize: 25, textAlign: 'center' }, centered: { color: colors.muted, lineHeight: 21, textAlign: 'center' }, photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photo: { width: 74, height: 74, borderRadius: 10 }, addPhoto: { width: 74, height: 74, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, photoText: { color: colors.yellow, fontSize: 11, fontWeight: '700' },
  addressLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, auto: { flexDirection: 'row', gap: 5, alignItems: 'center' }, autoText: { color: colors.yellow, fontWeight: '700', fontSize: 12 }, suggestion: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14 }, suggestionText: { color: colors.text, flex: 1 }, routeLine: { width: 18, alignItems: 'center' }, routeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green }, routeBar: { height: 28, width: 2, backgroundColor: colors.border }, garage: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }, chipActive: { backgroundColor: colors.yellow, borderColor: colors.yellow }, chipText: { color: colors.text, fontWeight: '700' }, quote: { alignItems: 'center', paddingVertical: 30, gap: 14 }, secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 3 }, priceValue: { color: colors.text, fontWeight: '700', textAlign: 'right', flex: 1 }, errorText: { color: colors.red, fontWeight: '700', textAlign: 'center', lineHeight: 21 },
});
