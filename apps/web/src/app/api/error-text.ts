// SPDX-License-Identifier: AGPL-3.0-or-later
// Texte d'une erreur d'action, pour un bilan ou un dialogue : premier problème
// de validation (clé i18n), sinon message du serveur (clé i18n `media.api.*`
// ou texte d'un service tiers, affiché tel quel, jamais en HTML), sinon le
// message de repli.

import { ApiError, validationMessages } from './client';

/** Message du serveur reconnu comme clé i18n (`media.api.label_required`). */
const I18N_KEY = /^[a-z_]+(\.[a-z0-9_]+)+$/;

export function apiErrorText(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  const issue = validationMessages(error).find((message) => message.includes('.'));
  if (issue !== undefined) return t(issue);
  if (error instanceof ApiError) {
    const message = error.serverMessage;
    if (message !== undefined && message !== '') {
      return I18N_KEY.test(message) ? t(message) : message;
    }
  }
  return t(fallbackKey);
}
