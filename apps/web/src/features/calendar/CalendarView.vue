<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Calendrier (`calendrier/index.html.twig`, routes n° 29 et 30) : sorties
// Radarr (cinéma, numérique, physique) et épisodes Sonarr de toutes les
// instances, dédoublonnés ; vues mois, semaine et jour (agenda), mémorisées
// dans le navigateur, `?view=day&date=AAAA-MM-JJ` prioritaire ; filtres par
// type et par état ; bannières « injoignable » par service ; lien
// d'abonnement iCal. Un événement ouvre l'aperçu rapide de sa bibliothèque.
// Sur mobile (P5c.3, V12) : mois en pastilles, le jour touché listé sous la
// grille ; semaine en liste verticale, un bloc par jour.
import { readStoredChoice, storeChoice } from '../../app/view-mode';
import { addDays, dayInZone, type CalendarEvent } from '@hubarr/shared';
import { mdiCalendarExport, mdiChevronLeft, mdiChevronRight, mdiContentCopy } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import CalendarEventRow from './CalendarEventRow.vue';
import { absoluteAppUrl } from '../../app/base-path';
import { useFormat } from '../../app/format';
import { openQuickLook } from '../../app/overlays';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import {
  CALENDAR_VIEWS,
  RELEASE_COLORS,
  STATUS_FILTERS,
  TYPE_FILTERS,
  VIEW_STORAGE_KEY,
  byDay,
  calendarApi,
  eventTitle,
  matchEvent,
  monthGrid,
  startOfWeek,
  type CalendarView,
  type StatusFilter,
  type TypeFilter,
} from './calendar-api';

const { t } = useI18n();
const format = useFormat();
const route = useRoute();
const session = useSessionStore();
const notify = useNotifyStore();
const { smAndDown } = useDisplay();

const query = useQuery({
  queryKey: ['calendar'],
  queryFn: ({ signal }) => calendarApi.events(signal),
  staleTime: 60_000,
  retry: false,
});

const today = computed(
  () =>
    dayInZone(new Date(), session.preferences.display_timezone) ??
    new Date().toISOString().slice(0, 10),
);
const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const view = ref<CalendarView>(
  (CALENDAR_VIEWS as readonly string[]).includes(String(route.query.view))
    ? (route.query.view as CalendarView)
    : readStoredChoice(VIEW_STORAGE_KEY, CALENDAR_VIEWS, 'month'),
);
const cursor = ref(isDay(route.query.date) ? route.query.date : today.value);
watch(view, (value) => {
  storeChoice(VIEW_STORAGE_KEY, value);
});

const typeFilter = ref<TypeFilter>('all');
const statusFilter = ref<StatusFilter>('all');
const events = computed(() =>
  (query.data.value?.events ?? []).filter((ev) =>
    matchEvent(ev, typeFilter.value, statusFilter.value),
  ),
);
const days = computed(() => byDay(events.value));
const countFor = (type: TypeFilter) =>
  (query.data.value?.events ?? []).filter((ev) => matchEvent(ev, type, 'all')).length;

const monthNames = computed(() =>
  Array.from({ length: 12 }, (_, i) => t(`calendar.months.full.${i}`)),
);
const weekdayNames = computed(() =>
  Array.from({ length: 7 }, (_, i) => t(`calendar.weekdays.short.${i}`)),
);
const cursorYear = computed(() => Number(cursor.value.slice(0, 4)));
const cursorMonth = computed(() => Number(cursor.value.slice(5, 7)) - 1);
const grid = computed(() => monthGrid(cursorYear.value, cursorMonth.value));
const week = computed(() => {
  const start = startOfWeek(cursor.value);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
});
const heading = computed(() => {
  if (view.value === 'month')
    return `${monthNames.value[cursorMonth.value] ?? ''} ${cursorYear.value}`;
  if (view.value === 'week') {
    const [first, last] = [week.value[0] ?? cursor.value, week.value[6] ?? cursor.value];
    return `${format.date(`${first}T12:00:00Z`)} — ${format.date(`${last}T12:00:00Z`)}`;
  }
  return format.date(`${cursor.value}T12:00:00Z`);
});
function shift(delta: -1 | 1): void {
  if (view.value === 'month') {
    const d = new Date(Date.UTC(cursorYear.value, cursorMonth.value + delta, 1));
    cursor.value = d.toISOString().slice(0, 10);
  } else cursor.value = addDays(cursor.value, view.value === 'week' ? 7 * delta : delta);
}
function openDay(day: string): void {
  cursor.value = day;
  view.value = 'day';
}
/** Case du mois : choisit le jour listé sous la grille, sur toutes les tailles (V12, P5d.5 V26). */
function pickDay(day: string): void {
  cursor.value = day;
}
const dayLabel = (day: string) =>
  `${format.date(`${day}T12:00:00Z`)} · ${t('calendar.event.count', { count: days.value.get(day)?.length ?? 0 })}`;
