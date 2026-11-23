// SPDX-License-Identifier: AGPL-3.0-or-later
// Garde SSRF des URL saisies par l'admin : port de `HealthService::urlBlockedReason`.
//
// Refuse ce qui n'est pas HTTP(S) et les adresses de lien local (169.254.0.0/16,
// fe80::/10, fd00:ec2::), par lesquelles les clouds exposent leurs métadonnées
// sans authentification. Le reste du RFC 1918 reste autorisé : Radarr sur
// 192.168.x ou 10.x est le cas normal d'un homelab.
//
// Deux niveaux : `urlBlockedReason` à l'enregistrement et au diagnostic (message
// clair pour l'admin), puis `guardedLookup` à chaque connexion de l'agent HTTP,
// qui couvre les URL enregistrées sans résolution et un DNS qui change de
// réponse entre la vérification et l'appel (rebinding).

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type UrlBlockedReason = 'malformed' | 'scheme' | 'host' | 'link-local';

/** Résolution DNS injectable (tests). Renvoie les adresses de l'hôte. */
export type HostResolver = (host: string) => Promise<string[]>;

const systemResolver: HostResolver = async (host) => {
  try {
    const entries = await lookup(host, { all: true });
    return entries.map((entry) => entry.address);
  } catch {
    // Hôte inconnu : la connexion échouera d'elle-même (diagnostic « réseau »).
    return [];
  }
};

/** `::ffff:a.b.c.d` (IPv4 dans IPv6) → `a.b.c.d`, pour ne pas contourner les contrôles. */
export function unmapIpv4(ip: string): string {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (match?.[1] !== undefined) return match[1];
  // Forme hexadécimale que produit `URL` : ::ffff:a9fe:a9fe.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return ip;
}

export function isLinkLocal(address: string): boolean {
  const ip = unmapIpv4(address).toLowerCase();
  if (ip.startsWith('169.254.')) return true;
  return ip.startsWith('fe80:') || ip.startsWith('fd00:ec2');
}

/** Contrôles sans réseau : forme de l'URL, schéma, hôte, adresse littérale. */
export function staticUrlBlockedReason(url: string): UrlBlockedReason | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Port hors de 0-65535 compris : `URL` le refuse.
    return /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url) ? 'scheme' : 'malformed';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'scheme';
  const host = normalizeHost(parsed.hostname);
  if (host === '') return 'host';
  if (isIP(host) !== 0 && isLinkLocal(host)) return 'link-local';
  // `URL` normalise les IPv4 numériques (`http://2852039166/`) en notation pointée.
  return null;
}

/** Contrôles complets, avec résolution du nom d'hôte. */
export async function urlBlockedReason(
  url: string,
  resolve: HostResolver = systemResolver,
): Promise<UrlBlockedReason | null> {
  const reason = staticUrlBlockedReason(url);
  if (reason !== null) return reason;
  const host = normalizeHost(new URL(url).hostname);
  if (isIP(host) !== 0) return null;
  const addresses = await resolve(host);
  return addresses.some(isLinkLocal) ? 'link-local' : null;
}

/**
 * Même origine (schéma, hôte, port) : un secret enregistré pour une URL ne doit
 * pas suivre un changement d'hôte qu'il n'a pas saisi lui-même (import).
 */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a.trim()).origin === new URL(b.trim()).origin;
  } catch {
    return false;
  }
}

/** Retire les crochets IPv6 et le point final d'un FQDN enraciné. */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

/** Code de l'erreur levée par `guardedLookup` (diagnostic « bloqué »). */
export const BLOCKED_LOOKUP_CODE = 'HUBARR_URL_BLOCKED';

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Résolution DNS de bas niveau, signature de `dns.lookup` (injectable pour les tests). */
export type RawLookup = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const systemLookup: RawLookup = (hostname, options, callback) => {
  dnsLookup(hostname, options, callback);
};

/**
 * `lookup` de `net.connect` qui refuse un nom résolu en adresse de lien local.
 * Toutes les adresses sont contrôlées, puis la forme attendue par l'appelant
 * (`all` ou adresse unique) est rendue.
 */
export function createGuardedLookup(raw: RawLookup = systemLookup) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    raw(hostname, { ...options, all: true }, (error, addresses) => {
      if (error !== null) {
        callback(error, []);
        return;
      }
      if (addresses.some((entry) => isLinkLocal(entry.address))) {
        const blocked: NodeJS.ErrnoException = new Error(`blocked: link-local (${hostname})`);
        blocked.code = BLOCKED_LOOKUP_CODE;
        callback(blocked, []);
        return;
      }
      if (options.all === true) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (first === undefined) {
        const missing: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
        missing.code = 'ENOTFOUND';
        callback(missing, []);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}

export const guardedLookup = createGuardedLookup();
