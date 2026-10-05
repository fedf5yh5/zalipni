/* Тайная страница за точкой: таймер тишины */
(function () {
  'use strict';

  var App = window.App;
  var out = document.querySelector('[data-quiet-timer]');
  var btn = document.querySelector('[data-quiet-break]');
  if (!App || !out || !btn) return;

  var start = Date.now();
  var LINES = [
    'Ну вот. Было так тихо.',
    'Тишина нарушена. Соседи в шоке.',
    'Кто-то громко чихнул в интернете.',
    'Шшш! Ладно, ещё разок можно.'
  ];
  var i = 0;

  function tick() {
    var sec = Math.floor((Date.now() - start) / 1000);
    out.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);

  btn.addEventListener('click', function () {
    var sec = Math.floor((Date.now() - start) / 1000);
    App.confetti({ count: 60 });
    App.toast(LINES[i % LINES.length], { icon: '📢', text: 'Продержаться в тишине: ' + out.textContent + (sec >= 60 ? '. Это сильно.' : '.') });
    i++;
    start = Date.now();
    tick();
  });
})();