function open(ev: CalendarEvent): void {
  if (ev.id === null) return;
  openQuickLook({
    kind: 'library',
    type: ev.type === 'film' ? 'movie' : 'series',
    slug: ev.instanceSlug,
    id: ev.id,
  });
}
const statusKey = (ev: CalendarEvent) =>
  ev.hasFile
    ? 'calendar.status.available'
    : ev.monitored
      ? 'calendar.status.monitored'
      : 'calendar.status.unmonitored';

const banner = computed(() => {
  const data = query.data.value;
  if (data === undefined) return null;
  if (!data.radarrConfigured && !data.sonarrConfigured) return 'none';
  if (data.radarrFailed && data.sonarrFailed) return 'both';
  if (data.radarrFailed) return 'radarr';
  if (data.sonarrFailed) return 'sonarr';
  return null;
});
const icalUrl = computed(() => absoluteAppUrl('/calendrier.ics'));
async function copyIcal(): Promise<void> {
  try {
    await navigator.clipboard.writeText(icalUrl.value);
    notify.success('common.labels.copied');
  } catch {
    notify.error('error.generic.message');
  }
}
const dayEvents = computed(() => days.value.get(cursor.value) ?? []);
const MAX_PER_CELL = 3;
</script>

<template>
  <v-container fluid class="py-4" data-test="calendar-view">
    <v-alert
      v-if="banner === 'none'"
      type="info"
      variant="tonal"
      class="mb-3"
      :title="t('calendar.info.none_configured_title')"
      >{{ t('calendar.info.none_configured_body') }}</v-alert
    >
    <v-alert
      v-else-if="banner"
      type="warning"
      variant="tonal"
      class="mb-3"
      :title="t(`calendar.error.${banner}_unreachable_title`)"
      data-test="calendar-banner"
      >{{ t(`calendar.error.${banner}_unreachable_body`) }}</v-alert
    >

    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-btn
        :icon="mdiChevronLeft"
        variant="text"
        :aria-label="t('calendar.nav.prev')"
        @click="shift(-1)"
      />
      <v-btn variant="tonal" size="small" @click="cursor = today">{{
        t('calendar.nav.today')
      }}</v-btn>
      <v-btn
        :icon="mdiChevronRight"
        variant="text"
        :aria-label="t('calendar.nav.next')"
        @click="shift(1)"
      />
      <h2 class="text-title-large cal-heading" data-test="calendar-heading">{{ heading }}</h2>
      <v-spacer />
      <v-btn-toggle
        v-model="view"
        mandatory
        density="compact"
        variant="outlined"
        divided
        :aria-label="t('calendar.view.aria_label')"
      >
        <v-btn v-for="v in CALENDAR_VIEWS" :key="v" :value="v" :data-test="`view-${v}`">{{
          t(`calendar.view.${v}`)
        }}</v-btn>
      </v-btn-toggle>
      <v-menu>
        <template #activator="{ props }">
          <v-btn
            v-if="smAndDown"
            v-bind="props"
            variant="text"
            :icon="mdiCalendarExport"
            :aria-label="t('calendar.nav.ical_title')"
            :title="t('calendar.nav.ical_title')"
          />
          <v-btn
            v-else
            v-bind="props"
            variant="tonal"
            size="small"
            :prepend-icon="mdiCalendarExport"
            :title="t('calendar.nav.ical_title')"
            >{{ t('calendar.nav.ical') }}</v-btn
          >
        </template>
        <v-card max-width="420" class="pa-3">
          <div class="text-body-small mb-2">{{ t('calendar.nav.ical_title') }}</div>
          <v-filter-field
            :model-value="icalUrl"
            readonly
            density="compact"
            hide-details
            variant="outlined"
          >
            <template #append-inner>
              <v-btn
                :icon="mdiContentCopy"
                size="x-small"
                variant="text"
                :aria-label="t('common.labels.copy')"
                @click="copyIcal"
              />
            </template>
          </v-filter-field>
        </v-card>
      </v-menu>
    </div>

    <div class="d-flex flex-wrap align-center ga-1 mb-2">
      <span class="text-label-medium me-1">{{ t('calendar.filter.media') }}</span>
      <v-chip-group v-model="typeFilter" mandatory selected-class="text-primary">
        <v-chip v-for="f in TYPE_FILTERS" :key="f" :value="f" size="small" filter>
          <v-badge v-if="f !== 'all'" dot inline :color="RELEASE_COLORS[f]" class="me-1" />
          {{ t(`calendar.filter.${f}`) }} <span class="text-muted ms-1">{{ countFor(f) }}</span>
        </v-chip>
      </v-chip-group>
    </div>
    <div class="d-flex flex-wrap align-center ga-1 mb-4">
      <span class="text-label-medium me-1">{{ t('calendar.filter.status') }}</span>
      <v-chip-group v-model="statusFilter" mandatory selected-class="text-primary">
        <v-chip v-for="f in STATUS_FILTERS" :key="f" :value="f" size="small" filter>{{
          t(`calendar.filter.status_${f}`)
        }}</v-chip>
      </v-chip-group>
    </div>

    <v-progress-linear v-if="query.isFetching.value" indeterminate color="primary" class="mb-2" />

    <!-- Mois -->
    <div v-if="view === 'month'" class="cal-month" data-test="calendar-month">
      <div v-for="name in weekdayNames" :key="name" class="cal-month__head text-label-medium">
        {{ name }}
      </div>
      <div
        v-for="cell in grid"
        :key="cell.day"
        class="cal-month__cell"
        :class="{
          'cal-month__cell--other': !cell.inMonth,
          'cal-month__cell--today': cell.day === today,
          'cal-month__cell--past': cell.day < today,
          'cal-month__cell--selected': cell.day === cursor,
        }"
        role="button"
        tabindex="0"
        :aria-label="dayLabel(cell.day)"
        :aria-pressed="cell.day === cursor"
        @click="pickDay(cell.day)"
        @keydown.enter.prevent="pickDay(cell.day)"
        @keydown.space.prevent="pickDay(cell.day)"
      >
        <div class="text-label-medium">{{ Number(cell.day.slice(8, 10)) }}</div>
        <div v-if="smAndDown" class="cal-dots" aria-hidden="true">
          <span
            v-for="ev in (days.get(cell.day) ?? []).slice(0, MAX_PER_CELL)"
            :key="`${ev.type}-${ev.instanceSlug}-${ev.id}-${ev.releaseType}-${ev.episode}`"
            class="cal-dot"
            :style="{ background: RELEASE_COLORS[ev.releaseType] }"
          />
          <span
            v-if="(days.get(cell.day)?.length ?? 0) > MAX_PER_CELL"
            class="cal-dots__more text-label-small"
            >+{{ (days.get(cell.day)?.length ?? 0) - MAX_PER_CELL }}</span
          >
        </div>
        <template v-else>
          <button
            v-for="ev in (days.get(cell.day) ?? []).slice(0, MAX_PER_CELL)"
            :key="`${ev.type}-${ev.instanceSlug}-${ev.id}-${ev.releaseType}-${ev.episode}`"
            type="button"
            class="cal-block text-truncate"
            :style="{ borderLeftColor: RELEASE_COLORS[ev.releaseType] }"
            :title="eventTitle(ev)"
            @click.stop="open(ev)"
          >
            {{ eventTitle(ev) }}
          </button>
          <div
            v-if="(days.get(cell.day)?.length ?? 0) > MAX_PER_CELL"
            class="text-label-small text-muted"
          >
            {{
              t('calendar.event.more', { count: (days.get(cell.day)?.length ?? 0) - MAX_PER_CELL })
            }}
          </div>
        </template>
      </div>
    </div>
    <!-- Mobile : sorties du jour touché, sous la grille (V12) -->
    <section v-if="view === 'month' && smAndDown" class="mt-4" data-test="calendar-month-day">
      <h3 class="text-title-small mb-2">{{ format.date(`${cursor}T12:00:00Z`) }}</h3>
      <p v-if="dayEvents.length === 0" class="text-body-small text-muted">
        {{ t('calendar.day.empty') }}
      </p>
      <CalendarEventRow
        v-for="ev in dayEvents"
        :key="`${ev.type}-${ev.instanceSlug}-${ev.id}-${ev.releaseType}-${ev.episode}`"
        :event="ev"
        @open="open"
      />
    </section>

    <!-- Semaine -->
    <div
      v-else-if="view === 'week'"
      class="cal-week"
      :class="{ 'cal-week--list': smAndDown }"
      data-test="calendar-week"
    >
      <div
        v-for="(day, i) in week"
        :key="day"
        class="cal-week__day"
        :class="{ 'cal-month__cell--today': day === today }"
      >
        <button type="button" class="cal-week__head text-label-large" @click="openDay(day)">
          {{ weekdayNames[i] }} {{ Number(day.slice(8, 10)) }}
        </button>
        <p v-if="!days.get(day)?.length" class="text-label-small text-muted">
          {{ t('calendar.event.none') }}
        </p>
        <CalendarEventRow
          v-for="ev in days.get(day) ?? []"
          :key="`${ev.type}-${ev.instanceSlug}-${ev.id}-${ev.releaseType}-${ev.episode}`"
          :event="ev"
          @open="open"
        />
      </div>
    </div>

    <!-- Jour (agenda) -->
    <div v-else data-test="calendar-day">
      <p v-if="dayEvents.length === 0" class="text-body-medium text-muted text-center py-6">
        {{ t('calendar.day.empty') }}
      </p>
      <v-card
        v-for="ev in dayEvents"
        :key="`${ev.type}-${ev.instanceSlug}-${ev.id}-${ev.releaseType}-${ev.episode}`"
        rounded="lg"
        class="mb-3 d-flex"
        :style="{ borderLeft: `4px solid ${RELEASE_COLORS[ev.releaseType]}` }"
        data-test="calendar-event"
        @click="open(ev)"
      >
        <v-img
          :src="ev.poster ?? ''"
          width="80"
          :aspect-ratio="2 / 3"
          cover
          class="flex-grow-0 bg-surface-alt"
        />
        <div class="pa-3 overflow-hidden">
          <div class="text-title-medium">{{ eventTitle(ev) }}</div>
          <div v-if="ev.type === 'episode'" class="text-body-small">{{ ev.title }}</div>
          <div class="d-flex flex-wrap ga-1 my-1">
            <v-chip size="x-small" :color="RELEASE_COLORS[ev.releaseType]" variant="flat">{{
              t(`calendar.event.release_${ev.releaseType}`)
            }}</v-chip>
            <v-chip size="x-small" variant="tonal">{{ t(statusKey(ev)) }}</v-chip>
            <v-chip v-if="ev.airDateUtc" size="x-small" variant="outlined">{{
              format.time(ev.airDateUtc)
            }}</v-chip>
            <v-chip v-if="ev.network || ev.studio" size="x-small" variant="outlined">{{
              ev.network ?? ev.studio
            }}</v-chip>
            <v-chip size="x-small" variant="outlined">{{ ev.instanceName }}</v-chip>
          </div>
          <p v-if="ev.overview" class="text-body-small text-muted overview">{{ ev.overview }}</p>
        </div>
      </v-card>
    </div>

    <p
      v-if="query.data.value && events.length === 0"
      class="text-body-medium text-muted text-center py-4"
    >
      {{ t(`calendar.empty.${view}`) }}
    </p>
  </v-container>
