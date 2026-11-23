// SPDX-License-Identifier: AGPL-3.0-or-later
// Diagnostic de connexion : port de `HealthService::probeFor`,
// `diagnoseFromResponse` et `diagnose`.
//
// Chaque service a une sonde légère qui valide aussi les identifiants
// (`/system/status` des *arr, `mode=queue` de SABnzbd, `get_activity` de
// Tautulli…). La réponse est classée en catégorie (`ok`, `network`, `auth`,
// `forbidden`, `not_found`, `server_error`, `host_whitelist`, `unknown`), que
// le front traduit (`admin.test.category.*`). Aucun détail technique (trace,
// clé) ne sort : seulement la catégorie et le statut HTTP.
//
// La même sonde sert à l'état de santé (P1.4) : un diagnostic `ok` vaut
// « joignable ».

import type { DiagnosisCategory, ServiceId, ServiceTestRequest } from '@hubarr/shared';
import type { Dispatcher } from 'undici';
import type { DbExecutor } from '../../db/client';
import type { ServiceHealthCache } from '../../integrations/http';
import {
  HttpClient,
  basicAuthHeader,
  urlBlockedReason,
  type HostResolver,
  type RequestOptions,
  type UpstreamErrorKind,
} from '../../integrations/http';
import {
  apiKeyOf,
  getDefaultInstance,
  getInstanceBySlug,
  type InstanceRow,
} from '../instances/instances';
import { tmdbApiOrigin } from '../../integrations/tmdb/origin';
import { readServiceConfig } from './config';

export interface Diagnosis {
  ok: boolean;
  category: DiagnosisCategory;
  http: number | null;
}

/** Réponse brute d'une sonde (`httpProbe` d'origine). */
export interface ProbeResponse {
  http: number | null;
  body: string | null;
  /** Erreur réseau ou URL refusée ; vide si une réponse est arrivée. */
  err: string;
}

/** Valeurs utilisées par la sonde. */
export interface ProbeValues {
  url: string;
  apiKey: string;
  user: string;
  password: string;
}

export interface ProbeSpec {
  baseUrl: string;
  request: RequestOptions;
}

/** Délai d'une sonde (5 s dans l'original, connexion comprise). */
export const PROBE_TIMEOUT_MS = 5_000;

export const TRACEARR_API_BASE = '/api/v1/public';

const JSON_ACCEPT = { accept: 'application/json' };

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Sonde d'un service, ou `null` s'il lui manque l'URL ou les identifiants
 * requis (catégorie `unconfigured`).
 */
