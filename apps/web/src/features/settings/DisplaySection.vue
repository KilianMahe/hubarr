<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Affichage » (`admin/settings.html.twig`, `section-display`) :
// préférences, visibilité dans le menu latéral, disposition du tableau de bord
// et réinitialisation. Le thème et l'accent s'appliquent dès l'enregistrement.
import {
  ACCENT_COLORS,
  DISPLAY_OPTIONS,
  DISPLAY_OPTION_KEYS,
  INTERNAL_FEATURES,
  SERVICE_IDS,
  SERVICE_SETTINGS,
  dashboardSectionLabelKey,
  defaultDisplayValues,
  displayOptionLabelKey,
  themeLabelKey,
  type DashboardSection,
  settingsResponseSchema,
  type DisplayOptionKey,
  type DisplayOptionSpec,
  type SettingsResponse,
} from '@hubarr/shared';
import { mdiArrowDown, mdiArrowUp, mdiCheck, mdiPalette } from '@mdi/js';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import { useHubarrTheme } from '../../app/theme/controller';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import { SETTINGS_KEY, saveSettings } from './settings-api';

const props = defineProps<{ settings: SettingsResponse }>();
const { t } = useI18n();
const notify = useNotifyStore();
const session = useSessionStore();
const theme = useHubarrTheme();
const queryClient = useQueryClient();

const shownKeys = DISPLAY_OPTION_KEYS.filter((key) => !('hidden' in DISPLAY_OPTIONS[key]));
const values = reactive<Record<DisplayOptionKey, string>>(defaultDisplayValues());
const sidebar = reactive<Record<string, boolean>>({});
const layout = ref<{ key: DashboardSection; visible: boolean }[]>([]);
const confirmReset = ref(false);

function reset(settings: SettingsResponse): void {
  Object.assign(values, settings.display);
  Object.assign(sidebar, settings.sidebar);
  layout.value = settings.dashboard.map((row) => ({ ...row }));
}
watch(() => props.settings, reset, { immediate: true });

const sidebarIds = computed(() => [...SERVICE_IDS, ...INTERNAL_FEATURES]);
const sidebarLabel = (id: string) =>
  id === 'calendar'
    ? t('admin.internal.calendar.label')
    : SERVICE_SETTINGS[id as keyof typeof SERVICE_SETTINGS].label;

function itemsOf(key: DisplayOptionKey): { value: string; title: string }[] {
  const spec = DISPLAY_OPTIONS[key];
  if (!('options' in spec)) return [];
  return (spec.options as readonly string[]).map((value) => ({
    value,
    title:
      spec.type === 'theme'
        ? t(themeLabelKey(value as never))
        : t(displayOptionLabelKey(key, value)),
  }));
}

function helpOf(key: DisplayOptionKey): string | undefined {
  const spec: DisplayOptionSpec = DISPLAY_OPTIONS[key];
  return spec.helpKey === undefined ? undefined : t(spec.helpKey);
}

const timezoneItems = computed(() => [
  {
    value: '',
    title: t('admin.display.timezone.system', { timezone: props.settings.systemTimezone }),
  },
  ...props.settings.timezones.map((zone) => ({ value: zone, title: zone })),
]);

function move(index: number, delta: number): void {
  const next = [...layout.value];
  const target = index + delta;
  const [row] = next.splice(index, 1);
  if (row === undefined || target < 0 || target > next.length) return;
  next.splice(target, 0, row);
  layout.value = next;
}

/** Réglages enregistrés : cache de la page, thème, préférences du shell. */
function received(next: SettingsResponse): void {
  queryClient.setQueryData(SETTINGS_KEY, next);
  theme.apply(next.theme);
  session.setPreferences({
    ...next.display,
    display_timezone:
      next.display.display_timezone === '' ? next.systemTimezone : next.display.display_timezone,
  });
}

