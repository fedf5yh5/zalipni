/* Тест «Какая ты клавиша?»: вопросы, подсчёт, карточка результата на canvas */
(function () {
  'use strict';

  var App = window.App;
  var Q = window.QUIZ;
  var box = document.querySelector('[data-quiz]');
  if (!App || !Q || !box) return;

  var esc = App.esc;
  var KEYS = Object.keys(Q.results);
  var state = null;
  var cardFile = null;

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Если карточка уехала под шапку — аккуратно подвинем её в поле зрения
  function keepInView() {
    var top = box.getBoundingClientRect().top;
    if (top < 72) window.scrollBy({ top: top - 80, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  /* ---------- Начало ---------- */
  function intro() {
    var prev = App.store.get('quiz', null);
    var prevRes = prev && Q.results[prev.key];
    var prevEl = box.querySelector('[data-quiz-prev]');
    if (prevRes && prevEl) {
      prevEl.hidden = false;
      prevEl.textContent = 'Прошлый результат: ' + prevRes.name + ' ' + prevRes.emoji + '. Интересно, что сейчас?';
    }
    box.querySelector('[data-quiz-start]').addEventListener('click', start);
  }

  function start() {
    state = { i: 0, scores: {}, last: null, order: Q.questions.map(function (q) { return shuffle(q.options.slice()); }) };
    KEYS.forEach(function (k) { state.scores[k] = 0; });
    renderQuestion();
  }

  /* ---------- Вопросы ---------- */
  function renderQuestion() {
    var q = Q.questions[state.i];
    var total = Q.questions.length;
    box.innerHTML =
      '<div class="quiz__bar" aria-hidden="true"><i style="--p:' + Math.round((state.i / total) * 100) + '%"></i></div>' +
      '<p class="quiz__step">Вопрос ' + (state.i + 1) + ' из ' + total + '</p>' +
      '<h2 class="quiz__q" tabindex="-1">' + esc(q.q) + '</h2>' +
      '<div class="quiz__options">' +
        state.order[state.i].map(function (o) {
          return '<button class="option" type="button" data-r="' + o.r + '">' + esc(o.t) + '</button>';
        }).join('') +
      '</div>';
    box.querySelector('.quiz__q').focus({ preventScroll: true });
    keepInView();
  }

  function answer(btn) {
    box.querySelectorAll('.option').forEach(function (b) { b.disabled = true; });
    btn.classList.add('is-picked');
    state.scores[btn.dataset.r]++;
    state.last = btn.dataset.r;
    setTimeout(function () {
      state.i++;
      if (state.i < Q.questions.length) renderQuestion();
      else finish();
    }, reduceMotion() ? 60 : 260);
  }

  function winner() {
    var best = -1;
    KEYS.forEach(function (k) { if (state.scores[k] > best) best = state.scores[k]; });
    var top = KEYS.filter(function (k) { return state.scores[k] === best; });
    return top.indexOf(state.last) !== -1 ? state.last : top[0];
  }

  /* ---------- Результат ---------- */
  function finish() {
    var key = winner();
    App.store.set('quiz', { key: key, name: Q.results[key].name, at: Date.now() });
    App.markTried('quiz');
    if (window.Cloud) window.Cloud.count('stats/quiz', key, 'quiz:' + key);
    renderResult(key);
  }

  function renderResult(key) {
    var r = Q.results[key];
    box.innerHTML =
      '<div class="quiz-result" style="--c:' + r.color + '">' +
        '<p class="quiz__step">Твой результат</p>' +
        '<h2 class="quiz-result__title" tabindex="-1">Ты — <em>' + esc(r.name) + '</em> ' + r.emoji + '</h2>' +
        '<figure class="quiz-card"><canvas width="1080" height="1350" role="img" aria-label="Карточка результата: ' + esc(r.name) + '"></canvas></figure>' +
        '<div class="quiz-result__actions">' +
          '<button class="btn" type="button" data-quiz-download>Скачать картинку</button>' +
          '<button class="btn btn--ghost" type="button" data-quiz-share>Отправить</button>' +
        '</div>' +
        '<p class="quiz-result__desc">' + esc(r.desc) + '</p>' +
        '<ul class="traits">' +
          '<li><span>Суперсила</span>' + esc(r.power) + '</li>' +
          '<li><span>Слабое место</span>' + esc(r.weak) + '</li>' +
          '<li><span>Лучшая пара</span>' + esc(r.pair) + '</li>' +
        '</ul>' +
        '<p class="guest-hint" data-guest-hint hidden></p>' +
        '<button class="link-btn" type="button" data-quiz-restart>Пройти ещё раз</button>' +
      '</div>';
    box.querySelector('.quiz-result__title').focus({ preventScroll: true });
    keepInView();

    var cv = box.querySelector('canvas');
    cardFile = null;
    drawCard(cv, r).then(function () {
      cv.toBlob(function (blob) {
        if (blob && typeof File === 'function') cardFile = new File([blob], 'zalipni-klavisha-' + key + '.png', { type: 'image/png' });
      }, 'image/png');
    });

    box.querySelector('[data-quiz-download]').addEventListener('click', function () { download(cv, key); });
    box.querySelector('[data-quiz-share]').addEventListener('click', function () {
      App.share({
        title: 'Какая ты клавиша?',
        text: 'Я — ' + r.name + ' ' + r.emoji + ' А какая клавиша ты?',
        url: App.pageUrl(),
        files: cardFile ? [cardFile] : null
      });
    });
    box.querySelector('[data-quiz-restart]').addEventListener('click', start);
  }

  function download(cv, key) {
    var name = 'zalipni-klavisha-' + key + '.png';
    var done = function (url, revoke) {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      App.toast('Картинка сохранена', { icon: '🖼️', text: 'Ищи её в загрузках — и отправляй друзьям.' });
    };
    if (cv.toBlob && window.URL && URL.createObjectURL) {
      cv.toBlob(function (blob) {
        if (blob) done(URL.createObjectURL(blob), true);
        else done(cv.toDataURL('image/png'), false);
      }, 'image/png');
    } else {
      done(cv.toDataURL('image/png'), false);
    }
  }

  /* ---------- Рисуем карточку ---------- */
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var t = f < 0 ? 0 : 255;
    var p = Math.abs(f);
    return 'rgb(' + Math.round((t - r) * p + r) + ',' + Math.round((t - g) * p + g) + ',' + Math.round((t - b) * p + b) + ')';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitFont(ctx, text, weight, family, maxW, size) {
    do {
      ctx.font = weight + ' ' + size + 'px ' + family;
      size -= 2;
    } while (ctx.measureText(text).width > maxW && size > 20);
  }

  function wrap(ctx, text, maxW) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var sample = 'Яя Zz 0';
    return Promise.all([
      document.fonts.load('900 80px Unbounded', sample),
      document.fonts.load('800 80px Unbounded', sample),
      document.fonts.load('500 40px Onest', sample),
      document.fonts.load('700 40px Onest', sample)
    ]).catch(function () {});
  }

  function drawCard(cv, r) {
    return loadFonts().then(function () {
      var ctx = cv.getContext('2d');
      var W = cv.width;
      var H = cv.height;
      var X = 80;
      var UNB = 'Unbounded, "Arial Black", sans-serif';
      var ONE = 'Onest, "Segoe UI", sans-serif';

      ctx.fillStyle = '#0e0c16';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (var y = 18; y < H; y += 36) {
        for (var x = 18; x < W; x += 36) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Шапка
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '900 46px ' + UNB;
      ctx.fillStyle = '#c6ff3d';
      ctx.shadowColor = 'rgba(198,255,61,0.45)';
      ctx.shadowBlur = 26;
      ctx.fillText(App.siteName(), X, 132);
      ctx.shadowBlur = 0;
      ctx.font = '500 36px ' + ONE;
      ctx.fillStyle = '#b9b2cf';
      ctx.fillText('Тест «Какая ты клавиша?»', X, 192);

      // Клавиша
      var kw = r.wide ? 800 : 480;
      var kh = 290;
      var kx = (W - kw) / 2;
      var ky = 270;
      roundRect(ctx, kx, ky + 28, kw, kh, 52);
      ctx.fillStyle = shade(r.color, -0.5);
      ctx.fill();
      roundRect(ctx, kx, ky, kw, kh, 52);
      ctx.fillStyle = r.color;
      ctx.fill();
      roundRect(ctx, kx + 30, ky + 22, kw - 60, kh - 76, 34);
      ctx.fillStyle = shade(r.color, 0.22);
      ctx.fill();
      ctx.fillStyle = '#0e0c16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, r.key, 800, UNB, kw - 130, 110);
      ctx.fillText(r.key, W / 2, ky + 22 + (kh - 76) / 2 + 4);

      // Заголовок
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f3f0fa';
      var title = 'Я — ' + r.name;
      fitFont(ctx, title, 900, UNB, W - X * 2, 96);
      ctx.fillText(title, X, 722);

      // Описание
      ctx.font = '500 38px ' + ONE;
      ctx.fillStyle = '#b9b2cf';
      var yy = 800;
      wrap(ctx, r.desc, W - X * 2).slice(0, 6).forEach(function (line) {
        ctx.fillText(line, X, yy);
        yy += 54;
      });

      // Суперсила
      yy += 26;
      ctx.font = '700 38px ' + ONE;
      ctx.fillStyle = r.color;
      wrap(ctx, 'Суперсила: ' + r.power.toLowerCase(), W - X * 2).slice(0, 2).forEach(function (line) {
        ctx.fillText(line, X, yy);
        yy += 52;
      });

      // Подвал
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(X, H - 150, W - X * 2, 2);
      ctx.font = '700 36px ' + ONE;
      ctx.fillStyle = '#f3f0fa';
      ctx.fillText('А какая клавиша ты?', X, H - 82);
      var host = App.isSet(App.CONFIG.SITE_URL) ? App.CONFIG.SITE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';
      if (host) {
        ctx.textAlign = 'right';
        ctx.font = '800 32px ' + UNB;
        ctx.fillStyle = '#c6ff3d';
        ctx.fillText(host, W - X, H - 82);
      }
    });
  }

  box.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-r]');
    if (btn && !btn.disabled) answer(btn);
  });

  intro();
})();
