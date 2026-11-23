// SPDX-License-Identifier: AGPL-3.0-or-later
// Langues de l'interface (`LocaleSubscriber::SUPPORTED` / `FALLBACK` d'origine).

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Langue de repli quand ni la session ni la préférence `display_language` n'en donnent une. */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
