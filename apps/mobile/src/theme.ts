/**
 * Paleta do app ("Fim de tarde"): terracota quente para ações e navegação, verde-azulado para
 * presença no local e fundo creme. Use sempre estas cores em vez de escrever o hex na tela.
 */
export const colors = {
  /** Botões principais, ícones de navegação, links e balões das minhas mensagens. */
  primary: '#C2410C',
  /** Fundo suave de um item selecionado. */
  primarySoft: '#FDE6D8',
  /** Texto e ícones sobre `primary` (ou `danger`). */
  onPrimary: '#FFFFFF',
  /** Link sobre fundo escuro (visualizador de fotos). */
  primaryOnDark: '#FB9F6B',

  /** Presença no local ("Você está aqui") e mensagens de sucesso. */
  presence: '#0B7A75',
  /** Estrelas das notas. */
  star: '#D97706',
  warning: '#B54708',
  danger: '#B42318',
  dangerOnDark: '#FF8A7A',

  /** Fundo das telas. */
  background: '#FFF8F3',
  /** Cartões, linhas de lista e balões da outra pessoa. */
  surface: '#F5EDE6',
  /** Espaço reservado de imagens e avatares. */
  surfaceStrong: '#EADFD5',
  /** Campos de texto e cartões sobre balões coloridos. */
  surfaceRaised: '#FFFFFF',
  border: '#E2D6CC',
  divider: '#EFE5DC',

  text: '#1F1A17',
  textSecondary: '#3D3530',
  textMuted: '#6B625C',
  textSubtle: '#8C827B',

  /** Fundo do visualizador de fotos e sombras. */
  black: '#000000',
  backdrop: 'rgba(31,26,23,0.4)',
  mapLabelBackground: 'rgba(255,248,243,0.85)',
} as const;