export function probeFor(service: ServiceId, values: ProbeValues): ProbeSpec | null {
  const url = trimSlash(values.url);
  const { apiKey, user, password } = values;
  switch (service) {
    case 'radarr':
    case 'sonarr':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: {
          path: '/api/v3/system/status',
          headers: { 'x-api-key': apiKey, ...JSON_ACCEPT },
        },
      };
    case 'prowlarr':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: {
          path: '/api/v1/system/status',
          headers: { 'x-api-key': apiKey, ...JSON_ACCEPT },
        },
      };
    case 'seerr':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: {
          path: '/api/v1/settings/about',
          headers: { 'x-api-key': apiKey, ...JSON_ACCEPT },
        },
      };
    case 'tmdb':
      if (apiKey === '') return null;
      return {
        baseUrl: tmdbApiOrigin(),
        request: { path: '/3/configuration', query: { api_key: apiKey }, headers: JSON_ACCEPT },
      };
    case 'qbittorrent':
      if (url === '') return null;
      // Sans identifiants (proxy qui authentifie, issue #10) : simple
      // `app/version` ; un 403 signale alors des identifiants oubliés.
      if (user === '' || password === '') {
        return {
          baseUrl: url,
          request: { path: '/api/v2/app/version', headers: { referer: url } },
        };
      }
      return {
        baseUrl: url,
        request: {
          method: 'POST',
          path: '/api/v2/auth/login',
          form: { username: user, password },
          headers: { referer: url },
        },
      };
    case 'deluge': {
      if (url === '') return null;
      // Mot de passe vide (proxy) : méthode qui exige une session, injectée par le proxy.
      const rpc =
        password === ''
          ? { method: 'web.get_config', params: [], id: 1 }
          : { method: 'auth.login', params: [password], id: 1 };
      return {
        baseUrl: url,
        request: { method: 'POST', path: '/json', json: rpc, headers: JSON_ACCEPT },
      };
    }
    case 'transmission':
      if (url === '') return null;
      // Sans `X-Transmission-Session-Id` : le 409 qui revient prouve que le démon répond.
      return {
        baseUrl: url,
        request: {
          method: 'POST',
          path: '/transmission/rpc',
          json: { method: 'session-get', arguments: { fields: ['version'] }, tag: 1 },
          headers: user === '' ? {} : { authorization: basicAuthHeader(user, password) },
        },
      };
    case 'sabnzbd':
      if (url === '' || apiKey === '') return null;
      // `mode=queue` valide la clé (`mode=version` répond 200 avec n'importe quelle clé).
      return {
        baseUrl: url,
        request: { path: '/api', query: { mode: 'queue', output: 'json', apikey: apiKey } },
      };
    case 'tautulli':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: {
          path: '/api/v2',
          query: { apikey: apiKey, cmd: 'get_activity' },
          headers: JSON_ACCEPT,
        },
      };
    case 'bazarr':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: { path: '/api/system/status', headers: { 'x-api-key': apiKey, ...JSON_ACCEPT } },
      };
    case 'tracearr':
      if (url === '' || apiKey === '') return null;
      return {
        baseUrl: url,
        request: {
          path: `${TRACEARR_API_BASE}/health`,
          headers: { authorization: `Bearer ${apiKey}`, ...JSON_ACCEPT },
        },
      };
    case 'emby': {
      if (url === '' || apiKey === '') return null;
      // `/System/Info` (et non `/Public`) valide la clé, passée en en-tête.
      const base = url.toLowerCase().endsWith('/emby') ? url : `${url}/emby`;
      return {
        baseUrl: base,
        request: { path: '/System/Info', headers: { 'x-emby-token': apiKey, ...JSON_ACCEPT } },
      };
    }
    case 'nzbget':
      if (url === '') return null;
      return {
        baseUrl: url,
        request: {
          method: 'POST',
          path: '/jsonrpc',
          json: { version: '1.1', id: 1, method: 'version', params: [] },
          headers:
            user !== '' || password !== ''
              ? { authorization: basicAuthHeader(user, password) }
              : {},
        },
      };
    case 'gluetun':
      // Pas de sonde dans l'original.
      return null;
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Classement d'une réponse brute (`diagnoseFromResponse`, testé tel quel). */
export function diagnoseFromResponse(response: ProbeResponse, service: ServiceId): Diagnosis {
  const { http, body, err } = response;
  if (err !== '') return { ok: false, category: 'network', http: null };

  // qBittorrent : identifiants faux → 200 avec le corps « Fails. ».
  if (service === 'qbittorrent' && http === 200 && body?.trim() === 'Fails.') {
    return { ok: false, category: 'auth', http };
  }
  // Deluge : tout est 200, le verdict est dans l'enveloppe JSON-RPC.
  if (service === 'deluge' && http === 200 && body !== null) {
    const decoded = parseJson(body);
    if (!isRecord(decoded)) return { ok: false, category: 'unknown', http };
    if (decoded.error !== undefined && decoded.error !== null)
      return { ok: false, category: 'auth', http };
    if (decoded.result === false) return { ok: false, category: 'auth', http };
    return { ok: true, category: 'ok', http };
  }
  // SABnzbd : 403 pour une mauvaise clé comme pour un hôte hors `host_whitelist`.
  if (service === 'sabnzbd' && http === 403 && body !== null) {
    const lower = body.toLowerCase();
    if (lower.includes('hostname')) return { ok: false, category: 'host_whitelist', http };
    if (lower.includes('api key')) return { ok: false, category: 'auth', http };
  }
  // Tautulli : toujours 200, le résultat est dans `response.result`.
  if (service === 'tautulli' && http === 200 && body !== null) {
    const decoded = parseJson(body);
    const result =
      isRecord(decoded) && isRecord(decoded.response) ? decoded.response.result : undefined;
    return result === 'success'
      ? { ok: true, category: 'ok', http }
      : { ok: false, category: 'auth', http };
  }
  // Transmission : 409 = démon joignable (échange de jeton de session).
  if (service === 'transmission' && http === 409) return { ok: true, category: 'ok', http };

  if (http !== null && http >= 200 && http < 300) return { ok: true, category: 'ok', http };
  if (http === 401) return { ok: false, category: 'auth', http };
  if (http === 403) return { ok: false, category: 'forbidden', http };
  if (http === 404) return { ok: false, category: 'not_found', http };
  if (http !== null && http >= 500) return { ok: false, category: 'server_error', http };
  return { ok: false, category: 'unknown', http };
}

