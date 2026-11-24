// SPDX-License-Identifier: AGPL-3.0-or-later
// Design system commun (P5b.3) : composants partagés par toutes les
// vues. Importer depuis ce module plutôt que réécrire une variante locale.

export { default as BulkActionBar } from './BulkActionBar.vue';
export { default as FilterChips } from './FilterChips.vue';
export type { FilterChipOption, ViewModeOption } from './types';
export { default as ViewModeMenu } from './ViewModeMenu.vue';
export { default as MediaListItem } from './MediaListItem.vue';
export { default as MetaLine } from './MetaLine.vue';
export { default as PosterCard } from './PosterCard.vue';
export { default as ProgressRow } from './ProgressRow.vue';
export { default as PullToRefresh } from './PullToRefresh.vue';
export { default as QualityChip } from './QualityChip.vue';
export { default as ServiceHeader } from './ServiceHeader.vue';
export { default as SpeedIndicator } from './SpeedIndicator.vue';
export { default as StatTile } from './StatTile.vue';
export { default as StatusChip } from './StatusChip.vue';
export { pullDistance, PULL_THRESHOLD } from './pull';
export { default as DetailCard } from './DetailCard.vue';
export { default as DetailFacts } from './DetailFacts.vue';
export { default as DetailLayout } from './DetailLayout.vue';
export { default as DetailState } from './DetailState.vue';
