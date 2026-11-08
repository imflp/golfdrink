import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export default function HomeScreen({ nickname }: { nickname: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ahoj, {nickname}!</Text>
      <Text style={styles.text}>Tímy, kolá a jamky pribudnú v ďalšom kroku.</Text>
      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={styles.link}>Odhlásiť sa</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.muted, textAlign: 'center' },
  link: { color: colors.accent, textAlign: 'center' },
});
