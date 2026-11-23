<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Pagination d'une bibliothèque (`_library_pagination.html.twig`) : plage
// « a – b sur n », « filtrés sur N », pages avec ellipses, saut direct à partir
// de 5 pages. Partagée par les films et les séries (`i18nPrefix`).
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PAGE_JUMP_MIN_PAGES, pageRange, paginationLinks } from '../features/movies/library';

const props = defineProps<{
  page: number;
  totalPages: number;
  total: number;
  libraryTotal: number;
  perPage: number;
  /** `media.films.pagination` ou `media.series.pagination`. */
  i18nPrefix: string;
}>();
const emit = defineEmits<{ 'update:page': [page: number] }>();
const { t } = useI18n();

const range = computed(() => pageRange(props.page, props.perPage, props.total));
const links = computed(() => paginationLinks(props.page, props.totalPages));
const jump = ref(String(props.page));
watch(
  () => props.page,
  (page) => (jump.value = String(page)),
);

function go(page: number): void {
  const target = Math.min(Math.max(1, Math.trunc(page)), props.totalPages);
  if (Number.isFinite(target) && target !== props.page) emit('update:page', target);
}
</script>

<template>
  <div class="library-pagination d-flex flex-wrap align-center ga-2 py-2">
    <div class="text-body-small text-muted flex-grow-1" data-test="pagination-range">
      <template v-if="range === null">{{ t(`${i18nPrefix}.no_results`) }}</template>
      <template v-else>
        {{ t(`${i18nPrefix}.range`, { first: range.first, last: range.last, total }) }}
        <span v-if="total < libraryTotal">
          · {{ t(`${i18nPrefix}.filtered_from`, { total: libraryTotal }) }}</span
        >
      </template>
    </div>
    <nav
      v-if="totalPages > 1"
      class="d-flex align-center ga-1"
      :aria-label="t(`${i18nPrefix}.aria_label`)"
    >
      <v-btn
        :icon="mdiChevronLeft"
        size="small"
        variant="text"
        :disabled="page <= 1"
        :aria-label="t(`${i18nPrefix}.prev`)"
        @click="go(page - 1)"
      />
      <template v-for="(link, index) in links" :key="`${link}-${index}`">
        <span v-if="link === 'gap'" class="px-1 text-muted">…</span>
        <v-btn
          v-else
          size="small"
          min-width="36"
          :variant="link === page ? 'tonal' : 'text'"
          :color="link === page ? 'service-text' : undefined"
          :aria-current="link === page ? 'page' : undefined"
          @click="go(link)"
          >{{ link }}</v-btn
        >
      </template>
      <v-btn
        :icon="mdiChevronRight"
        size="small"
        variant="text"
        :disabled="page >= totalPages"
        :aria-label="t(`${i18nPrefix}.next`)"
        @click="go(page + 1)"
      />
    </nav>
    <form
      v-if="totalPages >= PAGE_JUMP_MIN_PAGES"
      class="d-flex align-center ga-1"
      :aria-label="t(`${i18nPrefix}.jump_aria`)"
      @submit.prevent="go(Number(jump))"
    >
      <v-text-field
        v-model="jump"
        type="number"
        :min="1"
        :max="totalPages"
        :label="t(`${i18nPrefix}.jump_label`)"
        density="compact"
        hide-details
        variant="outlined"
        style="width: 96px"
        inputmode="numeric"
      />
      <span class="text-body-small text-muted">/ {{ totalPages }}</span>
    </form>
  </div>
</template>
