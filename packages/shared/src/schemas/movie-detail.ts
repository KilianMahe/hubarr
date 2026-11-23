// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de la fiche film (`#modal-film` de `films.html.twig`, P2.4) :
// fichiers, définitions de qualité, crédits, extras, historique, liste de
// blocage, suivi, édition, suppression, explorateur de dossiers, étiquettes.
//
// Écart assumé : l'original renvoyait les ressources brutes de
// Radarr et laissait le navigateur reconstruire les objets à renvoyer (qualité
// avec révision, langues). Hubarr renvoie des formes réduites et c'est le
// serveur qui fusionne les modifications dans la ressource brute.

import { z } from 'zod';
import { MINIMUM_AVAILABILITIES, arrTagSchema } from './movie-library';
import { movieSchema } from './movies';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/** Qualité ou langue réduite à `{ id, name }`. */
export const arrNamedItemSchema = z.object({ id: z.number(), name: z.string() });
export type ArrNamedItem = z.infer<typeof arrNamedItemSchema>;

/** Fiche d'un film : la ressource normalisée, toujours avec un id. */
export const movieDetailSchema = movieSchema.extend({ id: z.number() });
export type MovieDetail = z.infer<typeof movieDetailSchema>;

// ── Fichiers ────────────────────────────────────────────────────────────────

export const movieFileSchema = z.object({
  id: z.number(),
  relativePath: nullableString,
  path: nullableString,
  size: z.number(),
  dateAdded: nullableString,
  quality: arrNamedItemSchema.nullable(),
  languages: z.array(arrNamedItemSchema),
  releaseGroup: nullableString,
  edition: nullableString,
  customFormats: z.array(z.string()),
  customFormatScore: z.number(),
});
export type MovieFile = z.infer<typeof movieFileSchema>;

/**
 * Modification d'un fichier : seuls les champs présents changent (les `isset`
 * de l'original). La révision de la qualité est conservée par le serveur.
 */
export const movieFileUpdateRequestSchema = z.object({
  qualityId: z.number().int().nonnegative().optional(),
  languages: z
    .array(z.object({ id: z.number().int(), name: z.string().max(100) }))
    .min(1, { message: 'media.films.detail.pick_language' })
    .max(100)
    .optional(),
  releaseGroup: z.string().max(255).nullable().optional(),
  edition: z.string().max(255).nullable().optional(),
});
export type MovieFileUpdateRequest = z.infer<typeof movieFileUpdateRequestSchema>;

export const movieFileUpdateResponseSchema = z.object({
  ok: z.literal(true),
  file: movieFileSchema,
});

/** Définition de qualité : id **de la qualité** (pas de la définition) et nom. */
export const qualityDefinitionSummarySchema = arrNamedItemSchema;

/**
 * Langues proposées dans le gestionnaire de fichiers (`LANG_LIST` d'origine,
 * ids de Radarr). Une langue déjà portée par le fichier s'y ajoute.
 */
export const FILE_LANGUAGE_CHOICES: readonly ArrNamedItem[] = [
  { id: 2, name: 'French' },
  { id: 1, name: 'English' },
  { id: 4, name: 'German' },
  { id: 3, name: 'Spanish' },
  { id: 5, name: 'Italian' },
  { id: 13, name: 'Japanese' },
  { id: 17, name: 'Korean' },
  { id: 16, name: 'Chinese' },
  { id: 7, name: 'Portuguese' },
  { id: 10, name: 'Russian' },
  { id: 14, name: 'Arabic' },
  { id: 11, name: 'Hindi' },
];

// ── Crédits, extras ─────────────────────────────────────────────────────────

export const movieCreditSchema = z.object({
  personName: z.string(),
  personTmdbId: nullableNumber,
  character: nullableString,
  job: nullableString,
  department: nullableString,
  type: z.enum(['cast', 'crew']),
  /** Photo TMDB (`remoteUrl`) ; jamais une URL de l'instance. */
  image: nullableString,
});
export type MovieCredit = z.infer<typeof movieCreditSchema>;

export const movieExtraFileSchema = z.object({
  id: z.number(),
  relativePath: nullableString,
  extension: nullableString,
  type: nullableString,
});
export type MovieExtraFile = z.infer<typeof movieExtraFileSchema>;

// ── Historique, liste de blocage ────────────────────────────────────────────

export const movieHistoryItemSchema = z.object({
  id: z.number(),
  movieId: nullableNumber,
  eventType: z.string(),
  date: nullableString,
  quality: nullableString,
  sourceTitle: nullableString,
  /** Champs utiles de `data` (texte libre de l'instance). */
  indexer: nullableString,
  releaseTitle: nullableString,
  importedPath: nullableString,
  downloadClient: nullableString,
  /** Protocole (`torrent`, `usenet`) quand l'évènement le précise. */
  protocol: nullableString,
  reason: nullableString,
  /** Film concerné (page d'historique de l'instance). */
  movie: z.object({ title: z.string(), year: nullableNumber }).nullable(),
});
export type MovieHistoryItem = z.infer<typeof movieHistoryItemSchema>;

export const movieBlocklistItemSchema = z.object({
  id: z.number(),
  movieId: nullableNumber,
  sourceTitle: nullableString,
  quality: nullableString,
  date: nullableString,
  protocol: nullableString,
  indexer: nullableString,
  message: nullableString,
  languages: z.array(z.string()),
  movie: z.object({ title: z.string(), year: nullableNumber }).nullable(),
});
export type MovieBlocklistItem = z.infer<typeof movieBlocklistItemSchema>;

