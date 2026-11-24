<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bouton d'action principal d'un service sur mobile (P5b.4, D131) : au centre
// de la barre basse, ou flottant en bas à droite quand le service n'a pas
// d'onglets. Avec des actions, il devient un speed-dial (fiches film et série,
// D130) : les actions s'empilent au-dessus, libellées. `variant` explicite :
// la barre basse impose sinon la variante texte à ses boutons.
import { msClose } from './symbols';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FabAction, FabSpec } from '../app/service-chrome';

const props = defineProps<{ fab: FabSpec; floating?: boolean }>();
const { t } = useI18n();
const open = ref(false);

function run(action: FabAction): void {
  open.value = false;
  action.onClick();
}
</script>

<template>
  <div class="service-fab" :class="{ 'service-fab--floating': floating }">
    <v-speed-dial
      v-if="props.fab.actions && props.fab.actions.length > 0"
      v-model="open"
      :location="floating ? 'top end' : 'top center'"
      transition="slide-y-reverse-transition"
    >
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          :icon="open ? msClose : props.fab.icon"
          color="service"
          variant="flat"
          rounded="lg"
          :class="floating ? 'service-fab__btn--floating' : 'service-fab__btn'"
          :aria-label="open ? t('common.action.close') : props.fab.label"
          :aria-expanded="open"
          :data-test="props.fab.testId ?? 'service-fab'"
        />
      </template>
      <v-btn
        v-for="action in props.fab.actions"
        :key="action.label"
        :prepend-icon="action.icon"
        :color="action.color ?? 'surface-alt'"
        rounded="pill"
        variant="flat"
        elevation="4"
        class="service-fab__action"
        :data-test="action.testId"
        @click="run(action)"
        >{{ action.label }}</v-btn
      >
    </v-speed-dial>
    <v-btn
      v-else
      :icon="props.fab.icon"
      color="service"
      variant="flat"
      rounded="lg"
      :class="floating ? 'service-fab__btn--floating' : 'service-fab__btn'"
      :aria-label="props.fab.label"
      :title="props.fab.label"
      :data-test="props.fab.testId ?? 'service-fab'"
      @click="props.fab.onClick?.()"
    />
  </div>
</template>

<style scoped>
.service-fab {
  display: flex;
  align-items: center;
  justify-content: center;
}
.service-fab--floating {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 1004;
}
.service-fab__btn {
  width: 64px;
  height: 40px;
}
/* Remplissage explicite : dans la barre basse, Vuetify neutralise la couleur des boutons. */
.service-fab__btn,
.service-fab__btn--floating {
  background: rgb(var(--v-theme-service));
  color: rgb(var(--v-theme-on-service));
}
.service-fab__btn--floating {
  width: 56px;
  height: 56px;
}
.service-fab__action {
  text-transform: none;
  letter-spacing: normal;
}
</style>
