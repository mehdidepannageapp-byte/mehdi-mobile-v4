import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Card, Empty, Field, Header, PrimaryButton, SecondaryButton, ToggleRow, ui } from '../../components/ui';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { RootStackParamList, Vehicle } from '../../types';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

// B04 : écran complet de gestion des motos (liste, ajout, modification, suppression protégée).
export function VehiclesScreen({ navigation }: Props<'Vehicles'>) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [brand, setBrand] = useState(''); const [model, setModel] = useState(''); const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.vehicles().then(setVehicles).catch(() => undefined).finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);

  function startAdd() { setEditingId('new'); setBrand(''); setModel(''); setPlate(''); }
  function startEdit(v: Vehicle) { setEditingId(v.id); setBrand(v.brand); setModel(v.model); setPlate(v.plate ?? ''); }

  async function save() {
    if (!brand.trim() || !model.trim()) return;
    try {
      setSaving(true);
      if (editingId && editingId !== 'new') await api.updateVehicle(editingId, { brand, model, plate: plate || undefined });
      else await api.createVehicle({ brand, model, plate: plate || undefined });
      setEditingId(null);
      await load();
    } catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); }
    finally { setSaving(false); }
  }

  function remove(v: Vehicle) {
    Alert.alert('Supprimer cette moto ?', `${v.brand} ${v.model}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await api.deleteVehicle(v.id); await load(); } },
    ]);
  }

  return <AppScreen><Header title="Mes motos" subtitle={`${vehicles.length} moto${vehicles.length > 1 ? 's' : ''}`} onBack={() => navigation.goBack()} />
    {!loading && vehicles.length === 0 && !editingId ? <Empty icon="bicycle-outline" title="Aucune moto enregistrée" text="Ajoutez une moto pour accélérer vos prochaines demandes." /> : null}
    {vehicles.map((v) => <Card key={v.id}><View style={styles.row}><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{v.brand} {v.model}</Text>{v.plate ? <Text style={ui.muted}>{v.plate}</Text> : null}</View><Pressable onPress={() => startEdit(v)}><Ionicons name="create-outline" size={22} color={colors.yellow} /></Pressable><Pressable onPress={() => remove(v)} style={{ marginLeft: 16 }}><Ionicons name="trash-outline" size={22} color={colors.red} /></Pressable></View></Card>)}
    {editingId ? <Card>
      <Field label="Marque" value={brand} onChangeText={setBrand} placeholder="Yamaha" icon="bicycle" />
      <Field label="Modèle" value={model} onChangeText={setModel} placeholder="MT-07" />
      <Field label="Immatriculation (facultatif)" value={plate} onChangeText={(t) => setPlate(t.toUpperCase())} placeholder="AB-123-CD" />
      <View style={styles.row}><SecondaryButton title="Annuler" onPress={() => setEditingId(null)} /><View style={{ width: 10 }} /><PrimaryButton title="Enregistrer" onPress={save} loading={saving} disabled={!brand.trim() || !model.trim()} /></View>
    </Card> : <SecondaryButton title="Ajouter une moto" icon="add" onPress={startAdd} />}
  </AppScreen>;
}

// B06 : préférences de notification persistantes. Les communications transactionnelles
// obligatoires (confirmation, facture) restent toujours envoyées, quel que soit ce réglage.
export function NotificationsScreen({ navigation }: Props<'Notifications'>) {
  const [pushEnabled, setPushEnabled] = useState(true);
  useEffect(() => { api.notificationPreferences().then((p) => setPushEnabled(p.pushEnabled)).catch(() => undefined); }, []);
  async function toggle(value: boolean) {
    setPushEnabled(value);
    try { await api.updateNotificationPreferences(value); }
    catch (e) { setPushEnabled(!value); Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessayez.'); }
  }
  return <AppScreen><Header title="Notifications" subtitle="Préférences de communication" onBack={() => navigation.goBack()} />
    <ToggleRow title="Notifications push" subtitle="Missions, propositions de créneau, messages et mises à jour importantes" value={pushEnabled} onValueChange={toggle} />
    <Card><Text style={ui.muted}>La confirmation de réservation et votre facture vous sont toujours envoyées par SMS et e-mail, indépendamment de ce réglage.</Text></Card>
  </AppScreen>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
