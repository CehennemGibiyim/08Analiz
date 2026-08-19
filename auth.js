import { getStoredItem, setStoredItem, removeStoredItem } from './storage.js';

const config = window.APP_CONFIG || {};
const SUPABASE_URL = String(config.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(config.SUPABASE_PUBLISHABLE_KEY || config.SUPABASE_ANON_KEY || '');
const SESSION_KEY = '08-analiz-supabase-session-v1';
const USERNAME_DOMAIN = 'users.08analiz.local';

function cleanUsername(value) { return String(value || '').trim(); }
function authEmail(value) {
  const clean = cleanUsername(value).toLowerCase();
  return clean.includes('@') ? clean : `${clean}@${USERNAME_DOMAIN}`;
}
function managedEmail(username, suffix = '') {
  const clean = cleanUsername(username).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return `${clean}${suffix ? `+${suffix}` : ''}@${USERNAME_DOMAIN}`;
}
function isDuplicateAuthError(error) {
  const message = String(error?.message || error?.msg || '').toLowerCase();
  return message.includes('already registered') || message.includes('already exists') || message.includes('duplicate') || error?.code === 'user_already_exists';
}
async function resolveLoginEmail(value) {
  const clean = cleanUsername(value);
  if (clean.includes('@')) return clean.toLowerCase();
  try {
    const resolved = await supabaseRequest('/rest/v1/rpc/resolve_login_email', { method: 'POST', body: JSON.stringify({ input_username: clean }) });
    const email = Array.isArray(resolved) ? resolved[0] : resolved;
    if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase();
  } catch {}
  // Eski kurulumlarda RPC henüz çalıştırılmamış olabilir. RLS izin veriyorsa
  // profil tablosundan aynı bilgiyi okuyup mevcut Auth hesabını bulmayı dene.
  try {
    const rows = await supabaseRequest(`/rest/v1/profiles?select=auth_email&username=ilike.${encodeURIComponent(clean)}&is_active=eq.true&limit=1`);
    const email = rows?.[0]?.auth_email;
    if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase();
  } catch {}
  return authEmail(clean);
}
async function loginEmailCandidates(value) {
  const clean = cleanUsername(value);
  if (clean.includes('@')) return [clean.toLowerCase()];
  const resolved = await resolveLoginEmail(clean);
  // Eski profillerde auth_email gerçek e-posta, yeni yönetilen hesaplarda ise
  // dahili kullanıcı e-postası olabilir. RPC eski kuruluma aitse iki biçimi de
  // denemek, pasif/aktif geçişlerden sonra kullanıcıyı yeniden kayıt olmaktan
  // kurtarır.
  return [...new Set([resolved, authEmail(clean), managedEmail(clean)].filter((email) => email && email.includes('@')).map((email) => email.trim().toLowerCase()))];
}
function isConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function adminOnly(actor) { if (!actor || actor.role !== 'admin') throw new Error('forbidden'); }
function mapAuthError(error) {
  const code = String(error?.message || error?.msg || '').trim().replace(/^auth\./i, '');
  const appCodes = new Set(['username_invalid', 'username_exists', 'username_inactive', 'password_short', 'email_invalid', 'email_not_confirmed', 'email_confirmation_required', 'recovery_expired', 'rate_limited', 'invalid_credentials', 'forbidden', 'cannot_remove_self', 'last_admin', 'user_not_found', 'delete_setup_required']);
  if (appCodes.has(code)) return code;
  const message = code.toLowerCase();
  if (message.includes('already registered') || message.includes('already exists') || message.includes('duplicate') || error?.code === 'user_already_exists') return 'username_exists';
  if (message.includes('valid email') || message.includes('email address')) return 'email_invalid';
  if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) return 'email_not_confirmed';
  if (message.includes('password') && (message.includes('6') || message.includes('short') || message.includes('weak'))) return 'password_short';
  if (message.includes('recovery_expired') || (message.includes('expired') || message.includes('invalid')) && message.includes('token')) return 'recovery_expired';
  if (message.includes('too many') || message.includes('rate limit')) return 'rate_limited';
  if (error?.status === 400 || message.includes('invalid login credentials')) return 'invalid_credentials';
  return 'backend_unavailable';
}
function requestHeaders(token = '', json = false) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
async function supabaseRequest(path, options = {}, token = '') {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...requestHeaders(token, Boolean(options.body)), ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.msg || data?.error_description || `supabase_${response.status}`), { status: response.status, code: data?.code, data });
  return data;
}
async function readStoredSession() {
  try { const raw = await getStoredItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function writeStoredSession(session) {
  if (session) await setStoredItem(SESSION_KEY, JSON.stringify(session));
  else await removeStoredItem(SESSION_KEY);
}
async function refreshAccessToken(session) {
  if (!session?.refresh_token) return session;
  const data = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) });
  const next = { ...session, ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) };
  await writeStoredSession(next);
  return next;
}
async function profileFor(user, token) {
  const fallback = { id: user.id, username: user.user_metadata?.username || user.email?.split('@')[0] || 'user', role: 'guest', is_active: true, created_at: Date.now(), profileReady: false };
  try {
    const rows = await supabaseRequest(`/rest/v1/profiles?select=id,username,role,is_active,created_at&id=eq.${encodeURIComponent(user.id)}&limit=1`, {}, token);
    return rows?.[0] ? { ...rows[0], profileReady: true } : fallback;
  } catch {
    // Auth credentials are valid even when the optional profiles/RLS setup is incomplete.
    // Let the user enter as a guest instead of reporting a misleading login failure.
    return fallback;
  }
}
async function profileByUsername(username, token) {
  const filter = encodeURIComponent(cleanUsername(username));
  try {
    const rows = await supabaseRequest(`/rest/v1/profiles?select=id,username,role,is_active,created_at,auth_email&username=ilike.${filter}&limit=1`, {}, token);
    return rows?.[0] || null;
  } catch {
    try {
      const rows = await supabaseRequest(`/rest/v1/profiles?select=id,username,role,is_active,created_at&username=ilike.${filter}&limit=1`, {}, token);
      return rows?.[0] || null;
    } catch { return null; }
  }
}
async function profileByAuthEmail(email, token) {
  try {
    const rows = await supabaseRequest(`/rest/v1/profiles?select=id,is_active,auth_email&auth_email=eq.${encodeURIComponent(email)}&limit=1`, {}, token);
    return rows?.[0] || null;
  } catch { return null; }
}
function sessionFrom(user, accessToken, profile, raw = {}) {
  return { id: user.id, username: cleanUsername(profile.username), role: profile.role === 'admin' ? 'admin' : 'guest', profileReady: profile.profileReady !== false, token: accessToken || '', supabase: true, email: user.email || '', loggedAt: raw.loggedAt || Date.now() };
}
async function getCurrent() {
  if (!isConfigured()) return null;
  let stored = await readStoredSession();
  if (!stored?.access_token || !stored.user) return null;
  if (stored.expires_at && Number(stored.expires_at) * 1000 < Date.now() + 60000) {
    try { stored = await refreshAccessToken(stored); } catch { await writeStoredSession(null); return null; }
  }
  try {
    const user = await supabaseRequest('/auth/v1/user', {}, stored.access_token);
    const profile = await profileFor(user, stored.access_token);
    if (profile.is_active === false) { await writeStoredSession(null); return null; }
    return sessionFrom(user, stored.access_token, profile, stored);
  } catch { await writeStoredSession(null); return null; }
}

