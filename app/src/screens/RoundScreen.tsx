import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useRound } from '../lib/useRound';
import { buildScorecard, formatScore } from '../lib/score';
import { colors } from '../theme';

export default function RoundScreen({ roundId, userId, onBack }: { roundId: string; userId: string; onBack: () => void }) {
  const { round, players, holes, drinks, sipsByDrink, error, reload } = useRound(roundId);
  const [venue, setVenue] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!round) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  const finished = round.status === 'finished';
  const currentHole = holes.find((h) => !h.closed_at) ?? null;
  const myOpenBeer = currentHole
    ? drinks.find((d) => d.hole_id === currentHole.id && d.user_id === userId && d.type === 'beer' && !d.finished_at)
    : undefined;
  const mySips = myOpenBeer ? sipsByDrink[myOpenBeer.id] ?? 0 : 0;
  const rows = buildScorecard(players, holes, drinks, sipsByDrink);

  const call = async (fn: string, args: Record<string, unknown>, haptic = true) => {
    setBusy(true);
    setActionError(null);
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) setActionError(error.message);
    await reload();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.link}>‹ Späť</Text></Pressable>
        <Text style={styles.code}>kód {round.join_code}</Text>
      </View>
      <Text style={styles.title}>{round.name}</Text>
      <Text style={styles.muted}>Par {round.default_par} · {players.length} hráčov · {finished ? 'skončené' : 'hrá sa'}</Text>

      {!finished && (
        <View style={styles.card}>
          {currentHole ? (
            <>
              <Text style={styles.h2}>Jamka {currentHole.number}: {currentHole.venue}</Text>
              <Text style={styles.muted}>Par {currentHole.par}{myOpenBeer ? ` · rozpité pivo: ${mySips} glgov` : ''}</Text>
              <Pressable style={styles.sipButton} onPress={() => call('add_sip', { p_round: roundId })} disabled={busy}>
                <Text style={styles.sipText}>+1 glg</Text>
                <Text style={styles.sipCount}>{mySips}</Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable style={[styles.button, styles.flex]} onPress={() => call('finish_beer', { p_round: roundId })} disabled={busy || !myOpenBeer}>
                  <Text style={styles.buttonText}>Dopil som</Text>
                </Pressable>
                <Pressable style={[styles.shotButton, styles.flex]} onPress={() => call('add_shot', { p_round: roundId })} disabled={busy}>
                  <Text style={styles.buttonText}>Shot −2</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => call('undo_sip', { p_round: roundId }, false)} disabled={busy || mySips === 0}>
                <Text style={[styles.link, mySips === 0 && styles.disabled]}>Späť posledný glg</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.h2}>Kde začínate?</Text>
          )}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={venue}
              onChangeText={setVenue}
              placeholder={currentHole ? 'Ďalší podnik' : 'Názov podniku'}
              placeholderTextColor={colors.muted}
            />
            <Pressable
              style={styles.buttonSecondary}
              onPress={async () => { await call('open_hole', { p_round: roundId, p_venue: venue }, false); setVenue(''); }}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{currentHole ? 'Nová jamka' : 'Začať'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {actionError && <Text style={styles.error}>{actionError}</Text>}

      <Text style={styles.h2}>Scorecard</Text>
      <ScrollView horizontal>
        <View>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.nameCol]}>Hráč</Text>
            {holes.map((h) => <Text key={h.id} style={[styles.th, styles.cell]}>{h.number}</Text>)}
            <Text style={[styles.th, styles.cell]}>Spolu</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.nameCol, styles.muted]}>Par</Text>
            {holes.map((h) => <Text key={h.id} style={[styles.td, styles.cell, styles.muted]}>{h.par}</Text>)}
            <Text style={[styles.td, styles.cell]} />
          </View>
          {rows.map((r, i) => (
            <View key={r.player.user_id} style={[styles.tr, r.player.user_id === userId && styles.me]}>
              <Text style={[styles.td, styles.nameCol]} numberOfLines={1}>{i + 1}. {r.player.nickname}</Text>
              {holes.map((h) => {
                const c = r.cells[h.id];
                const text = c.score !== null ? formatScore(c.score) : c.inProgressSips > 0 ? `(${c.inProgressSips})` : '·';
                return <Text key={h.id} style={[styles.td, styles.cell, c.score === null && styles.muted]}>{text}{c.shots > 0 ? '*' : ''}</Text>;
              })}
              <Text style={[styles.td, styles.cell, styles.total]}>{formatScore(r.total)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.muted}>Čísla v zátvorke sú glgy rozpitého piva. * = v jamke padol shot (−2).</Text>

      {!finished && round.created_by === userId && (
        <Pressable onPress={() => call('finish_round', { p_round: roundId }, false)} disabled={busy}>
          <Text style={styles.danger}>Ukončiť kolo</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingTop: 56, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted },
  code: { color: colors.accent, fontWeight: '700', letterSpacing: 1 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  flex: { flex: 1 },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: 10, padding: 12, fontSize: 16 },
  sipButton: { backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 36, alignItems: 'center' },
  sipText: { color: '#fff', fontSize: 34, fontWeight: '900' },
  sipCount: { color: '#e4fff0', fontSize: 18, marginTop: 4 },
  button: { backgroundColor: '#2c3a33', borderRadius: 12, padding: 16, alignItems: 'center' },
  shotButton: { backgroundColor: '#b5651d', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#2c3a33', borderRadius: 10, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { color: colors.accent, textAlign: 'center', fontSize: 16 },
  disabled: { opacity: 0.4 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#26302b' },
  me: { backgroundColor: '#18261e' },
  th: { color: colors.muted, fontWeight: '700', paddingVertical: 8 },
  td: { color: colors.text, paddingVertical: 10 },
  nameCol: { width: 120, paddingRight: 8 },
  cell: { width: 52, textAlign: 'center' },
  total: { fontWeight: '800' },
  error: { color: '#ff6b6b' },
  danger: { color: '#ff6b6b', textAlign: 'center', marginTop: 16, fontSize: 16 },
});
