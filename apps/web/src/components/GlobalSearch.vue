<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Recherche globale (`#global-search-wrap` de `base.html.twig`, routes n° 232
// et 233) : champ dans la barre du haut sur grand écran, plein écran sur
// mobile ; Ctrl+K pour y aller. Saisie différée de 300 ms (2 caractères),
// bibliothèques locales puis recherche en ligne Radarr/Sonarr ; filtres
// Tous / Films / Séries ; recherches récentes (navigateur) ; navigation au
// clavier. Un résultat ouvre l'aperçu rapide (bibliothèque ou TMDB), ou
// l'ajout rapide s'il n'a pas de fiche TMDB. Réservée aux admins.
import type { LocalSearchHit, OnlineSearchHit } from '@hubarr/shared';
import { msClose, msHistory, msMovie, msSearch, msTv } from './symbols';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { openQuickAdd, openQuickLook } from '../app/overlays';
import { defaultInstance, isConfigured } from '../app/services';
import { useSessionStore } from '../app/stores/session';
import {
  RECENT_SEARCH_KEY,
  SEARCH_DEBOUNCE_MS,
  addRecentSearch,
  loadRecentSearches,
  resolvedFromHit,
  searchApi,
} from '../features/search/search';

type Hit = (LocalSearchHit & { kind: 'local' }) | (OnlineSearchHit & { kind: 'online' });

const { t } = useI18n();
const { mdAndUp } = useDisplay();
const session = useSessionStore();

const term = ref<string | null>('');
const menu = ref(false);
const mobileOpen = ref(false);
const filter = ref<'all' | 'film' | 'serie'>('all');
const local = ref<LocalSearchHit[]>([]);
const online = ref<OnlineSearchHit[]>([]);
const loading = ref(false);
const onlineLoading = ref(false);
const recent = ref<string[]>(loadRecentSearches());
const selected = ref(-1);
const field = ref<{ focus: () => void; $el?: Element } | null>(null);
/**
 * Ancre explicite du menu des résultats (P5c.3, V3) : ouvert par le focus et
 * non par un clic, le menu ne connaissait pas son activateur et s'affichait en
 * haut à gauche de la fenêtre. Il en reprend aussi la largeur.
 */
const anchorEl = computed(() => field.value?.$el);
const fieldWidth = ref(520);
watch(menu, (open) => {
  const width = anchorEl.value?.getBoundingClientRect().width ?? 0;
  if (open && width > 0) fieldWidth.value = width;
});

/** Slug transmis à l'API (instance Radarr par défaut, sinon Sonarr). */
const slug = computed(
  () =>
    defaultInstance(session.services, 'radarr')?.slug ??
    defaultInstance(session.services, 'sonarr')?.slug ??
    null,
);
// Instances lisibles par le compte (bootstrap filtré par ses droits).
const available = computed(
  () => isConfigured(session.services, 'radarr') || isConfigured(session.services, 'sonarr'),
);

const passes = (type: 'film' | 'serie') => filter.value === 'all' || filter.value === type;
const hits = computed<Hit[]>(() => [
  ...online.value.filter((h) => passes(h.type)).map((h) => ({ ...h, kind: 'online' as const })),
  ...local.value.filter((h) => passes(h.type)).map((h) => ({ ...h, kind: 'local' as const })),
]);
const onlineHits = computed(() => hits.value.filter((h) => h.kind === 'online'));
const localHits = computed(() => hits.value.filter((h) => h.kind === 'local'));
const query = computed(() => (term.value ?? '').trim());

let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;
watch(term, () => {
  clearTimeout(timer);
  controller?.abort();
  selected.value = -1;
  if (query.value.length < 2) {
    local.value = [];
    online.value = [];
    loading.value = false;
    onlineLoading.value = false;
    return;
  }
  menu.value = true;
  timer = setTimeout(() => void run(query.value), SEARCH_DEBOUNCE_MS);
});

async function run(q: string): Promise<void> {
  const target = slug.value;
  if (target === null) return;
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  try {
    local.value = await searchApi.local(target, q, signal);
    loading.value = false;
    onlineLoading.value = true;
    online.value = await searchApi.online(target, q, signal).catch(() => []);
    if (local.value.length || online.value.length) remember(q);
  } catch {
    // Requête annulée par une saisie plus récente, ou échec : liste vide.
  } finally {
    if (!signal.aborted) {
      loading.value = false;
      onlineLoading.value = false;
    }
  }
}
function remember(q: string): void {
  recent.value = addRecentSearch(recent.value, q);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recent.value));
}
function forget(q: string): void {
  recent.value = recent.value.filter((r) => r !== q);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recent.value));
}

