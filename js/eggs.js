/*
  Механика пасхалок: как каждая срабатывает, конфетти, сообщения, тайная комната.
  Описания самих секретов — в secrets.js.
*/
(function () {
  'use strict';

  var App = window.App;
  var SECRETS = window.SECRETS || [];
  if (!App) return;

  var page = document.body.dataset.page;
  var TOOL_IDS = App.TOOLS.map(function (t) { return t.id; });

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ==========================================================================
     Конфетти (своё, лёгкое, без библиотек)
     ========================================================================== */
  var COLORS = ['#c6ff3d', '#ff5cd6', '#3ee6ff', '#ffd84a', '#ff8a4c', '#ab8dff'];

  function confetti(o) {
    o = o || {};
    if (reduceMotion()) return;
    var cvs = document.createElement('canvas');
    cvs.className = 'confetti';
    cvs.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cvs);

    var ctx = cvs.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth;
    var H = window.innerHeight;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.scale(dpr, dpr);

    var rain = !!o.rain;
    var x0 = o.x != null ? o.x : W / 2;
    var y0 = o.y != null ? o.y : H * 0.62;
    var n = o.count || 80;
    var life = o.duration || (rain ? 4200 : 2600);
    var parts = [];

    for (var i = 0; i < n; i++) {
      var ang = rain ? Math.PI / 2 : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      var sp = rain ? 1.5 + Math.random() * 2.5 : 9 + Math.random() * 10;
      parts.push({
        x: rain ? Math.random() * W : x0,
        y: rain ? -20 - Math.random() * H * 0.8 : y0,
        vx: Math.cos(ang) * sp + (rain ? (Math.random() - 0.5) * 2 : 0),
        vy: Math.sin(ang) * sp,
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI * 2,
        c: COLORS[i % COLORS.length]
      });
    }

    var start = performance.now();
    var last = start;

    function frame(now) {
      var dt = Math.min((now - last) / 16.67, 3);
      last = now;
      var t = now - start;
      var fade = t > life - 500 ? Math.max(0, (life - t) / 500) : 1;
      ctx.clearRect(0, 0, W, H);
      var alive = false;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vy += (rain ? 0.05 : 0.38) * dt;
        p.vx *= Math.pow(0.986, dt);
        if (p.vy > 6) p.vy = 6;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        p.tilt += 0.12 * dt;
        if (p.y < H + 30) alive = true;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (t < life && alive) requestAnimationFrame(frame);
      else cvs.remove();
    }
    requestAnimationFrame(frame);
  }

  /* ==========================================================================
     Учёт найденных секретов
     ========================================================================== */
  function getFound() { return App.store.get('secrets', {}); }

  function byId(id) {
    for (var i = 0; i < SECRETS.length; i++) if (SECRETS[i].id === id) return SECRETS[i];
    return null;
  }

  function isFound(id) { return !!getFound()[id]; }

  function allFound() {
    return SECRETS.length > 0 && App.secretsFound() === SECRETS.length;
  }

  function find(id) {
    var s = byId(id);
    if (!s || isFound(id)) return false;

    var found = getFound();
    found[id] = Date.now();
    App.store.set('secrets', found);
    App.updateCounters();

    var count = App.secretsFound();
    var total = SECRETS.length;
    confetti({ count: count === total ? 140 : 80 });
    App.toast('Секрет найден: ' + s.name, {
      icon: s.emoji,
      text: s.message,
      meta: 'Найдено ' + count + ' из ' + total,
      variant: 'secret',
      duration: 6500,
      action: count === total ? null : { label: 'Все секреты', href: 'secrets.html' }
    });

    if (count === total) {
      setTimeout(function () {
        App.toast('Тайная комната открыта!', {
          icon: '🗝️',
          text: 'Все секреты найдены. Тебя ждут внутри.',
          variant: 'secret',
          duration: 12000,
          action: { label: 'Войти', href: 'room.html' }
        });
      }, 900);
    }

    document.dispatchEvent(new CustomEvent('secret:found', { detail: { id: id } }));
    return true;
  }

  function reset() {
    App.store.set('secrets', {});
    App.store.set('tried', {});
    App.updateCounters();
    document.dispatchEvent(new CustomEvent('secret:found', { detail: { id: null } }));
  }

  // Каждая штука вызывает это, когда в неё по-настоящему сыграли
  function markTried(toolId) {
    var tried = App.store.get('tried', {});
    if (!tried[toolId]) {
      tried[toolId] = true;
      App.store.set('tried', tried);
    }
    var all = TOOL_IDS.every(function (t) { return tried[t]; });
    if (all) find('explorer');
  }

  /* ==========================================================================
     1. Логотип: 7 нажатий подряд (на главной)
     ========================================================================== */
  function setupLogo() {
    var logo = document.querySelector('[data-logo]');
    if (!logo || page !== 'home') return;
    var clicks = 0;
    var timer;
    logo.addEventListener('click', function (e) {
      e.preventDefault();
      if (clicks === 0) window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(function () { clicks = 0; }, 1500);
      logo.classList.remove('is-poked');
      void logo.offsetWidth;
      logo.classList.add('is-poked');
      if (clicks >= 7) {
        clicks = 0;
        find('logo');
      }
    });
  }

  /* ==========================================================================
     2. Чит-код: ↑ ↑ ↓ ↓ ← → ← → B A (клавиатура или свайпы + два тапа)
     ========================================================================== */
  function setupCheat() {
    var CODE = 'up up down down left right left right b a';
    var buf = [];

    function push(token) {
      buf.push(token);
      if (buf.length > 10) buf.shift();
      if (buf.join(' ') === CODE) {
        buf = [];
        find('cheat');
      }
    }

    var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyB: 'b', KeyA: 'a' };
    document.addEventListener('keydown', function (e) {
      var t = KEYS[e.code];
      if (t) push(t);
      else buf = [];
    });

    var sx, sy, st, multi;
    document.addEventListener('touchstart', function (e) {
      multi = e.touches.length > 1;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (multi || sx == null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      var ax = Math.abs(dx);
      var ay = Math.abs(dy);
      if (ax < 12 && ay < 12 && Date.now() - st < 350) {
        // Тап: первый считается за B, второй за A
        push(buf[buf.length - 1] === 'b' ? 'a' : 'b');
      } else if (Math.max(ax, ay) > 40) {
        push(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      }
      sx = null;
    }, { passive: true });
  }

  /* ==========================================================================
     4. Волшебное слово «сезам» — с клавиатуры (любая раскладка) или в любом поле
     ========================================================================== */
  function setupWord() {
    // Клавиши, на которых стоят буквы С Е З А М в обычной раскладке
    var CODE = 'KeyC KeyT KeyP KeyF KeyV';
    var buf = [];
    document.addEventListener('keydown', function (e) {
      if (!e.code) return;
      buf.push(e.code);
      if (buf.length > 5) buf.shift();
      if (buf.join(' ') === CODE) find('word');
    });
    document.addEventListener('input', function (e) {
      var v = e.target && typeof e.target.value === 'string' ? e.target.value.toLowerCase() : '';
      if (v.indexOf('сезам') !== -1) find('word');
    });
  }

  /* ==========================================================================
     5. Долгое нажатие на 👀 на главной
     ========================================================================== */
  function setupEyes() {
    var eyes = document.querySelector('[data-eyes]');
    if (!eyes) return;
    var timer;

    function cancel() {
      clearTimeout(timer);
      eyes.classList.remove('is-pressing');
    }

    eyes.addEventListener('pointerdown', function () {
      cancel();
      eyes.classList.add('is-pressing');
      timer = setTimeout(function () {
        eyes.classList.remove('is-pressing');
        eyes.classList.remove('is-blink');
        void eyes.offsetWidth;
        eyes.classList.add('is-blink');
        if (navigator.vibrate) navigator.vibrate(30);
        find('eyes');
      }, 1300);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      eyes.addEventListener(ev, cancel);
    });
    eyes.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ==========================================================================
     6. Ночная смена: сайт открыт в 03:33
     ========================================================================== */
  function setupNight() {
    function check() {
      var d = new Date();
      if (d.getHours() === 3 && d.getMinutes() === 33) find('night');
    }
    check();
    setInterval(check, 15000);
  }

  /* ==========================================================================
     3, 7. Тайная страница-точка и страница 404 — засчитываются при открытии
     ========================================================================== */
  function setupPages() {
    if (page === 'psst') find('dot');
    if (page === '404') find('lost');
  }

  /* ==========================================================================
     8. Дочитать политику конфиденциальности до конца
     ========================================================================== */
  function setupReader() {
    var end = document.querySelector('[data-read-end]');
    if (!end) return;
    var timer;
    // Засчитываем, как только последняя строка показалась на экране или осталась выше —
    // даже если долистали одним рывком (например, клавишей End)
    function check() {
      if (end.getBoundingClientRect().top < window.innerHeight) {
        window.removeEventListener('scroll', onScroll);
        find('reader');
      }
    }
    function onScroll() {
      clearTimeout(timer);
      timer = setTimeout(check, 120);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ==========================================================================
     9. Невидимые чернила: выделить скрытую надпись на главной
     ========================================================================== */
  function setupInk() {
    var ink = document.querySelector('[data-ink]');
    if (!ink || !window.getSelection) return;
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      if (sel.containsNode(ink, true) && sel.toString().replace(/\s/g, '').length >= 4) find('ink');
    });
  }

  /* ========================================================================== */
  App.secrets = {
    list: SECRETS,
    find: find,
    isFound: isFound,
    allFound: allFound,
    reset: reset
  };
  App.markTried = markTried;
  App.confetti = confetti;

  setupLogo();
  setupCheat();
  setupWord();
  setupEyes();
  setupNight();
  setupPages();
  setupReader();
  setupInk();
})();
