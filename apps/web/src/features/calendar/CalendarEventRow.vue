<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ligne compacte d'une sortie (vue semaine, liste du jour choisi sur mobile) :
// affiche, titre, type de sortie et heure, liseré de la couleur du type.
import type { CalendarEvent } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { RELEASE_COLORS, eventTitle } from './calendar-api';

defineProps<{ event: CalendarEvent }>();
const emit = defineEmits<{ open: [event: CalendarEvent] }>();
const { t } = useI18n();
const format = useFormat();
</script>

<template>
  <v-card
    variant="tonal"
    class="mb-2 pa-2 d-flex align-center ga-2"
    :style="{ borderLeft: `3px solid ${RELEASE_COLORS[event.releaseType]}` }"
    data-test="calendar-event-row"
    @click="emit('open', event)"
  >
    <v-avatar rounded="sm" size="40" color="surface-alt"
      ><v-img v-if="event.poster" :src="event.poster" cover
    /></v-avatar>
    <div class="overflow-hidden">
      <div class="text-body-small font-weight-medium text-truncate">{{ eventTitle(event) }}</div>
      <div class="text-label-small text-muted text-truncate">
        {{ t(`calendar.event.release_${event.releaseType}`)
        }}<template v-if="event.airDateUtc"> · {{ format.time(event.airDateUtc) }}</template>
      </div>
    </div>
  </v-card>
</template>
