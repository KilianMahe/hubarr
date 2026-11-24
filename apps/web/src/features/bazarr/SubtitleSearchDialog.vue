<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Recherche manuelle de sous-titres (`bazarr/_search_modal.html.twig`) :
// résultats des fournisseurs (fournisseur, langue, malentendants, forcé,
// score, version, auteur) et téléchargement d'un résultat ; un épisode porte
// aussi sa série (exigée par Bazarr). Utilisé par les pages Bazarr et par les
// badges des bibliothèques.
import type { BazarrSubtitleResult } from '@hubarr/shared';
import { msCheck, msDownload } from '../../components/symbols';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useNotifyStore } from '../../app/stores/notify';
import DialogTitle from '../../components/DialogTitle.vue';
import { bazarrApi, bazarrKeys } from './bazarr-api';

const props = defineProps<{
  kind: 'movie' | 'episode';
  /** Film Radarr ou épisode Sonarr. */
  itemId: number | null;
  /** Série Sonarr d'un épisode. */
  seriesId?: number | null;
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ downloaded: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();
const notify = useNotifyStore();
const queryClient = useQueryClient();

const search = useQuery({
  queryKey: computed(() => ['bazarr', 'search', props.kind, props.itemId ?? 0]),
  queryFn: ({ signal }) => bazarrApi.search(props.kind, props.itemId ?? 0, signal),
  enabled: computed(() => open.value && props.itemId !== null),
  staleTime: 0,
  gcTime: 0,
  retry: false,
});
const downloading = ref<number | null>(null);
const failed = ref(false);
watch(open, (value) => {
  if (value) failed.value = false;
});

async function download(result: BazarrSubtitleResult, index: number): Promise<void> {
  if (props.itemId === null) return;
  downloading.value = index;
  failed.value = false;
  const options = {
    hi: result.hi,
    forced: result.forced,
    originalFormat: result.originalFormat,
    provider: result.provider,
    subtitle: result.subtitle,
  };
  try {
    if (props.kind === 'movie')
      await bazarrApi.downloadMovie({ radarrId: props.itemId, ...options });
    else
      await bazarrApi.downloadEpisode({
        seriesId: props.seriesId ?? 0,
        episodeId: props.itemId,
        ...options,
      });
    notify.success('bazarr.modal.success');
    await queryClient.invalidateQueries({ queryKey: bazarrKeys.all });
    open.value = false;
    emit('downloaded');
  } catch {
    failed.value = true;
  } finally {
    downloading.value = null;
  }
}
const results = computed(() => search.data.value?.results ?? []);
</script>

<template>
  <v-dialog
    v-model="open"
    :fullscreen="smAndDown"
    :max-width="smAndDown ? undefined : 960"
    scrollable
  >
    <v-card data-test="bazarr-search-dialog">
      <DialogTitle :title="t('bazarr.modal.title')" @close="open = false" />
      <v-card-text>
        <div v-if="search.isFetching.value" class="text-center text-muted py-6">
          <v-progress-circular indeterminate size="20" color="service" class="me-2" />
          {{ t('bazarr.modal.searching') }}
        </div>
        <p
          v-else-if="search.isError.value"
          class="text-center text-error py-6"
          data-test="bazarr-search-error"
        >
          {{ t('bazarr.modal.error') }}
        </p>
        <p
          v-else-if="results.length === 0"
          class="text-center text-muted py-6"
          data-test="bazarr-search-empty"
        >
          {{ t('bazarr.modal.no_results') }}
        </p>
        <template v-else>
          <v-alert v-if="failed" type="error" variant="tonal" density="compact" class="mb-3">{{
            t('bazarr.modal.error')
          }}</v-alert>
          <v-table density="compact">
            <thead>
              <tr>
                <th>{{ t('bazarr.modal.columns.provider') }}</th>
                <th>{{ t('bazarr.modal.columns.language') }}</th>
                <th class="text-center">{{ t('bazarr.modal.columns.hi') }}</th>
                <th class="text-center">{{ t('bazarr.modal.columns.forced') }}</th>
                <th>{{ t('bazarr.modal.columns.score') }}</th>
                <th>{{ t('bazarr.modal.columns.release') }}</th>
                <th>{{ t('bazarr.modal.columns.uploader') }}</th>
                <th class="text-end">{{ t('bazarr.modal.columns.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(result, index) in results"
                :key="`${result.provider}-${index}`"
                data-test="bazarr-result"
              >
                <td>{{ result.provider }}</td>
                <td>{{ result.language }}</td>
                <td class="text-center"><v-icon v-if="result.hi" :icon="msCheck" size="16" /></td>
                <td class="text-center">
                  <v-icon v-if="result.forced" :icon="msCheck" size="16" />
                </td>
                <td>{{ result.score ?? '' }}</td>
                <td class="bazarr-result__release" :title="result.release">{{ result.release }}</td>
                <td class="text-muted">{{ result.uploader ?? '' }}</td>
                <td class="text-end">
                  <v-btn
                    size="small"
                    color="service"
                    variant="tonal"
                    :prepend-icon="msDownload"
                    :loading="downloading === index"
                    :disabled="downloading !== null"
                    data-test="bazarr-download"
                    @click="download(result, index)"
                    >{{ t('bazarr.modal.download') }}</v-btn
                  >
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.action.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.bazarr-result__release {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
