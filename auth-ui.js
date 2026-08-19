import {
  authenticate,
  createUser,
  loadUsers,
  logout,
  recoveryFromLocation,
  requestPasswordReset,
  signUp,
  removeUser,
  deleteUser,
  restoreSession,
  updatePassword,
  updateUserAccess,
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
function errorKey(error) {
  const raw = String(typeof error === 'string' ? error : error?.message || 'backendUnavailable').trim().replace(/^auth\./i, '');
  const aliases = {
    backend_unavailable: 'backendUnavailable',
    invalid_credentials: 'invalidCredentials',
    invalid_login_credentials: 'invalidCredentials',
  };
  const normalized = aliases[raw] || raw;
  const known = new Set([
    'backendUnavailable', 'invalidCredentials', 'storageError', 'forbidden',
    'username_invalid', 'username_exists', 'username_inactive', 'password_short',
    'email_invalid', 'email_not_confirmed', 'email_confirmation_required',
    'rate_limited', 'recovery_expired', 'passwordMismatch', 'recoverySent',
    'passwordResetSuccess', 'cannot_remove_self', 'last_admin', 'user_not_found',
    'delete_setup_required', 'userAdded', 'roleUpdated', 'userActivated',
    'userDeactivated', 'userDeleted',
  ]);
  return `auth.${known.has(normalized) ? normalized : 'backendUnavailable'}`;
}
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
  const signupButton = document.querySelector('#signupButton');
  const signupForm = document.querySelector('#signupForm');
  const signupMessage = document.querySelector('#signupMessage');
  const signupBackToLoginButton = document.querySelector('#signupBackToLoginButton');
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
  let editingUserId = '';
  const recovery = recoveryFromLocation();
  translateAuth();
  bindProjectDownload();
  bindPasswordToggles();

  function setMode(mode) {
    const isLogin = mode === 'login';
    const isForgot = mode === 'forgot';
    const isSignup = mode === 'signup';
    form.hidden = !isLogin;
    signupButton.hidden = !isLogin;
    forgotButton.hidden = !isLogin;
    signupForm.hidden = !isSignup;
    forgotForm.hidden = !isForgot;
    recoveryForm.hidden = mode !== 'recovery';
    if (isSignup) authCopy.textContent = t('auth.signupCopy');
    else if (isForgot) authCopy.textContent = t('auth.forgotCopy');
    else if (mode === 'recovery') authCopy.textContent = t('auth.recoveryCopy');
    else authCopy.textContent = t('auth.copy');
    if (isLogin) form.username.focus();
    if (isSignup) signupForm.username.focus();
    if (isForgot) forgotForm.email.focus();
    if (mode === 'recovery') recoveryForm.password.focus();
  }
  function clearRecoveryHash() {
    try { window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`); } catch {}
  }
  function renderSession() {
    if (!session) return;
    const profileHint = session.profileReady === false ? `<small title="${escapeHtml(t('auth.profileSetupHint'))}">⚠ ${escapeHtml(t('auth.profileSetupShort'))}</small>` : '';
    sessionBadge.innerHTML = `<strong>${escapeHtml(session.username)}</strong><span>${escapeHtml(roleLabel(session.role))}</span>${profileHint}`;
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
    if (!users.length) {
      userList.innerHTML = `<div class="user-row"><span><b>${escapeHtml(t('auth.noUsers'))}</b><small>${escapeHtml(t('auth.listHint'))}</small></span></div>`;
      return;
    }
    userList.innerHTML = users.map((user) => {
      const self = user.id === session.id;
      const isActive = user.is_active !== false;
      const isEditing = editingUserId === user.id;
      const status = isActive ? t('auth.activeStatus') : t('auth.passiveStatus');
      const roleSelect = `<select class="user-role-select" data-user-role-select="${escapeHtml(user.id)}" aria-label="${escapeHtml(t('auth.role'))}" ${self ? 'disabled' : ''}><option value="guest" ${user.role !== 'admin' ? 'selected' : ''}>${escapeHtml(t('auth.guestRole'))}</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>${escapeHtml(t('auth.adminRole'))}</option></select>`;
      let userActions;
      if (!isActive) {
        userActions = `<span class="user-actions">${roleSelect}<button class="small-button" type="button" data-user-activate="${escapeHtml(user.id)}">${escapeHtml(t('auth.activate'))}</button><button class="text-button danger-button" type="button" data-user-delete="${escapeHtml(user.id)}">${escapeHtml(t('auth.deletePermanently'))}</button></span>`;
      } else if (isEditing) {
        userActions = `<span class="user-actions">${roleSelect}<button class="small-button" type="button" data-user-save="${escapeHtml(user.id)}">${escapeHtml(t('auth.saveChanges'))}</button><button class="text-button" type="button" data-user-cancel="${escapeHtml(user.id)}">${escapeHtml(t('auth.cancel'))}</button></span>`;
      } else {
        userActions = `<span class="user-actions"><button class="small-button" type="button" data-user-edit="${escapeHtml(user.id)}" ${self ? 'disabled' : ''}>${escapeHtml(t('auth.edit'))}</button><button class="text-button" type="button" data-user-remove="${escapeHtml(user.id)}" ${self ? 'disabled' : ''}>${escapeHtml(t('auth.deactivate'))}</button><button class="text-button danger-button" type="button" data-user-delete="${escapeHtml(user.id)}" ${self ? 'disabled' : ''}>${escapeHtml(t('auth.deletePermanently'))}</button></span>`;
      }
      const hint = isActive ? '' : `<small>${escapeHtml(t('auth.passiveHint'))}</small>`;
      return `<div class="user-row${isActive ? '' : ' is-inactive'}${isEditing ? ' is-editing' : ''}"><span><b>${escapeHtml(user.username)}</b><small>${escapeHtml(roleLabel(user.role))} · ${escapeHtml(status)}${self ? ` · ${escapeHtml(t('auth.you'))}` : ''}</small>${hint}</span>${userActions}</div>`;
    }).join('');
  }
  async function openAdmin() {
    if (session?.role !== 'admin') return;
    adminDialog.hidden = false;
    adminDialog.setAttribute('aria-hidden', 'false');
    showMessage(adminMessage);
    try {
      await refreshUsers();
    } catch (error) {
      showMessage(adminMessage, errorKey(error));
      userList.innerHTML = `<div class="user-row"><span><b>${escapeHtml(t('auth.backendUnavailable'))}</b><small>${escapeHtml(t('auth.listHint'))}</small></span></div>`;
    }
    userForm.querySelector('input')?.focus();
  }
  function closeAdmin() { adminDialog.hidden = true; adminDialog.setAttribute('aria-hidden', 'true'); showMessage(adminMessage); }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; showMessage(loginError); showMessage(loginSuccess);
    try {
      const result = await authenticate(form.username.value, form.password.value);
      button.disabled = false;
      if (!result.ok) {
        showMessage(loginError, errorKey(result.error));
        form.password.focus();
        return;
      }
      form.reset(); unlock(result.session);
    } catch {
      button.disabled = false;
      showMessage(loginError, 'auth.storageError');
    }
  });
  signupButton.addEventListener('click', () => { showMessage(loginError); showMessage(loginSuccess); showMessage(signupMessage); setMode('signup'); });
  signupBackToLoginButton.addEventListener('click', () => { showMessage(signupMessage); setMode('login'); });
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = signupForm.querySelector('button[type="submit"]');
    const password = signupForm.password.value;
    if (password !== signupForm.passwordConfirm.value) { showMessage(signupMessage, 'auth.passwordMismatch'); return; }
    button.disabled = true; showMessage(signupMessage);
    try {
      const result = await signUp({ username: signupForm.username.value, email: signupForm.email.value, password });
      signupForm.reset();
      if (result.session) { unlock(result.session); return; }
      setMode('login');
      showMessage(loginSuccess, 'auth.signupCheckEmail');
    } catch (error) { showMessage(signupMessage, errorKey(error)); }
    button.disabled = false;
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
    const editButton = event.target.closest('[data-user-edit]');
    const cancelButton = event.target.closest('[data-user-cancel]');
    const saveButton = event.target.closest('[data-user-save]');
    const activateButton = event.target.closest('[data-user-activate]');
    const removeButton = event.target.closest('[data-user-remove]');
    const deleteButton = event.target.closest('[data-user-delete]');
    const id = editButton?.dataset.userEdit || cancelButton?.dataset.userCancel || saveButton?.dataset.userSave || activateButton?.dataset.userActivate || removeButton?.dataset.userRemove || deleteButton?.dataset.userDelete;
    if (!id) return;
    try {
      if (editButton) { editingUserId = id; await refreshUsers(); return; }
      if (cancelButton) { editingUserId = ''; await refreshUsers(); return; }
      const row = event.target.closest('.user-row');
      const role = row?.querySelector('[data-user-role-select]')?.value === 'admin' ? 'admin' : 'guest';
      if (saveButton) { await updateUserAccess(id, { isActive: true, role }, session); editingUserId = ''; showMessage(adminMessage, 'auth.roleUpdated'); await refreshUsers(); return; }
      if (activateButton) { await updateUserAccess(id, { isActive: true, role }, session); showMessage(adminMessage, 'auth.userActivated'); await refreshUsers(); return; }
      if (removeButton) { if (!window.confirm(t('auth.confirmDeactivate'))) return; await removeUser(id, session); showMessage(adminMessage, 'auth.userDeactivated'); await refreshUsers(); return; }
      if (deleteButton) { if (!window.confirm(t('auth.confirmDeletePermanently'))) return; await deleteUser(id, session); showMessage(adminMessage, 'auth.userDeleted'); await refreshUsers(); }
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
