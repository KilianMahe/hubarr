// SPDX-License-Identifier: AGPL-3.0-or-later
// Alias lisibles des types générés depuis la spécification OpenAPI de Prowlarr.

import type { components, paths } from './openapi';

export type ProwlarrPaths = paths;
type Schemas = components['schemas'];

export type ProwlarrIndexerResource = Schemas['IndexerResource'];
export type ProwlarrIndexerStatusResource = Schemas['IndexerStatusResource'];
export type ProwlarrIndexerStatsResource = Schemas['IndexerStatsResource'];
export type ProwlarrIndexerStatistics = Schemas['IndexerStatistics'];
export type ProwlarrIndexerCategory = Schemas['IndexerCategory'];
export type ProwlarrIndexerBulkResource = Schemas['IndexerBulkResource'];
export type ProwlarrHealthResource = Schemas['HealthResource'];
export type ProwlarrApplicationResource = Schemas['ApplicationResource'];
export type ProwlarrAppProfileResource = Schemas['AppProfileResource'];
export type ProwlarrTagResource = Schemas['TagResource'];
export type ProwlarrHistoryResource = Schemas['HistoryResource'];
export type ProwlarrCommandResource = Schemas['CommandResource'];
export type ProwlarrSystemResource = Schemas['SystemResource'];
export type ProwlarrReleaseResource = Schemas['ReleaseResource'];