export async function loadUsers() {
  const actor = await getCurrent();
  adminOnly(actor);
  try {
    // Yönetim ekranı yalnızca aktif kullanıcıları değil, erişimi kaldırılmış
    // profilleri de göstermeli. Aksi halde kayıt silinmiş gibi görünür ve
    // aynı kullanıcı adı neden hâlâ kullanılamıyor anlaşılamaz.
    const rows = await supabaseRequest('/rest/v1/profiles?select=id,username,role,is_active,created_at&order=is_active.desc,created_at.asc', {}, actor.token);
    return (rows || []).map((user) => ({ ...user, is_active: user.is_active !== false, createdAt: user.created_at }));
  } catch {
    try {
      const rows = await supabaseRequest('/rest/v1/profiles?select=id,username,role,created_at&order=created_at.asc', {}, actor.token);
      return (rows || []).map((user) => ({ ...user, is_active: true, createdAt: user.created_at }));
    } catch { throw new Error('backend_unavailable'); }
  }
}

export async function restoreSession() {
  try { return await getCurrent(); } catch { return null; }
}

export async function authenticate(username, password) {
  if (!isConfigured()) return { ok: false, error: 'backend_unavailable' };
  try {
    const candidates = await loginEmailCandidates(username);
    let lastError = null;
    for (const email of candidates) {
      try {
        const data = await supabaseRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: String(password || '') }) });
        if (!data?.access_token || !data.user) return { ok: false, error: 'invalid_credentials' };
        const stored = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600), loggedAt: Date.now() };
        await writeStoredSession(stored);
        const profile = await profileFor(data.user, data.access_token);
        if (profile.is_active === false) { await writeStoredSession(null); return { ok: false, error: 'forbidden' }; }
        return { ok: true, session: sessionFrom(data.user, data.access_token, profile, stored) };
      } catch (error) {
        lastError = error;
        const code = mapAuthError(error);
        // Bu e-posta hesabı mevcut ama onay bekliyorsa veya backend erişilemiyorsa
        // diğer adaylarla denemek yerine gerçek durumu kullanıcıya göster.
        if (code === 'email_not_confirmed' || code === 'rate_limited' || code === 'backend_unavailable') throw error;
      }
    }
    throw lastError || new Error('invalid_credentials');
  } catch (error) { return { ok: false, error: mapAuthError(error) }; }
}

