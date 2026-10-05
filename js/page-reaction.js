/* Тест реакции: жми, как только поле загорится */
(function () {
  'use strict';

  var App = window.App;
  var zone = document.querySelector('[data-reaction]');
  if (!App || !zone) return;

  var title = zone.querySelector('[data-reaction-title]');
  var sub = zone.querySelector('[data-reaction-sub]');
  var bestEl = document.querySelector('[data-reaction-best]');
  var avgEl = document.querySelector('[data-reaction-avg]');
  var countEl = document.querySelector('[data-reaction-count]');
  var shareBtn = document.querySelector('[data-reaction-share]');

  var mode = 'idle';
  var timer = null;
  var t0 = 0;
  var lastMs = null;
  var data = App.store.get('reaction', { best: 0, recent: [], count: 0 });

  function rating(ms) {
    if (ms < 170) return 'Ты вообще человек? Это скорость молнии.';
    if (ms < 210) return 'Реакция кошки, заметившей пакет.';
    if (ms < 250) return 'Отлично! Быстрее большинства.';
    if (ms < 300) return 'Бодро. Нормальная человеческая скорость.';
    if (ms < 380) return 'Неплохо, но есть куда разогнаться.';
    return 'Кажется, кто-то задремал. Ещё разок?';
  }

  function stats() {
    bestEl.textContent = data.best ? data.best + ' мс' : '—';
    var avg = data.recent.length ? Math.round(data.recent.reduce(function (a, b) { return a + b; }, 0) / data.recent.length) : 0;
    avgEl.textContent = avg ? avg + ' мс' : '—';
    countEl.textContent = data.count;
    shareBtn.hidden = !lastMs;
  }

  function set(m, t, s) {
    mode = m;
    zone.dataset.mode = m;
    title.textContent = t;
    sub.textContent = s || '';
  }

  function arm() {
    clearTimeout(timer);
    set('wait', 'Жди…', 'Как только поле станет зелёным — жми!');
    timer = setTimeout(function () {
      set('go', 'ЖМИ!', '');
      t0 = performance.now();
    }, 1400 + Math.random() * 2800);
  }

  function press() {
    if (mode === 'idle' || mode === 'result' || mode === 'early') {
      arm();
    } else if (mode === 'wait') {
      clearTimeout(timer);
      set('early', 'Рано!', 'Фальстарт не считается. Нажми, чтобы попробовать снова.');
    } else if (mode === 'go') {
      var ms = Math.round(performance.now() - t0);
      lastMs = ms;
      var record = !data.best || ms < data.best;
      if (record) data.best = ms;
      data.recent = data.recent.concat(ms).slice(-5);
      data.count++;
      App.store.set('reaction', data);
      App.markTried('reaction');
      set('result', ms + ' мс', (record && data.count > 1 ? 'Новый рекорд! ' : '') + rating(ms) + ' Нажми, чтобы сыграть ещё.');
      stats();
    }
  }

  zone.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    press();
  });
  zone.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      press();
    }
  });
  // Ушёл с вкладки во время ожидания — честно сбрасываем раунд
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && (mode === 'wait' || mode === 'go')) {
      clearTimeout(timer);
      set('idle', 'Нажми, чтобы начать', 'Раунд сброшен: вкладка была скрыта.');
    }
  });

  shareBtn.addEventListener('click', function () {
    App.share({
      title: 'Тест реакции',
      text: 'Моя реакция — ' + lastMs + ' мс ⚡' + (data.best && data.best !== lastMs ? ' (рекорд ' + data.best + ' мс)' : '') + ' Сможешь быстрее?',
      url: App.pageUrl()
    });
  });

  set('idle', 'Нажми, чтобы начать', 'Сначала поле станет розовым. Жди зелёного и жми как можно быстрее.');
  stats();
})();
