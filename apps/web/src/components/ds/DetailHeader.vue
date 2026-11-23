<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête d'une fiche en page (film, série ; MEMOIRE D130) : image de fond
// assombrie, bouton retour, affiche, titre (h1, seul titre de l'écran), puis
// le contenu de la fiche (slot : statut, métadonnées, genres, liens).
import { mdiArrowLeft } from '@mdi/js';
import { useI18n } from 'vue-i18n';

defineProps<{
  title: string;
  fanart?: string | null;
  poster?: string | null;
  titleTest?: string;
  backTest?: string;
}>();
const emit = defineEmits<{ back: [] }>();
const { t } = useI18n();
</script>

<template>
  <header class="detail-header" :class="{ 'detail-header--art': fanart }">
    <img v-if="fanart" :src="fanart" alt="" class="detail-header__fanart" />
    <div class="detail-header__inner">
      <v-btn
        :icon="mdiArrowLeft"
        variant="text"
        size="small"
        class="detail-header__back"
        :aria-label="t('common.action.back')"
        :title="t('common.action.back')"
        :data-test="backTest ?? 'detail-back'"
        @click="emit('back')"
      />
      <div class="detail-header__identity">
        <div class="detail-header__poster">
          <img v-if="poster" :src="poster" :alt="title" />
        </div>
        <div class="detail-header__heading">
          <h1 class="text-headline-small detail-header__title" :data-test="titleTest">
            <slot name="title">{{ title }}</slot>
          </h1>
          <slot />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.detail-header {
  position: relative;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt, var(--v-theme-surface)));
}
.detail-header__fanart {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
}
.detail-header--art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.88));
}
.detail-header__inner {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 16px 20px;
}
.detail-header--art .detail-header__inner {
  color: #fff;
  padding-top: 120px;
}
.detail-header__back {
  position: absolute;
  top: 8px;
  left: 8px;
}
.detail-header__identity {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  padding-top: 40px;
}
.detail-header--art .detail-header__identity {
  padding-top: 0;
}
.detail-header__poster {
  flex-shrink: 0;
  width: 160px;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}
.detail-header__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.detail-header__heading {
  min-width: 0;
}
.detail-header__title {
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
@media (max-width: 599px) {
  .detail-header--art .detail-header__inner {
    padding-top: 72px;
  }
  .detail-header__identity {
    gap: 14px;
  }
  .detail-header__poster {
    width: 96px;
  }
}
</style>
