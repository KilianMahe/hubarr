// SPDX-License-Identifier: AGPL-3.0-or-later
// Intégrité des catalogues importés de Prismarr et rendu ICU (P0.9).
import { TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { IntlMessageFormat } from 'intl-messageformat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IcuMessageCache,
  SUPPORTED_LOCALES,
  flattenMessages,
  loadMessages,
  type Locale,
} from '../src';

/** Noms des arguments ICU d'un message (`{count}`, `{count, plural, …}`…), balises comprises. */
function argumentNames(message: string, locale: string): string[] {
  const names = new Set<string>();
  const visit = (elements: readonly MessageFormatElement[]): void => {
    for (const element of elements) {
      // Hors texte et `#` d'un pluriel, chaque élément porte un nom d'argument.
      if (element.type !== TYPE.literal && element.type !== TYPE.pound) {
        names.add(element.value);
      }
      if ('options' in element) {
        for (const option of Object.values(element.options)) visit(option.value);
      }
      if ('children' in element) visit(element.children);
    }
  };
  visit(new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).getAst());
  return [...names].sort();
}

const catalogs = new Map<Locale, Map<string, string>>();

beforeAll(async () => {
  for (const locale of SUPPORTED_LOCALES) {
    catalogs.set(locale, flattenMessages(await loadMessages(locale)));
  }
});

function catalog(locale: Locale): Map<string, string> {
  const found = catalogs.get(locale);
  if (!found) throw new Error(`catalogue ${locale} absent`);
  return found;
}

