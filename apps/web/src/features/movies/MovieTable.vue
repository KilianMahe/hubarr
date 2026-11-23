<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue tableau : vignette, titre, année, qualité, taille, statut ; colonne de
// sélection en mode sélection (clic sur la ligne, Maj+clic pour une plage).
import type { MovieLibraryItem } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { STATUS_COLORS, displayStatusOf, statusLabelKey } from './library';
import { posterUrl, sizeText, statusTitle } from './movie-display';

defineProps<{
  movies: MovieLibraryItem[];
  selectMode: boolean;
  selected: ReadonlySet<number>;
}>();
const emit = defineEmits<{
  select: [id: number, event: MouseEvent | KeyboardEvent];
  open: [id: number];
}>();
const { t } = useI18n();
</script>

<template>
  <v-card variant="flat" border>
    <v-table density="compact" class="movie-table" hover>
      <thead>
        <tr>
          <th v-if="selectMode" style="width: 40px" />
          <th style="width: 48px" />
          <th>{{ t('media.films.table.title') }}</th>
          <th>{{ t('media.films.table.year') }}</th>
          <th>{{ t('media.films.table.quality') }}</th>
          <th>{{ t('media.films.table.size') }}</th>
          <th>{{ t('media.films.table.status') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="movie in movies"
          :key="movie.id"
          :class="{ 'movie-table__row--selected': selected.has(movie.id) }"
          style="cursor: pointer"
          @click="selectMode ? emit('select', movie.id, $event) : emit('open', movie.id)"
        >
          <td v-if="selectMode">
            <v-checkbox-btn
              :model-value="selected.has(movie.id)"
              color="service"
              :aria-label="movie.title"
              @click.stop="emit('select', movie.id, $event)"
            />
          </td>
          <td>
            <img
              v-if="movie.poster"
              :src="posterUrl(movie.poster, 'w92') ?? undefined"
              alt=""
              loading="lazy"
              class="movie-table__poster"
            />
            <div v-else class="movie-table__poster" />
          </td>
          <td class="font-weight-medium">
            <a
              v-if="!selectMode"
              href="#"
              class="movie-table__link"
              @click.prevent.stop="emit('open', movie.id)"
              >{{ movie.title }}</a
            >
            <template v-else>{{ movie.title }}</template>
          </td>
          <td class="text-muted">{{ movie.year ?? '—' }}</td>
          <td>
            <v-chip v-if="movie.quality" size="x-small" label variant="tonal" color="info">{{
              movie.quality
            }}</v-chip>
            <span v-else>—</span>
          </td>
          <td class="text-muted">{{ sizeText(t, movie.sizeGb) ?? '—' }}</td>
          <td>
            <v-chip
              size="x-small"
              label
              variant="tonal"
              :color="STATUS_COLORS[displayStatusOf(movie)]"
              :title="statusTitle(t, movie)"
              >{{ t(statusLabelKey(displayStatusOf(movie))) }}</v-chip
            >
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<style scoped>
.movie-table__poster {
  display: block;
  width: 30px;
  height: 45px;
  object-fit: cover;
  border-radius: 4px;
  background: rgb(var(--v-theme-surface-alt));
}
.movie-table__row--selected {
  background: rgba(var(--v-theme-service), 0.12);
}
.movie-table__link {
  color: inherit;
  text-decoration: none;
}
.movie-table__link:hover,
.movie-table__link:focus-visible {
  text-decoration: underline;
}
</style>
