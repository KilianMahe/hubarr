// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AVATAR_FILENAME_PATTERN, detectAvatarType } from '../../../src/modules/profile/avatars';
import { AVATAR_SAMPLES } from './samples';

describe('détection du format d’avatar', () => {
  it.each(Object.entries(AVATAR_SAMPLES))('reconnaît %s à sa signature', (type, data) => {
    expect(detectAvatarType(data)).toBe(type);
  });

  it('refuse les autres formats, même déguisés', () => {
    expect(detectAvatarType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectAvatarType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectAvatarType(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(detectAvatarType(Buffer.alloc(0))).toBeNull();
  });

  it('n’admet que des noms `{id}-{hex}.{ext}`', () => {
    expect(AVATAR_FILENAME_PATTERN.test('1-0a1b2c3d.png')).toBe(true);
    for (const name of ['1.png', '1-0a1b2c3d.svg', '../1-0a1b2c3d.png', '1-0a1b2c3d.png.tmp']) {
      expect(AVATAR_FILENAME_PATTERN.test(name)).toBe(false);
    }
  });
});
