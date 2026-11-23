// SPDX-License-Identifier: AGPL-3.0-or-later
// Appui long (écrans tactiles, P5b.4, E3) : `v-long-press="handler"` appelle
// `handler` après un appui maintenu de `LONG_PRESS_MS` sans déplacement
// notable ; le clic qui suit le relâchement est alors absorbé (l'élément
// n'est pas ouvert). Sans effet à la souris : la sélection reste accessible
// par le bouton « Sélectionner » et au clavier.

import type { Directive } from 'vue';

export const LONG_PRESS_MS = 500;
/** Déplacement (px) au-delà duquel le geste est un défilement, pas un appui. */
export const LONG_PRESS_MOVE = 10;

type Handler = () => void;

interface State {
  handler: Handler;
  timer: ReturnType<typeof setTimeout> | null;
  x: number;
  y: number;
  fired: boolean;
  cleanup: () => void;
}

const states = new WeakMap<HTMLElement, State>();

function attach(el: HTMLElement, handler: Handler): State {
  const state: State = { handler, timer: null, x: 0, y: 0, fired: false, cleanup: () => undefined };
  const cancel = (): void => {
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
  };
  const onStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch === undefined) {
      cancel();
      return;
    }
    state.fired = false;
    state.x = touch.clientX;
    state.y = touch.clientY;
    cancel();
    state.timer = setTimeout(() => {
      state.timer = null;
      state.fired = true;
      // Absent de certains navigateurs (Safari) malgré le typage du DOM.
      if ('vibrate' in navigator) navigator.vibrate(20);
      state.handler();
    }, LONG_PRESS_MS);
  };
  const onMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (state.timer === null || touch === undefined) return;
    if (
      Math.abs(touch.clientX - state.x) > LONG_PRESS_MOVE ||
      Math.abs(touch.clientY - state.y) > LONG_PRESS_MOVE
    )
      cancel();
  };
  // Le clic synthétique qui suit un appui long ne doit pas ouvrir l'élément.
  const onClick = (event: MouseEvent): void => {
    if (!state.fired) return;
    state.fired = false;
    event.preventDefault();
    event.stopPropagation();
  };
  // Pas de menu contextuel du navigateur sur un appui long reconnu.
  const onContextMenu = (event: Event): void => {
    if (state.fired || state.timer !== null) event.preventDefault();
  };
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('click', onClick, true);
  el.addEventListener('contextmenu', onContextMenu);
  state.cleanup = () => {
    cancel();
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', cancel);
    el.removeEventListener('touchcancel', cancel);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('contextmenu', onContextMenu);
  };
  return state;
}

export const vLongPress: Directive<HTMLElement, Handler> = {
  mounted(el, binding) {
    states.set(el, attach(el, binding.value));
  },
  updated(el, binding) {
    const state = states.get(el);
    if (state) state.handler = binding.value;
  },
  unmounted(el) {
    states.get(el)?.cleanup();
    states.delete(el);
  },
};
