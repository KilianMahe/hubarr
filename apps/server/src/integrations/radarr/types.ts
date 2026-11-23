// SPDX-License-Identifier: AGPL-3.0-or-later
// Alias lisibles des types générés depuis la spécification OpenAPI de Radarr.

import type { components, paths } from './openapi';

export type RadarrPaths = paths;
type Schemas = components['schemas'];

export type RadarrMovieResource = Schemas['MovieResource'];
export type RadarrMovieEditorResource = Schemas['MovieEditorResource'];
export type RadarrMovieFileResource = Schemas['MovieFileResource'];
export type RadarrQueueResource = Schemas['QueueResource'];
export type RadarrQueueResourcePage = Schemas['QueueResourcePagingResource'];
export type RadarrHistoryResource = Schemas['HistoryResource'];
export type RadarrHistoryResourcePage = Schemas['HistoryResourcePagingResource'];
export type RadarrReleaseResource = Schemas['ReleaseResource'];
export type RadarrCollectionResource = Schemas['CollectionResource'];
export type RadarrBlocklistResourcePage = Schemas['BlocklistResourcePagingResource'];
export type RadarrImportListResource = Schemas['ImportListResource'];
export type RadarrManualImportResource = Schemas['ManualImportResource'];
export type RadarrCommandResource = Schemas['CommandResource'];
export type RadarrTagResource = Schemas['TagResource'];
export type RadarrTagDetailsResource = Schemas['TagDetailsResource'];
export type RadarrQualityProfileResource = Schemas['QualityProfileResource'];
export type RadarrRootFolderResource = Schemas['RootFolderResource'];
export type RadarrSystemResource = Schemas['SystemResource'];
export type RadarrHealthResource = Schemas['HealthResource'];
export type RadarrDiskSpaceResource = Schemas['DiskSpaceResource'];
export type RadarrLanguageResource = Schemas['LanguageResource'];
export type RadarrQueueStatusResource = Schemas['QueueStatusResource'];