/** Clés ajoutées par Hubarr, absentes de Prismarr (P0.12 : shell). */
const HUBARR_KEYS = [
  'admin.about.links.upstream',
  'media.films.bulk.delete_warning_count',
  'media.series.bulk.delete_warning_count',
  'media.series.bulk.no_tag_defined',
  'media.series.bulk.selected_hint',
  'media.series.add.pick_root_folder',
  'media.arr_admin.tags_usage',
  'media.arr_admin.backups.backup_created',
  'media.arr_admin.updates.install_started',
  'media.arr_admin.updates.install_error',
  'media.arr_admin.parse.episode',
  'media.arr_admin.parse.release_group',
  'media.arr_admin.calendar.title_sonarr',
  'media.arr_admin.calendar.page_title',
  'media.arr_admin.calendar.error_unreachable_sonarr',
  'media.arr_admin.calendar.empty',
  'media.arr_admin.calendar.unmonitored',
  'media.arr_admin.media_management.naming.colon_delete',
  'media.arr_admin.media_management.mm.file_date_local_air',
  'media.arr_admin.media_management.mm.file_date_utc_air',
  'media.arr_admin.schema_modal.trigger.on_series_add',
  'media.arr_admin.schema_modal.trigger.on_series_delete',
  'media.arr_admin.schema_modal.trigger.on_episode_file_delete',
  'media.arr_admin.schema_modal.trigger.on_episode_file_delete_for_upgrade',
  'media.arr_admin.schema_modal.trigger.on_import_complete',
  'prowlarr.index.status_disabled_till',
  'prowlarr.index.bulk.selected',
  'prowlarr.index.bulk.enable',
  'prowlarr.index.bulk.disable',
  'prowlarr.index.bulk.edit',
  'prowlarr.index.bulk.delete',
  'prowlarr.index.bulk.edit_title',
  'prowlarr.index.bulk.confirm_delete',
  'prowlarr.index.bulk.saved',
  'prowlarr.index.bulk.deleted',
  'prowlarr.index.bulk.error',
  'prowlarr.index.bulk.tags_add',
  'prowlarr.index.bulk.tags_remove',
  'prowlarr.index.bulk.tags_replace',
  'admin.display.dashboard_layout.move_down',
  'admin.display.dashboard_layout.move_up',
  'admin.display.theme_color.auto',
  'admin.display.timezone.system',
  'admin.instances.error.name_required',
  'admin.instances.error.slug_taken',
  'admin.instances.error.unknown_type',
  'admin.instances.error.url_blocked',
  'admin.instances.error.url_required',
  'admin.services.remove_confirm',
  'admin.services.secret_saved',
  'footer.help',
  'footer.source_code',
  'service.placeholder.text',
  'service.placeholder.title',
  'sidebar.family.arrs',
  'sidebar.family.downloads',
  'sidebar.family.others',
  'sidebar.family.requests',
  'sidebar.family.server',
  'sidebar.nav.home',
  'topbar.nav.toggle',
  // Clients torrent (P3d.1 à P3d.4).
  'common.labels.text',
  'qbittorrent.api.invalid_priority',
  'qbittorrent.modal_detail.actions.more',
  'qbittorrent.modal_detail.actions.force_start',
  'qbittorrent.modal_detail.actions.sequential',
  'qbittorrent.modal_detail.actions.first_last',
  'qbittorrent.modal_detail.actions.rename',
  'qbittorrent.modal_detail.actions.location',
  'qbittorrent.modal_add.savepath_label',
  'qbittorrent.toolbar.speed_mode',
  // Page Téléchargements agrégée (P3d.5).
  'downloads.none',
  // Seerr (P3f).
  'jellyseerr.api.schedule_required',
  // Tableau de bord, calendrier, découverte, téléchargements (P4).
  'common.labels.copy',
  'common.labels.copied',
  'decouverte.card.countdown',
  'decouverte.explorer.decade_label',
  'downloads.toast.completed',
  'downloads.toast.errored',
  // Audit i18n (P5.4) : clé de validation renvoyée par le serveur.
  'media.api.path_required',
  // Accessibilité (P5.5) : lien d'évitement.
  'common.labels.skip_to_content',
  // Design system commun et en-têtes (P5b.3).
  'common.ds.selected',
  'common.ds.clear_selection',
  'common.ds.pull_to_refresh',
  'common.ds.release_to_refresh',
  'media.films.header_count',
  'media.series.header_count',
  'media.films.actions.more',
  'jellyseerr.index.pending_count',
  'jellyseerr.index.filter_placeholder',
  'dashboard.health.summary',
  // Habillage mobile et onglet « Serveur » (P5b.4).
  'common.ds.select_all',
  'common.ds.actions',
  'server.tab',
  'server.version',
  'server.group.commands',
  'server.group.system',
  'server.commands.refresh_series',
  'server.commands.search_missing',
  'server.commands.search_missing_confirm',
  'server.command_started',
  'server.command_error',
  'server.stats.series',
  'server.stats.continuing',
  'server.stats.ended',
  'usenet.nav.queue',
  // Évolutions d'usage (P5c).
  'common.view_mode',
  'common.labelled_value',
  'media.add.empty_movie_title',
  'media.add.empty_series_title',
  'media.add.empty_movie_hint',
  'media.add.empty_series_hint',
  'media.add.trending_movie',
  'media.add.trending_series',
  'media.add.in_library',
  'admin.service_admin.hint',
  'admin.service_admin.status',
  'admin.service_admin.back',
  'admin.service_admin.open',
  'admin.service_admin.open_instance',
  'admin.service_admin.groups',
  'media.arr_system.disk.free_total_sizes',
  'common.ds.dismiss_alert',
  'tracearr.users.search',
  'tracearr.users.no_match',
  'media.group.more',
  'media.arr_lists.search_movie',
  'media.arr_lists.search_series',
  'media.arr_lists.no_match',
  'media.arr_lists.profile',
  'media.arr_lists.profile_all',
  'media.arr_lists.filter_label',
  'media.arr_lists.filter_all',
  'media.arr_lists.filter_monitored',
  'media.arr_lists.filter_unmonitored',
  'media.arr_lists.filter_missing',
  'media.arr_lists.no_match_filters',
  'media.queue_page.title',
  'media.queue_page.empty',
  'media.queue_page.refresh',
  'media.queue_page.rescan',
  'media.queue_page.open_series',
  'media.queue_page.open_movie',
  'media.upcoming.title',
  'media.upcoming.tab',
  'media.upcoming.empty',
  'media.upcoming.today',
  'media.upcoming.tomorrow',
  'jellyseerr.index.tags_hint',
  'dashboard.queue.title',
  'dashboard.queue.empty',
  'dashboard.queue.more',
  'dashboard.queue.open',
  'dashboard.queue.progress',
  'dashboard.queue.state.importing',
  'dashboard.queue.state.pending',
  'dashboard.queue.state.blocked',
  'dashboard.queue.state.warning',
  'dashboard.queue.state.error',
  'dashboard.queue.state.completed',
  'dashboard.queue.state.downloading',
  'dashboard.queue.state.other',
  'tracearr.nav.summary',
  'tracearr.nav.now',
  'tracearr.nav.stats',
  'tracearr.nav.history',
  'tracearr.nav.users',
  'tracearr.see_all',
  'tracearr.user.title',
  'tracearr.user.back',
  'tracearr.user.open',
  'tracearr.user.not_found',
  'tracearr.user.trust',
  'tracearr.user.stats.plays',
  'tracearr.user.stats.watch_time',
  'tracearr.user.stats.movies',
  'tracearr.user.stats.episodes',
  'tracearr.user.stats.last_seen',
  'tracearr.user.platforms',
  'tracearr.user.top_titles',
  'tracearr.user.plays_count',
  'tracearr.user.history',
  'tracearr.user.empty',
  'tracearr.user.window',
  'activity.detail.title',
  'activity.detail.user',
  'activity.detail.server',
  'activity.detail.player',
  'activity.detail.device',
  'activity.detail.location',
  'activity.detail.quality',
  'activity.detail.stream',
  'activity.detail.video',
  'activity.detail.audio',
  'activity.detail.subtitles',
  'activity.detail.dynamic_range',
  'activity.detail.bandwidth',
  'activity.detail.progress',
  'activity.detail.open_media',
  'activity.detail.codec_change',
];

