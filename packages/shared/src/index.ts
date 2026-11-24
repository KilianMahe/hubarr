// SPDX-License-Identifier: AGPL-3.0-or-later
// Point d'entrée du paquet partagé. Les sous-modules (schemas, constants, theme,
// i18n, puis format) sont ajoutés au fil des phases.

export { APP_NAME, SOURCE_CODE_URL, UPSTREAM_PROJECT_URL } from './constants/app';
export {
  CSRF_HEADER,
  LOGIN_THROTTLE,
  PASSWORD_MIN_LENGTH,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './constants/auth';
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from './constants/i18n';
export { flattenMessages, loadMessages, type MessageCatalog } from './i18n/catalogs';
export { IcuMessageCache, type IcuErrorHandler, type MessageValues } from './i18n/icu';
export {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  DISPLAY_NAME_MAX_LENGTH,
  type AvatarMimeType,
} from './constants/profile';
export { MEDIA_TYPES, USER_ROLES, type MediaType, type UserRole } from './constants/domain';
export {
  authUserSchema,
  csrfTokenResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  loginThrottledDetailsSchema,
  type AuthUser,
  type CsrfTokenResponse,
  type LoginRequest,
  type LoginResponse,
} from './schemas/auth';
export {
  API_ERROR_CODES,
  apiErrorSchema,
  type ApiErrorBody,
  type ApiErrorCode,
} from './schemas/errors';
export {
  bootstrapInstanceSchema,
  bootstrapResponseSchema,
  bootstrapServiceSchema,
  bootstrapServicesSchema,
  type BootstrapResponse,
  type BootstrapServices,
} from './schemas/bootstrap';
export {
  HEALTH_FLAT_SERVICES,
  appHealthResponseSchema,
  instanceHealthSchema,
  serviceDiagnosisResponseSchema,
  servicesHealthResponseSchema,
  type AppHealthResponse,
  type ServiceDiagnosisResponse,
  type ServicesHealthResponse,
} from './schemas/health';
export {
  SETUP_NEXT_STEPS,
  setupAdminRequestSchema,
  setupAdminResponseSchema,
  setupLocaleRequestSchema,
  setupStateResponseSchema,
  type SetupAdminRequest,
  type SetupAdminResponse,
  type SetupLocaleRequest,
  type SetupNextStep,
  type SetupStateResponse,
} from './schemas/setup';
export {
  profileResponseSchema,
  profileUpdateRequestSchema,
  profileWatchlistItemSchema,
  type ProfileResponse,
  type ProfileUpdateRequest,
  type ProfileWatchlistItem,
} from './schemas/profile';
export {
  DEFAULT_THEME_MODE,
  THEME_MODES,
  THEME_MODE_STORAGE_KEY,
  resolvedThemeSchema,
  themePaletteSchema,
  type ResolvedTheme,
  type ThemeMode,
  type ThemePalette,
} from './schemas/theme';
export {
  clamp,
  contrastRatio,
  ensureContrast,
  hslToHex,
  hslToRgbTuple,
  mixHex,
  readableOn,
  relativeLuminance,
  type Hsl,
} from './theme/color-math';
export {
  SERVICE_ACCENTS,
  serviceAccentColors,
  type ServiceAccentColors,
} from './theme/service-accents';
export {
  SERVICES,
  SERVICE_FAMILIES,
  SERVICE_IDS,
  isServiceId,
  type ServiceFamily,
  type ServiceId,
} from './constants/services';
export {
  CLASSIC_THEME,
  DEFAULT_THEME,
  DEFAULT_THEME_PRESET,
  THEME_CHOICES,
  THEME_PRESETS,
  THEME_PRESET_KEYS,
  isThemePresetKey,
  themeLabelKey,
  type ThemeChoice,
  type ThemePreset,
  type ThemePresetKey,
} from './theme/presets';
export {
  ACCENT_CHOICES,
  ACCENT_COLORS,
  CLASSIC_ACCENT,
  DEFAULT_ACCENT,
  THEME_DEFAULT_ACCENT,
  isAccentColor,
  type AccentChoice,
  type AccentColor,
} from './theme/accents';
export { resolvePresetPalette, resolveTheme } from './theme/resolve';
export {
  DIAGNOSIS_CATEGORIES,
  INSTANCE_TYPES,
  INTERNAL_FEATURES,
  SECRET_FIELD_KEYS,
  SERVICE_FIELD_KEYS,
  SERVICE_SETTINGS,
  SETTINGS_SERVICE_GROUPS,
  isInstanceType,
  isSecretField,
  type DiagnosisCategory,
  type FlatServiceId,
  type InstanceType,
  type InternalFeature,
  type SecretFieldKey,
  type ServiceFieldKey,
  type ServiceFieldSpec,
  type ServiceSettingsSpec,
} from './constants/service-settings';
export {
  aboutInfoSchema,
  flatServiceIdSchema,
  flatServiceStateSchema,
  instanceCreateRequestSchema,
  instanceListResponseSchema,
  instanceTestResponseSchema,
  instanceTypeSchema,
  instanceUpdateRequestSchema,
  okResponseSchema,
  serviceIdSchema,
  serviceInstanceSchema,
  servicePatchSchema,
  serviceTestRequestSchema,
  serviceTestResponseSchema,
  settingsResponseSchema,
  settingsSaveRequestSchema,
  sidebarVisibilityIdSchema,
  type AboutInfo,
  type FlatServiceState,
  type InstanceCreateRequest,
  type InstanceListResponse,
  type InstanceTestResponse,
  type InstanceUpdateRequest,
  type ServiceInstance,
  type ServicePatch,
  type ServiceTestRequest,
  type ServiceTestResponse,
  type SettingsResponse,
  type SettingsSaveRequest,
} from './schemas/settings';
export {
  DASHBOARD_SECTIONS,
  DISPLAY_OPTIONS,
  DISPLAY_OPTION_KEYS,
  LANGUAGES_SECTION_METADATA,
  PROWLARR_UI_LANGUAGES,
  SEERR_UI_LANGUAGES,
  dashboardSectionLabelKey,
  defaultDisplayValues,
  displayOptionLabelKey,
  isDashboardSection,
  isDisplayOptionKey,
  type DashboardSection,
  type DisplayOptionKey,
  type DisplayOptionSpec,
  type DisplayOptionType,
  type DisplayValues,
} from './constants/display';
export {
  arrLanguagesSchema,
  dashboardLayoutRequestSchema,
  dashboardLayoutSchema,
  dashboardSectionSchema,
  displayPatchSchema,
  displayValuesSchema,
  languagesResponseSchema,
  languagesSaveRequestSchema,
  languagesSaveResponseSchema,
  type DashboardLayout,
  type DashboardLayoutRequest,
  type LanguagesResponse,
  type LanguagesSaveRequest,
  type LanguagesSaveResponse,
} from './schemas/preferences';
export {
  addDays,
  dayInZone,
  formatDate,
  formatDateTime,
  formatTime,
  hourInZone,
  type DateTimePreferences,
} from './format/datetime';
export {
  BYTE_UNITS,
  byteUnits,
  formatBytes,
  formatSpeed,
  gigabytesToBytes,
  sizeParts,
} from './format/bytes';
export {
  EXPORT_FORMAT_KEY,
  EXPORT_VERSION,
  IMPORT_MAX_BYTES,
  exportCountsSchema,
  importResultSchema,
  type ExportCounts,
  type ImportResult,
} from './schemas/backup';
export {
  movieFileSummarySchema,
  movieMediaInfoSchema,
  movieQueueItemSchema,
  movieSchema,
  type Movie,
  type MovieFileSummary,
  type MovieMediaInfo,
  type MovieQueueItem,
} from './schemas/movies';
export {
  APPLY_TAGS_MODES,
  DEFAULT_LIBRARY_PER_PAGE,
  DEFAULT_MOVIE_LIBRARY_QUERY,
  LIBRARY_PER_PAGE,
  MINIMUM_AVAILABILITIES,
  MOVIE_LIBRARY_SORTS,
  MOVIE_LIBRARY_STATUSES,
  arrCommandStatusSchema,
  arrConfigResponseSchema,
  arrTagSchema,
  commandStartedResponseSchema,
  filteredIdsResponseSchema,
  hasActiveLibraryFilter,
  isLibraryPerPage,
  libraryFilterCount,
  libraryWarningSchema,
  libraryWarningsResponseSchema,
  movieIdsRequestSchema,
  movieLibraryItemSchema,
  movieLibraryQueryParams,
  movieLibraryQuerySchema,
  movieLibraryResponseSchema,
  moviesBulkDeleteRequestSchema,
  moviesBulkEditRequestSchema,
  parseMovieLibraryQuery,
  qualityProfileSummarySchema,
  rootFolderSummarySchema,
  withoutPagination,
  type ApplyTagsMode,
  type ArrCommandStatus,
  type ArrConfigResponse,
  type ArrTag,
  type CommandStartedResponse,
  type FilteredIdsResponse,
  type LibraryWarning,
  type LibraryWarningsResponse,
  type MovieIdsRequest,
  type MovieLibraryItem,
  type MovieLibraryQuery,
  type MovieLibraryResponse,
  type MovieLibrarySort,
  type MovieLibraryStatus,
  type MoviesBulkDeleteRequest,
  type MoviesBulkEditRequest,
  type QualityProfileSummary,
  type RootFolderSummary,
} from './schemas/movie-library';
// Fiche film et pages Radarr (P2.4 à P2.7) : modules exportés en entier.
export * from './schemas/movie-detail';
export * from './schemas/arr-lists';
export * from './schemas/radarr-pages';
export * from './schemas/query-params';
export * from './schemas/series';
export * from './schemas/series-library';
export * from './schemas/series-detail';
export * from './schemas/sonarr-pages';
export * from './schemas/arr-admin';
export * from './schemas/prowlarr';
export * from './schemas/bazarr';
export * from './schemas/torrents';
export * from './schemas/usenet';
export * from './schemas/activity';
export * from './schemas/tracearr-watch';
export * from './schemas/seerr';
export * from './schemas/discover';
export * from './schemas/calendar';
export * from './schemas/search';
export * from './schemas/dashboard';
export * from './schemas/logs';
