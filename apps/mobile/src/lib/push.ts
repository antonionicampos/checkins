import type { PushData } from '@checkins/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from './api';

/** ID do projeto no EAS (app.config.ts lê de EXPO_PUBLIC_EAS_PROJECT_ID). Sem ele não há token de push. */
const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId || undefined;

/** Tela aberta agora, para não mostrar aviso da conversa que a pessoa já está lendo. */
let currentPath = '';
export function setCurrentPath(path: string) {
  currentPath = path;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const url = (notification.request.content.data as Partial<PushData> | undefined)?.url;
    const show = url !== currentPath;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

let registeredToken: string | null = null;

/**
 * Pede permissão, pega o token do Expo Push e manda para a API. Não faz nada (sem erro) no simulador,
 * sem projeto EAS configurado, sem permissão ou no Expo Go do Android, que não recebe push.
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice || !projectId) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Mensagens e convites',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
    registeredToken = token;
  } catch (err) {
    console.warn('Não foi possível ativar as notificações', err);
  }
}

/** Ao sair da conta, para de mandar notificações para este aparelho. */
export async function unregisterForPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await unregisterPushToken(token).catch(() => {});
}

/** Endereço da tela que a notificação tocada deve abrir. */
export function urlFromResponse(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = (response?.notification.request.content.data as Partial<PushData> | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
