/* Админ-панель «Залипни»: статистика, идеи, расписание загадок, флаги секретов, удаление прогресса */
(function () {
  'use strict';

  var root = document.getElementById('admin');
  var Cloud = window.Cloud;
  var SECRETS = window.SECRETS || [];
  var QUIZ = (window.QUIZ && window.QUIZ.results) || {};
  var GAMES = { riddle: 'Загадка дня', quiz: 'Тест «Какая ты клавиша?»', excuse: 'Генератор оправданий', meme: 'Какой ты мем', reaction: 'Тест реакции', emoji: 'Угадай по эмодзи' };
  var DAY = 864e5;
  var ctx = null;
  var user = null;
  var tab = 'stats';

  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function show(html) { root.innerHTML = html; }
  function n(v) { return typeof v === 'number' ? v : 0; }
  function mskIso(offset) { return new Date((Math.floor((Date.now() + 3 * 3600e3) / DAY) + (offset || 0)) * DAY).toISOString().slice(0, 10); }
  function dayNumber(iso) { return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY) - Math.floor(Date.UTC(2026, 9, 1) / DAY) + 1; }
  function errText(e) {
    if (e && e.code === 'permission-denied') return 'Нет прав. Проверь, что твой UID вписан в правила и правила опубликованы.';
    return 'Ошибка: ' + h((e && (e.code || e.message)) || e);
  }

  if (!Cloud || !Cloud.enabled) {
    show('<h1>Админ-панель</h1><p class="note">Firebase ещё не настроен: заполни раздел FIREBASE в config.js.</p>');
    return;
  }

  show('<p>Загружаем…</p>');
  Cloud.ready().then(function (c) {
    ctx = c;
    c.F.onAuthStateChanged(c.auth, function (u) {
      user = u;
      if (!u) renderLogin();
      else checkAccess();
    });
  }, function () {
    show('<h1>Админ-панель</h1><p class="err">Не получилось загрузить Firebase. Проверь интернет и обнови страницу.</p>');
  });

  /* ---------- Вход ---------- */
  function renderLogin(msg) {
    show(
      '<h1>Админ-панель «Залипни»</h1>' +
      '<p class="muted">Только для владельца сайта.</p>' +
      '<p><button class="primary" type="button" data-login>Войти через Google</button></p>' +
      (msg ? '<p class="err">' + h(msg) + '</p>' : '')
    );
    root.querySelector('[data-login]').addEventListener('click', function () {
      var p = new ctx.F.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      ctx.F.signInWithPopup(ctx.auth, p).catch(function (e) {
        if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') renderLogin(errText(e));
      });
    });
  }

  function signOutButton() {
    return '<button type="button" data-signout>Выйти</button>';
  }

  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-signout]')) ctx.F.signOut(ctx.auth);
  });

  /* ---------- Проверка доступа ---------- */
  function checkAccess() {
    show('<p>Проверяем доступ…</p>');
    ctx.F.getDoc(ctx.F.doc(ctx.db, 'stats/secrets')).then(renderPanel, function (e) {
      if (e && e.code === 'permission-denied') renderNoAccess();
      else show('<p class="err">' + errText(e) + '</p>' + signOutButton());
    });
  }

  function renderNoAccess() {
    show(
      '<div class="top"><h1>Нет доступа</h1>' + signOutButton() + '</div>' +
      '<p>Вход выполнен' + (user.email ? ' (' + h(user.email) + ')' : '') + ', но этот аккаунт пока не админ.</p>' +
      '<p>Твой UID:</p>' +
      '<p><code data-uid>' + h(user.uid) + '</code> <button type="button" data-copy>Скопировать</button></p>' +
      '<p class="note">Чтобы стать админом: впиши этот UID в правила Firestore вместо <code>TODO_ADMIN_UID</code> ' +
      '(строка с <code>isAdmin</code>), опубликуй правила в консоли Firebase и обнови эту страницу.</p>' +
      '<p class="muted" data-copy-status></p>'
    );
    root.querySelector('[data-copy]').addEventListener('click', function () {
      var out = root.querySelector('[data-copy-status]');
      (navigator.clipboard ? navigator.clipboard.writeText(user.uid) : Promise.reject()).then(function () {
        out.textContent = 'UID скопирован.';
      }, function () { out.textContent = 'Не получилось скопировать — выдели UID вручную.'; });
    });
  }

  /* ---------- Панель ---------- */
  var TABS = [['stats', 'Статистика'], ['ideas', 'Идеи'], ['schedule', 'Загадки'], ['flags', 'Секреты'], ['users', 'Пользователи']];

  function renderPanel() {
    show(
      '<div class="top"><h1>Админ-панель</h1><div class="row-actions"><span class="muted">' + h(user.email || user.uid) + '</span>' + signOutButton() + '</div></div>' +
      '<nav class="tabs" role="tablist">' +
        TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join('') +
      '</nav>' +
      '<section data-section></section>'
    );
    root.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      openTab();
    });
    openTab();
  }

  function section() { return root.querySelector('[data-section]'); }

  function openTab() {
    section().innerHTML = '<p>Загружаем…</p>';
    ({ stats: loadStats, ideas: loadIdeas, schedule: loadSchedule, flags: loadFlags, users: renderUsers })[tab]();
  }

  /* ---------- 1. Статистика ---------- */
  function table(head, rows) {
    return '<div class="table-wrap"><table><thead><tr>' + head.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + '>' + h(c.t || c) + '</th>';
    }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="muted">Пока пусто</td></tr>') + '</tbody></table></div>';
  }

  function loadStats() {
    var F = ctx.F, db = ctx.db;
    var get = function (p) { return F.getDoc(F.doc(db, p)).then(function (s) { return s.exists() ? s.data() : {}; }); };
    // Последние 14 дней читаем по датам — так не нужен отдельный индекс в базе
    var days = [];
    for (var i = 0; i < 14; i++) days.push(mskIso(-i));
    Promise.all([
      get('stats/secrets'), get('stats/quiz'), get('stats/games'), get('stats/users'), get('flags/secrets'),
      Promise.all(days.map(function (d) { return get('stats/riddle/days/' + d).then(function (x) { return { id: d, data: x }; }); }))
    ]).then(function (r) {
      var secrets = r[0], quiz = r[1], games = r[2], users = r[3];
      var disabled = (r[4].disabled || []);
      var maxSecret = Math.max.apply(null, [1].concat(SECRETS.map(function (s) { return n(secrets[s.id]); })));
      var secretRows = SECRETS.slice().sort(function (a, b) { return n(secrets[b.id]) - n(secrets[a.id]); }).map(function (s) {
        var v = n(secrets[s.id]);
        var tag = disabled.indexOf(s.id) !== -1 ? '<span class="tag">выключен</span>' :
          v === 0 ? '<span class="tag warn">никто не нашёл</span>' :
          v < maxSecret * 0.15 ? '<span class="tag warn">находят редко</span>' : '';
        return '<tr><td>' + s.emoji + ' ' + h(s.name) + ' <span class="muted">' + h(s.id) + '</span></td>' +
          '<td class="num">' + v + '</td>' +
          '<td><span class="bar" style="width:' + Math.round((v / maxSecret) * 120) + 'px"></span> ' + tag + '</td></tr>';
      });
      var quizTotal = Object.keys(QUIZ).reduce(function (a, k) { return a + n(quiz[k]); }, 0) || 1;
      var quizRows = Object.keys(QUIZ).map(function (k) {
        return '<tr><td>' + QUIZ[k].emoji + ' ' + h(QUIZ[k].name) + '</td><td class="num">' + n(quiz[k]) + '</td><td class="num">' + Math.round((n(quiz[k]) / quizTotal) * 100) + '%</td></tr>';
      });
      var gameRows = Object.keys(GAMES).map(function (k) {
        return '<tr><td>' + h(GAMES[k]) + '</td><td class="num">' + n(games[k]) + '</td></tr>';
      });
      var dayRows = r[5].filter(function (d) { return Object.keys(d.data).length; }).map(function (d) {
        var x = d.data;
        var wins = n(x.win1) + n(x.win2) + n(x.win3) + n(x.win4);
        var all = wins + n(x.lose);
        return '<tr><td>' + h(d.id) + ' <span class="muted">№' + dayNumber(d.id) + '</span></td>' +
          '<td class="num">' + all + '</td><td class="num">' + wins + (all ? ' (' + Math.round((wins / all) * 100) + '%)' : '') + '</td>' +
          '<td class="num">' + n(x.win1) + ' / ' + n(x.win2) + ' / ' + n(x.win3) + ' / ' + n(x.win4) + '</td>' +
          '<td class="num">' + n(x.lose) + '</td><td class="num">' + n(x.hint) + '</td></tr>';
      });
      section().innerHTML =
        '<p class="note">Цифры приблизительные: один браузер считается один раз, люди с нескольких устройств и после очистки браузера считаются заново, защиты от накруток нет. Посещаемость смотри в Яндекс Метрике.</p>' +
        '<p><button type="button" data-refresh>Обновить</button></p>' +
        '<h2>Аккаунты</h2>' +
        table([{ t: 'Создано', num: true }, { t: 'Удалено', num: true }, { t: 'Сейчас примерно', num: true }],
          ['<tr><td class="num">' + n(users.created) + '</td><td class="num">' + n(users.deleted) + '</td><td class="num">' + Math.max(0, n(users.created) - n(users.deleted)) + '</td></tr>']) +
        '<h2>Секреты: сколько браузеров нашли</h2>' +
        table(['Секрет', { t: 'Нашли', num: true }, ''], secretRows) +
        '<div class="grid2"><div><h2>Тест «Какая ты клавиша?»</h2>' + table(['Результат', { t: 'Сколько', num: true }, { t: 'Доля', num: true }], quizRows) + '</div>' +
        '<div><h2>Игры: сколько браузеров попробовали</h2>' + table(['Раздел', { t: 'Сколько', num: true }], gameRows) + '</div></div>' +
        '<h2>Загадка дня (последние 14 дней)</h2>' +
        table(['День', { t: 'Сыграли', num: true }, { t: 'Отгадали', num: true }, { t: 'С 1 / 2 / 3 / 4 попытки', num: true }, { t: 'Не отгадали', num: true }, { t: 'Подсказка', num: true }], dayRows);
      section().querySelector('[data-refresh]').addEventListener('click', loadStats);
    }, function (e) { section().innerHTML = '<p class="err">' + errText(e) + '</p>'; });
  }

  /* ---------- 2. Идеи ---------- */
  function loadIdeas() {
    var F = ctx.F;
    F.getDocs(F.query(F.collection(ctx.db, 'ideas'), F.orderBy('createdAt', 'desc'), F.limit(100))).then(function (snap) {
      var items = snap.docs.map(function (d) {
        var x = d.data();
        var date = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toLocaleString('ru-RU') : '';
        return '<div class="idea' + (x.done ? ' done' : '') + '" data-id="' + h(d.id) + '">' +
          '<span class="muted">' + h(date) + (x.done ? ' · <span class="tag">сделано</span>' : '') + '</span>' +
          '<p>' + h(x.text) + '</p>' +
          '<div class="row-actions">' +
            '<button type="button" data-done="' + (x.done ? '0' : '1') + '">' + (x.done ? 'Вернуть в работу' : 'Сделано ✓') + '</button>' +
            '<button type="button" class="danger" data-del>Удалить</button>' +
          '</div></div>';
      });
      section().innerHTML =
        '<p class="muted">Последние 100 идей, новые сверху. Автор не показывается — только текст.</p>' +
        '<p><button type="button" data-refresh>Обновить</button></p>' +
        (items.length ? items.join('') : '<p class="muted">Идей пока нет.</p>') +
        '<p class="err" data-ideas-err></p>';
      section().querySelector('[data-refresh]').addEventListener('click', loadIdeas);
    }, function (e) { section().innerHTML = '<p class="err">' + errText(e) + '</p>'; });
  }

  root.addEventListener('click', function (e) {
    if (tab !== 'ideas') return;
    var card = e.target.closest('.idea');
    if (!card) return;
    var ref = ctx.F.doc(ctx.db, 'ideas', card.dataset.id);
    var fail = function (err) { var el = section().querySelector('[data-ideas-err]'); if (el) el.innerHTML = errText(err); };
    if (e.target.closest('[data-done]')) {
      ctx.F.updateDoc(ref, { done: e.target.closest('[data-done]').dataset.done === '1' }).then(loadIdeas, fail);
    } else if (e.target.closest('[data-del]') && window.confirm('Удалить идею навсегда?')) {
      ctx.F.deleteDoc(ref).then(loadIdeas, fail);
    }
  });

  /* ---------- 3. Расписание загадок ---------- */
  var scheduleCache = {};

  function builtinFor(iso) {
    if (!window.pickRiddle || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var num = dayNumber(iso);
    return num >= 1 ? window.pickRiddle(num) : null;
  }

  function loadSchedule() {
    var F = ctx.F;
    F.getDocs(F.query(F.collection(ctx.db, 'schedule'), F.orderBy(F.documentId()))).then(function (snap) {
      scheduleCache = {};
      var today = mskIso(0);
      var rows = snap.docs.map(function (d) {
        var x = d.data();
        scheduleCache[d.id] = x;
        var tag = d.id === today ? ' <span class="tag today">сегодня</span>' : d.id < today ? ' <span class="tag">прошла</span>' : '';
        return '<tr' + (d.id < today ? ' class="done"' : '') + '><td>' + h(d.id) + tag + '</td><td>' + h(x.q) + '</td><td>' + h((x.a || []).join(', ')) + '</td>' +
          '<td><div class="row-actions"><button type="button" data-edit="' + h(d.id) + '">Изменить</button>' +
          '<button type="button" class="danger" data-remove="' + h(d.id) + '">Удалить</button></div></td></tr>';
      });
      section().innerHTML =
        '<p class="muted">Здесь можно поставить свою загадку на любую дату. Если на дату ничего нет, сайт берёт встроенную. Будущие загадки посетители не видят до наступления дня (по Москве).</p>' +
        '<form class="box" data-sched-form>' +
          '<label for="s-date">Дата</label><input id="s-date" name="date" type="date" required value="' + mskIso(1) + '">' +
          '<p class="muted" data-builtin></p>' +
          '<label for="s-q">Загадка</label><textarea id="s-q" name="q" maxlength="400" required></textarea>' +
          '<label for="s-a">Правильные ответы через запятую (засчитывается любой)</label><input id="s-a" name="a" type="text" required>' +
          '<label for="s-h">Подсказка</label><input id="s-h" name="h" type="text" maxlength="200">' +
          '<div class="row-actions"><button class="primary" type="submit">Сохранить</button></div>' +
          '<p data-sched-status></p>' +
        '</form>' +
        '<h2>Запланировано</h2>' +
        table(['Дата', 'Загадка', 'Ответы', ''], rows);
      showBuiltin();
    }, function (e) { section().innerHTML = '<p class="err">' + errText(e) + '</p>'; });
  }

  function showBuiltin() {
    var form = section().querySelector('[data-sched-form]');
    if (!form) return;
    var iso = form.elements.date.value;
    var b = builtinFor(iso);
    form.querySelector('[data-builtin]').innerHTML = b
      ? 'Встроенная на эту дату (№' + dayNumber(iso) + '): «' + h(b.q) + '» — ответ: ' + h(b.a[0])
      : '';
  }

  root.addEventListener('input', function (e) {
    if (e.target.name === 'date' && e.target.closest('[data-sched-form]')) showBuiltin();
  });

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-sched-form]');
    if (!form) return;
    e.preventDefault();
    var out = form.querySelector('[data-sched-status]');
    var date = form.elements.date.value;
    var q = form.elements.q.value.trim();
    var a = form.elements.a.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var hint = form.elements.h.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { out.className = 'err'; out.textContent = 'Выбери дату.'; return; }
    if (q.length < 3) { out.className = 'err'; out.textContent = 'Напиши загадку.'; return; }
    if (!a.length || a.length > 10) { out.className = 'err'; out.textContent = 'Нужен хотя бы один ответ (максимум 10).'; return; }
    var F = ctx.F;
    F.setDoc(F.doc(ctx.db, 'schedule', date), { q: q, a: a, h: hint, updatedAt: F.serverTimestamp() }).then(function () {
      loadSchedule();
    }, function (err) { out.className = 'err'; out.innerHTML = errText(err); });
  });

  root.addEventListener('click', function (e) {
    if (tab !== 'schedule') return;
    var edit = e.target.closest('[data-edit]');
    var remove = e.target.closest('[data-remove]');
    if (edit) {
      var x = scheduleCache[edit.dataset.edit];
      var form = section().querySelector('[data-sched-form]');
      form.elements.date.value = edit.dataset.edit;
      form.elements.q.value = x.q || '';
      form.elements.a.value = (x.a || []).join(', ');
      form.elements.h.value = x.h || '';
      showBuiltin();
      form.scrollIntoView({ block: 'start' });
    }
    if (remove && window.confirm('Удалить загадку на ' + remove.dataset.remove + '? В этот день будет встроенная.')) {
      ctx.F.deleteDoc(ctx.F.doc(ctx.db, 'schedule', remove.dataset.remove)).then(loadSchedule, function (err) {
        section().insertAdjacentHTML('afterbegin', '<p class="err">' + errText(err) + '</p>');
      });
    }
  });

  /* ---------- 4. Секреты: включить и выключить ---------- */
  function loadFlags() {
    var F = ctx.F;
    F.getDoc(F.doc(ctx.db, 'flags/secrets')).then(function (snap) {
      var disabled = snap.exists() ? (snap.data().disabled || []) : [];
      section().innerHTML =
        '<p class="muted">Выключенный секрет нельзя найти, и он не считается в «Найдено X из N». Посетители увидят изменения со следующего захода на сайт.</p>' +
        '<form class="box" data-flags-form>' +
          SECRETS.map(function (s) {
            return '<label class="check-row"><input type="checkbox" name="on" value="' + h(s.id) + '"' + (disabled.indexOf(s.id) === -1 ? ' checked' : '') + '> ' +
              s.emoji + ' ' + h(s.name) + ' <span class="muted">' + h(s.id) + '</span></label>';
          }).join('') +
          '<div class="row-actions"><button class="primary" type="submit">Сохранить</button></div>' +
          '<p data-flags-status></p>' +
        '</form>';
    }, function (e) { section().innerHTML = '<p class="err">' + errText(e) + '</p>'; });
  }

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-flags-form]');
    if (!form) return;
    e.preventDefault();
    var out = form.querySelector('[data-flags-status]');
    var off = Array.prototype.filter.call(form.querySelectorAll('input[name=on]'), function (i) { return !i.checked; }).map(function (i) { return i.value; });
    var F = ctx.F;
    F.setDoc(F.doc(ctx.db, 'flags/secrets'), { disabled: off, updatedAt: F.serverTimestamp() }).then(function () {
      out.className = 'ok';
      out.textContent = off.length ? 'Сохранено. Выключено секретов: ' + off.length + '.' : 'Сохранено. Все секреты включены.';
    }, function (err) { out.className = 'err'; out.innerHTML = errText(err); });
  });

  /* ---------- 5. Пользователи: удалить прогресс по просьбе ---------- */
  function renderUsers() {
    section().innerHTML =
      '<p class="muted">Если человек просит удалить данные, попроси прислать его ID — он виден в окне «Аккаунт» на сайте.</p>' +
      '<form class="box" data-user-form>' +
        '<label for="u-id">ID пользователя (UID)</label>' +
        '<input id="u-id" name="uid" type="text" autocomplete="off" spellcheck="false" required>' +
        '<div class="row-actions"><button class="danger" type="submit">Удалить прогресс</button></div>' +
        '<p data-user-status></p>' +
      '</form>' +
      '<p class="note">Здесь удаляется облачный прогресс. Сам аккаунт входа (почта) удаляется в консоли Firebase: Authentication → Users → найти по UID → Delete account.</p>';
  }

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-user-form]');
    if (!form) return;
    e.preventDefault();
    var out = form.querySelector('[data-user-status]');
    var uid = form.elements.uid.value.trim();
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) { out.className = 'err'; out.textContent = 'Похоже, это не UID.'; return; }
    if (!window.confirm('Удалить облачный прогресс пользователя ' + uid + '? Отменить нельзя.')) return;
    ctx.F.deleteDoc(ctx.F.doc(ctx.db, 'users', uid)).then(function () {
      out.className = 'ok';
      out.textContent = 'Готово: прогресс удалён (если он был).';
      form.reset();
    }, function (err) { out.className = 'err'; out.innerHTML = errText(err); });
  });
})();
