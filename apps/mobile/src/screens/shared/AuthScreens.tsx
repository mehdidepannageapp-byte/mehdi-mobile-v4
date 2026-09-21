import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Brand, Card, Field, PrimaryButton, SecondaryButton, ui } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../theme';
import type { RootStackParamList } from '../../types';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export function SplashScreen({ navigation }: Props<'Splash'>) {
  useEffect(() => { const timer = setTimeout(() => navigation.replace('Onboarding'), 1400); return () => clearTimeout(timer); }, []);
  return <AppScreen scroll={false} style={styles.splash}><Brand /><Text style={styles.tagline}>Votre moto, notre engagement</Text><View style={styles.splashBottom}><View style={styles.line} /><Text style={ui.muted}>Dépannage moto • 24h/24 • 7j/7</Text></View></AppScreen>;
}

export function OnboardingScreen({ navigation }: Props<'Onboarding'>) {
  return <AppScreen scroll={false} style={{ justifyContent: 'space-between' }}>
    <View style={{ gap: 24 }}><Brand compact /><View style={styles.hero}><View style={styles.heroCircle}><Ionicons name="bicycle" size={88} color={colors.yellow} /></View><View style={styles.sosMini}><Text style={styles.sosText}>SOS</Text></View></View>
      <View><Text style={styles.bigTitle}>Un coup dur ?{`\n`}On est là.</Text><Text style={styles.copy}>Localisez-vous, obtenez votre devis et suivez le dépanneur en direct jusqu’à la livraison.</Text></View>
      <View style={styles.points}><Point icon="location" text="Intervention dans toute l’Île-de-France" /><Point icon="shield-checkmark" text="Paiement sécurisé après l’intervention" /><Point icon="chatbubble-ellipses" text="Suivi et messagerie en temps réel" /></View>
    </View>
    <PrimaryButton title="Commencer" icon="arrow-forward" onPress={() => navigation.replace('PhoneLogin')} />
  </AppScreen>;
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { return <View style={styles.point}><Ionicons name={icon} color={colors.yellow} size={22} /><Text style={styles.pointText}>{text}</Text></View>; }

export function PhoneLoginScreen({ navigation }: Props<'PhoneLogin'>) {
  const { requestOtp, demo } = useAuth();
  const [phone, setPhone] = useState('+33'); const [loading, setLoading] = useState(false);
  async function submit() { try { setLoading(true); await requestOtp(phone.replace(/\s/g, '')); navigation.navigate('Otp', { phone: phone.replace(/\s/g, '') }); } catch (e) { Alert.alert('Connexion impossible', e instanceof Error ? e.message : 'Réessayez.'); } finally { setLoading(false); } }
  async function enterDemo(role: 'client' | 'driver') { try { setLoading(true); await demo(role); } catch (e) { Alert.alert('API indisponible', 'Lancez PostgreSQL et le serveur Node.js, puis réessayez.'); } finally { setLoading(false); } }
  return <AppScreen><Brand /><View style={{ marginTop: 30, gap: 8 }}><Text style={styles.title}>Bienvenue</Text><Text style={styles.copy}>Connectez-vous avec votre numéro de téléphone.</Text></View>
    <Field label="Numéro de téléphone" value={phone} onChangeText={setPhone} placeholder="+33 6 00 00 00 00" keyboardType="phone-pad" icon="call" />
    <PrimaryButton title="Recevoir mon code" onPress={submit} loading={loading} disabled={phone.length < 10} />
    <View style={styles.divider}><View style={styles.line} /><Text style={ui.muted}>MODE DÉMONSTRATION</Text><View style={styles.line} /></View>
    <SecondaryButton title="Entrer comme client" icon="person" onPress={() => enterDemo('client')} /><SecondaryButton title="Entrer comme dépanneur" icon="construct" onPress={() => enterDemo('driver')} />
    <Text style={[ui.muted, { textAlign: 'center', marginTop: 'auto' }]}>En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité.</Text>
  </AppScreen>;
}

const OTP_RESEND_COOLDOWN_SECONDS = 30;

export function OtpScreen({ navigation, route }: Props<'Otp'>) {
  const { verifyOtp, requestOtp } = useAuth();
  const [code, setCode] = useState(''); const [firstName, setFirstName] = useState(''); const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit() { try { setLoading(true); await verifyOtp(route.params.phone, code, firstName || undefined); } catch (e) { Alert.alert('Code refusé', e instanceof Error ? e.message : 'Réessayez.'); } finally { setLoading(false); } }
  async function resend() {
    try { setResending(true); await requestOtp(route.params.phone); setCooldown(OTP_RESEND_COOLDOWN_SECONDS); Alert.alert('Code envoyé', 'Un nouveau code vous a été envoyé par SMS.'); }
    catch (e) { Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Réessayez plus tard.'); }
    finally { setResending(false); }
  }
  return <AppScreen><Pressable onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={28} color={colors.text} /></Pressable><View style={{ marginTop: 24 }}><Text style={styles.title}>Vérifiez votre numéro</Text><Text style={styles.copy}>Le code à 6 chiffres a été envoyé au {route.params.phone}.</Text></View>
    <Field label="Votre prénom" value={firstName} onChangeText={setFirstName} placeholder="Prénom" icon="person" />
    <Field label="Code reçu par SMS" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" icon="keypad" />
    <PrimaryButton title="Se connecter" onPress={submit} loading={loading} disabled={code.length !== 6} />
    <SecondaryButton title={cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : 'Renvoyer le code'} onPress={resend} disabled={resending || cooldown > 0} />
    <Card style={{ marginTop: 12 }}><Text style={styles.hint}>En développement, utilisez le code 000000.</Text></Card>
  </AppScreen>;
}

const styles = StyleSheet.create({
  splash: { alignItems: 'center', justifyContent: 'center' }, tagline: { color: colors.text, marginTop: 18, fontWeight: '600' }, splashBottom: { position: 'absolute', bottom: 40, alignItems: 'center', gap: 12 }, line: { height: 1, backgroundColor: colors.border, flex: 1 },
  hero: { height: 240, alignItems: 'center', justifyContent: 'center' }, heroCircle: { width: 210, height: 210, borderRadius: 105, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, sosMini: { position: 'absolute', right: 38, bottom: 25, width: 65, height: 65, borderRadius: 33, backgroundColor: colors.red, borderWidth: 5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' }, sosText: { color: colors.white, fontWeight: '900' },
  bigTitle: { color: colors.text, fontSize: 36, fontWeight: '900', lineHeight: 42 }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, copy: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 8 }, points: { gap: 14 }, point: { flexDirection: 'row', alignItems: 'center', gap: 12 }, pointText: { color: colors.text, flex: 1, fontWeight: '600' }, divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }, hint: { color: colors.yellow, textAlign: 'center', fontWeight: '700' },
});
