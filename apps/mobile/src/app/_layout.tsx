import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../auth/AuthProvider';

function RootNavigator() {
  const { initializing, firebaseUser } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const signedIn = firebaseUser !== null;
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'Lugares perto de você' }} />
        <Stack.Screen name="place/[id]" options={{ title: '' }} />
        <Stack.Screen name="conversations/index" options={{ title: 'Conversas e grupos' }} />
        <Stack.Screen name="conversations/[id]" options={{ title: '' }} />
        <Stack.Screen name="groups/new" options={{ title: 'Novo grupo' }} />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/members" options={{ title: 'Membros' }} />
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
