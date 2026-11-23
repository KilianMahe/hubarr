<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Parseur de titres (`radarr/parse.html.twig`) : titre dans l'URL (`?title=`),
// résultat analysé par l'instance (titre, année, qualité, édition, groupe,
// langues, épisode pour Sonarr) et film ou série correspondant (lien vers sa
// fiche).
import { parsePageSchema } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import { mediaDetailLocation } from '../../../app/media-links';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const titleParam = computed(() => String(route.query.title ?? ''));
const { ctx, query, feedback, error, title } = useAdminPage(
  'parse',
  () => `/parser?title=${encodeURIComponent(titleParam.value)}`,
  parsePageSchema,
);
const input = ref(titleParam.value);
watch(titleParam, (value) => (input.value = value));
function submit(): void {
  const value = input.value.trim();
  void router.push({ query: value === '' ? {} : { title: value } });
}
const result = computed(() => query.data.value?.result ?? null);
const matchLink = computed(() => {
  const match = result.value?.match;
  if (!match) return null;
  return mediaDetailLocation(ctx.kind.value, ctx.slug.value, match.id);
});
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="false"
    :error="error ? t(ctx.key('error')) : null"
  >
    <v-card variant="flat" border class="mb-4">
      <v-card-text>
        <form class="d-flex ga-2" @submit.prevent="submit">
          <v-text-field
            v-model="input"
            :placeholder="t(ctx.key('example_placeholder'))"
            variant="outlined"
            density="compact"
            hide-details
            data-test="parse-title"
          />
          <v-btn
            type="submit"
            color="service"
            :loading="query.isFetching.value"
            data-test="parse-submit"
            >{{ t(ctx.key('button_parse')) }}</v-btn
          >
        </form>
      </v-card-text>
    </v-card>
    <v-card
      v-if="titleParam !== '' && query.isSuccess.value"
      variant="flat"
      border
      data-test="parse-result"
    >
      <v-card-title class="text-title-medium">{{ t(ctx.key('result_title')) }}</v-card-title>
      <v-card-text v-if="result === null" class="text-muted">{{
        t(ctx.key('no_result'))
      }}</v-card-text>
      <v-table v-else density="compact">
        <tbody>
          <tr>
            <td class="text-muted">{{ t(ctx.key('parsed_title')) }}</td>
            <td>{{ result.parsedTitle ?? result.title ?? '—' }}</td>
          </tr>
          <tr v-if="result.episode">
            <td class="text-muted">{{ t(ctx.key('episode')) }}</td>
            <td>{{ result.episode }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t(ctx.key('year')) }}</td>
            <td>{{ result.year ?? '—' }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t(ctx.key('quality')) }}</td>
            <td>{{ result.quality ?? '—' }}</td>
          </tr>
          <tr v-if="result.edition">
            <td class="text-muted">{{ t(ctx.key('edition')) }}</td>
            <td>{{ result.edition }}</td>
          </tr>
          <tr v-if="result.releaseGroup">
            <td class="text-muted">{{ t(ctx.key('release_group')) }}</td>
            <td>{{ result.releaseGroup }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t(ctx.key('languages')) }}</td>
            <td>
              <v-chip
                v-for="language in result.languages"
                :key="language"
                size="x-small"
                class="me-1"
                >{{ language }}</v-chip><span v-if="result.languages.length === 0">—</span>
            </td>
          </tr>
          <tr v-if="result.match && matchLink">
            <td class="text-muted">
              {{ t(ctx.key(ctx.kind.value === 'radarr' ? 'matched_movie' : 'matched_series')) }}
            </td>
            <td>
              <router-link :to="matchLink" data-test="parse-match">{{
                result.match.title
              }}</router-link><span v-if="result.match.year"> ({{ result.match.year }})</span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </AdminPage>
</template>
