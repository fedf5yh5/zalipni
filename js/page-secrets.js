/* Страница «Секреты»: список с подсказками, «шепни слово», сброс прогресса */
(function () {
  'use strict';

  var App = window.App;
  if (!App || !App.secrets) return;

  var list = document.querySelector('[data-secret-list]');
  var roomLink = document.querySelector('[data-room-link]');
  var vaultTitle = document.querySelector('[data-vault-title]');
  var vaultText = document.querySelector('[data-vault-text]');
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function dateText(ts) {
    var d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function render() {
    var found = App.store.get('secrets', {});
    var esc = App.esc;
    var open = {};
    list.querySelectorAll('[aria-expanded="true"]').forEach(function (b) { open[b.dataset.hint] = true; });

    list.innerHTML = App.secrets.list.map(function (s, i) {
      var num = i + 1;
      if (found[s.id]) {
        return (
          '<li class="secret is-found">' +
            '<span class="secret__icon" aria-hidden="true">' + s.emoji + '</span>' +
            '<div class="secret__body">' +
              '<h3 class="secret__name">' + esc(s.name) + '</h3>' +
              '<p class="secret__text">' + esc(s.condition) + '</p>' +
              '<p class="secret__meta">Найден ' + dateText(found[s.id]) + '</p>' +
            '</div>' +
          '</li>'
        );
      }
      var isOpen = !!open[s.id];
      return (
        '<li class="secret">' +
          '<span class="secret__icon" aria-hidden="true">🔒</span>' +
          '<div class="secret__body">' +
            '<h3 class="secret__name">Секрет №' + num + '</h3>' +
            '<p class="secret__text" id="hint-' + s.id + '"' + (isOpen ? '' : ' hidden') + '>' + esc(s.hint) + '</p>' +
            '<button class="link-btn" type="button" data-hint="' + s.id + '" aria-controls="hint-' + s.id + '" aria-expanded="' + isOpen + '">' +
              (isOpen ? 'Спрятать подсказку' : 'Показать подсказку') +
            '</button>' +
          '</div>' +
        '</li>'
      );
    }).join('');

    var all = App.secrets.allFound();
    roomLink.hidden = !all;
    vaultTitle.textContent = all ? 'Все секреты найдены!' : 'Найдено секретов';
    var left = App.secretsTotal() - App.secretsFound();
    vaultText.textContent = all
      ? 'Тайная комната открыта. Заходи.'
      : left === App.secretsTotal()
        ? 'Найдёшь все — откроется тайная комната.'
        : 'Осталось ' + left + '. Потом откроется тайная комната.';
  }

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-hint]');
    if (!btn) return;
    var text = document.getElementById('hint-' + btn.dataset.hint);
    var open = btn.getAttribute('aria-expanded') !== 'true';
    text.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Спрятать подсказку' : 'Показать подсказку';
  });

  /* Шепни слово */
  var REPLIES = [
    'Не то. Но звучало красиво.',
    'Сайт прислушался… и пожал плечами.',
    'Холодно. Прямо очень холодно.',
    'Хорошее слово. Но не волшебное.',
    'Где-то вдалеке грустно вздохнул один разбойник.',
    'Мимо. Подсказка: сказка про сорок разбойников.'
  ];
  var replyIdx = 0;
  var form = document.querySelector('[data-whisper]');
  var reply = document.querySelector('[data-whisper-reply]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = form.elements.word;
    var word = input.value.trim().toLowerCase().replace(/[!.,…]+$/g, '');
    if (!word) {
      reply.textContent = 'Тишина в ответ на тишину. Логично.';
      return;
    }
    if (word.indexOf('сезам') !== -1) {
      // Слово могло сработать ещё при вводе — тогда это тоже «только что открылся»
      var ts = App.store.get('secrets', {}).word;
      var fresh = App.secrets.find('word') || (ts && Date.now() - ts < 60000);
      reply.textContent = fresh ? 'Сезам открылся!' : 'Это слово уже сработало. Сезам открыт 😉';
    } else {
      reply.textContent = REPLIES[replyIdx % REPLIES.length];
      replyIdx++;
    }
    input.value = '';
  });

  /* Сброс */
  document.querySelector('[data-reset]').addEventListener('click', function () {
    if (window.confirm('Точно начать заново? Все найденные секреты снова спрячутся.')) {
      App.secrets.reset();
      App.toast('Секреты снова спрятаны', { icon: '🙈', text: 'Удачной охоты!' });
    }
  });

  document.addEventListener('secret:found', render);
  window.addEventListener('pageshow', function (e) { if (e.persisted) render(); });
  render();
})();
