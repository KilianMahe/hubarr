// SPDX-License-Identifier: AGPL-3.0-or-later
import { LOGIN_THROTTLE } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_IP_TTL_MS,
  LoginThrottle,
  SlidingWindowLimiter,
} from '../../../src/modules/auth/login-throttle';
import { createClock } from '../../helpers';

const MINUTE = 60 * 1000;

describe('SlidingWindowLimiter', () => {
  it('bloque au-delà de la limite et libère quand la plus ancienne sort de la fenêtre', () => {
    const clock = createClock();
    const limiter = new SlidingWindowLimiter(2, 10 * MINUTE, clock.now);
    limiter.consume('k');
    clock.advance(MINUTE);
    limiter.consume('k');
    expect(limiter.retryAfter('k')).toBe(9 * MINUTE);
    clock.advance(9 * MINUTE);
    expect(limiter.retryAfter('k')).toBe(0);
  });
});

describe('LoginThrottle', () => {
  it('autorise 5 tentatives par IP + e-mail, refuse la 6e pendant 15 min', () => {
    const clock = createClock();
    const throttle = new LoginThrottle(clock.now);
    for (let i = 0; i < LOGIN_THROTTLE.maxAttempts; i++)
      expect(throttle.attempt('1.2.3.4', 'a@b.c')).toBe(0);
    expect(throttle.attempt('1.2.3.4', 'a@b.c')).toBe(15 * MINUTE);
    // Une autre adresse ou un autre e-mail ne sont pas concernés.
    expect(throttle.attempt('5.6.7.8', 'a@b.c')).toBe(0);
    expect(throttle.attempt('1.2.3.4', 'x@b.c')).toBe(0);
    clock.advance(15 * MINUTE);
    expect(throttle.attempt('1.2.3.4', 'a@b.c')).toBe(0);
  });

  it('ne compte pas une tentative refusée (le blocage ne s’allonge pas)', () => {
    const clock = createClock();
    const throttle = new LoginThrottle(clock.now);
    for (let i = 0; i < 5; i++) throttle.attempt('ip', 'e');
    clock.advance(5 * MINUTE);
    expect(throttle.attempt('ip', 'e')).toBe(10 * MINUTE);
    clock.advance(10 * MINUTE);
    expect(throttle.attempt('ip', 'e')).toBe(0);
  });

  it('limite aussi l’IP seule à 25 tentatives, tous e-mails confondus', () => {
    const throttle = new LoginThrottle(createClock().now);
    for (let i = 0; i < LOGIN_THROTTLE.maxAttemptsPerIp; i++) {
      expect(throttle.attempt('ip', `user${String(i)}@x`)).toBe(0);
    }
    expect(throttle.attempt('ip', 'nouveau@x')).toBeGreaterThan(0);
  });

  it('remet à zéro le couple IP + e-mail après une connexion réussie', () => {
    const throttle = new LoginThrottle(createClock().now);
    for (let i = 0; i < 4; i++) throttle.attempt('ip', 'e');
    throttle.succeeded('ip', 'e');
    for (let i = 0; i < 5; i++) expect(throttle.attempt('ip', 'e')).toBe(0);
  });

  it('limite l’e-mail toutes IP confondues (rotation de X-Forwarded-For)', () => {
    const throttle = new LoginThrottle(createClock().now);
    for (let i = 0; i < LOGIN_THROTTLE.maxAttemptsPerAccount; i++) {
      expect(
        throttle.attempt(`10.0.${String(Math.floor(i / 4))}.${String(i % 4)}`, 'admin@x'),
      ).toBe(0);
    }
    expect(throttle.attempt('10.9.9.9', 'admin@x')).toBeGreaterThan(0);
    // Les autres comptes ne sont pas concernés.
    expect(throttle.attempt('10.9.9.9', 'autre@x')).toBe(0);
  });

  it('laisse se connecter depuis une IP connue malgré la limite par e-mail', () => {
    const throttle = new LoginThrottle(createClock().now);
    throttle.succeeded('192.0.2.1', 'admin@x');
    // Attaque répartie sur de nombreuses adresses : l'e-mail est bloqué partout ailleurs.
    for (let i = 0; i < LOGIN_THROTTLE.maxAttemptsPerAccount; i++) {
      throttle.attempt(`10.0.${String(Math.floor(i / 4))}.${String(i % 4)}`, 'admin@x');
    }
    expect(throttle.attempt('10.9.9.9', 'admin@x')).toBeGreaterThan(0);
    expect(throttle.attempt('192.0.2.1', 'admin@x')).toBe(0);
  });

  it('garde la limite IP + e-mail pour une IP connue', () => {
    const throttle = new LoginThrottle(createClock().now);
    throttle.succeeded('ip', 'e');
    for (let i = 0; i < LOGIN_THROTTLE.maxAttempts; i++)
      expect(throttle.attempt('ip', 'e')).toBe(0);
    expect(throttle.attempt('ip', 'e')).toBeGreaterThan(0);
  });

  it('n’épargne pas la limite par e-mail à une IP connue d’un autre compte', () => {
    const throttle = new LoginThrottle(createClock().now);
    throttle.succeeded('192.0.2.1', 'autre@x');
    for (let i = 0; i < LOGIN_THROTTLE.maxAttemptsPerAccount; i++) {
      throttle.attempt(`10.0.${String(Math.floor(i / 4))}.${String(i % 4)}`, 'admin@x');
    }
    expect(throttle.attempt('192.0.2.1', 'admin@x')).toBeGreaterThan(0);
  });

  it('oublie une IP connue après 30 jours', () => {
    const clock = createClock();
    const throttle = new LoginThrottle(clock.now);
    throttle.succeeded('192.0.2.1', 'admin@x');
    clock.advance(KNOWN_IP_TTL_MS);
    for (let i = 0; i < LOGIN_THROTTLE.maxAttemptsPerAccount; i++) {
      throttle.attempt(`10.0.${String(Math.floor(i / 4))}.${String(i % 4)}`, 'admin@x');
    }
    expect(throttle.attempt('192.0.2.1', 'admin@x')).toBeGreaterThan(0);
  });
});
