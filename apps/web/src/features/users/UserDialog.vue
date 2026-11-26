<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Création ou modification d'un compte : e-mail, nom affiché, mot de passe
// provisoire (obligatoire à la création, facultatif ensuite), rôle et, pour un
// utilisateur, droits par service (aucun, lecture, écriture) et par instance
// Radarr/Sonarr. Un admin a tous les droits : l'éditeur est alors masqué.
import {
  ACCESS_LEVELS,
  PASSWORD_MIN_LENGTH,
  type AccessLevel,
  type ManagedUser,
  type UserPermissions,
  type UserRole,
} from '@hubarr/shared';
import { useMutation } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { ApiError, validationMessages } from '../../app/api/client';
import { useSessionStore } from '../../app/stores/session';
import DialogTitle from '../../components/DialogTitle.vue';
import PasswordField from '../../components/PasswordField.vue';
import { permissionGroups, usersApi } from './users-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ user: ManagedUser | null }>();
const emit = defineEmits<{ saved: [user: ManagedUser] }>();

const { t } = useI18n();
const { smAndDown } = useDisplay();
const session = useSessionStore();

type Choice = AccessLevel | 'none';
interface UserForm {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  permissions: UserPermissions;
}
const form = reactive<UserForm>({
  email: '',
  displayName: '',
  password: '',
  role: 'user',
  permissions: {},
});
const errors = ref<string[]>([]);

const self = computed(() => props.user !== null && props.user.id === session.user?.id);
const groups = computed(() => permissionGroups(session.services, form.permissions));
const roleItems = computed(() => [
  { value: 'user', title: t('users.role.user') },
  { value: 'admin', title: t('users.role.admin') },
]);
const choices: Choice[] = ['none', ...ACCESS_LEVELS];

watch(open, (visible) => {
  if (!visible) return;
  errors.value = [];
  const current = props.user;
  Object.assign(form, {
    email: current?.email ?? '',
    // Le nom affiché vaut l'e-mail à défaut : champ vide dans ce cas.
    displayName: current && current.displayName !== current.email ? current.displayName : '',
    password: '',
    role: current?.role ?? 'user',
    permissions: { ...(current?.permissions ?? {}) },
  });
});

function levelOf(key: string): Choice {
  return form.permissions[key] ?? 'none';
}

function setLevel(key: string, choice: Choice): void {
  const rest = Object.entries(form.permissions).filter(([granted]) => granted !== key);
  form.permissions = Object.fromEntries(choice === 'none' ? rest : [...rest, [key, choice]]);
}

/** Même niveau sur toutes les lignes affichées. */
function setAll(choice: Choice): void {
  for (const group of groups.value) for (const row of group.rows) setLevel(row.key, choice);
}

function problemsOf(error: unknown): string[] {
  const keys = validationMessages(error).filter((message) => message.includes('.'));
  if (keys.length > 0) return keys;
  if (error instanceof ApiError && error.code === 'LAST_ADMIN') return ['users.error.last_admin'];
  return ['error.generic.message'];
}

const submit = useMutation({
  mutationFn: () => {
    const permissions = form.role === 'admin' ? {} : form.permissions;
    if (props.user === null) {
      return usersApi.create({
        email: form.email,
        displayName: form.displayName,
        password: form.password,
        role: form.role,
        permissions,
      });
    }
    return usersApi.save(props.user.id, {
      email: form.email,
      displayName: form.displayName,
      ...(form.password === '' ? {} : { password: form.password }),
      ...(self.value ? {} : { role: form.role }),
      permissions,
    });
  },
  onMutate: () => (errors.value = []),
  onSuccess: (user) => {
    open.value = false;
    emit('saved', user);
  },
  onError: (error) => {
    errors.value = problemsOf(error);
  },
});
</script>

