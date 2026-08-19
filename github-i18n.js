(() => {
  const platform = window.miniappI18n || null;
  const platformTranslate = typeof platform?.t === 'function' ? platform.t.bind(platform) : null;
  const platformContext = typeof platform?.getContext === 'function' ? platform.getContext.bind(platform) : null;
  const platformSetLocale = typeof platform?.setLocale === 'function' ? platform.setLocale.bind(platform) : null;
  let catalog = {};

  const readKey = (key) => String(key || '').split('.').reduce((value, part) => value && typeof value === 'object' ? value[part] : undefined, catalog);
  const replaceValues = (value, values = {}) => String(value).replace(/\{(\w+)\}/g, (_, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : `{${name}}`);
  const localTranslate = (key, values = {}) => {
    const source = readKey(key);
    return typeof source === 'string' ? replaceValues(source, values) : String(key);
  };
  const usableTranslation = (value, key) => typeof value === 'string' && value.trim() && value !== key && !value.startsWith(`${key}.`);
  const translate = (key, values = {}) => {
    const normalizedKey = String(key || '');
    let remote = '';
    try { remote = platformTranslate ? platformTranslate(normalizedKey, values) : ''; } catch { remote = ''; }
    return usableTranslation(remote, normalizedKey) ? remote : localTranslate(normalizedKey, values);
  };

  const context = () => {
    try {
      const value = platformContext?.();
      if (value && typeof value === 'object') return value;
    } catch {}
    return { resolvedLocale: 'tr', dir: 'ltr', availableLocales: ['tr'], canChangeLocale: false };
  };

  window.miniappI18n = {
    ...(platform || {}),
    t: translate,
    getContext: context,
    setLocale: platformSetLocale || (async () => 'tr'),
  };

  const localeUrl = new URL(`locales/tr.json?v=${Date.now()}`, document.baseURI);
  window.githubI18nReady = fetch(localeUrl, { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(`locale_${response.status}`)))
    .then((data) => { catalog = data && typeof data === 'object' ? data : {}; })
    .catch(() => { catalog = {}; });
})();
