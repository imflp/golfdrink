import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle();
    setNickname(data?.nickname ?? null);
  };

  useEffect(() => {
    if (session) loadProfile(session.user.id);
    else setNickname(null);
  }, [session]);

  let screen;
  if (loading) {
    screen = (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (!session) {
    screen = <LoginScreen />;
  } else if (!nickname) {
    screen = <ProfileSetupScreen userId={session.user.id} onDone={() => loadProfile(session.user.id)} />;
  } else {
    screen = <HomeScreen nickname={nickname} />;
  }

  return (
    <>
      <StatusBar style="light" />
      {screen}
    </>
  );
}