</template>

<style scoped>
.cal-month {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.cal-month__head {
  text-align: center;
  padding: 4px;
}
.cal-month__cell {
  min-height: 96px;
  padding: 4px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  overflow: hidden;
}
.cal-month__cell--other {
  opacity: 0.45;
}
/* Jour choisi, listé sous la grille (mobile et desktop, V26). */
.cal-month__cell--selected {
  background: rgba(var(--v-theme-primary), 0.18);
}
.cal-month__cell--today {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.cal-month__cell--past .cal-block {
  opacity: 0.6;
}
.cal-block {
  display: block;
  width: 100%;
  margin-top: 2px;
  padding: 1px 4px;
  border: 0;
  border-left: 3px solid;
  border-radius: 3px;
  background: rgb(var(--v-theme-surface-alt));
  color: inherit;
  font-size: 0.7rem;
  text-align: start;
  cursor: pointer;
}
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(140px, 1fr));
  gap: 8px;
  overflow-x: auto;
}
.cal-week__day {
  border-radius: 12px;
  padding: 8px;
  background: rgb(var(--v-theme-surface));
}
.cal-week__head {
  background: none;
  border: 0;
  color: inherit;
  padding: 0 0 6px;
  cursor: pointer;
}
.overview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cal-month__cell:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
/* Mobile (V12) : titre sur sa ligne ; cases compactes, numéro centré, une pastille par sortie. */
@media (max-width: 959px) {
  .cal-heading {
    flex-basis: 100%;
    order: -1;
  }
  .cal-month {
    gap: 2px;
  }
  .cal-month__cell {
    min-height: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 2px;
  }
}
.cal-dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 3px;
}
.cal-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.cal-dots__more {
  line-height: 1;
  opacity: 0.8;
}
/* Semaine sur mobile (V12) : un bloc par jour, empilés. */
.cal-week--list {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: visible;
}
.cal-week--list .cal-week__head {
  width: 100%;
  text-align: start;
}
</style>
