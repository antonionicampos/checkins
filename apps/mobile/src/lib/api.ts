import type {
  Checkin,
  Conversation,
  CreateGroupInput,
  Group,
  GroupDetail,
  GroupMessage,
  Menu,
  Message,
  CreateCheckinInput,
  HealthResponse,
  Place,
  PlaceCategory,
  PlaceReviewsResponse,
  PresenceResponse,
  StartConversationInput,
  UpdateMeInput,
  User,
} from '@checkins/shared';
import { auth } from './firebase';

/**
 * Endereço da API. No celular com Expo Go, use o IP da máquina na rede local
 * (ex.: http://192.168.0.10:3000), não "localhost". Configure em apps/mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chama a API mandando o token do Firebase de quem está logado (renovado sozinho quando expira). */
async function request<T>(path: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // FormData (envio de arquivo) define o próprio content-type, com o boundary.
      ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !okStatuses.includes(res.status)) {
    throw new ApiError(res.status, body.error ?? `A API respondeu ${res.status}`);
  }
  return body;
}

export function getHealth() {
  // 503 também traz o corpo com o estado de cada serviço.
  return request<HealthResponse>('/health', {}, [503]);
}

export function getNearbyPlaces(params: { lat: number; lng: number; radius?: number; category?: PlaceCategory }) {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    ...(params.radius ? { radius: String(params.radius) } : {}),
    ...(params.category ? { category: params.category } : {}),
  });
  return request<{ places: Place[] }>(`/places/nearby?${qs}`);
}

export function getMe() {
  return request<User>('/me');
}

export function updateMe(input: UpdateMeInput) {
  return request<User>('/me', { method: 'PATCH', body: JSON.stringify(input) });
}

export function getPlace(placeId: string) {
  return request<Place>(`/places/${placeId}`);
}

export function createCheckin(placeId: string, input: CreateCheckinInput) {
  return request<Checkin>(`/places/${placeId}/checkins`, { method: 'POST', body: JSON.stringify(input) });
}

export function getPresence(placeId: string) {
  return request<PresenceResponse>(`/places/${placeId}/presence`);
}

export function getPlaceReviews(placeId: string) {
  return request<PlaceReviewsResponse>(`/places/${placeId}/checkins`);
}

export async function leavePlace() {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}/me/presence`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `A API respondeu ${res.status}`);
}

export function startConversation(input: StartConversationInput) {
  return request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(input) });
}

export function getConversations() {
  return request<{ conversations: Conversation[] }>('/conversations');
}

export function getConversation(conversationId: string) {
  return request<Conversation>(`/conversations/${conversationId}`);
}

export function answerConversation(conversationId: string, action: 'accept' | 'decline') {
  return request<Conversation>(`/conversations/${conversationId}/${action}`, { method: 'POST' });
}

export function getMessages(conversationId: string, before?: string) {
  const qs = before ? `?${new URLSearchParams({ before })}` : '';
  return request<{ messages: Message[] }>(`/conversations/${conversationId}/messages${qs}`);
}

export function sendMessage(conversationId: string, text: string) {
  return request<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function getPlaceGroups(placeId: string) {
  return request<{ groups: Group[] }>(`/places/${placeId}/groups`);
}

export function createGroup(placeId: string, input: CreateGroupInput) {
  return request<Group>(`/places/${placeId}/groups`, { method: 'POST', body: JSON.stringify(input) });
}

export function getMyGroups() {
  return request<{ groups: Group[] }>('/me/groups');
}

export function getGroup(groupId: string) {
  return request<GroupDetail>(`/groups/${groupId}`);
}

export function joinGroup(groupId: string) {
  return request<Group>(`/groups/${groupId}/join`, { method: 'POST' });
}

/** Chamadas que respondem 204 (sem corpo). */
async function requestNoContent(path: string, method: string) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `A API respondeu ${res.status}`);
  }
}

export function leaveGroup(groupId: string) {
  return requestNoContent(`/groups/${groupId}/leave`, 'POST');
}

export function removeGroupMember(groupId: string, userId: string) {
  return requestNoContent(`/groups/${groupId}/members/${userId}`, 'DELETE');
}

export function closeGroup(groupId: string) {
  return requestNoContent(`/groups/${groupId}`, 'DELETE');
}

export function getGroupMessages(groupId: string) {
  return request<{ messages: GroupMessage[] }>(`/groups/${groupId}/messages`);
}

export function sendGroupMessage(groupId: string, text: string) {
  return request<GroupMessage>(`/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
}

export function getMenus(placeId: string) {
  return request<{ menus: Menu[] }>(`/places/${placeId}/menus`);
}

/** Envia o cardápio (foto ou PDF) como multipart; `uri` é o arquivo local escolhido no celular. */
export async function uploadMenu(placeId: string, file: { uri: string; name: string; mimeType: string }) {
  const body = new FormData();
  // No React Native, o FormData aceita { uri, name, type } e lê o arquivo do celular.
  body.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return request<Menu>(`/places/${placeId}/menus`, { method: 'POST', body });
}

export function toggleMenuOutdated(menuId: string) {
  return request<Menu>(`/menus/${menuId}/outdated`, { method: 'POST' });
}

export function deleteMenu(menuId: string) {
  return requestNoContent(`/menus/${menuId}`, 'DELETE');
}

/** Endereço completo de um arquivo servido pela API (ex.: a foto do cardápio). */
export function mediaUrl(path: string) {
  return `${API_URL}${path}`;
}
