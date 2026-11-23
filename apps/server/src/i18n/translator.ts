// SPDX-License-Identifier: AGPL-3.0-or-later
// Traductions côté serveur, pour les rares textes produits hors navigateur
// (flux iCal). Mêmes catalogues et même compilateur ICU que le front
// ; une langue est chargée à la première demande.

import {
  IcuMessageCache,
  flattenMessages,
  isLocale,
  loadMessages,
  type Locale,
  type MessageValues,
} from '@hubarr/shared';

const catalogs = new Map<Locale, Promise<Map<string, string>>>();
const icu = new IcuMessageCache();

function catalog(locale: Locale): Promise<Map<string, string>> {
  let pending = catalogs.get(locale);
  if (pending === undefined) {
    pending = loadMessages(locale).then(flattenMessages);
    catalogs.set(locale, pending);
  }
  return pending;
}

export type Translate = (key: string, values?: MessageValues) => string;

/** Fonction de traduction d'une langue ; une clé absente est rendue telle quelle. */
export async function translator(locale: string): Promise<Translate> {
  const lang: Locale = isLocale(locale) ? locale : 'en';
  const messages = await catalog(lang);
  return (key, values) => {
    const message = messages.get(key);
    return message === undefined ? key : icu.format(message, lang, values);
  };
}
