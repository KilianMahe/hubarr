// SPDX-License-Identifier: AGPL-3.0-or-later
// Section « Langues » : port de `loadServiceLanguages` et `languagesSave`.
//
// - Hubarr : langue de l'interface (`display_language`) et des métadonnées TMDB ;
// - Radarr : langue de l'interface et des infos film, par instance active
//   (`/api/v3/config/ui`, liste `/api/v3/language`) ;
// - Sonarr : langue de l'interface seulement (Sonarr v4 n'a plus de langue globale) ;
// - Prowlarr : code de langue (liste figée, pas d'endpoint) ;
// - Seerr : langue globale (`/settings/main`) **et** celle de l'utilisateur 1
//   (l'admin), qui pilote la langue des métadonnées des appels faits avec la clé.
//
// Chaque service est traité à part : un service injoignable n'empêche ni
// l'affichage ni l'enregistrement des autres ; l'échec est signalé par son nom.

import {
  LANGUAGES_SECTION_METADATA,
  PROWLARR_UI_LANGUAGES,
  SEERR_UI_LANGUAGES,
  type LanguagesResponse,
  type LanguagesSaveRequest,
  type LanguagesSaveResponse,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { listEnabledInstances } from '../instances/instances';
import { apiKeyServiceClient, arrClient } from '../services/clients';
import { isServiceConfigured } from '../services/config';
import { readDisplayValues, setHiddenPreference } from './preferences';

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Identifiant de la configuration UI (`/config/ui/{id}`), 1 à défaut. */
function configId(config: Json): number {
  return typeof config.id === 'number' && Number.isInteger(config.id) ? config.id : 1;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function languageList(value: unknown): { id: number; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((row) => typeof row.id === 'number' && typeof row.name === 'string')
    .map((row) => ({ id: row.id as number, name: row.name as string }));
}

export async function loadLanguages(app: FastifyInstance): Promise<LanguagesResponse> {
  const display = readDisplayValues(app.db);
  const arr = async (type: 'radarr' | 'sonarr') =>
    Promise.all(
      listEnabledInstances(app.db, type).map(async (row) => {
        const base = {
          slug: row.slug,
          name: row.name,
          current: null,
          currentInfo: null,
          available: [],
          error: false,
        };
        try {
          const client = arrClient(app, row);
          const [ui, languages] = await Promise.all([
            client.get('/api/v3/config/ui'),
            client.get('/api/v3/language'),
          ]);
          const config = isRecord(ui) ? ui : {};
          return {
            ...base,
            current: numberOrNull(config.uiLanguage),
            currentInfo: type === 'radarr' ? numberOrNull(config.movieInfoLanguage) : null,
            available: languageList(languages),
          };
        } catch (error) {
          app.log.warn({ instance: row.slug, err: error }, `langues ${type} illisibles`);
          return { ...base, error: true };
        }
      }),
    );

  const code = async (service: 'prowlarr' | 'seerr') => {
    const available: Record<string, string> =
      service === 'prowlarr' ? { ...PROWLARR_UI_LANGUAGES } : { ...SEERR_UI_LANGUAGES };
    if (!isServiceConfigured(app.db, service))
      return { configured: false, current: null, available, error: false };
    try {
      const client = apiKeyServiceClient(app, service);
      const config = await client.get(
        service === 'prowlarr' ? '/api/v1/config/ui' : '/api/v1/settings/main',
      );
      const field = service === 'prowlarr' ? 'uiLanguage' : 'locale';
      const current = isRecord(config) && typeof config[field] === 'string' ? config[field] : null;
      return { configured: true, current, available, error: false };
    } catch (error) {
      app.log.warn({ service, err: error }, 'langue illisible');
      return { configured: true, current: null, available, error: true };
    }
  };

  const [radarr, sonarr, prowlarr, seerr] = await Promise.all([
    arr('radarr'),
    arr('sonarr'),
    code('prowlarr'),
    code('seerr'),
  ]);
  return {
    hubarr: { ui: display.display_language, metadata: display.display_metadata_language },
    radarr,
    sonarr,
    prowlarr,
    seerr,
  };
}

export async function saveLanguages(
  app: FastifyInstance,
  request: LanguagesSaveRequest,
): Promise<LanguagesSaveResponse> {
  const failed: string[] = [];

  if (request.hubarrUi !== undefined && (request.hubarrUi === 'fr' || request.hubarrUi === 'en')) {
    setHiddenPreference(app.db, 'display_language', request.hubarrUi);
  }
  if (
    request.hubarrMetadata !== undefined &&
    (LANGUAGES_SECTION_METADATA as readonly string[]).includes(request.hubarrMetadata)
  ) {
    setHiddenPreference(app.db, 'display_metadata_language', request.hubarrMetadata);
  }

  // Radarr : une configuration UI par instance touchée ; l'échec porte le nom de l'instance.
  const radarrUi = request.radarrUi ?? {};
  const radarrInfo = request.radarrInfo ?? {};
  for (const row of listEnabledInstances(app.db, 'radarr')) {
    const ui = radarrUi[row.slug];
    const info = radarrInfo[row.slug];
    if (ui === undefined && info === undefined) continue;
    try {
      const client = arrClient(app, row);
      const current = await client.get('/api/v3/config/ui');
      const config: Json = isRecord(current) ? { ...current } : {};
      let changed = false;
      if (ui !== undefined && config.uiLanguage !== ui) [config.uiLanguage, changed] = [ui, true];
      if (info !== undefined && config.movieInfoLanguage !== info)
        [config.movieInfoLanguage, changed] = [info, true];
      if (changed) await client.put(`/api/v3/config/ui/${configId(config)}`, config);
    } catch (error) {
      failed.push(row.name);
      app.log.warn({ instance: row.slug, err: error }, 'langues radarr non enregistrées');
    }
  }

  const sonarrUi = request.sonarrUi ?? {};
  for (const row of listEnabledInstances(app.db, 'sonarr')) {
    const ui = sonarrUi[row.slug];
    if (ui === undefined) continue;
    try {
      const client = arrClient(app, row);
      const current = await client.get('/api/v3/config/ui');
      const config: Json = isRecord(current) ? { ...current } : {};
      if (config.uiLanguage !== ui)
        await client.put('/api/v3/config/ui', { ...config, uiLanguage: ui });
    } catch (error) {
      failed.push(row.name);
      app.log.warn({ instance: row.slug, err: error }, 'langue sonarr non enregistrée');
    }
  }

  const prowlarrUi = request.prowlarrUi;
  if (prowlarrUi !== undefined && isServiceConfigured(app.db, 'prowlarr')) {
    try {
      const client = apiKeyServiceClient(app, 'prowlarr');
      const current = await client.get('/api/v1/config/ui');
      const config: Json = isRecord(current) ? { ...current } : {};
      if (Object.hasOwn(PROWLARR_UI_LANGUAGES, prowlarrUi) && config.uiLanguage !== prowlarrUi) {
        await client.put(`/api/v1/config/ui/${configId(config)}`, {
          ...config,
          uiLanguage: prowlarrUi,
        });
      }
    } catch (error) {
      failed.push('Prowlarr');
      app.log.warn({ err: error }, 'langue prowlarr non enregistrée');
    }
  }

  const seerrUi = request.seerrUi;
  if (
    seerrUi !== undefined &&
    isServiceConfigured(app.db, 'seerr') &&
    Object.hasOwn(SEERR_UI_LANGUAGES, seerrUi)
  ) {
    try {
      const client = apiKeyServiceClient(app, 'seerr');
      const main = await client.get('/api/v1/settings/main');
      // `POST /settings/main` complet échoue (clé d'API en lecture seule) : seule la langue part.
      if (!isRecord(main) || main.locale !== seerrUi)
        await client.post('/api/v1/settings/main', { locale: seerrUi });
      const user = await client.get('/api/v1/user/1/settings/main');
      const userConfig: Json = isRecord(user) ? { ...user } : {};
      if (userConfig.locale !== seerrUi) {
        await client.post('/api/v1/user/1/settings/main', { ...userConfig, locale: seerrUi });
      }
    } catch (error) {
      failed.push('Seerr');
      app.log.warn({ err: error }, 'langue seerr non enregistrée');
    }
  }

  return { failed, locale: readDisplayValues(app.db).display_language };
}
