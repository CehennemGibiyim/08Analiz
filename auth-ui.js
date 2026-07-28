import {
  authenticate,
  createUser,
  loadUsers,
  logout,
  recoveryFromLocation,
  requestPasswordReset,
  removeUser,
  restoreSession,
  updatePassword,
  updateUserRole,
} from './auth.js';
import { bindProjectDownload } from './project-download.js';

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' }[char])); }
function translateAuth() {
  document.querySelectorAll('#authGate [data-i18n], #adminDialog [data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('#authGate [data-i18n-placeholder], #adminDialog [data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  document.querySelectorAll('#authGate [data-i18n-aria-label], #adminDialog [data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
}
function roleLabel(role) { return t(role === 'admin' ? 'auth.adminRole' : 'auth.guestRole'); }
function showMessage(element, key, values = {}) { if (!element) return; element.textContent = key ? t(key, values) : ''; element.hidden = !key; }
function errorKey(error) { return `auth.${error?.message || 'backendUnavailable'}`; }
function bindPasswordToggles() {
  document.querySelectorAll('.password-toggle[data-password-target]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordTarget);
      const label = button.querySelector('.password-toggle-label');
      if (!input) return;
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      const nextKey = isVisible ? 'auth.showPassword' : 'auth.hidePassword';
      button.setAttribute('aria-label', t(nextKey));
      if (label) label.textContent = t(nextKey);
      button.classList.toggle('is-visible', !isVisible);
    });
  });
}

