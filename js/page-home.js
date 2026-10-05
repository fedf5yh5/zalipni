/* Главная: номер сегодняшней загадки и личные рекорды прямо на плитках */
(function () {
  'use strict';

  var App = window.App;
  if (!App) return;

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el && text) el.textContent = text;
  }

  var n = App.daily.number();
  setText('[data-riddle-no]', 'Загадка №' + n);

  var riddle = App.store.get('riddle', null);
  if (riddle && riddle.n === n && riddle.done) {
    setText('[data-riddle-status]', riddle.solved ? 'Разгадана ✓' : 'Завтра реванш →');
  }

  var quiz = App.store.get('quiz', null);
  if (quiz && quiz.name) setText('[data-stat="quiz"]', 'В прошлый раз — ' + quiz.name + '. А сейчас?');

  var reaction = App.store.get('reaction', null);
  if (reaction && reaction.best) setText('[data-stat="reaction"]', 'Твой рекорд: ' + reaction.best + ' мс. Побьёшь?');

  var emoji = App.store.get('emoji', null);
  if (emoji && emoji.best) setText('[data-stat="emoji"]', 'Твой рекорд: ' + emoji.best + ' за минуту.');
})();