const save = useMutation({
  mutationFn: () =>
    saveSettings({
      display: Object.fromEntries(shownKeys.map((key) => [key, values[key]])),
      sidebar: { ...sidebar },
      dashboard: {
        order: layout.value.map((row) => row.key),
        hidden: layout.value.filter((row) => !row.visible).map((row) => row.key),
      },
    }),
  onSuccess: (next) => {
    received(next);
    notify.success('admin.flash.saved');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const resetDisplay = useMutation({
  mutationFn: () =>
    api.post('/api/admin/settings/reset-display', undefined, settingsResponseSchema),
  onSuccess: (next) => {
    received(next);
    notify.success('admin.flash.display_reset_full');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});
</script>

<template>
  <section id="section-display" data-section="display">
    <h2 class="text-title-large mb-1">{{ t('admin.display.title') }}</h2>
    <p class="text-body-medium text-muted mb-4">{{ t('admin.display.description') }}</p>

    <form @submit.prevent="save.mutate()">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-title-medium">{{
          t('admin.display.preferences.title')
        }}</v-card-title>
        <v-card-subtitle>{{ t('admin.display.preferences.subtitle') }}</v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col v-for="key in shownKeys" :key="key" cols="12" md="6" :data-display-option="key">
              <v-switch
                v-if="DISPLAY_OPTIONS[key].type === 'switch'"
                :model-value="values[key] === '1'"
                :label="t(DISPLAY_OPTIONS[key].labelKey)"
                color="primary"
                :hint="helpOf(key)"
                persistent-hint
                @update:model-value="(on) => (values[key] = on ? '1' : '0')"
              />
              <v-autocomplete
                v-else-if="DISPLAY_OPTIONS[key].type === 'timezone'"
                v-model="values[key]"
                :items="timezoneItems"
                :label="t(DISPLAY_OPTIONS[key].labelKey)"
                :hint="t('admin.display.timezone.help')"
                persistent-hint
              />
              <div v-else-if="DISPLAY_OPTIONS[key].type === 'color'">
                <div class="text-body-medium mb-2">{{ t(DISPLAY_OPTIONS[key].labelKey) }}</div>
                <div
                  class="d-flex flex-wrap ga-2"
                  role="radiogroup"
                  :aria-label="t(DISPLAY_OPTIONS[key].labelKey)"
                >
                  <v-btn
                    v-for="item in itemsOf(key)"
                    :key="item.value"
                    :color="
                      item.value === 'theme_default'
                        ? undefined
                        : ACCENT_COLORS[item.value as keyof typeof ACCENT_COLORS]
                    "
                    :variant="item.value === 'theme_default' ? 'outlined' : 'flat'"
                    :icon="
                      values[key] === item.value
                        ? mdiCheck
                        : item.value === 'theme_default'
                          ? mdiPalette
                          : undefined
                    "
                    :aria-label="
                      item.value === 'theme_default'
                        ? t('admin.display.theme_color.auto')
                        : item.value
                    "
                    :aria-checked="values[key] === item.value"
                    :title="
                      item.value === 'theme_default'
                        ? t('admin.display.theme_color.auto')
                        : item.value
                    "
                    role="radio"
                    size="small"
                    :data-color="item.value"
                    @click="values[key] = item.value"
                  />
                </div>
              </div>
              <v-select
                v-else
                v-model="values[key]"
                :items="itemsOf(key)"
                :label="t(DISPLAY_OPTIONS[key].labelKey)"
                :hint="helpOf(key)"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-title-medium">{{
          t('admin.display.sidebar.title')
        }}</v-card-title>
        <v-card-subtitle class="text-wrap">{{
          t('admin.display.sidebar.description')
        }}</v-card-subtitle>
        <v-card-text class="d-flex flex-wrap gc-6">
          <v-switch
            v-for="id in sidebarIds"
            :key="id"
            :model-value="sidebar[id] !== false"
            :label="sidebarLabel(id)"
            color="primary"
            density="compact"
            hide-details
            :data-sidebar-toggle="id"
            @update:model-value="(on) => (sidebar[id] = on === true)"
          />
        </v-card-text>
      </v-card>

      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-title-medium">{{
          t('admin.display.dashboard_layout.title')
        }}</v-card-title>
        <v-card-subtitle class="text-wrap">{{
          t('admin.display.dashboard_layout.description')
        }}</v-card-subtitle>
        <v-list density="compact" class="bg-transparent" data-test="dashboard-layout">
          <v-list-item v-for="(row, index) in layout" :key="row.key" :data-dashboard-row="row.key">
            <template #prepend>
              <v-checkbox-btn
                v-model="row.visible"
                :aria-label="t(dashboardSectionLabelKey(row.key))"
              />
            </template>
            <v-list-item-title>{{ t(dashboardSectionLabelKey(row.key)) }}</v-list-item-title>
            <template #append>
              <v-btn
                :icon="mdiArrowUp"
                :aria-label="t('admin.display.dashboard_layout.move_up')"
                :disabled="index === 0"
                variant="text"
                size="small"
                data-test="move-up"
                @click="move(index, -1)"
              />
              <v-btn
                :icon="mdiArrowDown"
                :aria-label="t('admin.display.dashboard_layout.move_down')"
                :disabled="index === layout.length - 1"
                variant="text"
                size="small"
                @click="move(index, 1)"
              />
            </template>
          </v-list-item>
        </v-list>
        <v-card-text class="text-body-small text-muted pt-0">{{
          t('admin.display.dashboard_layout.reset_hint')
        }}</v-card-text>
      </v-card>

      <div class="d-flex flex-wrap ga-2 mb-6">
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          :loading="save.isPending.value"
          data-test="display-save"
        >
          {{ t('admin.save') }}
        </v-btn>
      </div>
    </form>

    <v-card variant="outlined">
      <v-card-title class="text-title-medium">{{ t('admin.backup.reset.title') }}</v-card-title>
      <v-card-subtitle class="text-wrap">{{ t('admin.backup.reset.subtitle') }}</v-card-subtitle>
      <v-card-actions>
        <v-btn
          color="error"
          variant="tonal"
          :loading="resetDisplay.isPending.value"
          data-test="display-reset"
          @click="confirmReset = true"
        >
          {{ t('admin.backup.reset.cta') }}
        </v-btn>
      </v-card-actions>
    </v-card>
    <ConfirmDialog
      v-model="confirmReset"
      :message="t('admin.backup.reset.confirm')"
      danger
      @confirm="resetDisplay.mutate()"
    />
  </section>
</template>
