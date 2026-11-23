// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />

// Repli pour les outils qui ne comprennent pas les SFC (ESLint type-aware).
// vue-tsc résout, lui, les vrais types des composants.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
