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
function isConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function adminOnly(actor) { if (!actor || actor.role !== 'admin') throw new Error('forbidden'); }
function mapAuthError(error) {
  const message = String(error?.message || error?.msg || '').toLowerCase();
  if (message.includes('already registered') || message.includes('already exists') || message.includes('duplicate') || error?.code === 'user_already_exists') return 'username_exists';
  if (message.includes('password') && (message.includes('6') || message.includes('short') || message.includes('weak'))) return 'password_short';
  if (message.includes('recovery_expired') || (message.includes('expired') || message.includes('invalid')) && message.includes('token')) return 'recovery_expired';
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
  const rows = await supabaseRequest(`/rest/v1/profiles?select=id,username,role,is_active,created_at&id=eq.${encodeURIComponent(user.id)}&limit=1`, {}, token);
  return rows?.[0] || { id: user.id, username: user.user_metadata?.username || user.email?.split('@')[0] || 'user', role: 'guest', is_active: true, created_at: Date.now() };
}
function sessionFrom(user, accessToken, profile, raw = {}) {
  return { id: user.id, username: cleanUsername(profile.username), role: profile.role === 'admin' ? 'admin' : 'guest', token: accessToken || '', supabase: true, email: user.email || '', loggedAt: raw.loggedAt || Date.now() };
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
    const rows = await supabaseRequest('/rest/v1/profiles?select=id,username,role,is_active,created_at&is_active=eq.true&order=created_at.asc', {}, actor.token);
    return (rows || []).map((user) => ({ ...user, createdAt: user.created_at }));
  } catch { throw new Error('backend_unavailable'); }
}

export async function restoreSession() {
  try { return await getCurrent(); } catch { return null; }
}

export async function authenticate(username, password) {
  if (!isConfigured()) return { ok: false, error: 'backend_unavailable' };
  try {
    const data = await supabaseRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: authEmail(username), password: String(password || '') }) });
    if (!data?.access_token || !data.user) return { ok: false, error: 'invalid_credentials' };
    const stored = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600), loggedAt: Date.now() };
    await writeStoredSession(stored);
    const profile = await profileFor(data.user, data.access_token);
    if (profile.is_active === false) { await writeStoredSession(null); return { ok: false, error: 'forbidden' }; }
    return { ok: true, session: sessionFrom(data.user, data.access_token, profile, stored) };
  } catch (error) { return { ok: false, error: mapAuthError(error) }; }
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
  const email = authEmail(value);
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
  try {
    const data = await supabaseRequest('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: authEmail(clean), password: String(password), data: { username: clean } }) });
    if (!data?.user) throw new Error('backend_unavailable');
    const updated = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(data.user.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ username: clean, role: role === 'admin' ? 'admin' : 'guest', is_active: true }) }, actor.token);
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
  if (target.role === 'admin' && !users.some((user) => user.id !== userId && user.role === 'admin')) throw new Error('last_admin');
  try { await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }, actor.token); } catch { throw new Error('backend_unavailable'); }
}

export async function updateUserRole(userId, role, actor) {
  adminOnly(actor);
  const users = await loadUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) throw new Error('user_not_found');
  const nextRole = role === 'admin' ? 'admin' : 'guest';
  if (target.role === 'admin' && nextRole === 'guest' && !users.some((user) => user.id !== userId && user.role === 'admin')) throw new Error('last_admin');
  try { await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }, actor.token); } catch { throw new Error('backend_unavailable'); }
}

export { isConfigured as backendEnabled };
