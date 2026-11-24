<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Écran de connexion (`security/login.html.twig`) : e-mail, mot de passe
// masquable, « Se souvenir de moi » (coché par défaut, comme l'original),
// erreurs `invalid` / `throttled` / `generic`, indication « mot de passe
// oublié », bascule de thème. Toujours vers l'accueil après connexion.
import { msError } from '../../components/symbols';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../../app/stores/session';
import AuthFooter from '../../components/AuthFooter.vue';
import HubarrLogo from '../../components/HubarrLogo.vue';
import PasswordField from '../../components/PasswordField.vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import { loginErrorKey } from './login-error';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();

const form = reactive({ email: '', password: '', remember: true });
const error = ref<string | null>(session.serverReachable ? null : 'error.503.message');
const submitting = ref(false);

async function submit(): Promise<void> {
  if (form.email.trim() === '' || form.password === '') return;
  submitting.value = true;
  error.value = null;
  try {
    await session.login({ email: form.email, password: form.password, remember: form.remember });
    await router.replace({ name: 'home' });
  } catch (failure) {
    error.value = loginErrorKey(failure);
    form.password = '';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-main class="bg-background">
    <div class="d-flex justify-end pa-3">
      <ThemeToggle />
    </div>
    <v-container class="d-flex flex-column align-center py-4" style="max-width: 440px">
      <HubarrLogo :size="56" class="mb-6" />
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        :icon="msError"
        class="mb-4 w-100"
        role="alert"
        data-test="login-error"
        >{{ t(error) }}</v-alert
      >
      <v-card rounded="xl" class="w-100 pa-2 pa-sm-4">
        <v-card-item>
          <v-card-title class="text-headline-small">{{ t('login.title') }}</v-card-title>
          <v-card-subtitle>{{ t('login.subtitle') }}</v-card-subtitle>
        </v-card-item>
        <v-form @submit.prevent="submit">
          <v-card-text>
            <v-text-field
              v-model="form.email"
              :label="t('login.email')"
              :placeholder="t('login.email_placeholder')"
              type="email"
              autocomplete="username"
              autofocus
              required
              data-test="login-email"
            />
            <PasswordField
              v-model="form.password"
              :label="t('login.password')"
              autocomplete="current-password"
              required
              data-test="login-password"
            />
            <v-checkbox
              v-model="form.remember"
              :label="t('login.remember')"
              color="service"
              density="compact"
              hide-details
            />
            <v-btn
              type="submit"
              color="service"
              variant="flat"
              size="large"
              block
              class="mt-4"
              :loading="submitting"
              data-test="login-submit"
              >{{ t('login.submit') }}</v-btn
            >
            <p class="text-body-small text-muted mt-4 mb-0">{{ t('login.forgot_hint') }}</p>
          </v-card-text>
        </v-form>
      </v-card>
      <AuthFooter />
    </v-container>
  </v-main>
</template>
