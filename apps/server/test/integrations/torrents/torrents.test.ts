// SPDX-License-Identifier: AGPL-3.0-or-later
// Clients torrent (P3d.1 à P3d.3) : `TransmissionControllerTest`,
// `DelugeControllerTest`, `QBittorrentClientTest`, `TransmissionClientTest`,
// `DelugeClientTest`, `GluetunClientTest` portés, et la logique commune de la
// liste (filtres, tri, pagination).

import type { Torrent } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  listTorrents,
  readTorrentFile,
  sanitizeHashes,
  splitAddUrls,
  validateTorrentUrls,
} from '../../../src/integrations/torrents/common';
import {
  DELUGE_DETAIL_KEYS,
  delugeBytesToKib,
  delugeKibToBytes,
  normalizeDelugeState,
  normalizeDelugeTorrent,
  parseDelugeRpc,
} from '../../../src/integrations/torrents/deluge';
import {
  GLUETUN_PORT_PATHS,
  GLUETUN_STATUS_PATHS,
} from '../../../src/integrations/torrents/gluetun';
import {
  extractQbitSessionCookie,
  normalizeQbitState,
  normalizeQbitTorrent,
} from '../../../src/integrations/torrents/qbittorrent';
import {
  TRANSMISSION_DETAIL_FIELDS,
  bytesToKib,
  kibToBytes,
  normalizeTransmissionBaseUrl,
  normalizeTransmissionState,
  normalizeTransmissionTorrent,
} from '../../../src/integrations/torrents/transmission';

const H40 = 'a'.repeat(40);
const H40B = 'B'.repeat(40);
const TR_PATTERN = '^[a-fA-F0-9]{40}$';
const QBIT_PATTERN = '^[a-fA-F0-9]{32,64}$';

describe('empreintes (sanitizeHashes)', () => {
  it.each([
    ['pas un tableau', 'not-an-array', []],
    ['tableau vide', [], []],
    ['une valide', [H40], [H40]],
    ['casse mixte', [H40B], [H40B]],
    ['trop courte', ['a'.repeat(39)], []],
    ['trop longue', ['a'.repeat(41)], []],
    ['non hexadécimale', [`g${'a'.repeat(39)}`], []],
    ['« all » refusé', ['all'], []],
    ['non-chaînes écartées', [123, null, true, H40], [H40]],
    ['mélange', [H40, 'nope', H40B], [H40, H40B]],
  ])('Transmission/Deluge : %s', (_label, raw, expected) => {
    expect(sanitizeHashes(raw, TR_PATTERN, false)).toEqual(expected);
  });

  it('qBittorrent : 32 à 64 caractères, « all » accepté', () => {
    expect(
      sanitizeHashes(['all', 'a'.repeat(32), 'a'.repeat(64), 'a'.repeat(31)], QBIT_PATTERN, true),
    ).toEqual(['all', 'a'.repeat(32), 'a'.repeat(64)]);
  });
});

describe('liens à ajouter (validateTorrentUrls)', () => {
  it.each([
    ['https://example.com/a.torrent', null],
    ['http://example.com/a.torrent', null],
    [`magnet:?xt=urn:btih:${H40}`, null],
    ['http://192.168.1.10:8080/a.torrent', null],
    [`https://a.example/1.torrent\nmagnet:?xt=urn:btih:${H40}`, null],
    ['file:///etc/passwd', 'invalid_url'],
    ['gopher://example.com', 'invalid_url'],
    ['https:///a.torrent', 'invalid_url'],
    ['http://169.254.169.254/latest/meta-data/', 'forbidden_host'],
    ['http://metadata.google.internal/', 'forbidden_host'],
    ['http://metadata.azure.com/', 'forbidden_host'],
    ['http://METADATA.GOOGLE.INTERNAL/', 'forbidden_host'],
    ['http://[fd00:ec2::254]/', 'forbidden_host'],
    ['\n\nhttps://example.com/a.torrent\n\n', null],
  ])('%s → %s', (raw, expected) => {
    expect(validateTorrentUrls(raw)).toBe(expected);
  });

  it('sépare magnets et liens http (splitAddUrls)', () => {
    expect(splitAddUrls(`http://a/1.torrent\nmagnet:?x|MAGNET:?y\n\n`)).toEqual({
      magnets: ['magnet:?x', 'MAGNET:?y'],
      urls: ['http://a/1.torrent'],
    });
  });
});

describe('fichiers .torrent', () => {
  const b64 = (text: string) => Buffer.from(text, 'latin1').toString('base64');
  it('contrôle extension, contenu bencode et nom', () => {
    expect(readTorrentFile('a.txt', b64('d4:info'))).toBe('invalid_format');
    expect(readTorrentFile('a.torrent', '')).toBe('unreadable');
    expect(readTorrentFile('a.torrent', b64('hello'))).toBe('invalid_format');
    const ok = readTorrentFile('../x/\0b.torrent', b64('d8:announce3:urle'));
    expect(ok).toMatchObject({ name: 'b.torrent' });
    expect(readTorrentFile('a.torrent', 'A'.repeat(15 * 1024 * 1024))).toBe('too_large');
  });
});

