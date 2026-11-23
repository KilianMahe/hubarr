// SPDX-License-Identifier: AGPL-3.0-or-later
// Avant le premier rendu : reporte sur <html> la variante clair/sombre choisie
// en mode classique, pour que `/api/theme.css` pose le bon fond sans attendre
// la SPA. Script classique et synchrone, servi comme fichier (la CSP refuse
// les scripts inline). La clé reprend THEME_MODE_STORAGE_KEY (@hubarr/shared).
(function () {
  try {
    var mode = window.localStorage.getItem('hubarr.theme-mode');
    if (mode === 'dark' || mode === 'light') {
      document.documentElement.setAttribute('data-theme-mode', mode);
    }
  } catch {
    // Stockage indisponible : variante sombre par défaut.
  }
})();
