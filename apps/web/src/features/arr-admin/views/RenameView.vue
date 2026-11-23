<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Renommage des fichiers d'un film (`radarr/rename.html.twig`, Radarr) : choix
// du film, propositions (chemin actuel → nouveau), « Renommer tout » suivi
// jusqu'à la fin, propositions relues ensuite.
import { arrCommandStartedSchema, renamePageSchema, renameProposalSchema } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import AdminPage from '../AdminPage.vue';
import { useAdminCommand, useAdminPage } from '../admin-api';

const { t } = useI18n();
const { ctx, query, feedback, error, title } = useAdminPage(
  'rename',
  '/renommer',
  renamePageSchema,
);
const command = useAdminCommand(ctx);
const movieId = ref<number | null>(null);
const movieItems = computed(() =>
  (query.data.value?.movies ?? []).map((movie) => ({
    value: movie.id,
    title: movie.year ? `${movie.title} (${movie.year})` : movie.title,
  })),
);
const proposals = useQuery({
  queryKey: computed(() => ctx.queryKey('rename', 'proposals', movieId.value ?? 0)),
  queryFn: ({ signal }) =>
    ctx.get(`/renommer/${movieId.value ?? 0}/propositions`, z.array(renameProposalSchema), signal),
  enabled: computed(() => movieId.value !== null),
  retry: false,
});
const list = computed(() => proposals.data.value ?? []);

const renaming = ref(false);
async function renameAll(): Promise<void> {
  if (movieId.value === null) return;
  renaming.value = true;
  feedback.value = { type: 'info', text: t(ctx.key('progress_starting')) };
  try {
    const started = await ctx.post(
      `/renommer/${movieId.value}/executer`,
      {},
      arrCommandStartedSchema,
    );
    if (started.cmdId !== null) {
      const result = await command.follow(ctx.slug.value, started.cmdId, (tick) => {
        feedback.value = {
          type: 'info',
          text: t(ctx.key('progress_status_tpl'), { status: tick.status.status }),
        };
      });
      if (result.outcome === 'failed') {
        feedback.value = { type: 'error', text: t(ctx.key('generic_error')) };
        return;
      }
    }
    feedback.value = { type: 'success', text: t(ctx.key('progress_done')) };
    await proposals.refetch();
  } catch (failure) {
    feedback.value = { type: 'error', text: ctx.errorMessage(failure, ctx.key('network_error')) };
  } finally {
    renaming.value = false;
  }
}
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card variant="flat" border class="mb-4">
      <v-card-title class="text-title-medium">{{
        t(ctx.key('choose_movie_card_title'))
      }}</v-card-title>
      <v-card-text>
        <v-autocomplete
          v-model="movieId"
          :items="movieItems"
          :placeholder="t(ctx.key('select_placeholder'))"
          variant="outlined"
          density="compact"
          hide-details
          data-test="rename-movie"
        />
      </v-card-text>
    </v-card>
    <v-card variant="flat" border>
      <v-card-title class="d-flex align-center text-title-medium">
        {{ t(ctx.key('proposals_card_title')) }}
        <v-spacer />
        <v-btn
          v-if="list.length > 0"
          color="service"
          size="small"
          :loading="renaming"
          data-test="rename-all"
          @click="renameAll"
          >{{ t(ctx.key('btn_rename_all')) }}</v-btn
        >
      </v-card-title>
      <v-card-text v-if="movieId === null" class="text-muted">{{
        t(ctx.key('select_movie_hint'))
      }}</v-card-text>
      <v-progress-linear v-else-if="proposals.isFetching.value" indeterminate color="service" />
      <v-card-text v-else-if="proposals.isError.value" class="text-error">{{
        t(ctx.key('load_error'))
      }}</v-card-text>
      <v-card-text v-else-if="list.length === 0" class="text-muted" data-test="rename-none">{{
        t(ctx.key('no_rename_needed'))
      }}</v-card-text>
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_current_path')) }}</th>
            <th>{{ t(ctx.key('col_new_path')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(proposal, index) in list" :key="index" data-test="rename-row">
            <td class="font-monospace text-body-small text-muted">{{ proposal.existingPath }}</td>
            <td class="font-monospace text-body-small">{{ proposal.newPath }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </AdminPage>
</template>