// ── Suivi, édition, suppression ─────────────────────────────────────────────

export const movieMonitorRequestSchema = z.object({ monitored: z.boolean().default(true) });
export type MovieMonitorRequest = z.input<typeof movieMonitorRequestSchema>;
export const movieMonitorResponseSchema = z.object({
  ok: z.literal(true),
  monitored: z.boolean(),
});

export const movieDeleteRequestSchema = z.object({
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});
export type MovieDeleteRequest = z.input<typeof movieDeleteRequestSchema>;

/** Édition d'un film : seuls les champs présents changent. */
export const movieEditRequestSchema = z.object({
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().int().positive().optional(),
  minimumAvailability: z.enum(MINIMUM_AVAILABILITIES).optional(),
  rootFolderPath: z.string().trim().min(1).max(4096).optional(),
  path: z.string().trim().min(1).max(4096).optional(),
  tags: z.array(z.number().int().nonnegative()).max(1_000).optional(),
});
export type MovieEditRequest = z.infer<typeof movieEditRequestSchema>;

export const movieEditResponseSchema = z.object({ ok: z.literal(true), movie: movieDetailSchema });

// ── Explorateur de dossiers, étiquettes ─────────────────────────────────────

export const filesystemResponseSchema = z.object({
  parent: nullableString,
  directories: z.array(z.object({ name: z.string(), path: z.string() })),
});
export type FilesystemResponse = z.infer<typeof filesystemResponseSchema>;

export const tagCreateRequestSchema = z.object({ label: z.string().trim().min(1).max(128) });
export const tagCreateResponseSchema = z.object({ ok: z.literal(true), tag: arrTagSchema });

// ── Releases, renommage, commandes (P2.5) ───────────────────────────────────

/** Release d'une recherche interactive (`filmReleases` d'origine), commune à Sonarr. */
export const arrReleaseSchema = z.object({
  guid: z.string(),
  indexerId: z.number(),
  title: z.string(),
  indexer: z.string(),
  quality: z.string(),
  /** Taille en Mio arrondie, comme l'original. */
  sizeMb: z.number(),
  seeders: nullableNumber,
  leechers: nullableNumber,
  protocol: z.string(),
  /** Âge en jours. */
  age: z.number(),
  approved: z.boolean(),
  rejections: z.array(z.string()),
  customFormatScore: z.number(),
  /** Score de chaque format personnalisé dans le profil du film. */
  scoreDetails: z.array(z.object({ name: z.string(), score: z.number() })),
  customFormats: z.array(z.string()),
  languages: z.array(z.string()),
  /** Lien de l'indexeur, seulement en http(s) (`safeInfoUrl`). */
  infoUrl: nullableString,
});
export type ArrRelease = z.infer<typeof arrReleaseSchema>;

export const releaseGrabRequestSchema = z.object({
  guid: z.string().min(1).max(4096),
  indexerId: z.number().int().nonnegative(),
});
export type ReleaseGrabRequest = z.infer<typeof releaseGrabRequestSchema>;

export const renameProposalSchema = z.object({
  movieFileId: nullableNumber,
  existingPath: nullableString,
  newPath: nullableString,
});
export type RenameProposal = z.infer<typeof renameProposalSchema>;

// ── Ajout, suivi de personnes (P2.6) ────────────────────────────────────────

export const movieLookupSchema = movieSchema;

/** Ajout d'un film ; profil absent ou 0 → profil par défaut de l'instance. */
export const movieAddRequestSchema = z
  .object({
    tmdbId: z.number().int().positive(),
    title: z.string().max(1_000).default(''),
    year: z.number().int().nonnegative().default(0),
    qualityProfileId: z.number().int().nonnegative().default(0),
    rootFolderPath: z.string().trim().max(4096).optional(),
    /** Chemin complet (import de bibliothèque) : prioritaire sur le dossier racine. */
    path: z.string().trim().max(4096).optional(),
    monitored: z.boolean().default(true),
    minimumAvailability: z.enum(MINIMUM_AVAILABILITIES).default('released'),
    searchForMovie: z.boolean().default(true),
  })
  .refine((body) => (body.path ?? '') !== '' || (body.rootFolderPath ?? '') !== '', {
    message: 'media.films.modal.pick_quality_folder',
    path: ['rootFolderPath'],
  });
export type MovieAddRequest = z.input<typeof movieAddRequestSchema>;

export const movieAddResponseSchema = z.object({
  ok: z.literal(true),
  movie: movieSchema,
  movieId: nullableNumber,
});

export const personFollowRequestSchema = z.object({
  personTmdbId: z.number().int().positive({ message: 'media.api.tmdb_id_missing' }),
  personName: z.string().max(500).default(''),
  type: z.enum(['cast', 'crew']).default('cast'),
  job: z.string().max(200).default(''),
});
export type PersonFollowRequest = z.input<typeof personFollowRequestSchema>;

export const personFollowResponseSchema = z.object({
  ok: z.literal(true),
  listId: nullableNumber,
  /** La personne était déjà suivie. */
  already: z.boolean(),
});

export const personUnfollowRequestSchema = z.object({ listId: z.number().int().positive() });

/** Personnes suivies : id TMDb de la personne → id de la liste d'import. */
export const personFollowingResponseSchema = z.record(z.string(), z.number());
export type PersonFollowingResponse = z.infer<typeof personFollowingResponseSchema>;
