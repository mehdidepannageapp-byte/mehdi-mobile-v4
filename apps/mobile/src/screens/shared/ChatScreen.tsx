import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { Header } from '../../components/ui';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { colors } from '../../theme';
import type { Message, RootStackParamList } from '../../types';

export function ChatScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Chat'>) {
  const { user, token } = useAuth(); const [messages, setMessages] = useState<Message[]>([]); const [text, setText] = useState(''); const socket = useRef<Socket | null>(null);
  useEffect(() => {
    api.booking(route.params.bookingId).then((b) => setMessages(b.messages ?? [])).catch(() => undefined);
    socket.current = io(API_URL, { auth: { token } }); socket.current.emit('booking:join', route.params.bookingId);
    socket.current.on('message:new', (message: Message) => setMessages((old) => old.some((m) => m.id === message.id) ? old : [...old, message]));
    return () => { socket.current?.disconnect(); };
  }, [route.params.bookingId]);
  async function send() { if (!text.trim()) return; const body = text; setText(''); if (socket.current?.connected) socket.current.emit('message:send', { bookingId: route.params.bookingId, body }); else { const message = await api.sendMessage(route.params.bookingId, body); setMessages((old) => [...old, message]); } }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.head}><Header title="Messagerie" subtitle="Échanges liés à l’intervention" onBack={() => navigation.goBack()} /></View>
    <FlatList contentContainerStyle={styles.list} data={messages} keyExtractor={(m) => m.id} renderItem={({ item }) => { const mine = item.senderId === user?.id; return <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={[styles.message, mine && { color: colors.bg }]}>{item.body}</Text><Text style={[styles.time, mine && { color: '#514300' }]}>{new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text></View>; }} ListEmptyComponent={<Text style={styles.empty}>Envoyez un message pour commencer la conversation.</Text>} />
    <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Votre message…" placeholderTextColor={colors.muted} style={styles.input} multiline /><Pressable onPress={send} style={styles.send}><Ionicons name="send" size={20} color={colors.bg} /></Pressable></View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, head: { paddingHorizontal: 20, paddingTop: 50 }, list: { padding: 20, gap: 10, flexGrow: 1 }, bubble: { maxWidth: '82%', borderRadius: 17, padding: 12 }, mine: { alignSelf: 'flex-end', backgroundColor: colors.yellow, borderBottomRightRadius: 4 }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 }, message: { color: colors.text, fontSize: 15 }, time: { color: colors.muted, fontSize: 10, marginTop: 5, textAlign: 'right' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 80 }, composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, input: { flex: 1, minHeight: 44, maxHeight: 110, color: colors.text, backgroundColor: colors.bg, borderRadius: 15, padding: 12 }, send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.yellow } });