<template>
  <component :is="smAndDown ? VBottomSheet : VDialog" v-model="open" max-width="640" scrollable>
    <v-card data-test="user-dialog">
      <DialogTitle
        :title="
          user === null
            ? t('users.dialog.add_title')
            : t('users.dialog.edit_title', { name: user.displayName })
        "
        @close="open = false"
      />
      <v-card-text>
        <form id="user-form" autocomplete="off" @submit.prevent="submit.mutate()">
          <v-alert
            v-for="key in errors"
            :key="key"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-test="user-error"
          >
            {{ t(key, { min: PASSWORD_MIN_LENGTH }) }}
          </v-alert>
          <v-text-field
            v-model="form.email"
            type="email"
            :label="t('users.field.email')"
            maxlength="180"
            spellcheck="false"
            autocomplete="off"
            data-test="user-email"
            class="mb-2"
          />
          <v-text-field
            v-model="form.displayName"
            :label="t('users.field.display_name')"
            :hint="t('users.field.display_name_hint')"
            persistent-hint
            maxlength="100"
            data-test="user-display-name"
            class="mb-2"
          />
          <PasswordField
            v-model="form.password"
            :label="user === null ? t('users.field.password') : t('users.field.password_reset')"
            :hint="
              user === null
                ? t('users.field.password_hint', { min: PASSWORD_MIN_LENGTH })
                : t('users.field.password_reset_hint')
            "
            persistent-hint
            autocomplete="new-password"
            data-test="user-password"
            class="mb-2"
          />
          <v-select
            v-model="form.role"
            :items="roleItems"
            :label="t('users.field.role')"
            :disabled="self"
            :hint="self ? t('users.field.role_self_hint') : undefined"
            persistent-hint
            data-test="user-role"
          />

          <div v-if="form.role === 'admin'" class="text-body-medium text-muted mt-4">
            {{ t('users.permissions.admin_all') }}
          </div>
          <div v-else class="mt-4" data-test="user-permissions">
            <div class="d-flex flex-wrap align-center ga-2 mb-2">
              <h3 class="text-title-small flex-grow-1">{{ t('users.permissions.title') }}</h3>
              <span class="text-label-medium text-muted">{{ t('users.permissions.set_all') }}</span>
              <v-btn
                v-for="choice in choices"
                :key="choice"
                size="small"
                variant="text"
                :data-test="`user-permissions-all-${choice}`"
                @click="setAll(choice)"
                >{{ t(`users.level.${choice}`) }}</v-btn
              >
            </div>
            <p class="text-body-small text-muted mb-3">{{ t('users.permissions.hint') }}</p>
            <p v-if="groups.length === 0" class="text-body-medium text-muted">
              {{ t('users.permissions.no_service') }}
            </p>
            <div v-for="group in groups" :key="group.family" class="mb-3">
              <div class="text-label-large text-muted mb-1">
                {{ t(`sidebar.family.${group.family}`) }}
              </div>
              <div
                v-for="row in group.rows"
                :key="row.key"
                class="permission-row"
                :data-test="`permission-${row.key}`"
              >
                <span class="text-body-medium text-truncate">{{ row.label }}</span>
                <v-btn-toggle
                  :model-value="levelOf(row.key)"
                  mandatory
                  density="compact"
                  variant="outlined"
                  divided
                  color="primary"
                  :aria-label="row.label"
                  @update:model-value="(value: Choice) => setLevel(row.key, value)"
                >
                  <v-btn
                    v-for="choice in choices"
                    :key="choice"
                    :value="choice"
                    size="small"
                    :data-test="`permission-${row.key}-${choice}`"
                    >{{ t(`users.level.${choice}`) }}</v-btn
                  >
                </v-btn-toggle>
              </div>
            </div>
          </div>
        </form>
      </v-card-text>
      <v-card-actions class="px-6 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.action.cancel') }}</v-btn>
        <v-btn
          type="submit"
          form="user-form"
          color="primary"
          variant="flat"
          :loading="submit.isPending.value"
          data-test="user-submit"
        >
          {{ user === null ? t('users.action.create') : t('users.action.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </component>
</template>

<style scoped>
.permission-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.permission-row > span {
  min-width: 0;
  flex: 1 1 160px;
}
</style>
