// SPDX-License-Identifier: AGPL-3.0-or-later
// Constantes du profil (`ProfileController` d'origine, P0.8).

/** Taille maximale d'un avatar : 2 Mo (`AVATAR_MAX_BYTES` d'origine). */
export const AVATAR_MAX_BYTES = 2_000_000;

/** Formats d'avatar acceptés, reconnus à leur signature et non à l'extension. */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

/** Longueur maximale du nom affiché (colonne `display_name`). */
export const DISPLAY_NAME_MAX_LENGTH = 100;

/** Modes d'affichage des bibliothèques Radarr et Sonarr. */
export const LIBRARY_VIEW_MODES = ['grid', 'wall', 'extended', 'table', 'shelf'] as const;
export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number];

/** Modes d'affichage de la liste des torrents. */
export const TORRENT_VIEWS = ['list', 'table', 'compact'] as const;
export type TorrentView = (typeof TORRENT_VIEWS)[number];
