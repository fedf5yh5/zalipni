/* Загадка дня: одна на всех, меняется в полночь по Москве */
(function () {
  'use strict';

  var App = window.App;
  var R = window.RIDDLES;
  var box = document.querySelector('[data-riddle]');
  if (!App || !R || !R.length || !box) return;

  var esc = App.esc;
  var MAX = 4;
  var MISS = ['Не-а. Попробуй ещё.', 'Холодно!', 'Мимо, но смело.', 'Хорошая версия, но нет.', 'Почти? Нет, не почти.'];
  var WIN = ['С первой попытки! Это было мощно.', 'Со второй попытки! Отлично.', 'С третьей попытки — всё равно победа.', 'На последней попытке! Нервы как сталь.'];
  var n, riddle, state, stats, timer;

  // Порядок загадок перемешан один раз и навсегда, чтобы они не шли подряд по списку
  function order() {
    var idx = R.map(function (_, i) { return i; });
    var seed = 20261001;
    for (var i = idx.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      var j = seed % (i + 1);
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx;
  }

  function norm(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function lev(a, b) {
    var m = a.length, k = b.length;
    var prev = [], cur = [];
    for (var j = 0; j <= k; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= k; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[k];
  }

  // Засчитываем и мелкие опечатки в длинных словах
  function isRight(guess) {
    var g = norm(guess);
    var gs = g.replace(/ /g, '');
    return riddle.a.some(function (ans) {
      var a = norm(ans);
      var as = a.replace(/ /g, '');
      if (g === a || gs === as) return true;
      return as.length >= 5 && lev(gs, as) <= 1;
    });
  }

  function load() {
    n = App.daily.number();
    riddle = R[order()[(n - 1) % R.length]];
    state = App.store.get('riddle', null);
    if (!state || state.n !== n) state = { n: n, guesses: [], solved: false, done: false, hint: false };
    stats = App.store.get('riddleStats', { played: 0, wins: 0, streak: 0, best: 0, lastWin: 0 });
    // Серия обнуляется, если пропущен день
    if (stats.streak && stats.lastWin < n - 1 && !(state.done && state.solved)) stats.streak = 0;
  }

  function save() {
    App.store.set('riddle', state);
    App.store.set('riddleStats', stats);
  }

  function squares() {
    var out = [];
    for (var i = 0; i < MAX; i++) {
      if (i < state.guesses.length) out.push(state.solved && i === state.guesses.length - 1 ? 'hit' : 'miss');
      else out.push('');
    }
    return out;
  }

  function shareText() {
    var sq = squares().map(function (s) { return s === 'hit' ? '🟩' : s === 'miss' ? '🟥' : '⬛'; }).join('');
    var line = state.solved ? 'Отгадано с ' + state.guesses.length + '-й попытки' : 'Не отгадано. Завтра — реванш';
    return 'Загадка дня №' + n + ' · ' + App.siteName() + '\n' + sq + (state.hint ? ' 💡' : '') + '\n' + line;
  }

  function countdown() {
    var ms = App.daily.msToNext();
    if (ms <= 0) { load(); render(); return; }
    var s = Math.floor(ms / 1000);
    var t = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(function (v) { return String(v).padStart(2, '0'); }).join(':');
    var el = box.querySelector('[data-riddle-timer]');
    if (el) el.textContent = t;
  }

  function render(msg, msgKind) {
    var sq = squares();
    var html =
      '<div class="riddle__top">' +
        '<span class="badge">Загадка №' + n + '</span>' +
        '<span class="riddle__date">' + App.daily.label() + '</span>' +
      '</div>' +
      '<p class="riddle__q">' + esc(riddle.q) + '</p>' +
      '<div class="riddle__tries" role="img" aria-label="Попыток использовано: ' + state.guesses.length + ' из ' + MAX + '">' +
        sq.map(function (s) { return '<i' + (s ? ' class="is-' + s + '"' : '') + '></i>'; }).join('') +
        '<span>' + (state.done ? '' : 'Осталось попыток: ' + (MAX - state.guesses.length)) + '</span>' +
      '</div>';

    if (state.hint || state.done) {
      html += '<p class="riddle__hint"><span aria-hidden="true">💡</span> ' + esc(riddle.h) + '</p>';
    }

    if (!state.done) {
      html +=
        '<form class="field-row riddle__form" data-riddle-form>' +
          '<label class="sr-only" for="riddle-answer">Твой ответ</label>' +
          '<input class="field" id="riddle-answer" name="answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" enterkeyhint="done" placeholder="Твой ответ">' +
          '<button class="btn" type="submit">Ответить</button>' +
        '</form>' +
        '<p class="riddle__msg' + (msgKind ? ' is-' + msgKind : '') + '" aria-live="polite">' + esc(msg || '') + '</p>' +
        (state.hint ? '' : '<button class="link-btn" type="button" data-riddle-hint>Взять подсказку</button>');
    } else {
      html +=
        '<div class="riddle__result">' +
          '<p class="riddle__verdict' + (state.solved ? ' is-win' : '') + '">' +
            esc(state.solved ? WIN[Math.min(state.guesses.length, MAX) - 1] : 'Не сегодня. Завтра будет новая.') +
          '</p>' +
          '<p class="riddle__answer">Ответ: <b>' + esc(riddle.a[0]) + '</b></p>' +
          '<pre class="riddle__share-preview" aria-label="Так будет выглядеть результат в сообщении">' + esc(shareText()) + '</pre>' +
          '<button class="btn" type="button" data-riddle-share>Поделиться результатом</button>' +
          '<dl class="stats">' +
            '<div><dt>Сыграно</dt><dd>' + stats.played + '</dd></div>' +
            '<div><dt>Отгадано</dt><dd>' + stats.wins + '</dd></div>' +
            '<div><dt>Серия</dt><dd>' + stats.streak + '</dd></div>' +
            '<div><dt>Рекорд серии</dt><dd>' + stats.best + '</dd></div>' +
          '</dl>' +
          '<p class="riddle__next">Новая загадка через <b data-riddle-timer>--:--:--</b></p>' +
        '</div>';
    }
    box.innerHTML = html;

    clearInterval(timer);
    if (state.done) {
      countdown();
      timer = setInterval(countdown, 1000);
    }
  }

  function finish(solved) {
    state.done = true;
    state.solved = solved;
    stats.played++;
    if (solved) {
      stats.wins++;
      stats.streak = stats.lastWin === n - 1 ? stats.streak + 1 : 1;
      stats.best = Math.max(stats.best, stats.streak);
      stats.lastWin = n;
      if (App.confetti) App.confetti({ count: 70 });
    } else {
      stats.streak = 0;
    }
  }

  box.addEventListener('submit', function (e) {
    if (!e.target.matches('[data-riddle-form]')) return;
    e.preventDefault();
    var input = e.target.elements.answer;
    var guess = input.value.trim();
    if (!guess) {
      render('Сначала напиши ответ — хотя бы одно слово.', 'miss');
      box.querySelector('#riddle-answer').focus();
      return;
    }
    App.markTried('riddle');
    if (state.guesses.some(function (g) { return norm(g) === norm(guess); })) {
      render('Этот вариант уже был. Попробуй другой.', 'miss');
      box.querySelector('#riddle-answer').focus();
      return;
    }
    state.guesses.push(guess);
    var msg;
    if (isRight(guess)) {
      finish(true);
    } else if (state.guesses.length >= MAX) {
      finish(false);
    } else {
      msg = MISS[(state.guesses.length - 1) % MISS.length] + (state.guesses.length === MAX - 1 ? ' Осталась последняя попытка!' : '');
    }
    save();
    render(msg, 'miss');
    var field = box.querySelector('#riddle-answer');
    if (field) field.focus();
  });

  box.addEventListener('click', function (e) {
    if (e.target.closest('[data-riddle-hint]')) {
      state.hint = true;
      save();
      render('Подсказка взята. В результате появится 💡.', '');
      var field = box.querySelector('#riddle-answer');
      if (field) field.focus();
    }
    if (e.target.closest('[data-riddle-share]')) {
      App.share({ title: 'Загадка дня', text: shareText(), url: App.pageUrl() });
    }
  });

  load();
  render();
})();
