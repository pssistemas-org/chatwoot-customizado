/* Kanban de conversas do Chatwoot.
 * Roda no mesmo domínio do Chatwoot e usa a sessão já logada (cookie cw_d_session_info).
 * Colunas = etiquetas da conta. Arrastar um card troca a etiqueta de "etapa" da conversa.
 * Pode abrir dentro do painel do Chatwoot (iframe criado pelo inject.js) ou em tela cheia.
 */
(function () {
  'use strict';

  var NO_LABEL = '__sem_etiqueta__';
  var MAX_PAGES = 8;          // 8 páginas x 25 = até 200 conversas por carga
  var REFRESH_MS = 30000;
  var EMBED = window.self !== window.top;
  var STATUSES = [['open', 'Abertas'], ['pending', 'Pendentes'], ['resolved', 'Resolvidas'], ['snoozed', 'Adiadas'], ['all', 'Todas']];

  var st = {
    account: null, accounts: [], labels: [], inboxes: [], convs: [], capped: false,
    inbox: '', status: 'open', q: '', cols: null, dragging: null, draggingCol: null, busy: false, loaded: false
  };
  var app = document.getElementById('app');

  /* ---------- utilidades ---------- */
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* sem storage: segue sem lembrar */ }
    return null;
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    var k;
    for (k in (props || {})) {
      var v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) { c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); continue; }
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    var span = document.createElement('span');
    span.style.display = 'inline-flex';
    span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
    return span.firstChild;
  }

  function toast(msg) {
    var t = h('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function ago(ts) {
    if (!ts) return '';
    var diff = Math.round((ts * 1000 - Date.now()) / 1000);
    var rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
    var abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  }

  // Cor estável por nome (avatar com iniciais, como no Chatwoot)
  var AVATAR_COLORS = [['#dbeafe', '#1d4ed8'], ['#dcfce7', '#15803d'], ['#fef3c7', '#a16207'], ['#fce7f3', '#be185d'], ['#e0e7ff', '#4338ca'], ['#ccfbf1', '#0f766e'], ['#ffedd5', '#c2410c'], ['#f3e8ff', '#7e22ce']];
  function avatar(name, thumb, small) {
    var n = name || '?';
    var sum = 0;
    for (var i = 0; i < n.length; i++) sum += n.charCodeAt(i);
    var c = AVATAR_COLORS[sum % AVATAR_COLORS.length];
    var el = h('div', { class: 'avatar' + (small ? ' sm' : ''), style: 'background:' + c[0] + ';color:' + c[1] });
    if (thumb) {
      var img = h('img', { src: thumb, alt: '', onerror: function () { img.remove(); el.textContent = n.charAt(0).toUpperCase(); } });
      el.appendChild(img);
    } else {
      el.textContent = n.charAt(0).toUpperCase();
    }
    return el;
  }

  /* ---------- tema e fonte iguais ao Chatwoot (quando embutido) ---------- */
  function syncWithParent() {
    if (!EMBED) return;
    try {
      var p = window.parent;
      var pd = p.document;
      var apply = function () {
        var dark = pd.documentElement.classList.contains('dark') || pd.body.classList.contains('dark');
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      };
      apply();
      var obs = new MutationObserver(apply);
      obs.observe(pd.documentElement, { attributes: true, attributeFilter: ['class'] });
      obs.observe(pd.body, { attributes: true, attributeFilter: ['class'] });

      // copia as @font-face do Chatwoot (Inter) para esta página
      var css = '';
      [].forEach.call(pd.styleSheets, function (sheet) {
        try {
          [].forEach.call(sheet.cssRules, function (r) { if (r.type === 5) css += r.cssText + '\n'; });
        } catch (e) { /* folha de outro domínio */ }
      });
      if (css) document.head.appendChild(h('style', { text: css }));
    } catch (e) { /* sem acesso ao pai: usa o tema do sistema */ }
  }

  /* ---------- API do Chatwoot (sessão do dashboard) ---------- */
  function session() {
    var prefix = 'cw_d_session_info=';
    var part = document.cookie.split('; ').filter(function (c) { return c.indexOf(prefix) === 0; })[0];
    if (!part) return null;
    try { return JSON.parse(decodeURIComponent(part.slice(prefix.length))); } catch (e) { return null; }
  }

  function api(path, opts) {
    var s = session();
    if (!s) return Promise.reject(new Error('NO_SESSION'));
    opts = opts || {};
    var headers = { accept: 'application/json', 'content-type': 'application/json' };
    ['access-token', 'token-type', 'client', 'expiry', 'uid'].forEach(function (k) {
      if (s[k] !== undefined && s[k] !== null) headers[k] = String(s[k]);
    });
    return fetch('/api/v1' + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) throw new Error('NO_SESSION');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  /* ---------- carga de dados ---------- */
  function loadMeta() {
    var base = '/accounts/' + st.account;
    return Promise.all([api(base + '/labels'), api(base + '/inboxes')]).then(function (r) {
      st.labels = (r[0] && r[0].payload) || [];
      st.inboxes = (r[1] && r[1].payload) || [];
      var saved = store('kanban.cols.' + st.account);
      var titles = st.labels.map(function (l) { return l.title; });
      st.cols = null;
      if (saved) {
        try { st.cols = JSON.parse(saved).filter(function (t) { return titles.indexOf(t) >= 0; }); } catch (e) { st.cols = null; }
      }
      if (!st.cols) st.cols = titles;
    });
  }

  function loadConvs() {
    var all = [];
    st.capped = false;
    function page(n) {
      var p = new URLSearchParams({ status: st.status, assignee_type: 'all', page: String(n) });
      if (st.inbox) p.set('inbox_id', st.inbox);
      return api('/accounts/' + st.account + '/conversations?' + p.toString()).then(function (r) {
        var list = (r && r.data && r.data.payload) || [];
        all = all.concat(list);
        if (list.length >= 25) {
          if (n < MAX_PAGES) return page(n + 1);
          st.capped = true;
        }
      });
    }
    return page(1).then(function () {
      var seen = {};
      st.convs = all.filter(function (c) { if (seen[c.id]) return false; seen[c.id] = true; return true; });
      st.loaded = true;
    });
  }

  function refresh() {
    st.busy = true;
    var btn = document.getElementById('refresh');
    if (btn) btn.classList.add('spin');
    return loadConvs().then(function () {
      st.busy = false;
      if (btn) btn.classList.remove('spin');
      renderBoard();
    }).catch(function (e) { st.busy = false; fail(e); });
  }

  /* ---------- lógica do kanban ---------- */
  function columnOf(c) {
    var labels = c.labels || [];
    for (var i = 0; i < st.cols.length; i++) if (labels.indexOf(st.cols[i]) >= 0) return st.cols[i];
    return NO_LABEL;
  }

  function labelColor(title) {
    var l = st.labels.filter(function (x) { return x.title === title; })[0];
    return (l && l.color) || '#98a2b3';
  }

  function matches(c) {
    if (!st.q) return true;
    var q = st.q.toLowerCase();
    var name = (c.meta && c.meta.sender && c.meta.sender.name) || '';
    var last = (c.last_non_activity_message && c.last_non_activity_message.content) || '';
    return (name + ' ' + last + ' #' + c.id).toLowerCase().indexOf(q) >= 0;
  }

  function saveCols() { store('kanban.cols.' + st.account, JSON.stringify(st.cols)); }

  // Reordena as colunas: coloca `key` antes/depois de `target` (target NO_LABEL = primeira posição).
  function reorderCol(key, target, after) {
    if (key === target) return;
    var rest = st.cols.filter(function (t) { return t !== key; });
    var idx = target === NO_LABEL ? 0 : rest.indexOf(target) + (after ? 1 : 0);
    if (target !== NO_LABEL && rest.indexOf(target) < 0) return;
    rest.splice(idx, 0, key);
    st.cols = rest;
    saveCols();
    renderBoard();
  }

  // A conversa tem uma única "etapa": ao mover, remove as etiquetas que são colunas e coloca a nova.
  function move(conv, to) {
    var before = (conv.labels || []).slice();
    var next = before.filter(function (l) { return st.cols.indexOf(l) < 0; });
    if (to !== NO_LABEL) next.push(to);
    conv.labels = next;
    renderBoard();
    api('/accounts/' + st.account + '/conversations/' + conv.id + '/labels', { method: 'POST', body: { labels: next } })
      .catch(function (e) {
        conv.labels = before;
        renderBoard();
        if (e.message === 'NO_SESSION') fail(e); else toast('Não foi possível mover a conversa (' + e.message + ').');
      });
  }

  /* ---------- tela ---------- */
  function fail(e) {
    var msg = e && e.message === 'NO_SESSION'
      ? h('p', null, 'Sessão do Chatwoot não encontrada. ', h('a', { href: '/app/login', target: '_top', text: 'Entre no Chatwoot' }), ' e volte para esta página.')
      : h('p', { text: 'Erro ao carregar os dados: ' + (e && e.message) });
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'state' }, h('h2', { text: 'Kanban' }), msg));
  }

  function field(iconName, control, extraClass) {
    return h('div', { class: 'field ' + (extraClass || '') }, iconName ? icon(iconName) : null, control,
      control.tagName === 'SELECT' ? h('span', { class: 'chev' }, icon('chevron')) : null);
  }

  function renderHeader() {
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, STATUSES.map(function (s) {
      return h('button', { class: 'tab' + (s[0] === st.status ? ' active' : ''), type: 'button', role: 'tab', text: s[1],
        onclick: function () { st.status = s[0]; store('kanban.status', st.status); renderHeaderInto(); refresh(); } });
    }));

    var inboxSel = h('select', { 'aria-label': 'Caixa de entrada', onchange: function (e) { st.inbox = e.target.value; store('kanban.inbox', st.inbox); renderHeaderInto(); refresh(); } },
      h('option', { value: '', text: 'Todas as caixas de entrada' }),
      st.inboxes.map(function (i) { return h('option', { value: String(i.id), text: i.name, selected: String(i.id) === st.inbox }); }));

    var search = h('input', { type: 'search', placeholder: 'Buscar cliente ou mensagem', value: st.q, 'aria-label': 'Buscar',
      oninput: function (e) { st.q = e.target.value; renderBoard(); } });

    var colsBtn = h('button', { class: 'btn', type: 'button', onclick: function (e) { e.stopPropagation(); openColsPopover(colsBtn); } }, icon('columns'), 'Colunas');
    var reload = h('button', { class: 'btn icon', id: 'refresh', type: 'button', title: 'Atualizar', 'aria-label': 'Atualizar', onclick: function () { if (!st.busy) refresh(); } }, icon('refresh'));

    var titleRow = h('div', { class: 'title-row' },
      h('h1', { text: 'Kanban' }),
      h('span', { class: 'sub', id: 'total' }),
      h('span', { class: 'grow' }),
      EMBED ? null : h('a', { class: 'back', href: '/app/accounts/' + st.account + '/dashboard', text: '← Voltar ao Chatwoot' }),
      reload, colsBtn);

    var toolbar = h('div', { class: 'toolbar' }, tabs, field('inbox', inboxSel, 'has-icon'), field('search', search, 'has-icon'));
    return h('div', { class: 'header', id: 'header' }, titleRow, toolbar);
  }

  function renderHeaderInto() {
    var old = document.getElementById('header');
    var focusSearch = document.activeElement && document.activeElement.type === 'search';
    var fresh = renderHeader();
    if (old) old.replaceWith(fresh);
    if (focusSearch) { var s = fresh.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    updateTotal();
  }

  function openColsPopover(anchor) {
    closePopover();
    var pop = h('div', { class: 'pop', id: 'pop', onclick: function (e) { e.stopPropagation(); } },
      h('div', { class: 'hint', text: 'Escolha as etiquetas que viram colunas. Arraste o título de uma coluna para mudar a ordem. Ao arrastar uma conversa, ela fica só com a etiqueta da coluna de destino (entre as colunas visíveis).' }),
      st.labels.map(function (l) {
        return h('label', null,
          h('input', { type: 'checkbox', checked: st.cols.indexOf(l.title) >= 0, onchange: function (e) {
            var without = st.cols.filter(function (t) { return t !== l.title; });
            st.cols = e.target.checked ? without.concat(l.title) : without;
            saveCols();
            renderBoard();
          } }),
          h('span', { class: 'dot', style: 'width:8px;height:8px;border-radius:50%;background:' + (l.color || '#98a2b3') }),
          l.title);
      }));
    var r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - 240, window.innerWidth - 260)) + 'px';
    document.body.appendChild(pop);
  }
  function closePopover() { var p = document.getElementById('pop'); if (p) p.remove(); }
  document.addEventListener('click', closePopover);

  function card(c) {
    var sender = (c.meta && c.meta.sender) || {};
    var name = sender.name || ('Conversa #' + c.id);
    var last = c.last_non_activity_message || {};
    var hasAttach = !!(last.attachments && last.attachments.length);
    var text = last.content || (hasAttach ? 'Anexo' : '');
    var inbox = st.inboxes.filter(function (i) { return i.id === c.inbox_id; })[0];
    var assignee = c.meta && c.meta.assignee;
    var extra = (c.labels || []).filter(function (l) { return st.cols.indexOf(l) < 0; });

    var chips = [];
    if (inbox) {
      var wa = /whats/i.test(inbox.name) || /whats/i.test(inbox.channel_type || '');
      chips.push(h('span', { class: 'chip', title: inbox.name },
        h('span', { style: 'display:inline-flex;color:' + (wa ? '#25d366' : 'var(--text-3)') }, icon('chat', 12)),
        h('span', { class: 't', text: inbox.name })));
    }
    extra.slice(0, 2).forEach(function (l) {
      chips.push(h('span', { class: 'chip' }, h('span', { class: 'd', style: 'background:' + labelColor(l) }), h('span', { class: 't', text: l })));
    });
    if (extra.length > 2) chips.push(h('span', { class: 'chip', text: '+' + (extra.length - 2) }));

    var el = h('a', {
      class: 'card', draggable: 'true', target: EMBED ? '_top' : '_blank', rel: 'noopener',
      href: '/app/accounts/' + st.account + '/conversations/' + c.id,
      ondragstart: function (e) {
        st.dragging = c;
        e.dataTransfer.setData('text/plain', String(c.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { el.classList.add('dragging'); }, 0);
      },
      ondragend: function () { st.dragging = null; el.classList.remove('dragging'); }
    },
      h('div', { class: 'top' },
        avatar(name, sender.thumbnail),
        h('div', { class: 'who' }, h('div', { class: 'name', text: name }), h('div', { class: 'time', text: ago(c.last_activity_at || c.timestamp) })),
        c.unread_count ? h('span', { class: 'unread', text: String(c.unread_count) }) : null),
      text ? (hasAttach && !last.content
        ? h('div', { class: 'msg att' }, icon('clip', 12), text)
        : h('div', { class: 'msg', text: text })) : null,
      chips.length ? h('div', { class: 'chips' }, chips) : null,
      assignee ? h('div', { class: 'foot' }, avatar(assignee.name, assignee.thumbnail, true), h('span', { text: assignee.name })) : null);
    return el;
  }

  function column(key) {
    var items = st.convs.filter(function (c) { return columnOf(c) === key && matches(c); });
    var body = h('div', { class: 'col-body' },
      h('div', { class: 'drop-hint', text: 'Solte para mover aqui' }),
      items.length ? items.map(card) : h('div', { class: 'empty', text: 'Nenhuma conversa' }));
    var movable = key !== NO_LABEL;
    function side(e) { var r = col.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? 'left' : 'right'; }
    function clearIns() { col.classList.remove('ins-left', 'ins-right'); }
    var col = h('div', {
      class: 'col', 'data-key': key,
      ondragover: function (e) {
        if (st.draggingCol) {
          if (st.draggingCol === key) return;
          e.preventDefault();
          var sd = side(e);
          col.classList.toggle('ins-left', sd === 'left' && movable);
          col.classList.toggle('ins-right', sd === 'right' || !movable);
        } else if (st.dragging) { e.preventDefault(); col.classList.add('over'); }
      },
      ondragleave: function (e) { if (!col.contains(e.relatedTarget)) { col.classList.remove('over'); clearIns(); } },
      ondrop: function (e) {
        e.preventDefault(); col.classList.remove('over');
        if (st.draggingCol) {
          var moving = st.draggingCol, after = movable ? side(e) === 'right' : false;
          st.draggingCol = null; clearIns();
          reorderCol(moving, key, after);
          return;
        }
        var conv = st.dragging; st.dragging = null;
        if (conv && columnOf(conv) !== key) move(conv, key);
      }
    },
      h('div', Object.assign({ class: 'col-head' + (movable ? ' grab' : '') }, movable ? {
        draggable: 'true', title: 'Arraste para mudar a ordem',
        ondragstart: function (e) {
          st.draggingCol = key;
          e.dataTransfer.setData('text/plain', 'col:' + key);
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setDragImage(col, 20, 20); } catch (x) { /* usa a imagem padrão */ }
          setTimeout(function () { col.classList.add('col-dragging'); }, 0);
        },
        ondragend: function () { st.draggingCol = null; col.classList.remove('col-dragging'); }
      } : {}),
        movable ? h('span', { class: 'grip' }, icon('grip', 14)) : null,
        h('span', { class: 'dot', style: 'background:' + (key === NO_LABEL ? '#98a2b3' : labelColor(key)) }),
        h('span', { class: 'name', text: key === NO_LABEL ? 'Sem etiqueta' : key, title: key === NO_LABEL ? '' : key }),
        h('span', { class: 'count', text: String(items.length) })),
      body);
    return col;
  }

  function skeleton() {
    var cols = [0, 1, 2, 3].map(function () {
      return h('div', { class: 'col' },
        h('div', { class: 'col-head' }, h('span', { class: 'skel', style: 'width:90px;height:14px;border-radius:6px' })),
        h('div', { class: 'col-body' }, [0, 1, 2].map(function () { return h('div', { class: 'skel', style: 'height:92px' }); })));
    });
    return h('div', { class: 'board', id: 'board' }, cols);
  }

  function updateTotal() {
    var total = document.getElementById('total');
    if (!total) return;
    var n = st.convs.filter(matches).length;
    total.textContent = st.loaded ? (n + (n === 1 ? ' conversa' : ' conversas')) : '';
    var warn = document.getElementById('warn');
    if (warn) warn.style.display = st.capped ? '' : 'none';
  }

  function renderBoard() {
    var old = document.getElementById('board');
    var scroll = old ? { x: old.scrollLeft, ys: [].map.call(old.querySelectorAll('.col-body'), function (b) { return b.scrollTop; }) } : null;
    var board = h('div', { class: 'board', id: 'board' }, [NO_LABEL].concat(st.cols).map(column));
    if (old) old.replaceWith(board); else app.appendChild(board);
    if (scroll) {
      board.scrollLeft = scroll.x;
      [].forEach.call(board.querySelectorAll('.col-body'), function (b, i) { if (scroll.ys[i]) b.scrollTop = scroll.ys[i]; });
    }
    updateTotal();
  }

  function start() {
    app.innerHTML = '';
    var page = h('div', { class: 'page' },
      renderHeader(),
      h('div', { class: 'warn', id: 'warn', style: 'display:none',
        text: 'Mostrando as ' + (MAX_PAGES * 25) + ' conversas mais recentes. Use o filtro de caixa de entrada ou status para refinar.' }));
    app.appendChild(page);
    // o quadro fica dentro de .page para ocupar o resto da altura
    var board = h('div', { class: 'board', id: 'board' });
    page.appendChild(board);
    renderBoard();
  }

  /* ---------- inicialização ---------- */
  var qs = new URLSearchParams(location.search);
  st.inbox = store('kanban.inbox') || '';
  st.status = store('kanban.status') || 'open';
  syncWithParent();

  app.appendChild(h('div', { class: 'page' }, h('div', { class: 'header' }, h('div', { class: 'title-row' }, h('h1', { text: 'Kanban' }))), skeleton()));
  api('/profile').then(function (p) {
    st.accounts = p.accounts || [];
    st.account = qs.get('account') || p.account_id || (st.accounts[0] && st.accounts[0].id);
    if (!st.account) throw new Error('conta não encontrada');
    return loadMeta();
  }).then(loadConvs).then(start).catch(fail);

  setInterval(function () {
    if (document.hidden || st.dragging || st.draggingCol || st.busy || !st.loaded || !document.getElementById('board')) return;
    refresh();
  }, REFRESH_MS);
})();
