(() => {
  if (window.miniappI18n?.t) {
    window.githubI18nReady = Promise.resolve();
    return;
  }

  let catalog = {};
  const readKey = (key) => String(key || '').split('.').reduce((value, part) => value && typeof value === 'object' ? value[part] : undefined, catalog);
  const translate = (key, values = {}) => {
    const source = readKey(key);
    if (typeof source !== 'string') return key;
    return source.replace(/\{(\w+)\}/g, (_, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : `{${name}}`);
  };

  window.miniappI18n = {
    t: translate,
    getContext: () => ({ resolvedLocale: 'tr', dir: 'ltr', availableLocales: ['tr'], canChangeLocale: false }),
    setLocale: async () => 'tr',
  };

  window.githubI18nReady = fetch(new URL('locales/tr.json', document.baseURI), { cache: 'no-cache' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(`locale_${response.status}`)))
    .then((data) => { catalog = data || {}; })
    .catch(() => { catalog = {}; });
})();