export async function startAuth({ app, onAuthenticated }) {
  const gate = document.querySelector('#authGate');
  const authCopy = gate.querySelector('.auth-copy');
  const form = document.querySelector('#loginForm');
  const loginError = document.querySelector('#loginError');
  const loginSuccess = document.querySelector('#loginSuccess');
  const forgotButton = document.querySelector('#forgotPasswordButton');
  const forgotForm = document.querySelector('#forgotPasswordForm');
  const forgotMessage = document.querySelector('#forgotMessage');
  const backToLoginButton = document.querySelector('#backToLoginButton');
  const recoveryForm = document.querySelector('#recoveryForm');
  const recoveryMessage = document.querySelector('#recoveryMessage');
  const adminButton = document.querySelector('#adminButton');
  const sessionBadge = document.querySelector('#sessionBadge');
  const adminDialog = document.querySelector('#adminDialog');
  const userForm = document.querySelector('#userForm');
  const userList = document.querySelector('#userList');
  const adminMessage = document.querySelector('#adminMessage');
  let session = null;
  const recovery = recoveryFromLocation();
  translateAuth();
  bindProjectDownload();
  bindPasswordToggles();

  function setMode(mode) {
    const isLogin = mode === 'login';
    const isForgot = mode === 'forgot';
    form.hidden = !isLogin;
    forgotButton.hidden = !isLogin;
    forgotForm.hidden = !isForgot;
    recoveryForm.hidden = mode !== 'recovery';
    if (mode === 'forgot') authCopy.textContent = t('auth.forgotCopy');
    else if (mode === 'recovery') authCopy.textContent = t('auth.recoveryCopy');
    else authCopy.textContent = t('auth.copy');
    if (isLogin) form.username.focus();
    if (isForgot) forgotForm.email.focus();
    if (mode === 'recovery') recoveryForm.password.focus();
  }
  function clearRecoveryHash() {
    try { window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`); } catch {}
  }
  function renderSession() {
    if (!session) return;
    sessionBadge.innerHTML = `<strong>${escapeHtml(session.username)}</strong><span>${escapeHtml(roleLabel(session.role))}</span>`;
    sessionBadge.hidden = false;
    adminButton.hidden = session.role !== 'admin';
  }
  function unlock(nextSession) {
    session = nextSession;
    renderSession();
    gate.hidden = true;
    app.hidden = false;
    onAuthenticated(session);
  }
  async function refreshUsers() {
    if (!session || session.role !== 'admin') return;
    const users = await loadUsers();
    userList.innerHTML = users.map((user) => {
      const self = user.id === session.id;
      const nextRole = user.role === 'admin' ? 'guest' : 'admin';
      return `<div class="user-row"><span><b>${escapeHtml(user.username)}</b><small>${escapeHtml(roleLabel(user.role))}${self ? ` · ${escapeHtml(t('auth.you'))}` : ''}</small></span><span class="user-actions"><button class="small-button" type="button" data-user-role="${escapeHtml(user.id)}" ${self ? 'disabled' : ''}>${escapeHtml(t(nextRole === 'admin' ? 'auth.makeAdmin' : 'auth.makeGuest'))}</button><button class="text-button" type="button" data-user-remove="${escapeHtml(user.id)}" ${self ? 'disabled' : ''}>${escapeHtml(t('auth.remove'))}</button></span></div>`;
    }).join('');
  }
  async function openAdmin() { if (session?.role !== 'admin') return; adminDialog.hidden = false; adminDialog.setAttribute('aria-hidden', 'false'); showMessage(adminMessage); await refreshUsers(); userForm.querySelector('input')?.focus(); }
  function closeAdmin() { adminDialog.hidden = true; adminDialog.setAttribute('aria-hidden', 'true'); showMessage(adminMessage); }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; showMessage(loginError); showMessage(loginSuccess);
    try {
      const result = await authenticate(form.username.value, form.password.value);
      button.disabled = false;
      if (!result.ok) {
        const key = result.error === 'backend_unavailable' ? 'auth.backendUnavailable' : result.error === 'invalid_credentials' ? 'auth.invalidCredentials' : `auth.${result.error}`;
        showMessage(loginError, key);
        form.password.focus();
        return;
      }
      form.reset(); unlock(result.session);
    } catch {
      button.disabled = false;
      showMessage(loginError, 'auth.storageError');
    }
  });
  forgotButton.addEventListener('click', () => { showMessage(loginError); showMessage(loginSuccess); showMessage(forgotMessage); setMode('forgot'); });
  backToLoginButton.addEventListener('click', () => { showMessage(forgotMessage); setMode('login'); });
  forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = forgotForm.querySelector('button[type="submit"]');
    button.disabled = true; showMessage(forgotMessage);
    try {
      await requestPasswordReset(forgotForm.email.value);
      showMessage(forgotMessage, 'auth.recoverySent');
      forgotForm.reset();
    } catch (error) { showMessage(forgotMessage, errorKey(error)); }
    button.disabled = false;
  });
  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = recoveryForm.querySelector('button[type="submit"]');
    const password = recoveryForm.password.value;
    if (password !== recoveryForm.passwordConfirm.value) { showMessage(recoveryMessage, 'auth.passwordMismatch'); return; }
    button.disabled = true; showMessage(recoveryMessage);
    try {
      await updatePassword(recovery?.accessToken, password);
      clearRecoveryHash();
      recoveryForm.reset();
      setMode('login');
      showMessage(loginSuccess, 'auth.passwordResetSuccess');
      form.username.focus();
    } catch (error) { showMessage(recoveryMessage, errorKey(error)); }
    button.disabled = false;
  });
  document.querySelector('#logoutButton').addEventListener('click', async () => { await logout(); window.location.reload(); });
  adminButton.addEventListener('click', openAdmin);
  document.querySelector('#closeAdminButton').addEventListener('click', closeAdmin);
  adminDialog.addEventListener('click', (event) => { if (event.target === adminDialog) closeAdmin(); });
  userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await createUser({ username: userForm.username.value, password: userForm.password.value, role: userForm.role.value }, session);
      userForm.reset(); userForm.role.value = 'guest'; showMessage(adminMessage, 'auth.userAdded'); await refreshUsers();
    } catch (error) { showMessage(adminMessage, errorKey(error)); }
  });
  userList.addEventListener('click', async (event) => {
    const roleButton = event.target.closest('[data-user-role]');
    const removeButton = event.target.closest('[data-user-remove]');
    try {
      if (roleButton) { const users = await loadUsers(); const target = users.find((user) => user.id === roleButton.dataset.userRole); if (target) await updateUserRole(target.id, target.role === 'admin' ? 'guest' : 'admin', session); showMessage(adminMessage, 'auth.roleUpdated'); await refreshUsers(); }
      if (removeButton) { if (!window.confirm(t('auth.confirmRemove'))) return; await removeUser(removeButton.dataset.userRemove, session); showMessage(adminMessage, 'auth.userRemoved'); await refreshUsers(); }
    } catch (error) { showMessage(adminMessage, errorKey(error)); }
  });

  if (recovery) {
    setMode('recovery');
    if (recovery.expiresAt && recovery.expiresAt < Math.floor(Date.now() / 1000)) showMessage(recoveryMessage, 'auth.recoveryExpired');
  } else {
    const existing = await restoreSession();
    if (existing) unlock(existing);
  }
}
