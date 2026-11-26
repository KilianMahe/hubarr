<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Paramètres (`admin/settings.html.twig`), réservés aux admins. Une section par
// onglet ; l'onglet suit le fragment de l'URL (`#section-services`…), comme les
// ancres de l'original, pour que l'assistant et les bannières y mènent. Sur
// mobile, les sections sont dans la barre basse et la barre du haut nomme la
// section affichée (« Paramètres · Sauvegarde »).
import { useQuery } from '@tanstack/vue-query';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import AboutSection from './AboutSection.vue';
import BackupSection from './BackupSection.vue';
import DisplaySection from './DisplaySection.vue';
import LanguagesSection from './LanguagesSection.vue';
import LogsSection from '../logs/LogsSection.vue';
import ServicesSection from './ServicesSection.vue';
import UsersSection from '../users/UsersSection.vue';
import { useSessionStore } from '../../app/stores/session';
import { SETTINGS_KEY, fetchSettings, servicesFromSettings } from './settings-api';
import { SETTINGS_SECTIONS, sectionFromHash, type SettingsSection } from './sections';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { mdAndUp } = useDisplay();

const settings = useQuery({
  queryKey: SETTINGS_KEY,
  queryFn: ({ signal }) => fetchSettings(signal),
});

// Chaque modification met à jour le tiroir et les gardes sans recharger le bootstrap.
const session = useSessionStore();
watch(
  () => settings.data.value,
  (data) => {
    if (data !== undefined) session.setServices(servicesFromSettings(data));
  },
);

const section = computed<SettingsSection>({
  get: () => sectionFromHash(route.hash),
  set: (value) => {
    void router.replace({ hash: `#section-${value}` });
  },
});
</script>

<template>
  <v-container style="max-width: 1200px">
    <ServiceHeader :title="t('admin.page.title')" :subtitle="t('admin.page.subtitle')" />

    <div class="settings-layout" :class="{ 'settings-layout--side': mdAndUp }">
      <!-- Grand écran : navigation verticale (maquette P0, P5b.1 R1) ; mobile : barre
           basse du shell (`SETTINGS_BOTTOM_NAV`). -->
      <nav v-if="mdAndUp" :aria-label="t('admin.nav.aria_label')" class="settings-nav">
        <v-list
          density="compact"
          nav
          color="primary"
          :selected="[section]"
          mandatory
          class="bg-transparent"
          @update:selected="(value: unknown[]) => (section = value[0] as SettingsSection)"
        >
          <v-list-item
            v-for="item in SETTINGS_SECTIONS"
            :key="item.id"
            :value="item.id"
            :title="t(item.labelKey)"
            :data-test="`tab-${item.id}`"
          />
        </v-list>
      </nav>
      <div class="settings-content">
        <v-progress-linear v-if="settings.isPending.value" indeterminate color="primary" />
        <v-alert v-else-if="settings.isError.value" type="error" variant="tonal">{{
          t('error.generic.message')
        }}</v-alert>
        <template v-else-if="settings.data.value">
          <ServicesSection v-if="section === 'services'" :settings="settings.data.value" />
          <UsersSection v-else-if="section === 'users'" />
          <DisplaySection v-else-if="section === 'display'" :settings="settings.data.value" />
          <LanguagesSection v-else-if="section === 'languages'" />
          <BackupSection v-else-if="section === 'backup'" :settings="settings.data.value" />
          <LogsSection v-else-if="section === 'logs'" />
          <AboutSection v-else-if="section === 'about'" :about="settings.data.value.about" />
        </template>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.settings-layout--side {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.settings-nav {
  position: sticky;
  top: 80px;
}
.settings-content {
  min-width: 0;
}
</style>
