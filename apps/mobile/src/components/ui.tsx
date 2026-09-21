import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function AppScreen({ children, scroll = true, style }: React.PropsWithChildren<{ scroll?: boolean; style?: StyleProp<ViewStyle> }>) {
  const content = <View style={[styles.screenContent, style]}>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}</SafeAreaView>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={[styles.brand, compact && { alignItems: 'flex-start' }]}>
    <View style={styles.brandIcon}><Ionicons name="flash" size={compact ? 20 : 32} color={colors.bg} /></View>
    <View><Text style={[styles.brandTitle, compact && { fontSize: 18 }]}>MEHDI</Text><Text style={[styles.brandSub, compact && { fontSize: 11 }]}>DÉPANNAGE</Text></View>
  </View>;
}

export function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return <View style={styles.header}>
    {onBack ? <Pressable onPress={onBack} style={styles.back}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable> : <Brand compact />}
    <View style={{ flex: 1 }}><Text style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}</View>
  </View>;
}

export function PrimaryButton({ title, onPress, disabled, loading, tone = 'yellow', icon }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: 'yellow' | 'green' | 'red'; icon?: keyof typeof Ionicons.glyphMap }) {
  const bg = tone === 'green' ? colors.green : tone === 'red' ? colors.red : colors.yellow;
  return <Pressable onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.primary, { backgroundColor: bg }, (disabled || loading) && { opacity: .45 }, pressed && { transform: [{ scale: .985 }] }]}>
    {loading ? <ActivityIndicator color={colors.bg} /> : <>{icon ? <Ionicons name={icon} size={20} color={colors.bg} /> : null}<Text style={styles.primaryText}>{title}</Text></>}
  </Pressable>;
}

export function SecondaryButton({ title, onPress, icon, danger, disabled }: { title: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; danger?: boolean; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.secondary, disabled && { opacity: .45 }]}>{icon ? <Ionicons name={icon} size={20} color={danger ? colors.red : colors.text} /> : null}<Text style={[styles.secondaryText, danger && { color: colors.red }]}>{title}</Text></Pressable>;
}

export function Card({ children, style, onPress }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void }>) {
  const Component = onPress ? Pressable : View;
  return <Component onPress={onPress} style={[styles.card, style]}>{children}</Component>;
}

export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, icon }: { label?: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: KeyboardTypeOptions; icon?: keyof typeof Ionicons.glyphMap }) {
  return <View style={{ gap: spacing.xs }}>{label ? <Text style={ui.label}>{label}</Text> : null}<View style={[styles.field, multiline && { minHeight: 90, alignItems: 'flex-start' }]}>{icon ? <Ionicons name={icon} size={20} color={colors.muted} /> : null}<TextInput style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]} placeholder={placeholder} placeholderTextColor={colors.muted} value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType} /></View></View>;
}

export function OptionCard({ icon, title, subtitle, selected, onPress, tone = 'yellow' }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; selected?: boolean; onPress: () => void; tone?: 'yellow' | 'red' }) {
  const accent = tone === 'red' ? colors.red : colors.yellow;
  return <Pressable onPress={onPress} style={[styles.option, selected && { borderColor: accent, backgroundColor: `${accent}15` }]}>
    <View style={[styles.optionIcon, { backgroundColor: `${accent}20` }]}><Ionicons name={icon} size={24} color={accent} /></View>
    <View style={{ flex: 1 }}><Text style={ui.optionTitle}>{title}</Text>{subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}</View>
    <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={22} color={selected ? accent : colors.muted} />
  </Pressable>;
}

export function SectionTitle({ children }: React.PropsWithChildren) { return <Text style={styles.sectionTitle}>{children}</Text>; }
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? colors.green : tone === 'yellow' ? colors.yellow : tone === 'red' ? colors.red : colors.muted;
  return <View style={[styles.pill, { borderColor: color }]}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}
export function ToggleRow({ title, subtitle, value, onValueChange }: { title: string; subtitle?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <Card style={styles.toggleRow}><View style={{ flex: 1 }}><Text style={ui.optionTitle}>{title}</Text>{subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}</View><Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.green }} /></Card>;
}
export function Money({ cents, size = 30 }: { cents: number; size?: number }) { return <Text style={[styles.money, { fontSize: size }]}>{(cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</Text>; }
export function Empty({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) { return <View style={styles.empty}><Ionicons name={icon} size={44} color={colors.yellow} /><Text style={styles.emptyTitle}>{title}</Text><Text style={[ui.muted, { textAlign: 'center' }]}>{text}</Text></View>; }

export const ui: { muted: TextStyle; label: TextStyle; optionTitle: TextStyle } = {
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontWeight: '700', fontSize: 13 },
  optionTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
};
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, screenContent: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, brandIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, brandTitle: { color: colors.white, fontWeight: '900', fontSize: 27, letterSpacing: .5 }, brandSub: { color: colors.yellow, fontWeight: '900', fontSize: 15, marginTop: -5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: spacing.sm }, back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, headerTitle: { color: colors.text, fontWeight: '800', fontSize: 23 },
  primary: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: 20, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.bg, fontWeight: '900', fontSize: 16 },
  secondary: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, secondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  field: { minHeight: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, input: { color: colors.text, flex: 1, fontSize: 16, paddingVertical: 12 },
  option: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 }, optionIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 3 }, pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }, pillText: { fontSize: 12, fontWeight: '800' }, dot: { width: 7, height: 7, borderRadius: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center' }, money: { color: colors.text, fontWeight: '900' }, empty: { flex: 1, minHeight: 350, alignItems: 'center', justifyContent: 'center', gap: 12 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 20 },
});
