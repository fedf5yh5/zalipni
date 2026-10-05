/*
  Общий код для всех страниц: шапка, подвал, хранилище, сообщения, «поделиться».
*/
(function () {
  'use strict';

  var CONFIG = window.CONFIG || {};
  var KEY_PREFIX = 'zz:';

  /* ---------- Список всех штук (для блока «Ещё штуки») ---------- */
  var TOOLS = [
    { id: 'riddle', href: 'riddle.html', emoji: '🧩', tag: 'Каждый день', title: 'Загадка дня', text: 'Одна на сутки. Отгадай и похвастайся квадратиками.', c: 'lime' },
    { id: 'quiz', href: 'quiz.html', emoji: '⌨️', tag: 'Тест', title: 'Какая ты клавиша?', text: '6 вопросов — и ясно, ты Пробел или Caps Lock.', c: 'violet' },
    { id: 'excuse', href: 'excuse.html', emoji: '🙈', tag: 'Генератор', title: 'Генератор оправданий', text: 'Когда не сделано, а объяснить надо.', c: 'pink' },
    { id: 'meme', href: 'meme.html', emoji: '🎭', tag: 'Генератор', title: 'Какой ты мем сегодня', text: 'Один тап — и твой вайб на день готов.', c: 'cyan' },
    { id: 'reaction', href: 'reaction.html', emoji: '⚡', tag: 'Игра', title: 'Тест реакции', text: 'Жми, как только экран загорится.', c: 'yellow' },
    { id: 'emoji', href: 'emoji.html', emoji: '🤔', tag: 'Игра', title: 'Угадай по эмодзи', text: 'Пословицы и фразы — одними смайлами.', c: 'orange' }
  ];

  /* ---------- Хранилище (localStorage, без падений в приватном режиме) ---------- */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(KEY_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
      } catch (e) { /* хранилище недоступно — просто не запоминаем */ }
      document.dispatchEvent(new CustomEvent('store:change', { detail: { key: key } }));
    },
    remove: function (key) {
      try {
        localStorage.removeItem(KEY_PREFIX + key);
      } catch (e) { /* ничего */ }
      document.dispatchEvent(new CustomEvent('store:change', { detail: { key: key } }));
    }
  };

  /* ---------- Мелкие помощники ---------- */
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function siteName() {
    return CONFIG.SITE_NAME || 'TODO_NAME';
  }

  function hasTelegram() {
    return !!CONFIG.TG_URL && CONFIG.TG_URL.indexOf('TODO') !== 0;
  }

  // Адрес страницы для «поделиться»: настоящий адрес сайта, когда он известен
  function pageUrl(file) {
    var name = file || location.pathname.split('/').pop() || '';
    if (name === 'index.html') name = '';
    if (CONFIG.SITE_URL) return CONFIG.SITE_URL.replace(/\/+$/, '') + '/' + name;
    return location.href.split('#')[0];
  }

  /* ---------- Сообщения внизу экрана ---------- */
  var toastBox = null;

  function toast(title, opts) {
    opts = opts || {};
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (opts.variant ? ' toast--' + opts.variant : '');
    el.innerHTML =
      '<span class="toast__icon" aria-hidden="true">' + esc(opts.icon || '✨') + '</span>' +
      '<div class="toast__body"><b>' + esc(title) + '</b>' +
        (opts.text ? '<span>' + esc(opts.text) + '</span>' : '') +
        (opts.meta ? '<small class="toast__meta">' + esc(opts.meta) + '</small>' : '') +
        (opts.action ? '<a class="toast__action" href="' + esc(opts.action.href) + '">' + esc(opts.action.label) + ' →</a>' : '') +
      '</div>' +
      '<button class="toast__close" type="button" aria-label="Закрыть">×</button>';

    var timer;
    function close() {
      clearTimeout(timer);
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 180);
    }
    el.querySelector('.toast__close').addEventListener('click', close);
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    timer = setTimeout(close, opts.duration || 4000);
    return close;
  }

  /* ---------- Копирование и «поделиться» ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  // share({ title, text, url, files }) — системное меню «Поделиться», а если его нет — копирование
  function share(data) {
    data = data || {};
    var url = data.url || pageUrl();
    var payload = { title: data.title || document.title, text: data.text || '', url: url };
    if (data.files && navigator.canShare && navigator.canShare({ files: data.files })) payload.files = data.files;

    if (navigator.share) {
      return navigator.share(payload).then(function () { return 'shared'; }, function (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        return copyFallback(payload);
      });
    }
    return copyFallback(payload);
  }

  function copyFallback(payload) {
    var full = [payload.text, payload.url].filter(Boolean).join('\n');
    return copyText(full).then(function (ok) {
      if (ok) {
        toast('Скопировано', { icon: '📋', text: 'Вставь в чат другу — ссылка уже внутри.' });
        return 'copied';
      }
      window.prompt('Скопируй и отправь другу:', full);
      return 'prompt';
    });
  }

  /* ---------- Шапка ---------- */
  function renderHeader() {
    var slot = document.getElementById('site-header');
    if (!slot) return;
    var isHome = document.body.dataset.page === 'home';
    slot.outerHTML =
      '<header class="site-header">' +
        '<div class="wrap site-header__in">' +
          '<a class="logo" href="index.html" data-logo' + (isHome ? ' aria-current="page"' : '') + '>' + esc(siteName()) + '</a>' +
          '<div class="site-header__right">' +
            '<a class="secret-pill" href="secrets.html" data-secret-pill>' +
              '<span aria-hidden="true">🔐</span>' +
              '<span class="secret-pill__num"><span class="secret-pill__label">Найдено секретов: </span><b data-secret-found>0</b> из <span data-secret-total>0</span></span>' +
              '<span class="secret-pill__bar" aria-hidden="true"><i></i></span>' +
            '</a>' +
            '<span class="account-slot" data-account-slot></span>' +
          '</div>' +
        '</div>' +
      '</header>';
  }

  /* ---------- Счётчик секретов (данные приходят из secrets.js) ---------- */
  function secretsTotal() {
    return Array.isArray(window.SECRETS) ? window.SECRETS.length : 0;
  }

  function secretsFound() {
    var found = store.get('secrets', {});
    var ids = Array.isArray(window.SECRETS) ? window.SECRETS.map(function (s) { return s.id; }) : [];
    return ids.filter(function (id) { return found[id]; }).length;
  }

  var lastFound = null;

  function updateCounters() {
    var total = secretsTotal();
    var found = secretsFound();
    var grew = lastFound !== null && found > lastFound;
    lastFound = found;
    var pct = total ? Math.round((found / total) * 100) + '%' : '0%';
    document.querySelectorAll('[data-secret-found]').forEach(function (el) { el.textContent = found; });
    document.querySelectorAll('[data-secret-total]').forEach(function (el) { el.textContent = total; });
    document.querySelectorAll('[data-secret-pill], [data-secret-progress]').forEach(function (el) { el.style.setProperty('--p', pct); });
    var pill = document.querySelector('[data-secret-pill]');
    if (pill) {
      pill.setAttribute('aria-label', 'Найдено секретов: ' + found + ' из ' + total);
      if (grew) {
        pill.classList.remove('is-bumped');
        void pill.offsetWidth;
        pill.classList.add('is-bumped');
      }
    }
  }

  /* ---------- «Ещё штуки», идея, подвал ---------- */
  function tileHtml(t) {
    return (
      '<a class="tile" href="' + t.href + '" style="--c: var(--' + t.c + ')">' +
        '<div class="tile__top"><span class="tile__emoji" aria-hidden="true">' + t.emoji + '</span></div>' +
        '<span class="tile__tag">' + esc(t.tag) + '</span>' +
        '<h3 class="tile__title">' + esc(t.title) + '</h3>' +
      '</a>'
    );
  }

  function renderMore() {
    var page = document.body.dataset.page;
    var main = document.getElementById('main');
    if (!main || page === 'home' || document.body.hasAttribute('data-no-more')) return;
    var list = TOOLS.filter(function (t) { return t.id !== page; });
    var sec = document.createElement('section');
    sec.className = 'more wrap';
    sec.setAttribute('aria-labelledby', 'more-title');
    sec.innerHTML =
      '<div class="section-head"><h2 class="kicker" id="more-title">Ещё штуки</h2></div>' +
      '<div class="grid">' + list.map(tileHtml).join('') + '</div>';
    main.after(sec);
  }

  function renderIdea() {
    var footer = document.getElementById('site-footer');
    if (!footer) return;
    var tg = hasTelegram();
    var cloud = !!(window.Cloud && window.Cloud.enabled);
    var tgButton = tg
      ? '<a class="btn ' + (cloud ? 'btn--ghost' : 'btn--pink') + '" href="' + esc(CONFIG.TG_URL) + '" target="_blank" rel="noopener">' + (cloud ? 'Telegram' : 'Предложить идею') + '</a>'
      : '<button class="btn ' + (cloud ? 'btn--ghost' : 'btn--pink') + '" type="button" data-idea-soon>' + (cloud ? 'Telegram' : 'Предложить идею') + ' <span class="btn__soon">скоро</span></button>';
    var sec = document.createElement('section');
    sec.className = 'idea wrap';
    sec.innerHTML =
      '<div class="idea__card">' +
        '<div>' +
          '<p class="idea__title">Чего-то не хватает?</p>' +
          '<p class="idea__text">Придумай тест, игру или новый секрет — лучшие идеи появятся на сайте.</p>' +
        '</div>' +
        '<div class="idea__actions">' +
          (cloud ? '<button class="btn btn--pink" type="button" data-idea-toggle aria-expanded="false" aria-controls="idea-form">Предложить идею</button>' : '') +
          tgButton +
        '</div>' +
        (cloud
          ? '<form class="idea-form" id="idea-form" data-idea-form hidden>' +
              '<label class="idea-form__label" for="idea-text">Твоя идея</label>' +
              '<textarea class="field idea-form__text" id="idea-text" name="text" rows="3" maxlength="300" required></textarea>' +
              '<div class="idea-form__row">' +
                '<span class="idea-form__count" data-idea-count>0 / 300</span>' +
                '<button class="btn" type="submit">Отправить</button>' +
              '</div>' +
              '<p class="idea-form__status" data-idea-status aria-live="polite"></p>' +
            '</form>'
          : '') +
      '</div>';
    footer.before(sec);
    var soon = sec.querySelector('[data-idea-soon]');
    if (soon) {
      soon.addEventListener('click', function () {
        toast('Канал вот-вот откроется', { icon: '💡', text: 'Загляни чуть позже — кнопка оживёт.' });
      });
    }
  }

  function renderFooter() {
    var slot = document.getElementById('site-footer');
    if (!slot) return;
    var year = new Date().getFullYear();
    slot.outerHTML =
      '<footer class="site-footer">' +
        '<div class="wrap site-footer__in">' +
          '<p class="site-footer__brand">' + esc(siteName()) + '</p>' +
          '<p>Маленькие штуки, чтобы залипнуть. Регистрация не нужна.</p>' +
          '<nav class="site-footer__nav" aria-label="О сайте">' +
            '<a href="about.html">О проекте</a>' +
            '<a href="secrets.html">Секреты</a>' +
            '<a href="contacts.html">Контакты</a>' +
            '<a href="privacy.html">Конфиденциальность</a>' +
          '</nav>' +
          '<p class="site-footer__copy">© ' + year + ' ' + esc(siteName()) + '<a class="dot" href="psst.html">.</a></p>' +
        '</div>' +
      '</footer>';
  }

  /* ---------- Заголовок вкладки, имя сайта в тексте, реклама ---------- */
  function applyName() {
    var name = siteName();
    var base = document.title;
    if (base.indexOf(name) === -1) {
      document.title = document.body.dataset.page === 'home' ? name + ' — ' + base : base + ' — ' + name;
    }
    document.querySelectorAll('[data-site-name]').forEach(function (el) { el.textContent = name; });
  }

  /* ---------- Значения из config.js прямо в тексте страниц ---------- */
  function isSet(v) {
    return typeof v === 'string' && v.trim() !== '' && v.indexOf('TODO') !== 0;
  }

  // <span data-config="EMAIL">запасной текст</span> — подставит значение, если оно уже заполнено
  function fillConfig() {
    document.querySelectorAll('[data-config]').forEach(function (el) {
      var v = CONFIG[el.dataset.config];
      if (!isSet(v)) return;
      if (el.dataset.config === 'EMAIL') {
        el.innerHTML = '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
      } else if (el.dataset.config === 'TG_URL') {
        el.innerHTML = '<a href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(v.replace(/^https?:\/\//, '')) + '</a>';
      } else {
        el.textContent = v;
      }
    });
    var fb = !!(window.Cloud && window.Cloud.enabled);
    document.querySelectorAll('[data-if-firebase]').forEach(function (el) { el.hidden = !fb; });
    document.querySelectorAll('[data-if-no-firebase]').forEach(function (el) { el.hidden = fb; });
    document.querySelectorAll('[data-config-age]').forEach(function (el) { el.textContent = String(CONFIG.AGE_MIN || 14); });
    var metrika = /^\d+$/.test(String(CONFIG.METRIKA_ID || '').trim());
    document.querySelectorAll('[data-if-metrika]').forEach(function (el) { el.hidden = !metrika; });
    document.querySelectorAll('[data-if-no-metrika]').forEach(function (el) { el.hidden = metrika; });
  }

  /* ---------- Реклама РСЯ: только при RSYA_ENABLED: true ---------- */
  function setupAds() {
    if (CONFIG.RSYA_ENABLED !== true) return;
    var blocks = CONFIG.RSYA_BLOCKS || {};
    var slots = document.querySelectorAll('.ad-slot[data-ad]');
    var used = 0;
    window.yaContextCb = window.yaContextCb || [];
    slots.forEach(function (slot, i) {
      var id = blocks[slot.dataset.ad] || blocks['default'];
      if (!id) { slot.remove(); return; }
      var box = document.createElement('div');
      box.id = 'yandex_rtb_' + id + '-' + i;
      slot.appendChild(box);
      used++;
      window.yaContextCb.push(function () {
        window.Ya.Context.AdvManager.render({ blockId: id, renderTo: box.id, pageNumber: i + 1 });
      });
    });
    if (!used) return;
    document.documentElement.classList.add('ads-on');
    var s = document.createElement('script');
    s.src = 'https://yandex.ru/ads/system/context.js';
    s.async = true;
    document.head.appendChild(s);
  }

  /* ---------- Яндекс Метрика: только если указан METRIKA_ID ---------- */
  function setupMetrika() {
    var id = String(CONFIG.METRIKA_ID || '').trim();
    if (!/^\d+$/.test(id)) return;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    var s = document.createElement('script');
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    s.async = true;
    document.head.appendChild(s);
    window.ym(Number(id), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }

  /* ---------- День по московскому времени (для загадки дня) ---------- */
  var DAY_MS = 864e5;
  var MSK_MS = 3 * 3600e3; // Москва: UTC+3 круглый год
  var RIDDLE_EPOCH = Date.UTC(2026, 9, 1) / DAY_MS; // 1 октября 2026 — загадка №1
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  var daily = {
    day: function (now) { return Math.floor(((now || Date.now()) + MSK_MS) / DAY_MS); },
    number: function (now) { return Math.max(1, daily.day(now) - RIDDLE_EPOCH + 1); },
    msToNext: function (now) {
      now = now || Date.now();
      return (daily.day(now) + 1) * DAY_MS - MSK_MS - now;
    },
    iso: function (now) {
      return new Date(daily.day(now) * DAY_MS).toISOString().slice(0, 10);
    },
    label: function (now) {
      var d = new Date(daily.day(now) * DAY_MS);
      return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
    }
  };

  /* ---------- Память прокрутки: ушёл в игру, вернулся — ты там же, где был ---------- */
  // Сами решаем, куда прокрутить при возврате (браузер иначе путается из-за блоков, которые дорисовывает скрипт)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var session = {
    get: function (k) { try { return sessionStorage.getItem(KEY_PREFIX + k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(KEY_PREFIX + k, v); } catch (e) { /* не запоминаем */ } },
    remove: function (k) { try { sessionStorage.removeItem(KEY_PREFIX + k); } catch (e) { /* ничего */ } }
  };

  // «/» и «/index.html» — одна и та же страница
  function normPath(p) { return p.replace(/index\.html$/, ''); }
  var PATH = normPath(location.pathname);
  var saveTimer;

  function saveScroll() {
    session.set('scroll:' + PATH, String(Math.round(window.scrollY)));
  }

  function navType() {
    var nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    return nav ? nav.type : 'navigate';
  }

  function restoreScroll() {
    var flag = session.get('restore');
    if (flag) session.remove('restore');
    var type = navType();
    var wanted = type === 'back_forward' || type === 'reload' || flag === PATH;
    var y = parseInt(session.get('scroll:' + PATH), 10);
    if (!wanted || location.hash || !(y > 0)) {
      saveScroll();
      return;
    }
    window.scrollTo(0, y);

    // Шрифты могли чуть сдвинуть вёрстку — поправим, если человек ещё не начал листать сам
    var moved = false;
    var mark = function () { moved = true; };
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, mark, { once: true, passive: true });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (!moved && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      });
    }
  }

  // Пришли ли мы на эту страницу прямо со страницы target (на нашем же сайте)
  function cameFrom(target) {
    if (!/^https?:$/.test(location.protocol) || !document.referrer) return false;
    try {
      var ref = new URL(document.referrer);
      return ref.origin === location.origin && normPath(ref.pathname) === normPath(target.pathname);
    } catch (e) {
      return false;
    }
  }

  // Ссылки «назад» (data-back): шаг назад по истории, а если его нет — обычный переход с возвратом позиции
  function setupBackLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-back]') : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var target = new URL(a.getAttribute('href'), location.href);
      if (history.length > 1 && cameFrom(target)) {
        e.preventDefault();
        history.back();
        return;
      }
      session.set('restore', normPath(target.pathname));
    });
  }

  /* ---------- Блокировка прокрутки фона для окон поверх страницы ---------- */
  var lockCount = 0;
  var lockY = 0;

  function lockScroll() {
    if (lockCount++ > 0) return;
    lockY = window.scrollY;
    var root = document.documentElement;
    root.style.setProperty('--scrollbar-gap', (window.innerWidth - root.clientWidth) + 'px');
    root.classList.add('is-scroll-locked');
  }

  function unlockScroll() {
    if (lockCount === 0 || --lockCount > 0) return;
    var root = document.documentElement;
    root.classList.remove('is-scroll-locked');
    root.style.removeProperty('--scrollbar-gap');
    window.scrollTo(0, lockY);
  }

  /* ---------- Плавное появление блоков при прокрутке ---------- */
  var REVEAL = '.tile, .card, .game, .how, .vault, .secret, .whisper, .quiet, .cert, .room__actions, .idea__card, .section-head, .site-footer__in, [data-reveal]';

  function setupReveal() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;

    // Всё, что уже на экране (или выше), показываем сразу и не трогаем
    var fold = window.innerHeight;
    var pending = [];
    document.querySelectorAll(REVEAL).forEach(function (el) {
      if (el.closest('.site-header, .toasts')) return;
      if (el.parentElement && el.parentElement.closest('.reveal')) return;
      if (el.getBoundingClientRect().top < fold) return;
      el.classList.add('reveal');
      pending.push(el);
    });
    if (!pending.length) return;
    document.documentElement.classList.add('js-reveal');

    var io = new IntersectionObserver(function (entries) {
      var shown = [];
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        shown.push({ el: en.target, top: Math.round(en.boundingClientRect.top), left: en.boundingClientRect.left });
      });
      // Плитки одного ряда — друг за другом, слева направо
      shown.sort(function (a, b) { return a.top - b.top || a.left - b.left; });
      var row = -1;
      var col = 0;
      var rowTop = null;
      shown.forEach(function (it) {
        if (rowTop === null || Math.abs(it.top - rowTop) > 8) {
          row++;
          col = 0;
          rowTop = it.top;
        } else {
          col++;
        }
        show(it.el, Math.min(row * 90 + col * 80, 480));
      });
    }, { rootMargin: '0px 0px -8% 0px' });

    pending.forEach(function (el) { io.observe(el); });

    function show(el, delay) {
      el.style.transitionDelay = delay + 'ms';
      el.classList.add('is-in');
      // После появления убираем служебные классы, чтобы вернулись обычные эффекты наведения
      setTimeout(function () {
        el.classList.remove('reveal', 'is-in');
        el.style.transitionDelay = '';
      }, delay + 650);
    }
  }

  /* ---------- Запуск ---------- */
  function init() {
    renderHeader();
    renderMore();
    renderIdea();
    renderFooter();
    applyName();
    fillConfig();
    updateCounters();
    setupAds();
    setupMetrika();
    setupTabTitle();
    setupBackLinks();
    window.addEventListener('pageshow', function (e) { if (e.persisted) updateCounters(); });
    window.addEventListener('storage', function (e) { if (e.key === KEY_PREFIX + 'secrets') updateCounters(); });
    window.addEventListener('scroll', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveScroll, 150);
    }, { passive: true });
    window.addEventListener('pagehide', saveScroll);

    // Прокрутку и появление — когда отработали скрипты самой страницы и вся вёрстка на месте
    var started = false;
    var afterScripts = function () {
      if (started) return;
      started = true;
      restoreScroll();
      setupReveal();
    };
    if (document.readyState === 'complete') {
      afterScripts();
    } else {
      document.addEventListener('DOMContentLoaded', afterScripts);
      window.addEventListener('load', afterScripts);
    }
  }

  // Ушёл на другую вкладку — сайт скучает
  function setupTabTitle() {
    var saved = null;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        saved = document.title;
        document.title = 'Эй, ты куда? 👀';
      } else if (saved) {
        document.title = saved;
        saved = null;
      }
    });
  }

  window.App = {
    CONFIG: CONFIG,
    TOOLS: TOOLS,
    store: store,
    esc: esc,
    toast: toast,
    share: share,
    copyText: copyText,
    pageUrl: pageUrl,
    siteName: siteName,
    updateCounters: updateCounters,
    secretsFound: secretsFound,
    secretsTotal: secretsTotal,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll,
    daily: daily,
    MONTHS: MONTHS,
    isSet: isSet
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