export async function signUp({ username, email, password }) {
  const clean = cleanUsername(username);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (clean.length < 3 || clean.length > 40 || /\s/.test(clean)) throw new Error('username_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('email_invalid');
  if (String(password || '').length < 8) throw new Error('password_short');
  if (!isConfigured()) throw new Error('backend_unavailable');
  try {
    const data = await supabaseRequest('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: cleanEmail, password: String(password), data: { username: clean } }) });
    if (!data?.user) throw new Error('backend_unavailable');
    if (!data.access_token) return { ok: true, requiresConfirmation: true, email: cleanEmail };
    const stored = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600), loggedAt: Date.now() };
    await writeStoredSession(stored);
    const profile = await profileFor(data.user, data.access_token);
    if (profile.is_active === false) { await writeStoredSession(null); throw new Error('forbidden'); }
    return { ok: true, requiresConfirmation: false, session: sessionFrom(data.user, data.access_token, profile, stored) };
  } catch (error) { throw new Error(mapAuthError(error)); }
}

export function recoveryFromLocation() {
  const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken || params.get('type') !== 'recovery') return null;
  return {
    accessToken,
    refreshToken: params.get('refresh_token') || '',
    expiresAt: Number(params.get('expires_at') || 0),
  };
}

export async function updatePassword(accessToken, password) {
  if (!accessToken) throw new Error('recovery_expired');
  if (String(password || '').length < 8) throw new Error('password_short');
  try {
    const user = await supabaseRequest('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: String(password) }) }, accessToken);
    if (!user?.id) throw new Error('recovery_expired');
    return user;
  } catch (error) { throw new Error(mapAuthError(error)); }
}

export async function requestPasswordReset(value) {
  const email = await resolveLoginEmail(value);
  if (!email || !email.includes('@')) throw new Error('email_invalid');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  try {
    await supabaseRequest('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email, redirect_to: redirectTo }) });
  } catch (error) { throw new Error(mapAuthError(error)); }
}

export async function logout() { await writeStoredSession(null); }

export async function createUser({ username, password, role }, actor) {
  adminOnly(actor);
  const clean = cleanUsername(username);
  if (clean.length < 3 || clean.length > 40 || /\s/.test(clean)) throw new Error('username_invalid');
  if (String(password || '').length < 8) throw new Error('password_short');
  const existing = await profileByUsername(clean, actor.token);
  if (existing?.is_active === false && existing?.id) throw new Error('username_inactive');
  if (existing?.id) throw new Error('username_exists');
  const baseEmail = managedEmail(clean);
  const oldAccount = await profileByAuthEmail(baseEmail, actor.token);
  let email = oldAccount ? managedEmail(clean, `re${Date.now().toString(36)}`) : baseEmail;
  try {
    let data;
    try {
      data = await supabaseRequest('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password: String(password), data: { username: clean } }) });
    } catch (error) {
      if (!isDuplicateAuthError(error) || email !== baseEmail) throw error;
      email = managedEmail(clean, `re${Date.now().toString(36)}`);
      data = await supabaseRequest('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password: String(password), data: { username: clean } }) });
    }
    if (!data?.user) throw new Error('backend_unavailable');
    if (!data.access_token) throw new Error('email_confirmation_required');
    const updated = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(data.user.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ username: clean, auth_email: email, role: role === 'admin' ? 'admin' : 'guest', is_active: true }) }, actor.token);
    const profile = updated?.[0] || { id: data.user.id, username: clean, role: role === 'admin' ? 'admin' : 'guest', created_at: Date.now() };
    return { ...profile, createdAt: profile.created_at };
  } catch (error) { throw new Error(mapAuthError(error)); }
}

export async function removeUser(userId, actor) {
  adminOnly(actor);
  if (userId === actor.id) throw new Error('cannot_remove_self');
  const users = await loadUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) throw new Error('user_not_found');
  if (!target.is_active) return;
  if (target.role === 'admin' && !users.some((user) => user.id !== userId && user.role === 'admin' && user.is_active !== false)) throw new Error('last_admin');
  try { await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }, actor.token); } catch { throw new Error('backend_unavailable'); }
}

