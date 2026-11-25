// SPDX-License-Identifier: AGPL-3.0-or-later
// Limitation des tentatives de connexion, portage de `login_throttling` de
// Symfony (`DefaultLoginRateLimiter`) :
// - une limite par couple IP + e-mail (5 / 15 min) et une limite par IP (25 / 15 min) ;
// - une limite par e-mail toutes IP confondues (50 / 15 min), propre à Hubarr :
//   l'IP d'un client derrière un proxy de confiance est déclarative
//   (`X-Forwarded-For`) et ne suffit pas à borner une attaque par dictionnaire ;
// - chaque tentative consomme les trois, **avant** la vérification du mot de passe :
//   au-delà, la tentative est refusée sans être évaluée ;
// - une connexion réussie remet à zéro les limites IP + e-mail et e-mail (pas
//   celle de l'IP, qu'un compte valide ne doit pas pouvoir réinitialiser) ;
// - une IP depuis laquelle le compte s'est connecté dans les 30 derniers jours
//   n'est pas soumise à la limite par e-mail : sans cela, 50 essais toutes les
//   15 minutes depuis n'importe où suffiraient à bloquer l'admin en continu.
//   Elle reste soumise aux limites IP + e-mail et IP.
// Fenêtre glissante exacte, en mémoire : un redémarrage remet les compteurs à zéro.

import { LOGIN_THROTTLE } from '@hubarr/shared';

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string, current: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter((at) => at > current - this.windowMs);
    if (kept.length === 0) this.hits.delete(key);
    else this.hits.set(key, kept);
    return kept;
  }

  /** Délai (ms) avant qu'une tentative soit de nouveau possible ; 0 si elle l'est. */
  retryAfter(key: string): number {
    const current = this.now();
    const recent = this.recent(key, current);
    if (recent.length < this.limit) return 0;
    const oldest = recent[recent.length - this.limit] ?? current;
    return Math.max(1, oldest + this.windowMs - current);
  }

  consume(key: string): void {
    const current = this.now();
    this.hits.set(key, [...this.recent(key, current), current]);
    // Borne la mémoire face à un balayage d'adresses ou d'e-mails.
    if (this.hits.size > 10_000) this.sweep(current);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(current: number): void {
    for (const key of [...this.hits.keys()]) this.recent(key, current);
  }
}

/** Durée pendant laquelle une IP reste connue d'un compte après une connexion réussie. */
export const KNOWN_IP_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Nombre maximal de couples IP + e-mail connus (les plus anciens sont oubliés). */
const KNOWN_IP_MAX = 10_000;

export class LoginThrottle {
  private readonly perAccount: SlidingWindowLimiter;
  private readonly perIp: SlidingWindowLimiter;
  private readonly perEmail: SlidingWindowLimiter;
  /** Couple `ip|email` → échéance, dans l'ordre d'insertion (le plus ancien en tête). */
  private readonly knownIps = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {
    this.perAccount = new SlidingWindowLimiter(
      LOGIN_THROTTLE.maxAttempts,
      LOGIN_THROTTLE.windowMs,
      now,
    );
    this.perIp = new SlidingWindowLimiter(
      LOGIN_THROTTLE.maxAttemptsPerIp,
      LOGIN_THROTTLE.windowMs,
      now,
    );
    this.perEmail = new SlidingWindowLimiter(
      LOGIN_THROTTLE.maxAttemptsPerAccount,
      LOGIN_THROTTLE.windowMs,
      now,
    );
  }

  /**
   * Enregistre une tentative. Renvoie 0 si elle peut être évaluée, sinon le délai
   * d'attente en millisecondes (la tentative refusée n'est pas comptée).
   */
  attempt(ip: string, email: string): number {
    const accountKey = `${ip}|${email}`;
    const known = this.isKnown(accountKey);
    const wait = Math.max(
      this.perAccount.retryAfter(accountKey),
      this.perIp.retryAfter(ip),
      known ? 0 : this.perEmail.retryAfter(email),
    );
    if (wait > 0) return wait;
    this.perAccount.consume(accountKey);
    this.perIp.consume(ip);
    if (!known) this.perEmail.consume(email);
    return 0;
  }

  succeeded(ip: string, email: string): void {
    const accountKey = `${ip}|${email}`;
    this.perAccount.reset(accountKey);
    this.perEmail.reset(email);
    // Réinsertion : le couple passe en fin de file avec une nouvelle échéance.
    this.knownIps.delete(accountKey);
    this.knownIps.set(accountKey, this.now() + KNOWN_IP_TTL_MS);
    for (const key of this.knownIps.keys()) {
      if (this.knownIps.size <= KNOWN_IP_MAX) break;
      this.knownIps.delete(key);
    }
  }

  private isKnown(accountKey: string): boolean {
    const expiresAt = this.knownIps.get(accountKey);
    if (expiresAt === undefined) return false;
    if (expiresAt > this.now()) return true;
    this.knownIps.delete(accountKey);
    return false;
  }
}
