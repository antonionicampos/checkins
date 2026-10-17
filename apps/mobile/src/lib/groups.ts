/** "até 22:30" para grupos temporários, "sem prazo" para os outros. */
export function expiryLabel(expiresAt?: string): string {
  if (!expiresAt) return 'sem prazo';
  return `até ${new Date(expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
