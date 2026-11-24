// SPDX-License-Identifier: AGPL-3.0-or-later
// Liste réordonnable au glisser-déposer, à la souris comme au doigt : la
// poignée de chaque ligne capte le pointeur (Pointer Events, au lieu du
// glisser-déposer HTML5 qui ne marche pas sur écran tactile) et la ligne suit
// le pointeur en direct. Les lignes du conteneur portent `data-sortable-item`.
// Les boutons Monter/Descendre restent l'alternative au clavier.

import { ref, type Ref } from 'vue';

/** `list` avec l'élément `from` déplacé en `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...list];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Place visée par le pointeur (`y`) pour la ligne `dragged` : nombre de
 * lignes, hors elle, dont le milieu est au-dessus du pointeur.
 */
export function targetIndex(midpoints: readonly number[], dragged: number, y: number): number {
  return midpoints.filter((mid, i) => i !== dragged && mid < y).length;
}

export function useSortable<T>(list: Ref<T[]>, container: Ref<HTMLElement | null>) {
  /** Ligne en cours de déplacement. */
  const dragging = ref<number | null>(null);

  function start(index: number, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    // Le pointeur reste à la poignée même hors de la ligne (absent de certains
    // environnements, comme jsdom).
    const target = event.currentTarget;
    if (target instanceof Element && 'setPointerCapture' in target)
      target.setPointerCapture(event.pointerId);
    dragging.value = index;
  }
  function move(event: PointerEvent): void {
    const from = dragging.value;
    if (from === null || container.value === null) return;
    const rows = [...container.value.querySelectorAll<HTMLElement>('[data-sortable-item]')];
    const mids = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const to = targetIndex(mids, from, event.clientY);
    if (to === from) return;
    list.value = moveItem(list.value, from, to);
    dragging.value = to;
  }
  function end(): void {
    dragging.value = null;
  }

  /** Écouteurs de la poignée de la ligne `index` (`v-on="handle(index)"`). */
  const handle = (index: number) => ({
    pointerdown: (event: PointerEvent) => {
      start(index, event);
    },
    pointermove: move,
    pointerup: end,
    pointercancel: end,
    lostpointercapture: end,
  });

  return { dragging, handle };
}
