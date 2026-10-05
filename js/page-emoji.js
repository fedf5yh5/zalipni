/* «Угадай по эмодзи»: минута, четыре варианта, как можно больше правильных */
(function () {
  'use strict';

  var App = window.App;
  var P = window.EMOJI_PUZZLES;
  var box = document.querySelector('[data-emoji-game]');
  if (!App || !P || !box) return;

  var esc = App.esc;
  var ROUND = 60;
  var CAT = { proverb: 'Пословица', idiom: 'Выражение', phrase: 'Слово или фраза' };
  var deck = [];
  var cur = null;
  var score = 0;
  var answered = 0;
  var endAt = 0;
  var tick = null;
  var locked = false;
  var data = App.store.get('emoji', { best: 0, games: 0 });

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function word(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'загадку';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'загадки';
    return 'загадок';
  }

  function intro() {
    var best = box.querySelector('[data-emoji-best]');
    if (best && data.best) best.textContent = 'Твой рекорд: ' + data.best + ' ' + word(data.best) + ' за минуту.';
    box.querySelector('[data-emoji-start]').addEventListener('click', start);
  }

  function start() {
    deck = shuffle(P.slice());
    score = 0;
    answered = 0;
    endAt = Date.now() + ROUND * 1000;
    box.innerHTML =
      '<div class="eg__bar">' +
        '<span class="eg__score">Счёт: <b data-eg-score>0</b></span>' +
        '<span class="eg__time"><b data-eg-time>' + ROUND + '</b> сек</span>' +
      '</div>' +
      '<div class="eg__timeline" aria-hidden="true"><i data-eg-line></i></div>' +
      '<p class="eg__cat" data-eg-cat></p>' +
      '<p class="eg__emoji" data-eg-emoji role="img" aria-label="Загадка из эмодзи"></p>' +
      '<div class="eg__options" data-eg-options></div>';
    next();
    clearInterval(tick);
    tick = setInterval(update, 200);
    update();
  }

  function next() {
    if (!deck.length) deck = shuffle(P.slice());
    cur = deck.pop();
    var pool = shuffle(P.filter(function (p) { return p.c === cur.c && p.a !== cur.a; })).slice(0, 3);
    var opts = shuffle(pool.concat(cur));
    box.querySelector('[data-eg-cat]').textContent = CAT[cur.c] || '';
    box.querySelector('[data-eg-emoji]').textContent = cur.e;
    box.querySelector('[data-eg-options]').innerHTML = opts.map(function (o) {
      return '<button class="option" type="button" data-a="' + esc(o.a) + '">' + esc(o.a) + '</button>';
    }).join('');
    locked = false;
  }

  function update() {
    var left = Math.max(0, endAt - Date.now());
    var t = box.querySelector('[data-eg-time]');
    var line = box.querySelector('[data-eg-line]');
    if (t) t.textContent = Math.ceil(left / 1000);
    if (line) line.style.transform = 'scaleX(' + (left / (ROUND * 1000)) + ')';
    if (left <= 0) finish();
  }

  function choose(btn) {
    if (locked) return;
    locked = true;
    answered++;
    if (answered === 1) App.markTried('emoji');
    var right = btn.dataset.a === cur.a;
    box.querySelectorAll('[data-a]').forEach(function (b) {
      b.disabled = true;
      if (b.dataset.a === cur.a) b.classList.add('is-right');
    });
    if (right) {
      score++;
      box.querySelector('[data-eg-score]').textContent = score;
    } else {
      btn.classList.add('is-wrong');
    }
    setTimeout(function () {
      if (Date.now() < endAt) next();
    }, right ? 450 : 1100);
  }

  function finish() {
    clearInterval(tick);
    var record = score > data.best;
    if (record) data.best = score;
    data.games++;
    App.store.set('emoji', data);
    var verdict = score >= 15 ? 'Эмодзи — твой родной язык.' :
      score >= 10 ? 'Сильно! Ты явно много переписываешься.' :
      score >= 5 ? 'Неплохо. Ещё раунд — и будет рекорд.' :
      'Разминка засчитана. Попробуй ещё!';
    box.innerHTML =
      '<div class="eg__end">' +
        '<p class="quiz__step">Время вышло</p>' +
        '<p class="eg__final"><b>' + score + '</b> ' + word(score) + ' за минуту</p>' +
        '<p class="eg__verdict">' + (record && data.games > 1 ? 'Новый рекорд! ' : '') + verdict + '</p>' +
        '<p class="eg__best">Рекорд: ' + data.best + ' · Сыграно раундов: ' + data.games + '</p>' +
        '<p class="guest-hint" data-guest-hint hidden></p>' +
        '<div class="quiz-result__actions">' +
          '<button class="btn" type="button" data-emoji-again>Ещё раунд</button>' +
          '<button class="btn btn--ghost" type="button" data-emoji-share>Поделиться</button>' +
        '</div>' +
      '</div>';
    box.querySelector('[data-emoji-again]').addEventListener('click', start);
    box.querySelector('[data-emoji-share]').addEventListener('click', function () {
      App.share({
        title: 'Угадай по эмодзи',
        text: 'Отгадано ' + score + ' ' + word(score) + ' из эмодзи за минуту 🤔 Сможешь больше?',
        url: App.pageUrl()
      });
    });
  }

  box.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-a]');
    if (btn && !btn.disabled) choose(btn);
  });

  intro();
})();
