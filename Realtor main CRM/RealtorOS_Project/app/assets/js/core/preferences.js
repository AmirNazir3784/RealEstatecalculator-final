/* Non-sensitive device/account presentation preferences. No tokens or CRM
   records are stored here. Loaded before CSS to avoid an incorrect theme flash. */
window.App = window.App || {};
App.preferences = (function () {
  "use strict";
  const KEY = "realtorcrm.presentation.v1";
  const LANGUAGES = ["en", "de", "fr", "es", "it", "pt", "ar"];
  const THEMES = ["light", "dark", "system"];
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const browserLanguage = () => (navigator.languages || [navigator.language || "en"]).map(v => String(v).split(/[-_]/)[0].toLowerCase()).find(v => LANGUAGES.includes(v)) || "en";
  function normalize(value) {
    value = value && typeof value === "object" ? value : {};
    return { theme: THEMES.includes(value.theme) ? value.theme : "system", language: LANGUAGES.includes(value.language) ? value.language : browserLanguage(), manualLanguage: value.manualLanguage === true };
  }
  function read() { try { return JSON.parse(window.localStorage.getItem(KEY) || "null"); } catch (_) { return null; } }
  let current = normalize(read()), queue = Promise.resolve();
  const get = () => Object.assign({}, current);
  function apply() {
    const theme = current.theme === "system" ? media && media.matches ? "dark" : "light" : current.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.lang = current.language;
    document.documentElement.dir = current.language === "ar" ? "rtl" : "ltr";
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = theme;
    if (App.i18n) App.i18n.setLocale(current.language);
    window.dispatchEvent(new CustomEvent("realtorcrm:preferences", { detail: get() }));
  }
  function remember() { try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch (_) { /* Private browsing can still change appearance for this visit. */ } }
  function set(patch) {
    current = normalize(Object.assign({}, current, patch));
    if (patch && Object.hasOwn(patch, "language")) current.manualLanguage = true;
    remember(); apply();
    const user = App.cloud && App.cloud.getUser(), snapshot = get();
    if (!user) return Promise.resolve(snapshot);
    // Serialize saves and recheck identity: a delayed request must never write
    // the previous person's preferences into a newly signed-in account.
    queue = queue.catch(() => {}).then(async () => {
      const active = App.cloud.getUser();
      if (!active || active.id !== user.id) return snapshot;
      const result = await App.cloud.updateProfile({ crm_preferences: snapshot });
      if (result.error) throw result.error;
      return snapshot;
    });
    return queue;
  }
  function hydrate(user) {
    const saved = user && user.user_metadata && user.user_metadata.crm_preferences;
    if (saved && typeof saved === "object") { current = normalize(saved); remember(); }
    apply();
  }
  if (media) {
    const changed = () => { if (current.theme === "system") apply(); };
    if (media.addEventListener) media.addEventListener("change", changed);
    else if (media.addListener) media.addListener(changed);
  }
  window.addEventListener("storage", event => {
    if (event.key !== KEY) return;
    current = normalize(read()); apply();
  });
  apply();
  return { get, set, hydrate, apply, languages: LANGUAGES.slice(), themes: THEMES.slice() };
})();
