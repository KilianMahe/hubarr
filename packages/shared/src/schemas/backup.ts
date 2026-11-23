// SPDX-License-Identifier: AGPL-3.0-or-later
// Export et import de la configuration (`AdminSettingsController::export`,
// `import`), au format propre à Hubarr (version 1). Aucun secret n'en sort
// ni n'y entre : clés d'API et mots de passe sont à ressaisir après un import.
// Les exports de Prismarr (`prismarr_export_version`) ne sont pas repris
//.

import { z } from 'zod';

export const EXPORT_FORMAT_KEY = 'hubarr_export_version';
export const EXPORT_VERSION = 1;
/** Taille maximale d'un fichier importé (64 Ko, comme l'original). */
export const IMPORT_MAX_BYTES = 64_000;

/** Compteurs affichés à côté du bouton d'export. */
export const exportCountsSchema = z.object({
  /** Réglages, services et instances exportés. */
  exportable: z.number().int(),
  /** Secrets enregistrés, jamais exportés. */
  skipped: z.number().int(),
});
export type ExportCounts = z.infer<typeof exportCountsSchema>;

export const importResultSchema = z.object({
  applied: z.number().int(),
  skipped: z.number().int(),
  instancesApplied: z.number().int(),
  instancesSkipped: z.number().int(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
