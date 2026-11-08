import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

type MyRound = { id: string; name: string; status: string; join_code: string };

export default function HomeScreen({ userId, nickname, onOpenRound }: { userId: string; nickname: string; onOpenRound: (id: string) => void }) {
  const [rounds, setRounds] = useState<MyRound[]>([]);
  const [name, setName] = useState('');
  const [par, setPar] = useState('5');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('round_players')
      .select('rounds(id, name, status, join_code)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    if (error) return setError(error.message);
    setRounds((data ?? []).map((x: any) => x.rounds).filter(Boolean));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_round', { p_name: name, p_par: Number(par) || 5 });
    setBusy(false);
    if (error) return setError(error.message);
    onOpenRound((data as any).id);
  };

  const join = async () => {
    if (code.trim().length < 6) return setError('Kód kola má 6 znakov.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_round', { p_code: code });
    setBusy(false);
    if (error) return setError(error.message);
    onOpenRound(data as string);
  };

  const live = rounds.filter((r) => r.status !== 'finished');
  const finished = rounds.filter((r) => r.status === 'finished');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ahoj, {nickname}!</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Nové kolo</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Názov (napr. Piatok v Starom Meste)" placeholderTextColor={colors.muted} />
        <View style={styles.row}>
          <Text style={styles.label}>Par (glgov na pivo)</Text>
          <TextInput style={[styles.input, styles.parInput]} value={par} onChangeText={setPar} keyboardType="number-pad" maxLength={2} />
        </View>
        <Pressable style={styles.button} onPress={create} disabled={busy}>
          <Text style={styles.buttonText}>Založiť kolo</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Pripojiť sa ku kolu</Text>
        <TextInput style={styles.input} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Kód kola (6 znakov)" placeholderTextColor={colors.muted} autoCapitalize="characters" maxLength={6} />
        <Pressable style={styles.buttonSecondary} onPress={join} disabled={busy}>
          <Text style={styles.buttonText}>Pripojiť sa</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {live.length > 0 && <Text style={styles.h2}>Prebiehajúce kolá</Text>}
      {live.map((r) => (
        <Pressable key={r.id} style={styles.roundItem} onPress={() => onOpenRound(r.id)}>
          <Text style={styles.roundName}>{r.name}</Text>
          <Text style={styles.muted}>kód {r.join_code}</Text>
        </Pressable>
      ))}
      {finished.length > 0 && <Text style={styles.h2}>Odohrané kolá</Text>}
      {finished.map((r) => (
        <Pressable key={r.id} style={styles.roundItem} onPress={() => onOpenRound(r.id)}>
          <Text style={styles.roundName}>{r.name}</Text>
          <Text style={styles.muted}>skončené</Text>
        </Pressable>
      ))}

      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={styles.link}>Odhlásiť sa</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingTop: 64, gap: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.muted, fontSize: 15 },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: 10, padding: 12, fontSize: 17 },
  parInput: { width: 64, textAlign: 'center' },
  button: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#2c3a33', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  roundItem: { backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between' },
  roundName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted },
  link: { color: colors.accent, textAlign: 'center', marginTop: 12 },
  error: { color: '#ff6b6b' },
});