describe('catalogues de traductions', () => {
  it('contiennent les clés de Prismarr, identiques en FR et en EN', () => {
    const en = [...catalog('en').keys()].sort();
    const fr = [...catalog('fr').keys()].sort();
    expect(fr).toEqual(en);
    // 5 155 entrées de Prismarr dont 3 listes (12 mois, 7 + 7 jours) aplaties en
    // 26 messages, plus les clés propres à Hubarr (HUBARR_KEYS).
    expect(en).toHaveLength(5155 - 3 + 26 + HUBARR_KEYS.length);
    for (const key of HUBARR_KEYS) expect(en).toContain(key);
  });

  it('gardent `yes` et `no` comme clés (YAML 1.2, comme Symfony)', () => {
    expect(catalog('fr').get('common.status.yes')).toBe('Oui');
    expect(catalog('fr').get('common.status.no')).toBe('Non');
    expect(catalog('en').get('calendar.months.full.11')).toBe('December');
  });

  it.each(SUPPORTED_LOCALES)('%s : chaque message est un ICU valide', (locale) => {
    const invalid: string[] = [];
    for (const [key, message] of catalog(locale)) {
      try {
        new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
      } catch {
        invalid.push(key);
      }
    }
    expect(invalid).toEqual([]);
  });

  it('attendent les mêmes arguments en FR et en EN', () => {
    const mismatches: string[] = [];
    for (const [key, en] of catalog('en')) {
      const fr = catalog('fr').get(key) ?? '';
      if (argumentNames(en, 'en').join() !== argumentNames(fr, 'fr').join()) mismatches.push(key);
    }
    expect(mismatches).toEqual([]);
  });

  it('ne nomment plus Prismarr, hors du lien de crédit de la page À propos', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const named = [...catalog(locale)].filter(
        ([key, message]) => message.includes('Prismarr') && key !== 'admin.about.links.upstream',
      );
      expect(named).toEqual([]);
      expect(catalog(locale).get('app.name')).toBe('Hubarr');
    }
  });
});

describe('IcuMessageCache', () => {
  it('applique les règles de pluriel de chaque langue', () => {
    const icu = new IcuMessageCache();
    const message = '{count, plural, =0 {aucun} one {# élément} other {# éléments}}';
    expect(icu.format(message, 'fr', { count: 0 })).toBe('aucun');
    // En français, 0 et 1 sont au singulier (hors `=0`) ; en anglais, seul 1 l'est.
    expect(icu.format('{count, plural, one {#} other {# s}}', 'fr', { count: 1.5 })).toBe('1,5');
    expect(icu.format('{count, plural, one {#} other {# s}}', 'en', { count: 1.5 })).toBe('1.5 s');
    expect(icu.format(message, 'fr', { count: 1234 })).toBe('1\u202f234 éléments'); // espace fine insécable, comme ICU
  });

  it('rend un message du catalogue avec ses valeurs', () => {
    const icu = new IcuMessageCache();
    const message = catalog('fr').get('profile.stats.watchlist_label') ?? '';
    expect(icu.format(message, 'fr', { count: 0 })).toBe('Aucun film/série dans ma liste');
    expect(icu.format(message, 'fr', { count: 3 })).toBe('3 films/séries dans ma liste');
  });

  it('traite les apostrophes comme ICU', () => {
    const icu = new IcuMessageCache();
    expect(icu.format("Hubarr isn't reachable", 'en')).toBe("Hubarr isn't reachable");
    expect(icu.format("l''instance {name}", 'fr', { name: 'A' })).toBe("l'instance A");
    expect(icu.format("'{literal}' {name}", 'fr', { name: 'A' })).toBe('{literal} A');
  });

  it('laisse les balises HTML en texte, arguments compris', () => {
    const icu = new IcuMessageCache();
    expect(
      icu.format('Use <em>Test</em> on <a href="{url}">{name}</a>', 'en', {
        url: '/x',
        name: 'Radarr',
      }),
    ).toBe('Use <em>Test</em> on <a href="/x">Radarr</a>');
  });

  it('compile chaque message une seule fois par langue', () => {
    const icu = new IcuMessageCache();
    expect(icu.compile('{n} a', 'fr')).toBe(icu.compile('{n} a', 'fr'));
    icu.compile('{n} a', 'en');
    expect(icu.size).toBe(2);
  });

  it('rend le message tel quel et signale l’erreur : valeur manquante ou syntaxe invalide', () => {
    const errors: string[] = [];
    const icu = new IcuMessageCache((_error, message, locale) =>
      errors.push(`${locale}:${message}`),
    );
    expect(icu.format('{count} films', 'fr')).toBe('{count} films');
    expect(icu.format('{count, plural, one {x}', 'en', { count: 1 })).toBe(
      '{count, plural, one {x}',
    );
    expect(errors).toEqual(['fr:{count} films', 'en:{count, plural, one {x}']);
  });
});
