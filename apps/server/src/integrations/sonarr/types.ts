// SPDX-License-Identifier: AGPL-3.0-or-later
// Alias lisibles des types générés depuis la spécification OpenAPI de Sonarr.

import type { components, paths } from './openapi';

export type SonarrPaths = paths;
type Schemas = components['schemas'];

export type SonarrSeriesResource = Schemas['SeriesResource'];
export type SonarrSeriesEditorResource = Schemas['SeriesEditorResource'];
export type SonarrSeasonResource = Schemas['SeasonResource'];
export type SonarrEpisodeResource = Schemas['EpisodeResource'];
export type SonarrEpisodeResourcePage = Schemas['EpisodeResourcePagingResource'];
export type SonarrEpisodeFileResource = Schemas['EpisodeFileResource'];
export type SonarrMediaInfoResource = Schemas['MediaInfoResource'];
export type SonarrQueueResource = Schemas['QueueResource'];
export type SonarrHistoryResource = Schemas['HistoryResource'];
export type SonarrHistoryResourcePage = Schemas['HistoryResourcePagingResource'];
export type SonarrReleaseResource = Schemas['ReleaseResource'];
export type SonarrRenameEpisodeResource = Schemas['RenameEpisodeResource'];
export type SonarrManualImportResource = Schemas['ManualImportResource'];
export type SonarrBlocklistResource = Schemas['BlocklistResource'];
export type SonarrBlocklistResourcePage = Schemas['BlocklistResourcePagingResource'];
export type SonarrQualityDefinitionResource = Schemas['QualityDefinitionResource'];
export type SonarrQualityProfileResource = Schemas['QualityProfileResource'];
export type SonarrTagDetailsResource = Schemas['TagDetailsResource'];
