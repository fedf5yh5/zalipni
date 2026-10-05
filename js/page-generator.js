/* Генераторы: «Генератор оправданий» и «Какой ты мем сегодня» */
(function () {
  'use strict';

  var App = window.App;
  var root = document.querySelector('[data-gen]');
  if (!App || !root) return;

  var kind = root.dataset.gen;
  var textEl = root.querySelector('[data-gen-text]');
  var noEl = root.querySelector('[data-gen-no]');
  var last = {};
  var current = null;

  function pick(list, avoid) {
    if (list.length < 2) return 0;
    var i;
    do { i = Math.floor(Math.random() * list.length); } while (i === avoid);
    return i;
  }

  function makeExcuse() {
    var E = window.EXCUSES;
    var a = pick(E.intro, last.a);
    var b = pick(E.cause, last.b);
    var c = pick(E.finale, last.c);
    last = { a: a, b: b, c: c };
    return {
      no: (a * E.cause.length + b) * E.finale.length + c + 1,
      text: E.intro[a] + ' ' + E.cause[b] + '. ' + E.finale[c]
    };
  }

  function makeMeme() {
    var M = window.MEMES;
    var h = pick(M.hero, last.h);
    var a = pick(M.action, last.a);
    var c = pick(M.caption, last.c);
    last = { h: h, a: a, c: c };
    return {
      no: (h * M.action.length + a) * M.caption.length + c + 1,
      emoji: M.hero[h][0],
      who: M.hero[h][1] + ' ' + M.action[a],
      caption: M.caption[c],
      vibe: 12 + Math.floor(Math.random() * 89)
    };
  }

  function paint() {
    if (noEl) noEl.textContent = current.no.toLocaleString('ru-RU');
    if (kind === 'excuse') {
      textEl.textContent = current.text;
    } else {
      root.querySelector('[data-meme-emoji]').textContent = current.emoji;
      textEl.textContent = 'Ты сегодня — ' + current.who + '.';
      root.querySelector('[data-meme-caption]').textContent = '«' + current.caption + '»';
      root.querySelector('[data-meme-vibe]').textContent = current.vibe + '%';
      root.querySelector('[data-meme-bar]').style.setProperty('--p', current.vibe + '%');
    }
  }

  function generate(animate) {
    current = kind === 'excuse' ? makeExcuse() : makeMeme();
    if (!animate) { paint(); return; }
    root.classList.add('is-swapping');
    setTimeout(function () {
      paint();
      root.classList.remove('is-swapping');
    }, 140);
  }

  function shareText() {
    if (kind === 'excuse') return '«' + current.text + '»\nОправдание дня — с сайта «' + App.siteName() + '»';
    return 'Мой мем дня: ' + current.who + ' ' + current.emoji + '\n«' + current.caption + '»\nА какой мем сегодня ты?';
  }

  root.querySelector('[data-gen-again]').addEventListener('click', function () {
    generate(true);
    App.markTried(kind);
  });

  root.querySelector('[data-gen-share]').addEventListener('click', function () {
    App.share({ title: document.title, text: shareText(), url: App.pageUrl() });
    App.markTried(kind);
  });

  generate(false);
})();
