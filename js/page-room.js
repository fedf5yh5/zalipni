/* Тайная комната: открыта только тем, кто нашёл все секреты */
(function () {
  'use strict';

  var App = window.App;
  if (!App || !App.secrets) return;

  var locked = document.querySelector('[data-room-locked]');
  var open = document.querySelector('[data-room-open]');
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  // Без JS видна запертая дверь; комнату открываем, только если найдено всё
  if (!App.secrets.allFound()) return;
  locked.hidden = true;
  open.hidden = false;

  // Номер и дата удостоверения — по времени последней находки, у каждого свои
  var found = App.store.get('secrets', {});
  var times = Object.keys(found).map(function (k) { return found[k]; });
  var lastTs = Math.max.apply(null, times);
  var sum = times.reduce(function (a, b) { return a + (b % 100000); }, 0);
  var d = new Date(lastTs);
  document.querySelector('[data-cert-no]').textContent = String(1000 + (sum % 9000));
  document.querySelector('[data-cert-date]').textContent = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();

  // Telegram
  var tgSlot = document.querySelector('[data-room-tg]');
  var tg = App.CONFIG.TG_URL;
  if (tg && tg.indexOf('TODO') !== 0) {
    tgSlot.outerHTML = '<a class="btn btn--cyan" href="' + App.esc(tg) + '" target="_blank" rel="noopener">Telegram-канал</a>';
  } else {
    tgSlot.outerHTML = '<button class="btn btn--cyan" type="button" data-tg-soon>Telegram-канал <span class="btn__soon">скоро</span></button>';
    document.querySelector('[data-tg-soon]').addEventListener('click', function () {
      App.toast('Канал вот-вот откроется', { icon: '📣', text: 'Загляни чуть позже — ссылка появится здесь.' });
    });
  }

  document.querySelector('[data-room-share]').addEventListener('click', function () {
    App.share({
      title: App.siteName(),
      text: 'Все ' + App.secretsTotal() + ' секретов на сайте «' + App.siteName() + '» найдены 🗝️ Сможешь так же?',
      url: App.pageUrl('index.html')
    });
  });

  document.querySelector('[data-room-confetti]').addEventListener('click', function () {
    App.confetti({ count: 120 });
  });

  // Праздник при входе
  App.confetti({ rain: true, count: 160 });
  setTimeout(function () { App.confetti({ count: 120, x: window.innerWidth * 0.3 }); }, 350);
  setTimeout(function () { App.confetti({ count: 120, x: window.innerWidth * 0.7 }); }, 700);
})();
