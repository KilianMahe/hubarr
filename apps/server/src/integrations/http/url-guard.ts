// SPDX-License-Identifier: AGPL-3.0-or-later
// Garde SSRF des URL saisies par l'admin : port de `HealthService::urlBlockedReason`.
//
// Refuse ce qui n'est pas HTTP(S) et les adresses de lien local (169.254.0.0/16,
// fe80::/10, fd00:ec2::), par lesquelles les clouds exposent leurs métadonnées
// sans authentification. Le reste du RFC 1918 reste autorisé : Radarr sur
// 192.168.x ou 10.x est le cas normal d'un homelab.

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

/** Retire les crochets IPv6 et le point final d'un FQDN enraciné. */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}
