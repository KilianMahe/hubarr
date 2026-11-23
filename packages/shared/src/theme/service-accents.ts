// SPDX-License-Identifier: AGPL-3.0-or-later
// Accent par service (option B des maquettes P0.11) : dans la vue
// d'un service, la barre du haut, l'indicateur de la barre basse, les puces
// actives, les boutons pleins et le FAB prennent la couleur du service. Hors
// d'un service, ces mêmes rôles reprennent l'accent du thème.
//
// Teintes propres à Hubarr, une variante pour les
// palettes sombres et une pour les claires. Chaque teinte est ensuite ajustée
// au contraste de la palette active (`ensureContrast`) : elle reste lisible sur
// les 17 préréglages comme en mode classique (test du paquet).

import type { ServiceId } from '../constants/services';
import type { ThemePalette } from '../schemas/theme';
import { contrastRatio, ensureContrast, mixHex, readableOn } from './color-math';

export const SERVICE_ACCENTS: Record<ServiceId, { dark: string; light: string }> = {
  radarr: { dark: '#fbbf24', light: '#b45309' },
  sonarr: { dark: '#38bdf8', light: '#0369a1' },
  prowlarr: { dark: '#fb923c', light: '#c2410c' },
  bazarr: { dark: '#a3e635', light: '#4d7c0f' },
  qbittorrent: { dark: '#2dd4bf', light: '#0f766e' },
  transmission: { dark: '#f87171', light: '#b91c1c' },
  deluge: { dark: '#60a5fa', light: '#1d4ed8' },
  sabnzbd: { dark: '#facc15', light: '#a16207' },
  nzbget: { dark: '#4ade80', light: '#15803d' },
  gluetun: { dark: '#a78bfa', light: '#6d28d9' },
  tautulli: { dark: '#f59e0b', light: '#b45309' },
  tracearr: { dark: '#e879f9', light: '#a21caf' },
  emby: { dark: '#34d399', light: '#047857' },
  seerr: { dark: '#c084fc', light: '#7e22ce' },
  tmdb: { dark: '#22d3ee', light: '#0e7490' },
};

/** Noms des couleurs Vuetify posées par l'accent (classes `bg-service`, `text-service`…). */
export interface ServiceAccentColors {
  /** Remplissage : boutons pleins, FAB, indicateurs (3:1 sur la surface, WCAG 1.4.11). */
  service: string;
  /** Texte et icônes posés sur `service` (4,5:1). */
  'on-service': string;
  /** Texte et icônes à la couleur du service sur la surface : liens, boutons tonals (4,5:1). */
  'service-text': string;
  /** Fond de la barre du haut dans la vue du service. */
  'service-bar': string;
  /** Fond des puces actives et de l'indicateur de la barre basse. */
  'service-container': string;
  /** Texte sur `service-container` (4,5:1). */
  'on-service-container': string;
}

/**
 * Couleurs d'accent pour `palette` : celles du service, ou à défaut (hors vue de
 * service) celles de l'accent du thème `primary`.
 */
export function serviceAccentColors(
  palette: Pick<ThemePalette, 'dark' | 'surface' | 'topbar'>,
  primary: string,
  service: ServiceId | null,
): ServiceAccentColors {
  const base =
    service === null ? primary : SERVICE_ACCENTS[service][palette.dark ? 'dark' : 'light'];
  // Remplissage : texte blanc dès que la teinte s'y prête (au prix d'un léger
  // assombrissement), quasi-noir sinon ; puis au moins 3:1 sur la surface.
  const prefersWhite = contrastRatio('#ffffff', base) >= 3.5;
  let on = prefersWhite ? '#ffffff' : '#141414';
  let fill = ensureContrast(ensureContrast(base, on), palette.surface, 3);
  if (contrastRatio(on, fill) < 4.5) {
    on = readableOn(fill);
    fill = ensureContrast(fill, on);
  }
  const text = ensureContrast(base, palette.surface);
  const container = mixHex(text, palette.surface, 0.22);
  return {
    service: fill,
    'on-service': on,
    'service-text': text,
    'service-bar': service === null ? palette.topbar : mixHex(text, palette.topbar, 0.14),
    'service-container': container,
    'on-service-container': ensureContrast(text, container),
  };
}