function torrent(hash: string, overrides: Partial<Torrent> = {}): Torrent {
  return {
    hash,
    name: hash,
    size: 0,
    totalSize: 0,
    downloaded: 0,
    uploaded: 0,
    progress: 0,
    dlSpeed: 0,
    upSpeed: 0,
    eta: null,
    state: 'downloading',
    rawState: '',
    category: '',
    tags: [],
    ratio: 0,
    seeds: 0,
    leechs: 0,
    addedOn: null,
    completedOn: null,
    savePath: '',
    tracker: '',
    dlLimit: null,
    upLimit: null,
    forceStart: false,
    sequential: false,
    firstLast: false,
    ...overrides,
  };
}

describe('liste (filtres, tri, pagination)', () => {
  const all = [
    torrent('Charlie', { addedOn: 3, size: 10, state: 'seeding', upSpeed: 5, category: 'movies' }),
    torrent('alpha', { addedOn: 1, size: 30, state: 'paused', progress: 100, tags: ['x', 'y'] }),
    torrent('Bravo', { addedOn: 2, size: 20, state: 'error' }),
  ];
  const query = {
    page: 1,
    perPage: 50,
    filter: 'all',
    search: '',
    category: '',
    tag: '',
    sort: 'added',
    desc: '1',
  };
  const names = (q: Partial<typeof query>) =>
    listTorrents(all, { ...query, ...q }).torrents.map((t) => t.name);

  it('tri par ajout décroissant par défaut, par nom, par taille', () => {
    expect(names({})).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(names({ sort: 'name', desc: '0' })).toEqual(['Bravo', 'Charlie', 'alpha']);
    expect(names({ sort: 'size', desc: '0' })).toEqual(['Charlie', 'Bravo', 'alpha']);
    expect(names({ sort: 'inconnu' })).toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('filtres : actifs, état, terminés, catégorie, étiquette, recherche', () => {
    expect(names({ filter: 'active' })).toEqual(['Charlie']);
    expect(names({ filter: 'error' })).toEqual(['Bravo']);
    expect(names({ filter: 'completed' })).toEqual(['alpha']);
    expect(names({ category: 'movies' })).toEqual(['Charlie']);
    expect(names({ tag: 'y' })).toEqual(['alpha']);
    expect(names({ search: 'ALP' })).toEqual(['alpha']);
  });

  it('pagination bornée (1 à 500 par page, page ramenée)', () => {
    const page = listTorrents(all, { ...query, perPage: 2, page: 9 });
    expect(page.pagination).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
    expect(page.torrents.map((t) => t.name)).toEqual(['alpha']);
    expect(listTorrents(all, { ...query, perPage: 9_999 }).pagination.perPage).toBe(500);
    expect(listTorrents([], query).pagination).toEqual({
      page: 1,
      perPage: 50,
      total: 0,
      totalPages: 1,
    });
  });
});

describe('qBittorrent', () => {
  it('cookie de session : SID (< 5.2) et QBT_SID_<port> (5.2+, issue #33)', () => {
    expect(extractQbitSessionCookie({ 'set-cookie': ['SID=abc123XYZ; path=/'] })).toBe(
      'SID=abc123XYZ',
    );
    expect(
      extractQbitSessionCookie({
        'set-cookie': 'QBT_SID_8112=Zm9vYmFy0=; HttpOnly; SameSite=Strict',
      }),
    ).toBe('QBT_SID_8112=Zm9vYmFy0=');
    expect(extractQbitSessionCookie({})).toBeNull();
  });

  it('états normalisés (4.x et 5.x)', () => {
    expect(normalizeQbitState('forcedDL')).toBe('downloading');
    expect(normalizeQbitState('stalledUP')).toBe('seeding');
    expect(normalizeQbitState('stoppedDL')).toBe('paused');
    expect(normalizeQbitState('pausedUP')).toBe('paused');
    expect(normalizeQbitState('queuedDL')).toBe('queued');
    expect(normalizeQbitState('checkingResumeData')).toBe('checking');
    expect(normalizeQbitState('stalledDL')).toBe('stalled');
    expect(normalizeQbitState('missingFiles')).toBe('error');
    expect(normalizeQbitState('moving')).toBe('moving');
    expect(normalizeQbitState('')).toBe('completed');
    expect(normalizeQbitState('weird')).toBe('unknown');
  });

  it('torrent normalisé : progression en %, ETA inconnu, étiquettes, limites', () => {
    const t = normalizeQbitTorrent({
      hash: 'h',
      name: 'n',
      progress: 0.4567,
      eta: 8_640_000,
      tags: 'a, b,',
      dl_limit: -1,
      up_limit: 2048,
      ratio: 1.23456,
      seq_dl: true,
    });
    expect(t).toMatchObject({
      progress: 45.7,
      eta: null,
      tags: ['a', 'b'],
      dlLimit: null,
      upLimit: 2048,
      ratio: 1.23,
      sequential: true,
      forceStart: false,
    });
  });
});

describe('Transmission', () => {
  it('état : l’erreur l’emporte sur le statut', () => {
    expect(normalizeTransmissionState(4, 0)).toBe('downloading');
    expect(normalizeTransmissionState(4, 3)).toBe('error');
    expect(normalizeTransmissionState(0, 0)).toBe('paused');
    expect(normalizeTransmissionState(2, 0)).toBe('checking');
    expect(normalizeTransmissionState(5, 0)).toBe('queued');
    expect(normalizeTransmissionState(6, 0)).toBe('seeding');
    expect(normalizeTransmissionState(9, 0)).toBe('unknown');
  });

  it('Kio/s ↔ octets/s, 0 = illimité', () => {
    expect(kibToBytes(0)).toBeNull();
    expect(kibToBytes(100)).toBe(102_400);
    expect(bytesToKib(0)).toBe(0);
    expect(bytesToKib(102_400)).toBe(100);
    expect(kibToBytes(bytesToKib(1_536_000))).toBe(1_536_000);
  });

  it('URL de base sans suffixe /transmission', () => {
    expect(normalizeTransmissionBaseUrl('http://h:9091/transmission/rpc/')).toBe('http://h:9091');
    expect(normalizeTransmissionBaseUrl('http://h:9091/transmission/web')).toBe('http://h:9091');
    expect(normalizeTransmissionBaseUrl('http://h:9091/Transmission')).toBe('http://h:9091');
    expect(normalizeTransmissionBaseUrl('http://h/proxy')).toBe('http://h/proxy');
  });

  it('champs de la fiche couvrant ceux qu’elle lit', () => {
    for (const field of ['files', 'fileStats', 'trackerStats', 'peers', 'pieceCount', 'comment']) {
      expect(TRANSMISSION_DETAIL_FIELDS).toContain(field);
    }
  });

  it('torrent normalisé : labels, hôte du tracker, limites', () => {
    const t = normalizeTransmissionTorrent({
      hashString: H40,
      percentDone: 1,
      labels: ['movies', 'x'],
      trackers: [{ announce: 'https://tracker.example:443/announce' }],
      downloadLimited: true,
      downloadLimit: 10,
      uploadLimited: false,
      uploadLimit: 50,
      eta: -1,
      status: 6,
    });
    expect(t).toMatchObject({
      category: 'movies',
      tags: ['movies', 'x'],
      tracker: 'tracker.example',
      dlLimit: 10_240,
      upLimit: null,
      progress: 100,
      eta: null,
      state: 'seeding',
    });
  });
});

describe('Deluge', () => {
  it('enveloppe JSON-RPC et code d’erreur (relogin sur 1)', () => {
    expect(parseDelugeRpc({ result: true, error: null })).toEqual({ result: true, error: null });
    expect(
      parseDelugeRpc({ result: null, error: { code: 1, message: 'Not authenticated' } }),
    ).toEqual({
      result: null,
      error: { code: 1, message: 'Not authenticated' },
    });
    expect(parseDelugeRpc('x').error?.message).toBe('malformed JSON-RPC response');
  });

  it('états, avec repli « terminé » → partage', () => {
    expect(normalizeDelugeState('Downloading', false)).toBe('downloading');
    expect(normalizeDelugeState('Allocating', false)).toBe('downloading');
    expect(normalizeDelugeState('Seeding', false)).toBe('seeding');
    expect(normalizeDelugeState('Paused', false)).toBe('paused');
    expect(normalizeDelugeState('Error', false)).toBe('error');
    expect(normalizeDelugeState('Other', true)).toBe('seeding');
    expect(normalizeDelugeState('Other', false)).toBe('unknown');
  });

  it('vitesses : -1 = illimité', () => {
    expect(delugeKibToBytes(-1)).toBeNull();
    expect(delugeKibToBytes(10)).toBe(10_240);
    expect(delugeBytesToKib(0)).toBe(-1);
    expect(delugeBytesToKib(10_240)).toBe(10);
  });

  it('torrent à la forme commune', () => {
    const t = normalizeDelugeTorrent(H40, {
      name: 'n',
      progress: 55.55,
      label: 'tv',
      state: 'Seeding',
      max_download_speed: -1,
      max_upload_speed: 5,
      time_added: 100,
      completed_time: 0,
    });
    expect(t).toMatchObject({
      hash: H40,
      progress: 55.6,
      category: 'tv',
      state: 'seeding',
      dlLimit: null,
      upLimit: 5_120,
      addedOn: 100,
      completedOn: null,
    });
    expect(DELUGE_DETAIL_KEYS).toContain('file_priorities');
  });
});

describe('Gluetun', () => {
  it('routes unifiées d’abord, aucune route WireGuard', () => {
    expect(GLUETUN_STATUS_PATHS[0]).toBe('/v1/vpn/status');
    expect(GLUETUN_PORT_PATHS[0]).toBe('/v1/portforward');
    expect(
      [...GLUETUN_STATUS_PATHS, ...GLUETUN_PORT_PATHS].some((p) => p.includes('wireguard')),
    ).toBe(false);
  });
});
