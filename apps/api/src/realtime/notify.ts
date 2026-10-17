/** Manda um evento em tempo real para uma pessoa (todas as conexões dela), pelo UID do Firebase. */
export type Notify = (firebaseUid: string, event: string, payload: unknown) => void;

export const noopNotify: Notify = () => {};

/** Sala de Socket.IO de cada pessoa; quem conecta entra na sua automaticamente. */
export const userRoom = (firebaseUid: string) => `user:${firebaseUid}`;
