// SPDX-License-Identifier: AGPL-3.0-or-later
// Stratégies d'authentification des services :
// - `apiKeyHeader` : Radarr, Sonarr, Prowlarr, Seerr (`X-Api-Key`), Bazarr
//   (`X-API-KEY`), Emby (`X-Emby-Token`), Gluetun ;
// - `apiKeyQuery` : TMDB (`api_key`), SABnzbd et Tautulli (`apikey`) ;
// - `basicAuth` : NZBGet, Transmission ;
// - `bearer` : Tracearr ;
// - `cookieSession` : qBittorrent (`SID`), Deluge (`_session_id`), avec une
//   reconnexion et un seul rejeu quand la session a expiré ;
// - `transmissionSessionId` : échange `X-Transmission-Session-Id` (409 → rejeu).
//
// Une stratégie est propre à une instance : elle garde l'état de sa session.

export interface OutgoingRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
}

export interface ResponseHead {
  status: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthStrategy {
  /** Ajoute les identifiants à la requête ; peut ouvrir une session. */
  apply(request: OutgoingRequest): void | Promise<void>;
  /**
   * Appelée après chaque réponse : `true` demande **un** rejeu (session
   * expirée ou jeton renouvelé), après que la stratégie a mis son état à jour.
   */
  shouldRetry?(response: ResponseHead): boolean | Promise<boolean>;
  /** Oublie l'état de session (identifiants modifiés). */
  reset?(): void;
}

export const noAuth: AuthStrategy = { apply: () => undefined };

export function apiKeyHeader(header: string, key: string): AuthStrategy {
  return {
    apply(request) {
      if (key !== '') request.headers[header.toLowerCase()] = key;
    },
  };
}

export function apiKeyQuery(param: string, key: string): AuthStrategy {
  return {
    apply(request) {
      if (key !== '') request.url.searchParams.set(param, key);
    },
  };
}

export function basicAuthHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

/** Basic, omis si l'utilisateur et le mot de passe sont vides (proxy qui authentifie). */
export function basicAuth(user: string, password: string): AuthStrategy {
  return {
    apply(request) {
      if (user !== '' || password !== '') {
        request.headers.authorization = basicAuthHeader(user, password);
      }
    },
  };
}

export function bearer(token: string): AuthStrategy {
  return {
    apply(request) {
      if (token !== '') request.headers.authorization = `Bearer ${token}`;
    },
  };
}

/** Applique plusieurs stratégies dans l'ordre ; un rejeu est demandé si l'une le veut. */
export function combineAuth(...strategies: AuthStrategy[]): AuthStrategy {
  return {
    async apply(request) {
      for (const strategy of strategies) await strategy.apply(request);
    },
    async shouldRetry(response) {
      let retry = false;
      for (const strategy of strategies) {
        if (strategy.shouldRetry && (await strategy.shouldRetry(response))) retry = true;
      }
      return retry;
    },
    reset() {
      for (const strategy of strategies) strategy.reset?.();
    },
  };
}

export interface CookieSessionOptions {
  /**
   * Ouvre une session et renvoie la valeur de l'en-tête `Cookie` à envoyer
   * (`SID=…`), ou `null` si l'authentification est assurée ailleurs (proxy).
   * Lève une erreur si la connexion échoue.
   */
  login: () => Promise<string | null>;
  /** La réponse indique une session expirée (qBittorrent : 403). */
  isExpired: (response: ResponseHead) => boolean;
}

/** Session par cookie, ouverte au premier appel et rouverte une fois si elle expire. */
export function cookieSession(options: CookieSessionOptions): AuthStrategy & {
  readonly cookie: string | null;
} {
  let cookie: string | null = null;
  let opened = false;
  let pending: Promise<void> | null = null;

  const open = async (): Promise<void> => {
    // Une seule connexion à la fois, même avec des appels concurrents.
    pending ??= options
      .login()
      .then((value) => {
        cookie = value;
        opened = true;
      })
      .finally(() => {
        pending = null;
      });
    await pending;
  };

  return {
    get cookie() {
      return cookie;
    },
    async apply(request) {
      if (!opened) await open();
      if (cookie !== null) request.headers.cookie = cookie;
    },
    shouldRetry(response) {
      if (!options.isExpired(response)) return false;
      cookie = null;
      opened = false;
      return true;
    },
    reset() {
      cookie = null;
      opened = false;
    },
  };
}

export const TRANSMISSION_SESSION_HEADER = 'x-transmission-session-id';

/** Échange de jeton de Transmission : un 409 porte le nouvel identifiant de session. */
export function transmissionSessionId(): AuthStrategy & { readonly sessionId: string | null } {
  let sessionId: string | null = null;
  return {
    get sessionId() {
      return sessionId;
    },
    apply(request) {
      if (sessionId !== null) request.headers[TRANSMISSION_SESSION_HEADER] = sessionId;
    },
    shouldRetry(response) {
      if (response.status !== 409) return false;
      const header = response.headers[TRANSMISSION_SESSION_HEADER];
      const value = Array.isArray(header) ? header[0] : header;
      if (value === undefined || value === '' || value === sessionId) return false;
      sessionId = value;
      return true;
    },
    reset() {
      sessionId = null;
    },
  };
}

/** Valeur `nom=valeur` du cookie `name` dans les en-têtes `Set-Cookie` d'une réponse. */
export function readSetCookie(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const raw = headers['set-cookie'];
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    const pair = value.split(';', 1)[0]?.trim() ?? '';
    if (pair.startsWith(`${name}=`)) return pair;
  }
  return null;
}
