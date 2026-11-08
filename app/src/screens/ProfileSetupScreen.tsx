import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

function isAdult(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return false;
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return birth <= limit;
}

export default function ProfileSetupScreen({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (nickname.trim().length < 2) return setError('Prezývka musí mať aspoň 2 znaky.');
    if (!isAdult(birthDate)) return setError('Zadaj dátum narodenia vo formáte RRRR-MM-DD. Aplikácia je len pre 18+.');
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, nickname: nickname.trim(), birth_date: birthDate });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tvoj profil</Text>
      <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="Prezývka" placeholderTextColor={colors.muted} />
      <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} placeholder="Dátum narodenia (RRRR-MM-DD)" placeholderTextColor={colors.muted} />
      <Text style={styles.note}>Hra je určená len pre dospelých. Pi zodpovedne.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={save} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Pokračovať</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, padding: 14, fontSize: 18 },
  note: { color: colors.muted, textAlign: 'center' },
  button: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  error: { color: '#ff6b6b' },
});
