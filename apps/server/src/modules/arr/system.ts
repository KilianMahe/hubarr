// SPDX-License-Identifier: AGPL-3.0-or-later
// Page système d'une instance Radarr ou Sonarr (`radarrSystem`, `sonarrSystem`) :
// statut, santé, disques, clients, indexeurs, 20 derniers journaux. Sections
// indépendantes (`Promise.allSettled`) : une section en échec vaut `null`, et
// l'erreur commune n'est levée que si toutes échouent.

import type { ArrSystemResponse } from '@hubarr/shared';
import { isoDate } from '../../integrations/radarr/normalize';

/** Lecture seule commune aux clients Radarr et Sonarr. */
export interface ArrSystemSource {
  systemStatus(): Promise<{
    version?: string | null;
    osName?: string | null;
    osVersion?: string | null;
    runtimeVersion?: string | null;
    databaseVersion?: string | null;
    startTime?: string;
    urlBase?: string | null;
    isDocker?: boolean;
  }>;
  systemHealth(): Promise<{ type?: string; source?: string | null; message?: string | null }[]>;
  diskSpace(): Promise<
    { path?: string | null; label?: string | null; freeSpace?: number; totalSpace?: number }[]
  >;
  downloadClients(): Promise<
    { name?: string | null; implementation?: string | null; enable?: boolean }[]
  >;
  indexers(): Promise<
    {
      name?: string | null;
      enableRss?: boolean;
      enableAutomaticSearch?: boolean;
      enableInteractiveSearch?: boolean;
    }[]
  >;
  logs(
    page: number,
    pageSize: number,
  ): Promise<{
    records?:
      | {
          time?: string;
          level?: string | null;
          message?: string | null;
          exception?: string | null;
        }[]
      | null;
  }>;
}

export async function arrSystemResponse(source: ArrSystemSource): Promise<ArrSystemResponse> {
  const sections = await Promise.allSettled([
    source.systemStatus(),
    source.systemHealth(),
    source.diskSpace(),
    source.downloadClients(),
    source.indexers(),
    source.logs(1, 20),
  ]);
  const rejected = sections.filter((section) => section.status === 'rejected');
  if (rejected.length === sections.length) throw rejected[0]?.reason;
  const value = <T>(section: PromiseSettledResult<T>): T | null =>
    section.status === 'fulfilled' ? section.value : null;
  const [status, health, disks, clients, indexers, logs] = [
    value(sections[0]),
    value(sections[1]),
    value(sections[2]),
    value(sections[3]),
    value(sections[4]),
    value(sections[5]),
  ] as const;
  const result: ArrSystemResponse = {
    status:
      status === null
        ? null
        : {
            version: status.version ?? null,
            osName: status.osName ?? null,
            osVersion: status.osVersion ?? null,
            runtimeVersion: status.runtimeVersion ?? null,
            databaseVersion: status.databaseVersion ?? null,
            startTime: isoDate(status.startTime),
            urlBase: status.urlBase ?? null,
            isDocker: status.isDocker ?? null,
          },
    health:
      health?.map((check) => ({
        type: check.type ?? 'warning',
        source: check.source ?? null,
        message: check.message ?? null,
      })) ?? null,
    diskSpace:
      disks?.map((disk) => ({
        path: disk.path ?? null,
        label: disk.label ?? null,
        freeSpace: disk.freeSpace ?? 0,
        totalSpace: disk.totalSpace ?? 0,
      })) ?? null,
    downloadClients:
      clients?.map((client) => ({
        name: client.name ?? '—',
        implementation: client.implementation ?? null,
        enable: client.enable ?? false,
      })) ?? null,
    indexers:
      indexers?.map((indexer) => ({
        name: indexer.name ?? '—',
        enableRss: indexer.enableRss ?? false,
        enableAutomaticSearch: indexer.enableAutomaticSearch ?? false,
        enableInteractiveSearch: indexer.enableInteractiveSearch ?? false,
      })) ?? null,
    logs:
      logs === null
        ? null
        : (logs.records ?? []).map((log) => ({
            time: isoDate(log.time),
            level: log.level ?? '',
            message: log.message ?? null,
            exception: log.exception ? log.exception.slice(0, 200) : null,
          })),
  };
  return result;
}
