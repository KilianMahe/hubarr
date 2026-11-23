<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Étape 2 de l'assistant (`setup/admin.html.twig`) : création de l'unique
// compte administrateur, connecté aussitôt, puis direction la section des
// services des paramètres avec le message `setup.flash.connect_services`.
// Toutes les erreurs de validation s'affichent ensemble ; une
// course perdue (compte déjà créé) renvoie vers la connexion, comme l'original.
import { PASSWORD_MIN_LENGTH, setupAdminResponseSchema } from '@hubarr/shared';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ApiError, api, validationMessages } from '../../app/api/client';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import PasswordField from '../../components/PasswordField.vue';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const notify = useNotifyStore();

const form = reactive({ email: '', displayName: '', password: '', passwordConfirm: '' });
const errors = ref<string[]>([]);
const submitting = ref(false);

async function submit(): Promise<void> {
  submitting.value = true;
  errors.value = [];
  try {
    const response = await api.post(
      '/api/setup/admin',
      {
        email: form.email,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        ...(form.displayName.trim() === '' ? {} : { displayName: form.displayName }),
      },
      setupAdminResponseSchema,
    );
    session.completeSetup(response);
    notify.success('setup.flash.connect_services');
    await router.replace({ name: 'settings', hash: '#section-services' });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'SETUP_COMPLETED') {
      session.setupRequired = false;
      await router.replace({ name: 'login' });
      return;
    }
    const messages = validationMessages(error);
    errors.value = messages.length > 0 ? messages : ['login.error.generic'];
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-form @submit.prevent="submit">
    <v-card-text>
      <div class="text-label-large text-muted">{{ t('setup.step.admin.eyebrow') }}</div>
      <h1 class="text-headline-small mb-1">{{ t('setup.step.admin.title') }}</h1>
      <p class="text-body-medium text-muted mb-6">{{ t('setup.step.admin.subtitle') }}</p>

      <v-alert
        v-if="errors.length"
        type="error"
        variant="tonal"
        class="mb-4"
        data-test="setup-errors"
      >
        <ul class="ps-4">
          <li v-for="message in errors" :key="message">{{ t(message) }}</li>
        </ul>
      </v-alert>

      <v-text-field
        v-model="form.email"
        :label="t('setup.step.admin.email')"
        type="email"
        autocomplete="email"
        :placeholder="t('login.email_placeholder')"
        autofocus
        required
        data-test="setup-email"
      />
      <v-text-field
        v-model="form.displayName"
        :label="`${t('setup.step.admin.display_name')} ${t('setup.step.admin.display_name_optional')}`"
        autocomplete="name"
      />
      <v-row>
        <v-col cols="12" sm="6">
          <PasswordField
            v-model="form.password"
            :label="`${t('setup.step.admin.password')} ${t('setup.step.admin.password_hint')}`"
            autocomplete="new-password"
            :minlength="PASSWORD_MIN_LENGTH"
            required
            data-test="setup-password"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <PasswordField
            v-model="form.passwordConfirm"
            :label="t('setup.step.admin.password_confirm')"
            autocomplete="new-password"
            required
            data-test="setup-password-confirm"
          />
        </v-col>
      </v-row>
    </v-card-text>
    <v-divider />
    <v-card-actions class="justify-space-between pa-4">
      <v-btn :to="{ name: 'setup-welcome' }" variant="text">{{ t('setup.step.admin.back') }}</v-btn>
      <v-btn
        type="submit"
        color="service"
        variant="flat"
        size="large"
        :loading="submitting"
        data-test="setup-submit"
        >{{ t('setup.step.admin.cta') }}</v-btn
      >
    </v-card-actions>
  </v-form>
</template>