export async function updateUserRole(userId, role, actor) {
  adminOnly(actor);
  const users = await loadUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) throw new Error('user_not_found');
  const nextRole = role === 'admin' ? 'admin' : 'guest';
  if (target.role === 'admin' && nextRole === 'guest' && target.is_active !== false && !users.some((user) => user.id !== userId && user.role === 'admin' && user.is_active !== false)) throw new Error('last_admin');
  try { await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }, actor.token); } catch { throw new Error('backend_unavailable'); }
}

export async function updateUserAccess(userId, { isActive = true, role = 'guest' } = {}, actor) {
  adminOnly(actor);
  if (userId === actor.id && !isActive) throw new Error('cannot_remove_self');
  const users = await loadUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) throw new Error('user_not_found');
  const nextRole = role === 'admin' ? 'admin' : 'guest';
  const activeAdminExists = users.some((user) => user.id !== userId && user.role === 'admin' && user.is_active !== false);
  if (target.role === 'admin' && (!isActive || nextRole === 'guest') && !activeAdminExists) throw new Error('last_admin');
  try {
    await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole, is_active: Boolean(isActive) }) }, actor.token);
  } catch { throw new Error('backend_unavailable'); }
}

export async function deleteUser(userId, actor) {
  adminOnly(actor);
  if (userId === actor.id) throw new Error('cannot_remove_self');
  const users = await loadUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) throw new Error('user_not_found');
  if (target.role === 'admin' && target.is_active !== false && !users.some((user) => user.id !== userId && user.role === 'admin' && user.is_active !== false)) throw new Error('last_admin');
  try {
    await supabaseRequest('/rest/v1/rpc/delete_managed_user', { method: 'POST', body: JSON.stringify({ target_user_id: userId }) }, actor.token);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('last_admin')) throw new Error('last_admin');
    if (message.includes('cannot_remove_self')) throw new Error('cannot_remove_self');
    if (message.includes('user_not_found')) throw new Error('user_not_found');
    if (error?.status === 404 || message.includes('delete_managed_user')) throw new Error('delete_setup_required');
    throw new Error('backend_unavailable');
  }
}

export { isConfigured as backendEnabled };
