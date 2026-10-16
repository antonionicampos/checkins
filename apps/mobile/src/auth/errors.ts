/** Traduz os códigos de erro do Firebase Auth para mensagens para o usuário. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  switch (code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Espere um pouco e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet.';
    case 'auth/account-exists-with-different-credential':
      return 'Este e-mail já entra de outro jeito. Use e-mail e senha.';
    default:
      return (err as Error).message ?? 'Não foi possível entrar.';
  }
}