function choose(hit: Hit): void {
  menu.value = false;
  mobileOpen.value = false;
  if (hit.kind === 'local') {
    openQuickLook({
      kind: 'library',
      type: hit.type === 'film' ? 'movie' : 'series',
      slug: hit.instance.slug,
      id: hit.id,
    });
    return;
  }
  if (!hit.inLibrary && hit.tmdbId === null) {
    openQuickAdd({ media: resolvedFromHit(hit, session.services) });
    return;
  }
  const tmdbId = hit.tmdbId ?? (hit.type === 'film' ? hit.id : null);
  if (tmdbId !== null && isConfigured(session.services, 'tmdb')) {
    openQuickLook({ kind: 'tmdb', type: hit.type === 'film' ? 'movie' : 'tv', id: tmdbId });
  } else {
    openQuickAdd({ media: resolvedFromHit(hit, session.services) });
  }
}
function onKeydown(event: KeyboardEvent): void {
  const count = hits.value.length;
  if (event.key === 'ArrowDown' && count) {
    event.preventDefault();
    selected.value = (selected.value + 1) % count;
  } else if (event.key === 'ArrowUp' && count) {
    event.preventDefault();
    selected.value = (selected.value - 1 + count) % count;
  } else if (event.key === 'Enter' && selected.value >= 0) {
    event.preventDefault();
    const hit = hits.value[selected.value];
    if (hit) choose(hit);
  } else if (event.key === 'Escape') {
    menu.value = false;
  }
}
function onGlobalKey(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && available.value) {
    event.preventDefault();
    if (mdAndUp.value) {
      field.value?.focus();
      menu.value = true;
    } else mobileOpen.value = true;
  }
}
onMounted(() => {
  window.addEventListener('keydown', onGlobalKey);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey);
  clearTimeout(timer);
  controller?.abort();
});
const indexOf = (hit: Hit) => hits.value.indexOf(hit);
</script>

