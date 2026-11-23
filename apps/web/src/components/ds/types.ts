// SPDX-License-Identifier: AGPL-3.0-or-later
// Types publics du design system (hors des .vue, résolus par ESLint).

export interface FilterChipOption<V> {
  value: V;
  label: string;
  count?: number | null;
  icon?: string;
}

/** Entrée de `ViewModeMenu` (P5c.2). */
export interface ViewModeOption<V extends string> {
  value: V;
  icon: string;
  label: string;
}
