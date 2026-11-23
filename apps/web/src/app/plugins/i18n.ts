// SPDX-License-Identifier: AGPL-3.0-or-later
// vue-i18n branché sur le format ICU des catalogues.
//
// Les messages ne passent pas par le compilateur de vue-i18n (retiré du bundle,
// voir `vite.config.ts`) mais par `IcuMessageCache` : `t('clé', { count: 3 })`
// rend les pluriels ICU de Prismarr à l'identique.
// Une seule langue est chargée à la fois, à la demande (un chunk par langue) ;
// FR et EN ont les mêmes clés (test du paquet partagé), d'où l'absence de repli.

import {
  DEFAULT_LOCALE,
  IcuMessageCache,
  isLocale,
  loadMessages,
  type Locale,
  type MessageValues,
} from '@hubarr/shared';
import { createI18n, type MessageCompiler, type MessageContext } from 'vue-i18n';

const icu = new IcuMessageCache((error, message, locale) => {
  if (import.meta.env.DEV) console.warn(`[i18n] ${locale} : ${error.message}\n${message}`);
});

/**
 * Compilateur vue-i18n : vue-i18n mute la fonction renvoyée (`key`, `locale`),
 * on en crée donc une par appel, le travail de compilation ICU étant en cache.
 */
export const icuMessageCompiler: MessageCompiler = (message, { locale }) => {
  // Les catalogues sont en JSON brut : jamais d'AST précompilé.
  const source = typeof message === 'string' ? message : '';
  return (context: MessageContext) => icu.format(source, locale, context.values as MessageValues);
};

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: false,
  messages: {},
  messageCompiler: icuMessageCompiler,
  // HTML voulu dans une partie des messages (`<em>`, `<strong>`), rendu par les composants.
  warnHtmlMessage: false,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
});

/** Charge au besoin le catalogue puis bascule l'interface (et `<html lang>`) dans `locale`. */
export async function setLocale(locale: Locale): Promise<void> {
  const { global } = i18n;
  if (!global.availableLocales.includes(locale)) {
    global.setLocaleMessage(locale, await loadMessages(locale));
  }
  global.locale.value = locale;
  document.documentElement.lang = locale;
}

/**
 * `?_locale=xx` : aperçu ponctuel dans une autre langue, prioritaire et jamais
 * enregistré (`LocaleSubscriber` d'origine). Valeur inconnue ignorée.
 */
export function localeFromQuery(search: string): Locale | null {
  const value = new URLSearchParams(search).get('_locale');
  return isLocale(value) ? value : null;
}