export interface DiagnoseDeps {
  health: ServiceHealthCache;
  dispatcher?: Dispatcher | undefined;
  resolve?: HostResolver | undefined;
}

/** Envoie la sonde (garde SSRF comprise) et renvoie la réponse brute. */
export async function runProbe(
  service: ServiceId,
  spec: ProbeSpec,
  deps: DiagnoseDeps,
): Promise<ProbeResponse & { latencyMs: number; errorKind: UpstreamErrorKind | null }> {
  const blocked = await urlBlockedReason(spec.baseUrl, deps.resolve);
  if (blocked !== null) {
    return {
      http: null,
      body: null,
      err: `blocked: ${blocked}`,
      latencyMs: 0,
      errorKind: 'blocked',
    };
  }
  const client = new HttpClient({
    service,
    baseUrl: spec.baseUrl,
    health: deps.health,
    timeoutMs: PROBE_TIMEOUT_MS,
    headers: {},
    ...(deps.dispatcher ? { dispatcher: deps.dispatcher } : {}),
  });
  const result = await client.probe(spec.request);
  if (result.error !== null) {
    return {
      http: null,
      body: null,
      err: result.error.info.networkCode ?? result.error.kind,
      latencyMs: result.latencyMs,
      errorKind: result.error.kind,
    };
  }
  return {
    http: result.status,
    body: result.body,
    err: '',
    latencyMs: result.latencyMs,
    errorKind: null,
  };
}

/** Valeurs enregistrées d'un service (instance par défaut pour Radarr/Sonarr). */
export function savedValues(
  db: DbExecutor,
  service: ServiceId,
  instance?: InstanceRow | null,
): ProbeValues {
  if (service === 'radarr' || service === 'sonarr') {
    const row = instance === undefined ? getDefaultInstance(db, service) : instance;
    return {
      url: row?.url ?? '',
      apiKey: row === null ? '' : (apiKeyOf(row) ?? ''),
      user: '',
      password: '',
    };
  }
  const config = readServiceConfig(db, service);
  return { url: config.url, apiKey: config.apiKey, user: config.user, password: config.password };
}

/** Valeurs du formulaire, une valeur vide retombant sur la valeur enregistrée. */
export function mergeOverrides(saved: ProbeValues, overrides: ServiceTestRequest): ProbeValues {
  const pick = (value: string | undefined, fallback: string) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? fallback : trimmed;
  };
  return {
    url: pick(overrides.url, saved.url),
    apiKey: pick(overrides.apiKey, saved.apiKey),
    user: pick(overrides.user, saved.user),
    // Le mot de passe n'est pas retaillé (des espaces peuvent en faire partie).
    password:
      overrides.password !== undefined && overrides.password !== ''
        ? overrides.password
        : saved.password,
  };
}

/**
 * Diagnostic d'un service. Sans `overrides` (diagnostic passif), un service
 * marqué injoignable n'est pas resondé (`network` aussitôt) ; un « Tester »
 * (avec `overrides`) sonde toujours.
 */
export async function diagnose(
  db: DbExecutor,
  service: ServiceId,
  overrides: ServiceTestRequest | null,
  deps: DiagnoseDeps,
  instanceSlug?: string,
): Promise<Diagnosis> {
  if (overrides === null && deps.health.isDown(service, instanceSlug)) {
    return { ok: false, category: 'network', http: null };
  }
  let instance: InstanceRow | null | undefined;
  if (instanceSlug !== undefined && (service === 'radarr' || service === 'sonarr')) {
    instance = getInstanceBySlug(db, service, instanceSlug);
  }
  const saved = savedValues(db, service, instance);
  const spec = probeFor(service, overrides === null ? saved : mergeOverrides(saved, overrides));
  if (spec === null) return { ok: false, category: 'unconfigured', http: null };
  return diagnoseFromResponse(await runProbe(service, spec, deps), service);
}
