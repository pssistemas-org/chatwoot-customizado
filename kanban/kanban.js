/* Kanban de conversas do Chatwoot.
 * Roda no mesmo domínio do Chatwoot e usa a sessão já logada (cookie cw_d_session_info).
 * Colunas = etiquetas da conta. Arrastar um card troca a etiqueta de "etapa" da conversa.
 */
(function () {
  'use strict';

  var NO_LABEL = '__sem_etiqueta__';
  var MAX_PAGES = 8;          // 8 páginas x 25 = até 200 conversas por carga
  var REFRESH_MS = 30000;

  var st = {
    account: null, accounts: [], labels: [], inboxes: [], convs: [], capped: false,
    inbox: '', status: 'open', q: '', cols: null, dragging: null, busy: false
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
      if (Array.isArray(c)) { c.forEach(function (x) { if (x) el.appendChild(x); }); continue; }
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
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
      if (saved) {
        try {
          st.cols = JSON.parse(saved).filter(function (t) { return titles.indexOf(t) >= 0; });
        } catch (e) { st.cols = null; }
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
    });
  }

  function refresh(showBoard) {
    st.busy = true;
    return loadConvs().then(function () { st.busy = false; if (showBoard !== false) renderBoard(); })
      .catch(function (e) { st.busy = false; fail(e); });
  }

  /* ---------- lógica do kanban ---------- */
  function columnOf(c) {
    var labels = c.labels || [];
    for (var i = 0; i < st.cols.length; i++) if (labels.indexOf(st.cols[i]) >= 0) return st.cols[i];
    return NO_LABEL;
  }

  function matches(c) {
    if (!st.q) return true;
    var q = st.q.toLowerCase();
    var name = (c.meta && c.meta.sender && c.meta.sender.name) || '';
    var last = (c.last_non_activity_message && c.last_non_activity_message.content) || '';
    return (name + ' ' + last + ' #' + c.id).toLowerCase().indexOf(q) >= 0;
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
      ? h('p', null, 'Sessão do Chatwoot não encontrada. ', h('a', { href: '/app/login', text: 'Entre no Chatwoot' }), ' e volte para esta página.')
      : h('p', { text: 'Erro ao carregar os dados: ' + (e && e.message) });
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'state' }, h('h2', { text: 'Kanban' }), msg));
  }

  function renderBar() {
    var inbox = h('select', { onchange: function (e) { st.inbox = e.target.value; store('kanban.inbox', st.inbox); refresh(); } },
      h('option', { value: '', text: 'Todas as caixas de entrada' }),
      st.inboxes.map(function (i) { return h('option', { value: String(i.id), text: i.name, selected: String(i.id) === st.inbox }); }));

    var statuses = [['open', 'Abertas'], ['pending', 'Pendentes'], ['resolved', 'Resolvidas'], ['snoozed', 'Adiadas'], ['all', 'Todas']];
    var status = h('select', { onchange: function (e) { st.status = e.target.value; store('kanban.status', st.status); refresh(); } },
      statuses.map(function (s) { return h('option', { value: s[0], text: s[1], selected: s[0] === st.status }); }));

    var search = h('input', { type: 'search', placeholder: 'Buscar cliente ou mensagem', value: st.q,
      oninput: function (e) { st.q = e.target.value; renderBoard(); } });

    var colsBtn = h('button', { type: 'button', text: 'Colunas', onclick: function (e) { e.stopPropagation(); openColsPopover(colsBtn); } });
    var reload = h('button', { type: 'button', text: 'Atualizar', onclick: function () { refresh(); } });
    var total = h('span', { class: 'total', id: 'total' });
    var back = h('a', { class: 'back', href: '/app/accounts/' + st.account + '/dashboard', text: '← Voltar ao Chatwoot' });

    return h('div', { class: 'bar' }, h('h1', { text: 'Kanban' }), inbox, status, search, colsBtn, reload, total, h('span', { class: 'grow' }), back);
  }

  function openColsPopover(anchor) {
    closePopover();
    var pop = h('div', { class: 'pop', id: 'pop', onclick: function (e) { e.stopPropagation(); } },
      h('div', { class: 'hint', text: 'Escolha as etiquetas que viram colunas. Ao arrastar, a conversa fica só com a etiqueta da coluna de destino (entre as colunas visíveis).' }),
      st.labels.map(function (l) {
        return h('label', null,
          h('input', { type: 'checkbox', checked: st.cols.indexOf(l.title) >= 0, onchange: function (e) {
            st.cols = st.labels.map(function (x) { return x.title; }).filter(function (t) {
              return t === l.title ? e.target.checked : st.cols.indexOf(t) >= 0;
            });
            store('kanban.cols.' + st.account, JSON.stringify(st.cols));
            renderBoard();
          } }), l.title);
      }));
    var r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
    pop.style.left = Math.max(8, r.left + window.scrollX) + 'px';
    document.body.appendChild(pop);
  }
  function closePopover() { var p = document.getElementById('pop'); if (p) p.remove(); }
  document.addEventListener('click', closePopover);

  function card(c) {
    var sender = (c.meta && c.meta.sender) || {};
    var name = sender.name || ('Conversa #' + c.id);
    var last = c.last_non_activity_message || {};
    var text = last.content || (last.attachments && last.attachments.length ? '📎 Anexo' : '');
    var inbox = st.inboxes.filter(function (i) { return i.id === c.inbox_id; })[0];
    var assignee = c.meta && c.meta.assignee;
    var avatar = h('div', { class: 'avatar' }, sender.thumbnail ? h('img', { src: sender.thumbnail, alt: '' }) : name.charAt(0).toUpperCase());

    var el = h('a', {
      class: 'card', draggable: 'true', target: '_blank', rel: 'noopener',
      href: '/app/accounts/' + st.account + '/conversations/' + c.id,
      ondragstart: function (e) {
        st.dragging = c;
        e.dataTransfer.setData('text/plain', String(c.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { el.classList.add('dragging'); }, 0);
      },
      ondragend: function () { st.dragging = null; el.classList.remove('dragging'); }
    },
      h('div', { class: 'top' }, avatar, h('div', { class: 'who', text: name }),
        c.unread_count ? h('span', { class: 'unread', text: String(c.unread_count) }) : null),
      text ? h('div', { class: 'msg', text: text }) : null,
      h('div', { class: 'meta' },
        inbox ? h('span', { class: 'chip', text: inbox.name }) : null,
        assignee ? h('span', { class: 'chip', text: assignee.name }) : null,
        h('span', { text: ago(c.last_activity_at || c.timestamp) })));
    return el;
  }

  function column(key) {
    var label = st.labels.filter(function (l) { return l.title === key; })[0];
    var items = st.convs.filter(function (c) { return columnOf(c) === key && matches(c); });
    var body = h('div', { class: 'col-body' }, items.length ? items.map(card) : h('div', { class: 'empty', text: 'Nenhuma conversa' }));
    var col = h('div', {
      class: 'col', 'data-key': key,
      ondragover: function (e) { if (st.dragging) { e.preventDefault(); col.classList.add('over'); } },
      ondragleave: function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); },
      ondrop: function (e) {
        e.preventDefault(); col.classList.remove('over');
        var conv = st.dragging; st.dragging = null;
        if (conv && columnOf(conv) !== key) move(conv, key);
      }
    },
      h('div', { class: 'col-head' },
        h('span', { class: 'dot', style: 'background:' + ((label && label.color) || '#98a2b3') }),
        h('span', { class: 'name', text: key === NO_LABEL ? 'Sem etiqueta' : key }),
        h('span', { class: 'count', text: String(items.length) })),
      body);
    if (label && label.color) col.style.borderTopColor = label.color;
    return col;
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
    var total = document.getElementById('total');
    if (total) total.textContent = st.convs.filter(matches).length + ' conversas';
    var warn = document.getElementById('warn');
    if (warn) warn.style.display = st.capped ? '' : 'none';
  }

  function start() {
    app.innerHTML = '';
    app.appendChild(renderBar());
    app.appendChild(h('div', { class: 'warn', id: 'warn', style: 'display:none',
      text: 'Mostrando as ' + (MAX_PAGES * 25) + ' conversas mais recentes. Use o filtro de caixa de entrada ou status para refinar.' }));
    renderBoard();
  }

  /* ---------- inicialização ---------- */
  var qs = new URLSearchParams(location.search);
  st.inbox = store('kanban.inbox') || '';
  st.status = store('kanban.status') || 'open';

  app.appendChild(h('div', { class: 'state', text: 'Carregando…' }));
  api('/profile').then(function (p) {
    st.accounts = p.accounts || [];
    st.account = qs.get('account') || p.account_id || (st.accounts[0] && st.accounts[0].id);
    if (!st.account) throw new Error('conta não encontrada');
    return loadMeta();
  }).then(loadConvs).then(start).catch(fail);

  setInterval(function () {
    if (document.hidden || st.dragging || st.busy || !st.account || !document.getElementById('board')) return;
    refresh();
  }, REFRESH_MS);
})();
