/*
  Облако (Firebase), лёгкая часть — без загрузки SDK.
  - Cloud.enabled: заполнены ли настройки FIREBASE в config.js
  - чтение открытых документов напрямую (выключенные секреты, расписание загадок) — раз за сессию
  - анонимные счётчики: +1 к полю, один раз на браузер
  - Cloud.ready(): подгружает SDK из vendor/ только когда он правда нужен (вход, сохранение, админка)
*/
(function () {
  'use strict';

  var CONFIG = window.CONFIG || {};
  var FB = CONFIG.FIREBASE || {};
  var SDK_URL = 'vendor/firebase-12.19.0.js';
  var PREFIX = 'zz:';

  function filled(v) { return typeof v === 'string' && v.trim() !== '' && v.indexOf('TODO') !== 0; }
  var enabled = filled(FB.apiKey) && filled(FB.projectId) && filled(FB.appId) && filled(FB.authDomain);

  function storage(kind) {
    return {
      get: function (key, fallback) {
        try {
          var raw = window[kind].getItem(PREFIX + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try {
          if (value === null || value === undefined) window[kind].removeItem(PREFIX + key);
          else window[kind].setItem(PREFIX + key, JSON.stringify(value));
        } catch (e) { /* хранилище недоступно */ }
      }
    };
  }
  var ls = storage('localStorage');
  var ss = storage('sessionStorage');

  // Локальный эмулятор Firebase — только для проверок на этом компьютере
  var emu = window.__ZZ_EMULATOR && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? window.__ZZ_EMULATOR : null;
  var REST = emu ? 'http://' + emu.host + ':' + emu.firestorePort + '/v1' : 'https://firestore.googleapis.com/v1';
  var DOCS = 'projects/' + FB.projectId + '/databases/(default)/documents';

  /* ---------- Чтение открытых документов без SDK ---------- */
  function decode(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
    if ('mapValue' in v) return decodeFields(v.mapValue.fields);
    return null;
  }
  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = decode(fields[k]); });
    return out;
  }

  // Читаем через batchGet: если документа нет, это обычный ответ, а не ошибка 404 в консоли
  function restGet(path) {
    if (!enabled || !window.fetch) return Promise.resolve(null);
    return fetch(REST + '/' + DOCS + ':batchGet?key=' + encodeURIComponent(FB.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: [DOCS + '/' + path] })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) {
        var item = Array.isArray(list) ? list[0] : null;
        return item && item.found ? decodeFields(item.found.fields) : null;
      })
      .catch(function () { return null; });
  }

  /* ---------- Анонимный счётчик: +1, один раз на браузер ---------- */
  function count(docPath, field, once) {
    if (!enabled || !window.fetch) return;
    if (once) {
      var done = ls.get('counted', {});
      if (done[once]) return;
      done[once] = 1;
      ls.set('counted', done);
    }
    var body = {
      writes: [{
        update: { name: DOCS + '/' + docPath, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }]
      }]
    };
    fetch(REST + '/' + DOCS + ':commit?key=' + encodeURIComponent(FB.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () { /* статистика приблизительная — промах не страшен */ });
  }

  /* ---------- Выключенные секреты (флаги из админки) ---------- */
  var ALL_SECRETS = Array.isArray(window.SECRETS) ? window.SECRETS.slice() : [];
  var isAdminPage = document.body && document.body.dataset.page === 'admin';

  function applyFlags(disabled) {
    if (!Array.isArray(window.SECRETS) || isAdminPage) return;
    var off = Array.isArray(disabled) ? disabled : [];
    // Меняем тот же массив, чтобы все, кто на него ссылается, увидели изменения
    window.SECRETS.length = 0;
    ALL_SECRETS.forEach(function (s) { if (off.indexOf(s.id) === -1) window.SECRETS.push(s); });
  }

  var cachedFlags = enabled ? ls.get('flags', null) : null;
  if (cachedFlags) applyFlags(cachedFlags.disabled);

  function refreshFlags() {
    if (!enabled || isAdminPage || ss.get('flags-checked', false)) return;
    ss.set('flags-checked', true);
    restGet('flags/secrets').then(function (doc) {
      var disabled = doc && Array.isArray(doc.disabled) ? doc.disabled : [];
      var before = JSON.stringify((cachedFlags && cachedFlags.disabled) || []);
      ls.set('flags', { disabled: disabled });
      if (JSON.stringify(disabled) === before) return;
      applyFlags(disabled);
      if (window.App) {
        window.App.updateCounters();
        document.dispatchEvent(new CustomEvent('secret:found', { detail: { id: null } }));
      }
    });
  }

  function idle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  }
  if (enabled) {
    if (document.readyState === 'complete') idle(refreshFlags);
    else window.addEventListener('load', function () { idle(refreshFlags); });
  }

  /* ---------- Расписание загадок: одна дата — один запрос за сессию ---------- */
  function schedule(date) {
    if (!enabled) return Promise.resolve(null);
    var cached = ss.get('sched:' + date, undefined);
    if (cached !== undefined) return Promise.resolve(cached);
    return restGet('schedule/' + date).then(function (doc) {
      var r = doc && typeof doc.q === 'string' && Array.isArray(doc.a) && doc.a.length
        ? { q: doc.q, a: doc.a.map(String), h: typeof doc.h === 'string' ? doc.h : '' }
        : null;
      ss.set('sched:' + date, r);
      return r;
    });
  }

  /* ---------- SDK — только по требованию ---------- */
  var sdk = null;
  function ready() {
    if (!enabled) return Promise.reject(new Error('firebase-off'));
    if (sdk) return sdk;
    sdk = new Promise(function (resolve, reject) {
      if (window.ZFirebase) { resolve(); return; }
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('sdk-load')); };
      document.head.appendChild(s);
    }).then(function () {
      var F = window.ZFirebase;
      var app = F.initializeApp({ apiKey: FB.apiKey, authDomain: FB.authDomain, projectId: FB.projectId, appId: FB.appId });
      var auth = F.getAuth(app);
      auth.languageCode = 'ru';
      var db = F.getFirestore(app);
      if (emu) {
        F.connectAuthEmulator(auth, 'http://' + emu.host + ':' + emu.authPort, { disableWarnings: true });
        F.connectFirestoreEmulator(db, emu.host, emu.firestorePort);
      }
      return { F: F, app: app, auth: auth, db: db };
    });
    sdk.catch(function () { sdk = null; });
    return sdk;
  }

  window.Cloud = {
    enabled: enabled,
    ls: ls,
    ss: ss,
    ready: ready,
    count: count,
    restGet: restGet,
    schedule: schedule,
    allSecrets: function () { return ALL_SECRETS.slice(); },
    signedIn: function () { return !!ls.get('account', null); }
  };
})();
