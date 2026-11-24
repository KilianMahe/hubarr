<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mise en page d'une fiche (film, série ; maquette B du lot 6) : bandeau
// (image de fond, bouton retour), puis deux
// colonnes sur grand écran. À gauche, une colonne fixe au défilement :
// affiche, puis `aside` (état, actions, chiffres clés). À droite : titre (h1,
// seul titre de l'écran), `meta` (métadonnées, genres, liens), puis le
// contenu. Sur mobile, l'affiche réduite et le titre se partagent la première
// ligne, `aside` suit, puis le contenu.
import { msArrowBack } from '../symbols';
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
  <div class="detail-layout" :class="{ 'detail-layout--art': fanart }">
    <div class="detail-layout__band">
      <img v-if="fanart" :src="fanart" alt="" class="detail-layout__fanart" />
      <v-btn
        :icon="msArrowBack"
        variant="text"
        size="small"
        class="detail-layout__back"
        :aria-label="t('common.action.back')"
        :title="t('common.action.back')"
        :data-test="backTest ?? 'detail-back'"
        @click="emit('back')"
      />
    </div>
    <div class="detail-layout__grid">
      <aside class="detail-layout__aside">
        <div class="detail-layout__poster">
          <img v-if="poster" :src="poster" :alt="title" />
        </div>
        <div class="detail-layout__side">
          <slot name="aside" />
        </div>
      </aside>
      <div class="detail-layout__main">
        <div class="detail-layout__heading">
          <h1 class="text-headline-small detail-layout__title" :data-test="titleTest">
            <slot name="title">{{ title }}</slot>
          </h1>
          <slot name="meta" />
        </div>
        <div class="detail-layout__content">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-layout {
  padding-bottom: 32px;
}
.detail-layout__band {
  position: relative;
  height: 160px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt, var(--v-theme-surface)));
}
.detail-layout__fanart {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
}
.detail-layout--art .detail-layout__band::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.6));
}
.detail-layout__back {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
}
.detail-layout--art .detail-layout__back {
  color: #fff;
}
.detail-layout__grid {
  position: relative;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 24px;
  max-width: 1240px;
  margin: -100px auto 0;
  padding: 0 16px;
}
.detail-layout__aside {
  position: sticky;
  top: 16px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-layout__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-layout__poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.detail-layout__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.detail-layout__heading {
  min-width: 0;
  padding-top: 116px;
  margin-bottom: 16px;
}
.detail-layout__title {
  margin: 0 0 6px;
}
@media (max-width: 959px) {
  .detail-layout__band {
    height: 96px;
  }
  /* Mobile : affiche et titre côte à côte, puis `aside`, puis le contenu. */
  .detail-layout__grid {
    grid-template-columns: 112px minmax(0, 1fr);
    grid-template-areas:
      'poster heading'
      'side side'
      'content content';
    gap: 14px;
    margin-top: -48px;
    padding: 0 12px;
  }
  .detail-layout__aside,
  .detail-layout__main {
    display: contents;
  }
  .detail-layout__poster {
    grid-area: poster;
    border-radius: 10px;
  }
  .detail-layout__heading {
    grid-area: heading;
    align-self: end;
    padding-top: 56px;
    margin-bottom: 0;
  }
  .detail-layout__side {
    grid-area: side;
  }
  .detail-layout__content {
    grid-area: content;
    min-width: 0;
  }
}
</style>
