/** Distância máxima (em metros) entre o usuário e o lugar para fazer check-in ou criar grupo. */
export const PRESENCE_RADIUS_METERS = 100;

/** Por quanto tempo um check-in conta como "presente no local". */
export const CHECKIN_PRESENCE_HOURS = 3;

/** Categorias iniciais de lugares (a lista final ainda será definida). */
export const PLACE_CATEGORIES = [
  'bar',
  'restaurante',
  'cafe',
  'academia',
  'balada',
  'outro',
] as const;
