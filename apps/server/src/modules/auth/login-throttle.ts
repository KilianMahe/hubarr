// SPDX-License-Identifier: AGPL-3.0-or-later
// Limitation des tentatives de connexion, portage de `login_throttling` de
// Symfony (`DefaultLoginRateLimiter`) :
// - une limite par couple IP + e-mail (5 / 15 min) et une limite par IP (25 / 15 min) ;
// - chaque tentative consomme les deux, **avant** la vérification du mot de passe :
//   au-delà, la tentative est refusée sans être évaluée ;
// - une connexion réussie remet à zéro la limite IP + e-mail (pas celle de l'IP,
//   qu'un compte valide ne doit pas pouvoir réinitialiser).
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

export class LoginThrottle {
  private readonly perAccount: SlidingWindowLimiter;
  private readonly perIp: SlidingWindowLimiter;

  constructor(now: () => number = Date.now) {
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
  }

  /**
   * Enregistre une tentative. Renvoie 0 si elle peut être évaluée, sinon le délai
   * d'attente en millisecondes (la tentative refusée n'est pas comptée).
   */
  attempt(ip: string, email: string): number {
    const accountKey = `${ip}|${email}`;
    const wait = Math.max(this.perAccount.retryAfter(accountKey), this.perIp.retryAfter(ip));
    if (wait > 0) return wait;
    this.perAccount.consume(accountKey);
    this.perIp.consume(ip);
    return 0;
  }

  succeeded(ip: string, email: string): void {
    this.perAccount.reset(`${ip}|${email}`);
  }
}