<template>
  <div v-if="available" class="d-flex align-center">
    <template v-if="mdAndUp">
      <!-- Résultats ancrés sous le champ, alignés sur son bord gauche (V3) -->
      <v-menu
        v-model="menu"
        :close-on-content-click="false"
        :target="anchorEl"
        location="bottom start"
        origin="top start"
        :offset="6"
        max-height="70vh"
        :open-on-click="false"
      >
        <template #activator="{ props }">
          <v-text-field
            v-bind="props"
            ref="field"
            v-model="term"
            :placeholder="`${t('topbar.search.placeholder')} (${t('topbar.search.shortcut_hint')})`"
            :aria-label="t('topbar.search.label')"
            :prepend-inner-icon="msSearch"
            :loading="loading"
            variant="solo-filled"
            flat
            density="compact"
            hide-details
            clearable
            rounded="pill"
            class="global-search"
            data-test="global-search"
            @focus="menu = true"
            @keydown="onKeydown"
          />
        </template>
        <v-card
          :width="Math.max(fieldWidth, 360)"
          max-width="calc(100vw - 32px)"
          data-test="global-search-results"
        >
          <template v-if="query.length < 2">
            <v-list v-if="recent.length" density="compact">
              <v-list-subheader>{{ t('topbar.search.recent') }}</v-list-subheader>
              <v-list-item
                v-for="q in recent"
                :key="q"
                :title="q"
                :prepend-icon="msHistory"
                @click="term = q"
              >
                <template #append>
                  <v-btn
                    :icon="msClose"
                    size="x-small"
                    variant="text"
                    :aria-label="t('topbar.search.forget')"
                    @click.stop="forget(q)"
                  />
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="pa-4 text-body-small text-muted">
              {{ t('topbar.search.placeholder_short') }}
            </div>
          </template>
          <template v-else>
            <div class="d-flex ga-1 pa-2">
              <v-chip-group v-model="filter" mandatory selected-class="text-primary">
                <v-chip value="all" size="small" filter>{{ t('topbar.search.filter.all') }}</v-chip>
                <v-chip value="film" size="small" filter>{{
                  t('topbar.search.filter.films')
                }}</v-chip>
                <v-chip value="serie" size="small" filter>{{
                  t('topbar.search.filter.series')
                }}</v-chip>
              </v-chip-group>
            </div>
            <v-list density="compact" class="pt-0">
              <template v-if="onlineHits.length || onlineLoading">
                <v-list-subheader>{{ t('topbar.search.group_online') }}</v-list-subheader>
                <v-list-item
                  v-if="onlineLoading && !onlineHits.length"
                  :title="t('topbar.search.loading_online')"
                />
              </template>
              <template
                v-for="section in [onlineHits, localHits]"
                :key="section === onlineHits ? 'online' : 'local'"
              >
                <v-list-subheader v-if="section === localHits && section.length">{{
                  t('topbar.search.group_local')
                }}</v-list-subheader>
                <v-list-item
                  v-for="hit in section"
                  :key="`${hit.kind}-${hit.type}-${hit.id}-${hit.kind === 'local' ? hit.instance.slug : ''}`"
                  :active="indexOf(hit) === selected"
                  :data-test="`search-hit-${hit.kind}`"
                  @click="choose(hit)"
                >
                  <template #prepend>
                    <v-avatar rounded="sm" size="40" color="surface-alt" class="me-2">
                      <v-img v-if="hit.poster" :src="hit.poster" cover />
                      <v-icon v-else :icon="hit.type === 'film' ? msMovie : msTv" size="18" />
                    </v-avatar>
                  </template>
                  <v-list-item-title>{{ hit.title }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ hit.year ?? ''
                    }}<template v-if="hit.kind === 'local'"> · {{ hit.instance.name }}</template>
                  </v-list-item-subtitle>
                  <template #append>
                    <v-chip
                      v-if="hit.kind === 'local' && hit.subtitle"
                      size="x-small"
                      :color="hit.subtitle.state === 'missing' ? 'warning' : 'success'"
                      class="me-1"
                      :title="
                        t(
                          hit.subtitle.state === 'missing'
                            ? 'bazarr.badge.missing'
                            : 'bazarr.badge.complete',
                        )
                      "
                      >{{ hit.subtitle.state === 'missing' ? hit.subtitle.count : '✓' }}</v-chip
                    >
                    <v-chip
                      size="x-small"
                      :color="hit.inLibrary ? 'success' : undefined"
                      variant="tonal"
                      >{{
                        t(
                          hit.inLibrary
                            ? 'topbar.search.in_library_badge'
                            : 'topbar.search.not_added_badge',
                        )
                      }}</v-chip
                    >
                  </template>
                </v-list-item>
              </template>
              <v-list-item
                v-if="!loading && !onlineLoading && hits.length === 0"
                :title="t('topbar.search.empty')"
              />
            </v-list>
          </template>
        </v-card>
      </v-menu>
    </template>
    <template v-else>
      <v-btn
        :icon="msSearch"
        :aria-label="t('topbar.search.label')"
        data-test="global-search-open"
        @click="mobileOpen = true"
      />
      <v-dialog v-model="mobileOpen" fullscreen transition="dialog-bottom-transition">
        <v-card>
          <div class="d-flex align-center pa-2 ga-1">
            <v-text-field
              v-model="term"
              autofocus
              :placeholder="t('topbar.search.placeholder')"
              :prepend-inner-icon="msSearch"
              :loading="loading"
              variant="solo-filled"
              flat
              density="compact"
              hide-details
              clearable
              @keydown="onKeydown"
            />
            <v-btn
              :icon="msClose"
              variant="text"
              :aria-label="t('topbar.search.clear')"
              data-test="dialog-close"
              @click="mobileOpen = false"
            />
          </div>
          <v-chip-group v-model="filter" mandatory selected-class="text-primary" class="px-2">
            <v-chip value="all" size="small" filter>{{ t('topbar.search.filter.all') }}</v-chip>
            <v-chip value="film" size="small" filter>{{ t('topbar.search.filter.films') }}</v-chip>
            <v-chip value="serie" size="small" filter>{{
              t('topbar.search.filter.series')
            }}</v-chip>
          </v-chip-group>
          <v-list density="compact">
            <template v-if="query.length < 2">
              <v-list-subheader v-if="recent.length">{{
                t('topbar.search.recent')
              }}</v-list-subheader>
              <v-list-item
                v-for="q in recent"
                :key="q"
                :title="q"
                :prepend-icon="msHistory"
                @click="term = q"
              />
            </template>
            <v-list-item
              v-for="hit in hits"
              :key="`${hit.kind}-${hit.type}-${hit.id}`"
              @click="choose(hit)"
            >
              <template #prepend>
                <v-avatar rounded="sm" size="40" color="surface-alt" class="me-2">
                  <v-img v-if="hit.poster" :src="hit.poster" cover />
                </v-avatar>
              </template>
              <v-list-item-title>{{ hit.title }}</v-list-item-title>
              <v-list-item-subtitle
                >{{ hit.year ?? '' }} ·
                {{
                  t(
                    hit.inLibrary
                      ? 'topbar.search.in_library_badge'
                      : 'topbar.search.not_added_badge',
                  )
                }}</v-list-item-subtitle
              >
            </v-list-item>
          </v-list>
        </v-card>
      </v-dialog>
    </template>
  </div>
</template>

<style scoped>
.global-search {
  width: min(520px, 40vw);
}
</style>
