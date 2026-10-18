import * as Notifications from 'expo-notifications';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { setCurrentPath, urlFromResponse } from '../lib/push';
import { colors } from '../theme';

/** Ao tocar numa notificação (com o app aberto ou fechado), abre a conversa ou o grupo dela. */
function useNotificationNavigation(ready: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => setCurrentPath(pathname), [pathname]);

  useEffect(() => {
    const url = urlFromResponse(lastResponse);
    if (!ready || !url) return;
    router.push(url as never);
    void Notifications.clearLastNotificationResponseAsync();
  }, [ready, lastResponse, router]);
}

function RootNavigator() {
  const { initializing, firebaseUser } = useAuth();
  useNotificationNavigation(!initializing && firebaseUser !== null);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const signedIn = firebaseUser !== null;
  return (
    // Botão de voltar só com a seta, sem o nome da tela anterior (o iOS mostra o nome por padrão).
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'Lugares perto de você' }} />
        <Stack.Screen name="place/[id]" options={{ title: '' }} />
        <Stack.Screen name="conversations/index" options={{ title: 'Conversas e grupos' }} />
        <Stack.Screen name="conversations/[id]" options={{ title: '' }} />
        <Stack.Screen name="groups/new" options={{ title: 'Novo grupo' }} />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/members" options={{ title: 'Membros' }} />
        <Stack.Screen name="profile/[id]" options={{ title: '' }} />
        <Stack.Screen name="recommend/[placeId]" options={{ title: 'Recomendar' }} />
        <Stack.Screen name="blocked" options={{ title: 'Pessoas bloqueadas' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
