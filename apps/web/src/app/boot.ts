// SPDX-License-Identifier: AGPL-3.0-or-later
// Démarrage de la SPA : état initial (`GET /api/bootstrap`), puis langue et thème.
// Le client API typé et les stores (session, préférences) reprendront ce
// chargement en P0.12.

import {
  DEFAULT_LOCALE,
  bootstrapResponseSchema,
  resolveTheme,
  type BootstrapResponse,
  type Locale,
  type ResolvedTheme,
} from '@hubarr/shared';
import { appUrl } from './base-path';
import { localeFromQuery } from './plugins/i18n';

/** État initial du shell, ou `null` si le serveur ne répond pas correctement. */
export async function fetchBootstrap(
  fetcher: typeof fetch = fetch,
): Promise<BootstrapResponse | null> {
  try {
    const response = await fetcher(appUrl('/api/bootstrap'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const parsed = bootstrapResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Langue de l'interface : `?_locale` ponctuel, puis celle résolue par le
 * serveur (session, préférence `display_language`), puis `en`.
 */
export function resolveLocale(search: string, bootstrap: BootstrapResponse | null): Locale {
  return localeFromQuery(search) ?? bootstrap?.locale ?? DEFAULT_LOCALE;
}

/** Thème du bootstrap ; sans serveur, le mode classique par défaut (comme `/api/theme.css`). */
export function resolveInitialTheme(bootstrap: BootstrapResponse | null): ResolvedTheme {
  return bootstrap?.theme ?? resolveTheme(undefined, undefined);
}
