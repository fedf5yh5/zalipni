/*
  Необязательный аккаунт: вход, облачный прогресс, удаление, идеи.
  Работает, только если в config.js заполнены настройки FIREBASE.
  В облаке хранится только uid и прогресс — без имени, почты и фото.
*/
(function () {
  'use strict';

  var App = window.App;
  var Cloud = window.Cloud;
  if (!App || !Cloud || !Cloud.enabled) return;

  var esc = App.esc;
  var AGE = Number(App.CONFIG.AGE_MIN) || 14;
  var QUIZ_NAMES = { space: 'Пробел', enter: 'Enter', esc: 'Esc', caps: 'Caps Lock', undo: 'Ctrl+Z', f5: 'F5' };
  var SYNC_KEYS = ['secrets', 'tried', 'quiz', 'reaction', 'emoji', 'riddleStats', 'riddleSolved'];
  var ERRORS = {
    'auth/invalid-email': 'Похоже, в адресе почты опечатка.',
    'auth/missing-email': 'Впиши адрес почты.',
    'auth/missing-password': 'Впиши пароль.',
    'auth/weak-password': 'Пароль должен быть не короче 6 символов.',
    'auth/email-already-in-use': 'Эта почта уже зарегистрирована. Попробуй войти.',
    'auth/invalid-credential': 'Неверная почта или пароль.',
    'auth/wrong-password': 'Неверная почта или пароль.',
    'auth/user-not-found': 'Неверная почта или пароль.',
    'auth/invalid-login-credentials': 'Неверная почта или пароль.',
    'auth/too-many-requests': 'Слишком много попыток. Подожди немного и попробуй снова.',
    'auth/popup-blocked': 'Браузер заблокировал окно входа. Разреши всплывающие окна или войди через почту.',
    'auth/network-request-failed': 'Нет связи с интернетом. Проверь подключение.',
    'auth/operation-not-allowed': 'Этот способ входа пока выключен.',
    'auth/unauthorized-domain': 'Вход с этого адреса сайта пока не настроен.',
    'auth/user-disabled': 'Этот аккаунт отключён.',
    'auth/requires-recent-login': 'Для этого действия нужно войти ещё раз.',
    'sdk-load': 'Не получилось загрузить вход. Проверь интернет и попробуй ещё раз.'
  };
  var SILENT = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

  var ctx = null;        // { F, auth, db } после загрузки SDK
  var user = null;
  var booting = null;
  var dialog = null;
  var lastFocus = null;
  var reason = '';
  var mode = 'signin';   // вкладка формы почты: signin | signup
  var lastSynced = null;
  var syncTimer = null;
  var syncing = null;
  var deleting = false;

  function signedIn() { return Cloud.signedIn(); }
  function ageOk() { return !!Cloud.ls.get('age-ok', false); }

  /* ==========================================================================
     Загрузка SDK и состояние входа
     ========================================================================== */
  function boot() {
    if (booting) return booting;
    booting = Cloud.ready().then(function (c) {
      ctx = c;
      return new Promise(function (resolve) {
        var first = true;
        c.F.onAuthStateChanged(c.auth, function (u) {
          user = u;
          Cloud.ls.set('account', u ? { uid: u.uid } : null);
          if (!u) lastSynced = null;
          renderButton();
          fillHints();
          if (u) syncSoon(0);
          // Перерисовываем окно, только если меняется экран — чтобы не стереть то, что человек уже вписал
          if (dialog && dialog.open && !dialog.dataset.busy) {
            var target = u ? 'account' : 'guest';
            if (dialog.dataset.view !== target || target === 'account') render(target);
          }
          if (first) { first = false; resolve(); }
        });
      });
    });
    booting.catch(function () { booting = null; });
    return booting;
  }

  /* ==========================================================================
     Прогресс: локальный ↔ облачный
     ========================================================================== */
  function union(a, b, max) {
    var seen = {};
    (a || []).concat(b || []).forEach(function (v) { if (typeof v === 'string' && v.length <= 40) seen[v] = 1; });
    var out = Object.keys(seen).sort();
    return max ? out.slice(-max) : out;
  }
  function int(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : 0; }

  function readLocal() {
    var s = App.store;
    var tried = s.get('tried', {}) || {};
    var quiz = s.get('quiz', null);
    var reaction = s.get('reaction', null);
    var emoji = s.get('emoji', null);
    var rs = s.get('riddleStats', null) || {};
    return {
      secrets: Object.keys(s.get('secrets', {}) || {}).sort(),
      tried: Object.keys(tried).filter(function (k) { return tried[k]; }).sort(),
      quiz: quiz && QUIZ_NAMES[quiz.key] ? quiz.key : null,
      reactionBest: reaction && int(reaction.best) ? int(reaction.best) : null,
      emojiBest: emoji ? int(emoji.best) : 0,
      riddleStreak: int(rs.streak),
      riddleBest: int(rs.best),
      riddleSolved: union(s.get('riddleSolved', []), [], 400)
    };
  }

  function fromCloud(d) {
    d = d || {};
    return {
      secrets: union(d.secrets, [], 50),
      tried: union(d.tried, [], 20),
      quiz: typeof d.quiz === 'string' && QUIZ_NAMES[d.quiz] ? d.quiz : null,
      reactionBest: int(d.reactionBest) || null,
      emojiBest: int(d.emojiBest),
      riddleStreak: int(d.riddleStreak),
      riddleBest: int(d.riddleBest),
      riddleSolved: union(d.riddleSolved, [], 400)
    };
  }

  // Ничего не теряется: секреты объединяем, рекорды берём лучшие, серию — большую
  function merge(a, b) {
    var r = [a.reactionBest, b.reactionBest].filter(Boolean);
    return {
      secrets: union(a.secrets, b.secrets, 50),
      tried: union(a.tried, b.tried, 20),
      quiz: a.quiz || b.quiz || null,
      reactionBest: r.length ? Math.min.apply(null, r) : null,
      emojiBest: Math.max(a.emojiBest, b.emojiBest),
      riddleStreak: Math.max(a.riddleStreak, b.riddleStreak),
      riddleBest: Math.max(a.riddleBest, b.riddleBest, a.riddleStreak, b.riddleStreak),
      riddleSolved: union(a.riddleSolved, b.riddleSolved, 400)
    };
  }

  // Переносим объединённый прогресс в этот браузер, не трогая то, что хранится только тут
  function writeLocal(m) {
    var s = App.store;
    var changed = false;

    var sec = s.get('secrets', {}) || {};
    var newSecrets = m.secrets.filter(function (id) { return !sec[id]; });
    if (newSecrets.length) {
      newSecrets.forEach(function (id) { sec[id] = Date.now(); });
      s.set('secrets', sec);
      changed = true;
    }

    var tried = s.get('tried', {}) || {};
    var newTried = m.tried.filter(function (id) { return !tried[id]; });
    if (newTried.length) {
      newTried.forEach(function (id) { tried[id] = true; });
      s.set('tried', tried);
      changed = true;
    }

    if (m.quiz && !s.get('quiz', null)) {
      s.set('quiz', { key: m.quiz, name: QUIZ_NAMES[m.quiz], at: Date.now() });
      changed = true;
    }

    var reaction = s.get('reaction', null) || { best: 0, recent: [], count: 0 };
    if (m.reactionBest && (!reaction.best || m.reactionBest < reaction.best)) {
      reaction.best = m.reactionBest;
      s.set('reaction', reaction);
      changed = true;
    }

    var emoji = s.get('emoji', null) || { best: 0, games: 0 };
    if (m.emojiBest > (emoji.best || 0)) {
      emoji.best = m.emojiBest;
      s.set('emoji', emoji);
      changed = true;
    }

    var solved = s.get('riddleSolved', []) || [];
    if (m.riddleSolved.length !== solved.length || m.riddleSolved.some(function (d) { return solved.indexOf(d) === -1; })) {
      s.set('riddleSolved', m.riddleSolved);
      changed = true;
    }

    var rs = s.get('riddleStats', null) || { played: 0, wins: 0, streak: 0, best: 0, lastWin: 0 };
    var lastDay = m.riddleSolved.length ? m.riddleSolved[m.riddleSolved.length - 1] : '';
    var lastWin = lastDay ? Date.UTC(+lastDay.slice(0, 4), +lastDay.slice(5, 7) - 1, +lastDay.slice(8, 10)) / 864e5 - (App.daily.day() - App.daily.number()) : 0;
    var next = {
      played: Math.max(rs.played || 0, m.riddleSolved.length),
      wins: Math.max(rs.wins || 0, m.riddleSolved.length),
      streak: Math.max(rs.streak || 0, m.riddleStreak),
      best: Math.max(rs.best || 0, m.riddleBest),
      lastWin: Math.max(rs.lastWin || 0, lastWin)
    };
    if (JSON.stringify(next) !== JSON.stringify({ played: rs.played || 0, wins: rs.wins || 0, streak: rs.streak || 0, best: rs.best || 0, lastWin: rs.lastWin || 0 })) {
      s.set('riddleStats', next);
      changed = true;
    }

    if (changed) {
      App.updateCounters();
      document.dispatchEvent(new CustomEvent('secret:found', { detail: { id: null } }));
      document.dispatchEvent(new CustomEvent('progress:synced'));
    }
    return changed;
  }

  function sync() {
    if (!user || deleting) return Promise.resolve();
    if (syncing) return syncing;
    var F = ctx.F;
    var uid = user.uid;
    var ref = F.doc(ctx.db, 'users', uid);
    syncing = F.getDoc(ref).then(function (snap) {
      var cloud = snap.exists() ? fromCloud(snap.data()) : null;
      var merged = merge(readLocal(), cloud || fromCloud({}));
      var pulled = writeLocal(merged);
      var json = JSON.stringify(merged);
      lastSynced = json;
      if (cloud && JSON.stringify(cloud) === json) return pulled;
      var data = JSON.parse(json);
      data.updatedAt = F.serverTimestamp();
      return F.setDoc(ref, data).then(function () {
        // Первый вход: прогресс гостя перенесён в аккаунт
        if (!cloud) Cloud.count('stats/users', 'created', 'user-created:' + uid);
        return pulled;
      });
    }).then(function (pulled) {
      if (pulled && !Cloud.ss.get('synced-toast', false)) {
        Cloud.ss.set('synced-toast', true);
        App.toast('Прогресс подтянут из облака', { icon: '☁️', text: 'Секреты и рекорды с других устройств теперь здесь.' });
      }
    }, function () { lastSynced = null; }).then(function () { syncing = null; });
    return syncing;
  }

  // Сохраняем с задержкой и только если что-то правда поменялось
  function syncSoon(delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      if (!signedIn() || deleting) return;
      if (lastSynced && JSON.stringify(readLocal()) === lastSynced) return;
      boot().then(function () { return user ? sync() : null; });
    }, delay === undefined ? 2500 : delay);
  }

  document.addEventListener('store:change', function (e) {
    if (signedIn() && SYNC_KEYS.indexOf(e.detail && e.detail.key) !== -1) syncSoon();
  });

  /* ==========================================================================
     Кнопка в шапке и мягкие подсказки
     ========================================================================== */
  function renderButton() {
    var slot = document.querySelector('[data-account-slot]');
    if (!slot) return;
    var on = signedIn();
    slot.innerHTML =
      '<button class="account-btn' + (on ? ' is-on' : '') + '" type="button" data-account-open aria-haspopup="dialog">' +
        '<span class="account-btn__icon" aria-hidden="true">' + (on ? '☁️' : '👤') + '</span>' +
        '<span class="account-btn__label">' + (on ? 'Аккаунт' : 'Войти') + '</span>' +
      '</button>';
  }

  function fillHints() {
    var state = signedIn() ? 'user' : 'guest';
    document.querySelectorAll('[data-guest-hint]').forEach(function (el) {
      if (el.dataset.hintState === state) return;
      el.dataset.hintState = state;
      el.hidden = state === 'user';
      el.innerHTML = state === 'user' ? '' :
        '<span aria-hidden="true">☁️</span> Прогресс хранится только в этом браузере. ' +
        '<button class="link-btn" type="button" data-account-open>Войди</button>, чтобы он не потерялся.';
    });
  }

  /* ==========================================================================
     Окно входа и аккаунта (закрывается крестиком, по Esc и кликом мимо)
     ========================================================================== */
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.setAttribute('aria-labelledby', 'modal-title');
    dialog.innerHTML =
      '<div class="modal__box">' +
        '<button class="modal__close" type="button" data-modal-close aria-label="Закрыть">×</button>' +
        '<div class="modal__body" data-modal-body></div>' +
      '</div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('submit', onSubmit);
    dialog.addEventListener('change', function (e) {
      if (e.target.matches('[data-age]')) Cloud.ls.set('age-ok', e.target.checked || null);
    });
    return dialog;
  }

  function open(opts) {
    reason = (opts && opts.reason) || '';
    ensureDialog();
    if (!dialog.open) {
      lastFocus = document.activeElement;
      App.lockScroll();
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    render(signedIn() ? 'account' : 'guest');
    // Готовим вход заранее, пока человек читает окно
    boot().then(function () {
      if (dialog.open && !dialog.dataset.busy && dialog.dataset.view === 'account') render(user ? 'account' : 'guest');
    }, function (err) { status(errorText(err), 'error'); });
  }

  function close() {
    if (!dialog || !dialog.open) return;
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
    App.unlockScroll();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function body() { return dialog.querySelector('[data-modal-body]'); }

  function status(text, kind) {
    var el = dialog && dialog.querySelector('[data-modal-status]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'modal__status' + (kind ? ' is-' + kind : '');
  }

  function busy(on) {
    if (!dialog) return;
    if (on) dialog.dataset.busy = '1';
    else delete dialog.dataset.busy;
    dialog.querySelectorAll('button:not([data-modal-close]), input').forEach(function (el) { el.disabled = !!on; });
  }

  function errorText(err) {
    var code = (err && err.code) || (err && err.message) || '';
    if (SILENT.indexOf(code) !== -1) return '';
    return ERRORS[code] || 'Что-то пошло не так. Попробуй ещё раз.';
  }

  function render(view) {
    view = view || (user || signedIn() ? 'account' : 'guest');
    if (view === 'account' && !user && ctx) view = 'guest';
    dialog.dataset.view = view;
    var html = '';

    if (view === 'guest') {
      html =
        '<h2 class="modal__title" id="modal-title">Вход</h2>' +
        (reason === 'idea' ? '<p class="modal__note">Чтобы отправить идею, войди — так мы защищаемся от спама.</p>' : '') +
        '<p class="modal__text">Аккаунт нужен, только чтобы прогресс не потерялся и был на всех твоих устройствах. Играть можно и без него.</p>' +
        '<label class="check"><input type="checkbox" data-age' + (ageOk() ? ' checked' : '') + '> <span>Мне исполнилось ' + AGE + ' лет</span></label>' +
        '<p class="modal__small">Создавая аккаунт, ты соглашаешься с <a href="privacy.html">политикой конфиденциальности</a>. Мы не храним имя и фото — только прогресс.</p>' +
        '<button class="btn btn--block modal__google" type="button" data-google><span aria-hidden="true">G</span> Войти через Google</button>' +
        '<p class="modal__or"><span>или почта и пароль</span></p>' +
        '<div class="tabs" role="tablist">' +
          '<button class="tabs__btn' + (mode === 'signin' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (mode === 'signin') + '" data-mode="signin">Вход</button>' +
          '<button class="tabs__btn' + (mode === 'signup' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (mode === 'signup') + '" data-mode="signup">Регистрация</button>' +
        '</div>' +
        '<form class="modal__form" data-email-form novalidate>' +
          '<label class="modal__label" for="acc-email">Почта</label>' +
          '<input class="field" id="acc-email" name="email" type="email" autocomplete="email" inputmode="email" required>' +
          '<label class="modal__label" for="acc-pass">Пароль' + (mode === 'signup' ? ' (от 6 символов)' : '') + '</label>' +
          '<input class="field" id="acc-pass" name="password" type="password" minlength="6" autocomplete="' + (mode === 'signup' ? 'new-password' : 'current-password') + '" required>' +
          '<button class="btn btn--block" type="submit">' + (mode === 'signup' ? 'Создать аккаунт' : 'Войти') + '</button>' +
        '</form>' +
        (mode === 'signin' ? '<button class="link-btn" type="button" data-reset>Не помню пароль</button>' : '');
    }

    if (view === 'account') {
      var u = user;
      var password = u && u.providerData.some(function (p) { return p.providerId === 'password'; });
      html =
        '<h2 class="modal__title" id="modal-title">Аккаунт</h2>' +
        (u ? '<p class="modal__text">Вход выполнен' + (u.email ? ': <b>' + esc(u.email) + '</b>' : '') + '. Прогресс сохраняется в облаке и появится на любом устройстве, где ты войдёшь.</p>'
           : '<p class="modal__text">Загружаем аккаунт…</p>') +
        (u && password && !u.emailVerified
          ? '<div class="modal__warn"><p>Подтверди почту: мы отправили письмо со ссылкой. Без подтверждения нельзя отправлять идеи.</p>' +
              '<div class="modal__row"><button class="btn btn--ghost" type="button" data-verify-send>Отправить письмо ещё раз</button>' +
              '<button class="btn btn--ghost" type="button" data-verify-check>Проверить</button></div></div>'
          : '') +
        (reason === 'idea' && u ? '<button class="btn btn--block" type="button" data-to-idea>Написать идею</button>' : '') +
        (u ? '<p class="modal__small">Твой ID (пригодится, если напишешь нам про удаление данных): <code data-uid>' + esc(u.uid) + '</code> ' +
             '<button class="link-btn" type="button" data-copy-uid>Скопировать</button></p>' : '') +
        '<div class="modal__row">' +
          '<button class="btn btn--ghost" type="button" data-signout' + (u ? '' : ' disabled') + '>Выйти</button>' +
        '</div>' +
        '<div class="modal__danger">' +
          '<button class="link-btn link-btn--danger" type="button" data-delete-ask' + (u ? '' : ' disabled') + '>Удалить аккаунт и все данные</button>' +
        '</div>';
    }

    if (view === 'delete') {
      html =
        '<h2 class="modal__title" id="modal-title">Удалить аккаунт?</h2>' +
        '<p class="modal__text">Удалятся облачный прогресс, сам аккаунт и прогресс в этом браузере: секреты, рекорды, серия загадок. Отменить это нельзя.</p>' +
        '<div class="modal__row">' +
          '<button class="btn btn--danger" type="button" data-delete-confirm>Да, удалить всё</button>' +
          '<button class="btn btn--ghost" type="button" data-back-account>Отмена</button>' +
        '</div>';
    }

    if (view === 'reauth') {
      var isPassword = user && user.providerData.some(function (p) { return p.providerId === 'password'; });
      html =
        '<h2 class="modal__title" id="modal-title">Подтверди, что это ты</h2>' +
        '<p class="modal__text">Для удаления аккаунта нужно войти ещё раз — это защита от чужих рук.</p>' +
        (isPassword
          ? '<form class="modal__form" data-reauth-form novalidate>' +
              '<label class="modal__label" for="acc-repass">Пароль</label>' +
              '<input class="field" id="acc-repass" name="password" type="password" autocomplete="current-password" required>' +
              '<button class="btn btn--danger btn--block" type="submit">Подтвердить и удалить</button>' +
            '</form>'
          : '<button class="btn btn--danger btn--block" type="button" data-reauth-google>Подтвердить через Google и удалить</button>') +
        '<button class="link-btn" type="button" data-back-account>Отмена</button>';
    }

    body().innerHTML = html + '<p class="modal__status" data-modal-status aria-live="polite"></p>';
    var first = dialog.querySelector('.modal__body input:not([type=checkbox]), .modal__body button');
    if (view !== 'guest' && first) first.focus({ preventScroll: true });
  }

  /* ---------- Действия ---------- */
  function afterSignIn() {
    busy(false);
    App.toast('Вход выполнен', { icon: '☁️', text: 'Прогресс теперь хранится в облаке.' });
    if (reason === 'idea') {
      close();
      openIdeaForm();
      return;
    }
    render('account');
  }

  function fail(err) {
    busy(false);
    status(errorText(err), 'error');
  }

  function google() {
    if (!ageOk()) { status('Отметь, что тебе исполнилось ' + AGE + ' лет.', 'error'); return; }
    busy(true);
    boot().then(function () {
      var provider = new ctx.F.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return ctx.F.signInWithPopup(ctx.auth, provider);
    }).then(afterSignIn, fail);
  }

  function emailSubmit(form) {
    var email = form.elements.email.value.trim();
    var pass = form.elements.password.value;
    if (!email) { status('Впиши адрес почты.', 'error'); return; }
    if (pass.length < 6) { status('Пароль должен быть не короче 6 символов.', 'error'); return; }
    if (mode === 'signup' && !ageOk()) { status('Отметь, что тебе исполнилось ' + AGE + ' лет.', 'error'); return; }
    busy(true);
    boot().then(function () {
      if (mode === 'signin') return ctx.F.signInWithEmailAndPassword(ctx.auth, email, pass).then(afterSignIn);
      return ctx.F.createUserWithEmailAndPassword(ctx.auth, email, pass).then(function (cred) {
        return ctx.F.sendEmailVerification(cred.user).catch(function () {});
      }).then(function () {
        busy(false);
        render('account');
        status('Аккаунт создан! Мы отправили письмо — подтверди почту по ссылке из него.', 'ok');
      });
    }).catch(fail);
  }

  function resetPassword() {
    var input = dialog.querySelector('#acc-email');
    var email = input ? input.value.trim() : '';
    if (!email) { status('Впиши почту выше — пришлём ссылку для нового пароля.', 'error'); if (input) input.focus(); return; }
    busy(true);
    boot().then(function () { return ctx.F.sendPasswordResetEmail(ctx.auth, email); }).then(function () {
      busy(false);
      status('Если такая почта зарегистрирована, письмо уже летит. Загляни и в «Спам».', 'ok');
    }, fail);
  }

  function signOut() {
    busy(true);
    boot().then(function () { return ctx.F.signOut(ctx.auth); }).then(function () {
      busy(false);
      Cloud.ss.set('synced-toast', null);
      render('guest');
      status('Выход выполнен. Прогресс остался в этом браузере.', 'ok');
    }, fail);
  }

  function wipeLocal() {
    SYNC_KEYS.concat('riddle').forEach(function (k) { App.store.remove(k); });
    App.updateCounters();
  }

  function deleteAccount() {
    if (!user) return;
    var uid = user.uid;
    deleting = true;
    clearTimeout(syncTimer);
    busy(true);
    ctx.F.deleteDoc(ctx.F.doc(ctx.db, 'users', uid))
      .then(function () { return ctx.F.deleteUser(user); })
      .then(function () {
        Cloud.count('stats/users', 'deleted', 'user-deleted:' + uid);
        wipeLocal();
        Cloud.ls.set('account', null);
        deleting = false;
        busy(false);
        close();
        App.toast('Аккаунт и все данные удалены', { icon: '🗑️', text: 'Можно играть дальше как гость.' });
        setTimeout(function () { location.reload(); }, 1600);
      }, function (err) {
        deleting = false;
        busy(false);
        if (err && err.code === 'auth/requires-recent-login') render('reauth');
        else status(errorText(err), 'error');
      });
  }

  function reauthAndDelete(password) {
    busy(true);
    var F = ctx.F;
    var step = password
      ? F.reauthenticateWithCredential(user, F.EmailAuthProvider.credential(user.email, password))
      : F.reauthenticateWithPopup(user, new F.GoogleAuthProvider());
    step.then(function () { busy(false); deleteAccount(); }, fail);
  }

  function onClick(e) {
    var t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.matches('[data-modal-close]')) close();
    else if (t.matches('[data-google]')) google();
    else if (t.matches('[data-mode]')) { mode = t.dataset.mode; render('guest'); dialog.querySelector('[data-mode="' + mode + '"]').focus(); }
    else if (t.matches('[data-reset]')) resetPassword();
    else if (t.matches('[data-signout]')) signOut();
    else if (t.matches('[data-delete-ask]')) render('delete');
    else if (t.matches('[data-back-account]')) render('account');
    else if (t.matches('[data-delete-confirm]')) deleteAccount();
    else if (t.matches('[data-reauth-google]')) reauthAndDelete(null);
    else if (t.matches('[data-to-idea]')) { close(); openIdeaForm(); }
    else if (t.matches('[data-copy-uid]')) {
      App.copyText(user.uid).then(function (ok) { status(ok ? 'ID скопирован.' : 'Не получилось скопировать — выдели ID вручную.', ok ? 'ok' : 'error'); });
    } else if (t.matches('[data-verify-send]')) {
      busy(true);
      ctx.F.sendEmailVerification(user).then(function () { busy(false); render('account'); status('Письмо отправлено ещё раз.', 'ok'); }, fail);
    } else if (t.matches('[data-verify-check]')) {
      busy(true);
      ctx.F.reload(user).then(function () { return user.getIdToken(true); }).then(function () {
        busy(false);
        render('account');
        status(user.emailVerified ? 'Почта подтверждена. Спасибо!' : 'Пока не подтверждена. Открой ссылку из письма и нажми «Проверить» ещё раз.', user.emailVerified ? 'ok' : 'error');
      }, fail);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (e.target.matches('[data-email-form]')) emailSubmit(e.target);
    if (e.target.matches('[data-reauth-form]')) reauthAndDelete(e.target.elements.password.value);
  }

  /* ==========================================================================
     Идеи: короткая форма только для вошедших (защита от спама)
     ========================================================================== */
  function ideaParts() {
    return {
      toggle: document.querySelector('[data-idea-toggle]'),
      form: document.querySelector('[data-idea-form]')
    };
  }

  function openIdeaForm() {
    var p = ideaParts();
    if (!p.form) return;
    p.form.hidden = false;
    p.toggle.setAttribute('aria-expanded', 'true');
    p.form.scrollIntoView({ block: 'center' });
    p.form.querySelector('textarea').focus({ preventScroll: true });
  }

  function setupIdeas() {
    var p = ideaParts();
    if (!p.toggle || !p.form) return;
    var text = p.form.querySelector('textarea');
    var counter = p.form.querySelector('[data-idea-count]');
    var out = p.form.querySelector('[data-idea-status]');
    var say = function (msg, kind) { out.textContent = msg; out.className = 'idea-form__status' + (kind ? ' is-' + kind : ''); };

    p.toggle.addEventListener('click', function () {
      if (!signedIn()) { open({ reason: 'idea' }); return; }
      if (p.form.hidden) openIdeaForm();
      else { p.form.hidden = true; p.toggle.setAttribute('aria-expanded', 'false'); }
    });
    text.addEventListener('input', function () { counter.textContent = text.value.length + ' / 300'; });

    p.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = text.value.trim();
      if (value.length < 3) { say('Напиши хотя бы пару слов.', 'error'); return; }
      if (value.length > 300) { say('Максимум 300 символов.', 'error'); return; }
      var last = Cloud.ls.get('idea-at', 0);
      if (Date.now() - last < 60000) { say('Одна идея в минуту — подожди немного.', 'error'); return; }
      var btn = p.form.querySelector('button[type=submit]');
      btn.disabled = true;
      say('Отправляем…');
      boot().then(function () {
        if (!user) { btn.disabled = false; say(''); open({ reason: 'idea' }); return null; }
        var password = user.providerData.some(function (x) { return x.providerId === 'password'; });
        if (password && !user.emailVerified) {
          btn.disabled = false;
          say('Сначала подтверди почту по ссылке из письма. Подробности — в «Аккаунте».', 'error');
          return null;
        }
        var F = ctx.F;
        return F.addDoc(F.collection(ctx.db, 'ideas'), { text: value, uid: user.uid, createdAt: F.serverTimestamp() }).then(function () {
          Cloud.ls.set('idea-at', Date.now());
          text.value = '';
          counter.textContent = '0 / 300';
          btn.disabled = false;
          say('Спасибо! Идея улетела 🚀', 'ok');
        });
      }).catch(function (err) {
        btn.disabled = false;
        say(err && err.code === 'permission-denied' ? 'Не получилось отправить. Проверь, что почта подтверждена.' : 'Не получилось отправить. Попробуй ещё раз.', 'error');
      });
    });
  }

  /* ==========================================================================
     Запуск
     ========================================================================== */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-account-open]');
    if (t) open();
  });

  renderButton();
  fillHints();
  setupIdeas();
  // Новые подсказки появляются на страницах игр после результата
  new MutationObserver(function (list) {
    if (list.some(function (m) { return m.addedNodes.length; })) fillHints();
  }).observe(document.body, { childList: true, subtree: true });

  // Вошедший раньше: раз за сессию подтягиваем облако (в фоне, когда страница уже показана)
  var acc = Cloud.ls.get('account', null);
  if (acc && Cloud.ss.get('pulled', null) !== acc.uid) {
    var go = function () {
      Cloud.ss.set('pulled', acc.uid);
      boot().catch(function () {});
    };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1500);
  }

  App.account = { open: open, close: close, signedIn: signedIn };
})();
