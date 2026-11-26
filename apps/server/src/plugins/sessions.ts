// SPDX-License-Identifier: AGPL-3.0-or-later
// Sessions HTTP stockées dans la table `session`.
//
// - Le cookie `hubarr_session` porte un jeton aléatoire de 256 bits ; la base n'en
//   garde que l'empreinte SHA-256 (une copie de la base ne permet pas d'usurper
//   une session).
// - Durée glissante : 7 jours d'inactivité pour une session authentifiée, 1 jour
//   pour une session anonyme (créée pour porter le jeton CSRF avant la connexion).
//   L'échéance est repoussée au plus une fois par heure, pour limiter les écritures.
// - « Se souvenir de moi » : cookie persistant (Max-Age), sinon cookie de session
//   du navigateur ; l'échéance côté serveur est la même.
// - Régénération à la connexion (fixation de session) : l'ancienne ligne est supprimée.

import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  isLocale,
  type AuthUser,
  type Locale,
} from '@hubarr/shared';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { sessions, users } from '../db/schema';
import { loadAuthUser } from '../modules/users/users';

export const ANONYMOUS_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface SessionData {
  csrfToken: string;
  persistent: boolean;
  /**
   * Langue choisie dans l'assistant avant que la préférence `display_language`
   * existe (clé `_locale` de la session d'origine). Perdue à la régénération.
   */
  locale?: Locale;
}

export interface ActiveSession {
  /** Empreinte du jeton (clé primaire en base). */
  readonly id: string;
  readonly userId: number | null;
  readonly data: SessionData;
  expiresAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Session courante, ou `null` si le cookie est absent, inconnu ou expiré. */
    session: ActiveSession | null;
    /** Utilisateur connecté, ou `null`. */
    user: AuthUser | null;
  }
  interface FastifyInstance {
    sessions: SessionManager;
  }
}

export interface SessionOptions {
  /** Horloge injectable pour les tests. */
  now?: () => number;
}

export interface SessionManager {
  /** Session existante, ou nouvelle session anonyme. */
  ensure(request: FastifyRequest, reply: FastifyReply): ActiveSession;
  /** Ouvre une session authentifiée en remplaçant la session courante. */
  start(
    request: FastifyRequest,
    reply: FastifyReply,
    options: { userId: number; persistent: boolean },
  ): ActiveSession;
  /** Enregistre les données modifiées d'une session. */
  save(session: ActiveSession): void;
  /** Supprime la session courante et son cookie. */
  destroy(request: FastifyRequest, reply: FastifyReply): void;
  /** Supprime les sessions expirées ; renvoie leur nombre. */
  purgeExpired(): number;
}

/**
 * Supprime les sessions d'un compte, sauf éventuellement la session courante
 * (changement de mot de passe depuis le profil, réinitialisation par la CLI).
 * Renvoie le nombre de sessions supprimées.
 */
export function revokeUserSessions(db: DbExecutor, userId: number, exceptId?: string): number {
  const ofUser = eq(sessions.userId, userId);
  return db
    .delete(sessions)
    .where(exceptId === undefined ? ofUser : and(ofUser, ne(sessions.id, exceptId)))
    .run().changes;
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isSessionData(value: unknown): value is SessionData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.csrfToken === 'string' &&
    typeof data.persistent === 'boolean' &&
    (data.locale === undefined || isLocale(data.locale))
  );
}

const sessionsPlugin: FastifyPluginAsync<SessionOptions> = async (app, options) => {
  const now = options.now ?? Date.now;
  const db = app.db;

  await app.register(cookie);
  app.decorateRequest('session', null);
  app.decorateRequest('user', null);

  const ttlFor = (userId: number | null) =>
    userId === null ? ANONYMOUS_SESSION_TTL_MS : SESSION_TTL_MS;

  function setCookie(
    request: FastifyRequest,
    reply: FastifyReply,
    token: string,
    session: ActiveSession,
  ) {
    void reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // `request.protocol` tient compte de X-Forwarded-Proto derrière un proxy de confiance.
      secure: request.protocol === 'https',
      ...(session.data.persistent ? { maxAge: Math.floor(ttlFor(session.userId) / 1000) } : {}),
    });
  }

  function create(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: number | null,
    persistent: boolean,
  ): ActiveSession {
    const token = randomBytes(32).toString('base64url');
    const session: ActiveSession = {
      id: digest(token),
      userId,
      data: { csrfToken: randomBytes(32).toString('base64url'), persistent },
      expiresAt: new Date(now() + ttlFor(userId)),
    };
    db.insert(sessions)
      .values({
        id: session.id,
        userId,
        data: { ...session.data },
        expiresAt: session.expiresAt,
        createdAt: new Date(now()),
      })
      .run();
    setCookie(request, reply, token, session);
    request.session = session;
    return session;
  }

  function clear(request: FastifyRequest, reply: FastifyReply) {
    if (request.session !== null)
      db.delete(sessions).where(eq(sessions.id, request.session.id)).run();
    request.session = null;
    request.user = null;
    void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token === undefined || !TOKEN_PATTERN.test(token)) return;
    const id = digest(token);
    const row = db
      .select({ session: sessions, user: users })
      .from(sessions)
      .leftJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .get();
    const current = now();
    if (
      row === undefined ||
      row.session.expiresAt.getTime() <= current ||
      !isSessionData(row.session.data)
    ) {
      if (row !== undefined) db.delete(sessions).where(eq(sessions.id, id)).run();
      void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return;
    }
    const session: ActiveSession = {
      id,
      userId: row.session.userId,
      data: row.session.data,
      expiresAt: row.session.expiresAt,
    };
    request.session = session;
    request.user = row.user === null ? null : loadAuthUser(db, row.user);

    const ttl = ttlFor(session.userId);
    if (session.expiresAt.getTime() - current < ttl - REFRESH_INTERVAL_MS) {
      session.expiresAt = new Date(current + ttl);
      db.update(sessions).set({ expiresAt: session.expiresAt }).where(eq(sessions.id, id)).run();
      if (session.data.persistent) setCookie(request, reply, token, session);
    }
  });

  const manager: SessionManager = {
    ensure: (request, reply) => request.session ?? create(request, reply, null, false),
    start: (request, reply, { userId, persistent }) => {
      clear(request, reply);
      return create(request, reply, userId, persistent);
    },
    save: (session) => {
      db.update(sessions)
        .set({ data: { ...session.data } })
        .where(eq(sessions.id, session.id))
        .run();
    },
    destroy: clear,
    purgeExpired: () =>
      db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date(now())))
        .run().changes,
  };
  app.decorate('sessions', manager);

  // Purge au démarrage puis toutes les heures, sans retenir le processus.
  let timer: NodeJS.Timeout | undefined;
  app.addHook('onReady', () => {
    manager.purgeExpired();
    timer = setInterval(() => manager.purgeExpired(), PURGE_INTERVAL_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
};

export default fp(sessionsPlugin, { name: 'hubarr-sessions', dependencies: [] });
