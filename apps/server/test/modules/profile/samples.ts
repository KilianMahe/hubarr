// SPDX-License-Identifier: AGPL-3.0-or-later
// Débuts de fichiers image : seule la signature compte pour la détection.
import type { AvatarMimeType } from '@hubarr/shared';

export const AVATAR_SAMPLES: Record<AvatarMimeType, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
  'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
  'image/gif': Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'),
};
