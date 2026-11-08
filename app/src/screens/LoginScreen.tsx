import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('+421');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
    setBusy(false);
    if (error) setError(error.message);
    else setCodeSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GOLF&DRINK</Text>
      <Text style={styles.subtitle}>Prihlás sa telefónnym číslom</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+421 900 000 000"
        placeholderTextColor={colors.muted}
        editable={!codeSent}
      />
      {codeSent && (
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="Kód z SMS"
          placeholderTextColor={colors.muted}
          maxLength={6}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={codeSent ? verify : sendCode} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{codeSent ? 'Potvrdiť kód' : 'Poslať kód'}</Text>}
      </Pressable>
      {codeSent && (
        <Pressable onPress={() => { setCodeSent(false); setCode(''); }}>
          <Text style={styles.link}>Zmeniť číslo</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: colors.accent, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 12 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, padding: 14, fontSize: 18 },
  button: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  link: { color: colors.muted, textAlign: 'center', marginTop: 8 },
  error: { color: '#ff6b6b' },
});
