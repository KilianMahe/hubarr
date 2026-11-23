// SPDX-License-Identifier: AGPL-3.0-or-later
// Avatars des comptes, rangés dans `<HUBARR_DATA_DIR>/avatars`.
//
// - Le format est reconnu à la signature du fichier (comme `getMimeType()` de
//   Symfony, qui lit le contenu), jamais au nom ni au `Content-Type` envoyé.
// - Nom de fichier `{userId}-{8 hex}.{ext}` : il change à chaque envoi, ce qui
//   permet un cache navigateur long sans servir une image périmée (l'original
//   réutilisait `{userId}.{ext}` avec 60 s de cache).
// - Écriture dans un fichier temporaire puis renommage : un avatar n'est jamais
//   lu à moitié écrit.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AvatarMimeType } from '@hubarr/shared';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const satisfies Record<AvatarMimeType, string>;

const MIME_BY_EXTENSION: Record<string, AvatarMimeType> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime as AvatarMimeType]),
);

/** Seule forme de nom servie : ni chemin, ni point de plus, ni autre extension. */
export const AVATAR_FILENAME_PATTERN = /^\d+-[0-9a-f]{8}\.(?:jpg|png|webp|gif)$/;

function startsWith(data: Buffer, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => data[offset + index] === byte);
}

const ascii = (text: string): readonly number[] => [...Buffer.from(text, 'latin1')];

/** Type d'image d'après la signature, ou `null` si le format n'est pas accepté. */
export function detectAvatarType(data: Buffer): AvatarMimeType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, ascii('GIF87a')) || startsWith(data, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

export function avatarMimeType(filename: string): AvatarMimeType | undefined {
  return MIME_BY_EXTENSION[filename.slice(filename.lastIndexOf('.') + 1)];
}

export class AvatarStore {
  constructor(readonly dir: string) {}

  /** Écrit l'avatar et renvoie son nom de fichier. */
  async save(userId: number, data: Buffer, type: AvatarMimeType): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const filename = `${String(userId)}-${randomBytes(4).toString('hex')}.${EXTENSIONS[type]}`;
    const target = join(this.dir, filename);
    const temporary = `${target}.tmp`;
    try {
      await writeFile(temporary, data, { mode: 0o640 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return filename;
  }

  /** Supprime un avatar ; un fichier déjà absent n'est pas une erreur. */
  async remove(filename: string): Promise<void> {
    if (!AVATAR_FILENAME_PATTERN.test(filename)) return;
    await rm(join(this.dir, filename), { force: true });
  }

  /** Contenu d'un avatar, ou `null` s'il n'existe pas. */
  async read(filename: string): Promise<Buffer | null> {
    if (!AVATAR_FILENAME_PATTERN.test(filename)) return null;
    try {
      return await readFile(join(this.dir, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
