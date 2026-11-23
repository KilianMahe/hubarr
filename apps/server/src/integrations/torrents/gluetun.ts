// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Gluetun (P3d.2) : port de `GluetunClient.php`, pour la carte VPN de
// la page qBittorrent.
//
// Serveur de contrôle de Gluetun : IP publique (`/v1/publicip/ip`, gardée
// 30 s), état du VPN et port transféré (10 s chacun). Routes unifiées
// d'abord (`/v1/vpn/status`, `/v1/portforward`), puis les anciennes
// d'OpenVPN ; aucune route propre à WireGuard (`GluetunClientTest`). Clé
// d'API en `X-API-Key` si elle est saisie. Un échec ne lève jamais : la
// dernière valeur connue (ou `null`) est rendue, sans toucher au
// disjoncteur (l'original ne l'utilisait pas pour Gluetun).

import type { HttpClient } from '../http';
import { isRecord, num, str } from './common';

export const GLUETUN_STATUS_PATHS = ['/v1/vpn/status', '/v1/openvpn/status'] as const;
export const GLUETUN_PORT_PATHS = ['/v1/portforward', '/v1/openvpn/portforwarded'] as const;
const PUBLIC_IP_TTL_MS = 30_000;
const STATUS_TTL_MS = 10_000;
const PORT_TTL_MS = 10_000;

export interface GluetunSummary {
  ok: boolean;
  status: string | null;
  publicIp: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  organization: string | null;
  timezone: string | null;
  forwardedPort: number | null;
}

interface Cached<T> {
  at: number;
  value: T;
}

export class GluetunClient {
  #ip: Cached<Record<string, unknown>> | null = null;
  #status: Cached<string> | null = null;
  #port: Cached<number> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  async #get(path: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await this.http.get(path, undefined, { trackHealth: false });
      return isRecord(data) ? data : null;
    } catch {
      return null;
    }
  }

  async publicIp(): Promise<Record<string, unknown> | null> {
    if (this.#ip !== null && this.now() - this.#ip.at < PUBLIC_IP_TTL_MS) return this.#ip.value;
    const data = await this.#get('/v1/publicip/ip');
    if (data === null) return this.#ip?.value ?? null;
    this.#ip = { at: this.now(), value: data };
    return data;
  }

  async vpnStatus(): Promise<string | null> {
    if (this.#status !== null && this.now() - this.#status.at < STATUS_TTL_MS)
      return this.#status.value;
    for (const path of GLUETUN_STATUS_PATHS) {
      const data = await this.#get(path);
      if (data?.status !== undefined) {
        this.#status = { at: this.now(), value: str(data.status) };
        return this.#status.value;
      }
    }
    return this.#status?.value ?? null;
  }

  async forwardedPort(): Promise<number | null> {
    if (this.#port !== null && this.now() - this.#port.at < PORT_TTL_MS) return this.#port.value;
    for (const path of GLUETUN_PORT_PATHS) {
      const data = await this.#get(path);
      if (data?.port !== undefined) {
        this.#port = { at: this.now(), value: num(data.port) };
        return this.#port.value;
      }
    }
    return this.#port?.value ?? null;
  }

  async summary(): Promise<GluetunSummary> {
    const [ip, status, port] = await Promise.all([
      this.publicIp(),
      this.vpnStatus(),
      this.forwardedPort(),
    ]);
    const field = (key: string) => {
      const value = ip?.[key];
      return typeof value === 'string' && value !== '' ? value : null;
    };
    return {
      ok: ip !== null,
      status,
      publicIp: field('public_ip'),
      country: field('country'),
      city: field('city'),
      region: field('region'),
      organization: field('organization'),
      timezone: field('timezone'),
      forwardedPort: port,
    };
  }
}

export const EMPTY_GLUETUN: GluetunSummary = {
  ok: false,
  status: null,
  publicIp: null,
  country: null,
  city: null,
  region: null,
  organization: null,
  timezone: null,
  forwardedPort: null,
};
