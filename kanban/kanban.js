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
    inbox: '', status: 'open', q: '', cols: null, dragging: null, draggingCol: null, busy: false, loaded: false,
    agents: [], teams: [], campaigns: [], attrs: [], views: [], filters: [], view: null, names: {}, sel: {}, lastSel: null
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
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    tick: '<path d="M20 6 9 17l-5-5"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
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
    function soft(path, pick) { return api(path).then(pick).catch(function (e) { if (e.message === 'NO_SESSION') throw e; return []; }); }
    function list(r) { return Array.isArray(r) ? r : ((r && (r.payload || r.data)) || []); }
    return Promise.all([
      api(base + '/labels'), api(base + '/inboxes'),
      soft(base + '/agents', list), soft(base + '/teams', list), soft(base + '/campaigns', list),
      soft(base + '/custom_attribute_definitions?attribute_model=conversation_attribute', list),
      soft(base + '/custom_filters?filter_type=conversation', list)
    ]).then(function (r) {
      st.labels = (r[0] && r[0].payload) || [];
      st.inboxes = (r[1] && r[1].payload) || [];
      st.agents = r[2]; st.teams = r[3]; st.campaigns = r[4]; st.attrs = r[5]; st.views = r[6];
      restoreFilters();
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
    var adv = activePayload();
    st.capped = false;
    function page(n) {
      var req;
      if (adv) {
        req = api('/accounts/' + st.account + '/conversations/filter?page=' + n, { method: 'POST', body: { payload: adv } });
      } else {
        var p = new URLSearchParams({ status: st.status, assignee_type: 'all', page: String(n) });
        if (st.inbox) p.set('inbox_id', st.inbox);
        req = api('/accounts/' + st.account + '/conversations?' + p.toString());
      }
      return req.then(function (r) {
        var list = (r && r.data && r.data.payload) || (r && r.payload) || [];
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
      if (adv) {
        // status e caixa rápidos continuam valendo, a menos que o filtro avançado já trate deles
        var skipS = hasKey('status') || st.status === 'all', skipI = hasKey('inbox_id') || !st.inbox;
        st.convs = st.convs.filter(function (c) {
          return (skipS || c.status === st.status) && (skipI || String(c.inbox_id) === String(st.inbox));
        });
      }
      pruneSel();
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
    }).catch(function (e) {
      st.busy = false; if (btn) btn.classList.remove('spin');
      if (st.loaded && e.message !== 'NO_SESSION') toast('Não foi possível aplicar os filtros (' + e.message + ').'); else fail(e);
    });
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
  function move(conv, to) { moveMany([conv], to); }
  function moveMany(list, to) {
    var backs = list.map(function (c) { return [c, (c.labels || []).slice()]; });
    var nexts = backs.map(function (b) {
      var next = b[1].filter(function (l) { return st.cols.indexOf(l) < 0; });
      if (to !== NO_LABEL) next.push(to);
      b[0].labels = next;
      return next;
    });
    renderBoard();
    backs.forEach(function (b, i) {
      api('/accounts/' + st.account + '/conversations/' + b[0].id + '/labels', { method: 'POST', body: { labels: nexts[i] } })
        .catch(function (e) {
          b[0].labels = b[1];
          renderBoard();
          if (e.message === 'NO_SESSION') fail(e); else toast('Não foi possível mover a conversa (' + e.message + ').');
        });
    });
  }

  /* ---------- seleção em massa e menu de ações (botão direito) ---------- */
  var PRIO_LABEL = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };
  function selected() { return st.convs.filter(function (c) { return st.sel[c.id]; }); }
  function selCount() { return Object.keys(st.sel).length; }
  function visibleOrder() {
    var out = [];
    [NO_LABEL].concat(st.cols).forEach(function (k) {
      st.convs.forEach(function (c) { if (columnOf(c) === k && matches(c)) out.push(c); });
    });
    return out;
  }
  function pruneSel() { var ids = {}; st.convs.forEach(function (c) { ids[c.id] = 1; }); Object.keys(st.sel).forEach(function (k) { if (!ids[k]) delete st.sel[k]; }); }
  function toggleSel(c, range) {
    if (range && st.lastSel) {
      var order = visibleOrder().map(function (x) { return x.id; });
      var a = order.indexOf(st.lastSel), b = order.indexOf(c.id);
      if (a >= 0 && b >= 0) { order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (id) { st.sel[id] = true; }); renderBoard(); return; }
    }
    if (st.sel[c.id]) delete st.sel[c.id]; else st.sel[c.id] = true;
    st.lastSel = c.id;
    renderBoard();
  }
  function setSel(list, on) {
    list.forEach(function (c) { if (on) st.sel[c.id] = true; else delete st.sel[c.id]; });
    renderBoard();
  }
  function clearSel() { if (!selCount()) return; st.sel = {}; renderBoard(); }

  function updateSelBar() {
    var old = document.getElementById('selbar');
    var n = selCount();
    var pg = document.querySelector('.page'); if (pg) pg.classList.toggle('selecting', n > 0);
    if (!n) { if (old) old.remove(); return; }
    var all = visibleOrder();
    var bar = h('div', { class: 'selbar', id: 'selbar', onclick: function (e) { e.stopPropagation(); } },
      h('span', { class: 'n', text: n + (n === 1 ? ' selecionada' : ' selecionadas') }),
      h('button', { class: 'btn', type: 'button', text: n >= all.length ? 'Limpar' : 'Selecionar todas (' + all.length + ')',
        onclick: function () { if (n >= all.length) clearSel(); else setSel(all, true); } }),
      h('button', { class: 'btn primary', type: 'button', onclick: function (e) {
        e.stopPropagation();
        var r = e.currentTarget.getBoundingClientRect();
        openMenu(r.left, r.top, selected(), true);
      } }, 'Ações', icon('chevron', 14)),
      h('button', { class: 'ibtn', type: 'button', title: 'Limpar seleção (Esc)', 'aria-label': 'Limpar seleção', onclick: clearSel }, icon('x', 16)));
    if (old) old.replaceWith(bar); else document.body.appendChild(bar);
  }

  /* aplica uma ação a várias conversas, atualizando o card na hora */
  function bulk(list, label, call, patch) {
    var snap = list.map(function (c) { return [c, JSON.stringify([c.status, c.priority, c.labels, c.unread_count, c.meta])]; });
    list.forEach(function (c) { patch(c); });
    applyStatusView();
    renderBoard();
    var fails = 0;
    return Promise.all(list.map(function (c) {
      return call(c).catch(function (e) { fails++; if (e.message === 'NO_SESSION') throw e; });
    })).then(function () {
      if (fails) { toast(fails + ' de ' + list.length + ' falharam em “' + label + '”. Atualizando…'); refresh(); }
      else toast(label + (list.length > 1 ? ' (' + list.length + ' conversas)' : '') + '.');
    }).catch(fail);
  }
  // some do quadro as conversas que não combinam mais com a aba de status
  function applyStatusView() {
    if (st.status === 'all' || hasKey('status')) return;
    st.convs = st.convs.filter(function (c) { return c.status === st.status; });
    pruneSel();
  }
  function cpath(c, tail) { return '/accounts/' + st.account + '/conversations/' + c.id + tail; }
  function postTo(c, tail, body) { return api(cpath(c, tail), { method: 'POST', body: body || {} }); }

  function setStatus(list, status, label, until) {
    return bulk(list, label, function (c) { return postTo(c, '/toggle_status', until === undefined ? { status: status } : { status: status, snoozed_until: until }); },
      function (c) { c.status = status; });
  }
  function setPriority(list, p) {
    return bulk(list, p ? 'Prioridade: ' + PRIO_LABEL[p] : 'Prioridade removida', function (c) { return postTo(c, '/toggle_priority', { priority: p }); }, function (c) { c.priority = p; });
  }
  function toggleLabel(list, title) {
    var all = list.every(function (c) { return (c.labels || []).indexOf(title) >= 0; });
    var next = {};
    list.forEach(function (c) {
      var cur = (c.labels || []).filter(function (l) { return l !== title; });
      var isCol = st.cols.indexOf(title) >= 0;
      if (!all) { if (isCol) cur = cur.filter(function (l) { return st.cols.indexOf(l) < 0; }); cur.push(title); }
      next[c.id] = cur;
    });
    return bulk(list, all ? 'Etiqueta “' + title + '” removida' : 'Etiqueta “' + title + '” aplicada',
      function (c) { return postTo(c, '/labels', { labels: next[c.id] }); }, function (c) { c.labels = next[c.id]; });
  }
  function assignAgent(list, a) {
    return bulk(list, a ? 'Atribuída a ' + a.name : 'Agente removido', function (c) { return postTo(c, '/assignments', { assignee_id: a ? a.id : null }); },
      function (c) { c.meta = Object.assign({}, c.meta, { assignee: a ? { id: a.id, name: a.name, thumbnail: a.thumbnail } : null }); });
  }
  function assignTeam(list, t) {
    return bulk(list, t ? 'Time: ' + t.name : 'Time removido', function (c) { return postTo(c, '/assignments', { team_id: t ? t.id : 0 }); },
      function (c) { c.meta = Object.assign({}, c.meta, { team: t ? { id: t.id, name: t.name } : null }); });
  }
  function markUnread(list) {
    return bulk(list, 'Marcada como não lida', function (c) { return postTo(c, '/unread'); }, function (c) { c.unread_count = c.unread_count || 1; });
  }
  function removeConvs(list) {
    var ids = {}; list.forEach(function (c) { ids[c.id] = 1; });
    var backup = st.convs.slice();
    st.convs = st.convs.filter(function (c) { return !ids[c.id]; });
    pruneSel(); renderBoard();
    var fails = 0;
    Promise.all(list.map(function (c) { return api(cpath(c, ''), { method: 'DELETE' }).catch(function () { fails++; }); })).then(function () {
      if (fails) { toast(fails + ' não puderam ser excluídas (confira suas permissões).'); refresh(); }
      else toast(list.length > 1 ? list.length + ' conversas excluídas.' : 'Conversa excluída.');
    });
  }
  function copyText(t) {
    function fallback() { var i = h('textarea', { style: 'position:fixed;opacity:0' }); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); } catch (e) { /* sem permissão */ } i.remove(); }
    try { navigator.clipboard.writeText(t).catch(fallback); } catch (e) { fallback(); }
  }
  function convUrl(c) { return location.origin + '/app/accounts/' + st.account + '/conversations/' + c.id; }

  function closeMenu() { var m = document.getElementById('cmenu'); if (m) m.remove(); }
  function menuItems(list) {
    var one = list.length === 1 ? list[0] : null;
    var resolved = list.every(function (c) { return c.status === 'resolved'; });
    var prios = list.map(function (c) { return c.priority || ''; });
    var samePrio = prios.every(function (p) { return p === prios[0]; }) ? prios[0] : null;
    function tomorrow() { var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return Math.floor(d / 1000); }
    function nextWeek() { var d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); return Math.floor(d / 1000); }
    var items = [
      { label: 'Marcar como não lida', ic: 'eye', run: function () { markUnread(list); } },
      { sep: true },
      resolved ? { label: 'Reabrir', ic: 'check', run: function () { setStatus(list, 'open', 'Reabertas'); } }
               : { label: 'Marcar como resolvida', ic: 'check', run: function () { setStatus(list, 'resolved', 'Resolvidas'); } },
      { label: 'Deixar pendente', ic: 'clock', run: function () { setStatus(list, 'pending', 'Pendentes'); } },
      { label: 'Adiar', ic: 'moon', sub: [
        { label: 'Até a próxima resposta', run: function () { setStatus(list, 'snoozed', 'Adiadas'); } },
        { label: 'Por 1 hora', run: function () { setStatus(list, 'snoozed', 'Adiadas por 1 hora', Math.floor(Date.now() / 1000) + 3600); } },
        { label: 'Até amanhã', run: function () { setStatus(list, 'snoozed', 'Adiadas até amanhã', tomorrow()); } },
        { label: 'Até a próxima semana', run: function () { setStatus(list, 'snoozed', 'Adiadas até a próxima semana', nextWeek()); } }
      ] },
      { sep: true },
      { label: 'Prioridade', ic: 'flag', sub: [['', 'Nenhuma'], ['urgent', 'Urgente'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']].map(function (p) {
        return { label: p[1], checked: samePrio === p[0], run: function () { setPriority(list, p[0] || null); } };
      }) },
      { label: 'Atribuir etiqueta', ic: 'tag', sub: st.labels.length ? st.labels.map(function (l) {
        var n = list.filter(function (c) { return (c.labels || []).indexOf(l.title) >= 0; }).length;
        return { label: l.title, dot: l.color, checked: n === list.length, partial: n > 0 && n < list.length, keep: false, run: function () { toggleLabel(list, l.title); } };
      }) : [{ label: 'Nenhuma etiqueta criada', disabled: true }] },
      { label: 'Atribuir Agente', ic: 'user', sub: [{ label: 'Ninguém (remover)', run: function () { assignAgent(list, null); } }].concat(st.agents.map(function (a) {
        var same = list.every(function (c) { return c.meta && c.meta.assignee && c.meta.assignee.id === a.id; });
        return { label: a.name, checked: same, run: function () { assignAgent(list, a); } };
      })) },
      { label: 'Atribuir time', ic: 'users', sub: st.teams.length ? [{ label: 'Nenhum (remover)', run: function () { assignTeam(list, null); } }].concat(st.teams.map(function (t) {
        var same = list.every(function (c) { return c.meta && c.meta.team && c.meta.team.id === t.id; });
        return { label: t.name, checked: same, run: function () { assignTeam(list, t); } };
      })) : [{ label: 'Nenhum time criado', disabled: true }] }
    ];
    if (one) {
      items.push({ sep: true });
      items.push({ label: 'Abrir em nova aba', ic: 'ext', run: function () { window.open(convUrl(one), '_blank', 'noopener'); } });
      items.push({ label: 'Copiar link da conversa', ic: 'link', run: function () { copyText(convUrl(one)); toast('Link copiado.'); } });
    }
    items.push({ sep: true });
    items.push({ label: list.length > 1 ? 'Excluir ' + list.length + ' conversas' : 'Excluir conversa', ic: 'trash', danger: true, confirm: true, run: function () { removeConvs(list); } });
    return items;
  }

  function openMenu(x, y, list, above) {
    closeMenu(); closePopover();
    if (!list.length) return;
    var menu = h('div', { class: 'cmenu', id: 'cmenu', role: 'menu', onclick: function (e) { e.stopPropagation(); }, oncontextmenu: function (e) { e.preventDefault(); } });
    if (list.length > 1) menu.appendChild(h('div', { class: 'mtitle', text: list.length + ' conversas selecionadas' }));
    function build(items, host) {
      items.forEach(function (it) {
        if (it.sep) { host.appendChild(h('div', { class: 'msep' })); return; }
        var row = h('div', { class: 'mitem' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '') + (it.sub ? ' has-sub' : ''), role: 'menuitem' },
          it.ic ? icon(it.ic, 16) : (it.dot !== undefined ? h('span', { class: 'mdot', style: 'background:' + (it.dot || '#98a2b3') }) : h('span', { class: 'mgap' })),
          h('span', { class: 'ml', text: it.label }),
          it.checked ? icon('tick', 14) : (it.partial ? h('span', { class: 'part', text: '–' }) : null),
          it.sub ? icon('chevR', 14) : null);
        if (it.sub) {
          var sub = h('div', { class: 'cmenu sub' });
          build(it.sub, sub);
          row.appendChild(sub);
          var show = function () {
            [].forEach.call(host.querySelectorAll(':scope > .mitem.open'), function (o) { if (o !== row) o.classList.remove('open'); });
            row.classList.add('open');
            sub.style.top = '-6px'; sub.style.left = ''; sub.style.right = ''; sub.classList.remove('flip');
            var r = sub.getBoundingClientRect();
            if (r.right > window.innerWidth - 4) sub.classList.add('flip');
            if (r.bottom > window.innerHeight - 4) sub.style.top = (-6 - (r.bottom - window.innerHeight + 8)) + 'px';
          };
          row.addEventListener('mouseenter', show);
          row.addEventListener('click', function (e) { e.stopPropagation(); show(); });
        } else if (!it.disabled) {
          row.addEventListener('mouseenter', function () { [].forEach.call(host.querySelectorAll(':scope > .mitem.open'), function (o) { o.classList.remove('open'); }); });
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            if (it.confirm && !row.dataset.sure) { row.dataset.sure = '1'; row.querySelector('.ml').textContent = 'Clique para confirmar'; return; }
            closeMenu();
            it.run();
          });
        }
        host.appendChild(row);
      });
    }
    build(menuItems(list), menu);
    document.body.appendChild(menu);
    var r = menu.getBoundingClientRect();
    var left = Math.min(x, window.innerWidth - r.width - 8);
    var top = above ? y - r.height - 8 : Math.min(y, window.innerHeight - r.height - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
    if (left + r.width + 220 > window.innerWidth) menu.classList.add('left-subs');
  }
  document.addEventListener('click', closeMenu);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('cmenu')) closeMenu(); else if (!document.getElementById('modal')) clearSel();
  });

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
      var off = hasKey('status');
      return h('button', { class: 'tab' + (s[0] === st.status && !off ? ' active' : '') + (off ? ' off' : ''), type: 'button', role: 'tab', text: s[1], title: off ? 'O filtro avançado de status está em uso' : null, disabled: off,
        onclick: function () { st.status = s[0]; store('kanban.status', st.status); renderHeaderInto(); refresh(); } });
    }));

    var inboxSel = h('select', { 'aria-label': 'Caixa de entrada', disabled: hasKey('inbox_id'), title: hasKey('inbox_id') ? 'O filtro avançado de caixa de entrada está em uso' : null, onchange: function (e) { st.inbox = e.target.value; store('kanban.inbox', st.inbox); renderHeaderInto(); refresh(); } },
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

    var n = st.filters.length;
    var filtBtn = h('button', { class: 'btn' + (n ? ' on' : ''), type: 'button', onclick: function (e) { e.stopPropagation(); closePopover(); openFilterModal(); } },
      icon('filter'), 'Filtros', n ? h('span', { class: 'badge', text: String(n) }) : null);
    var viewBtn = h('button', { class: 'btn' + (st.view ? ' on' : ''), type: 'button', onclick: function (e) { e.stopPropagation(); openViewsPopover(viewBtn); } },
      icon('bookmark'), st.view ? st.view.name + (isDirty() ? ' •' : '') : 'Visualizações', icon('chevron', 14));
    var toolbar = h('div', { class: 'toolbar' }, tabs, field('inbox', inboxSel, 'has-icon'), field('search', search, 'has-icon'), h('span', { class: 'grow' }), viewBtn, filtBtn);
    return h('div', { class: 'header', id: 'header' }, titleRow, toolbar, renderChips());
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

  /* ---------- filtros avançados e visualizações salvas ---------- */
  var OPS = {
    equal_to: 'É igual a', not_equal_to: 'Não é igual a', contains: 'Contém', does_not_contain: 'Não contém',
    is_present: 'Está presente', is_not_present: 'Não está presente', is_greater_than: 'É maior que',
    is_less_than: 'É menor que', days_before: 'Está antes de (dias)'
  };
  var OPS_ENUM = ['equal_to', 'not_equal_to'];
  var OPS_PRES = ['equal_to', 'not_equal_to', 'is_present', 'is_not_present'];
  var OPS_TEXT = ['equal_to', 'not_equal_to', 'contains', 'does_not_contain', 'is_present', 'is_not_present'];
  var OPS_NUM = ['equal_to', 'not_equal_to', 'is_greater_than', 'is_less_than', 'is_present', 'is_not_present'];
  var OPS_DATE = ['equal_to', 'not_equal_to', 'is_greater_than', 'is_less_than', 'days_before'];
  var PRIORITIES = [['none', 'Nenhuma'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']];
  var countriesCache = null;

  function countries() {
    if (countriesCache) return countriesCache;
    var out = [];
    try {
      var dn = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
      for (var a = 65; a <= 90; a++) for (var b = 65; b <= 90; b++) {
        var code = String.fromCharCode(a, b), name = dn.of(code);
        if (name && name !== code && name !== 'Região desconhecida') out.push([code, name]);
      }
      out.sort(function (x, y) { return x[1].localeCompare(y[1], 'pt-BR'); });
    } catch (e) { out = []; }
    countriesCache = out;
    return out;
  }

  function attrDefs() {
    var defs = [
      { key: 'status', label: 'Status', type: 'enum', ops: OPS_ENUM, options: STATUSES.filter(function (s) { return s[0] !== 'all'; }) },
      { key: 'priority', label: 'Prioridade', type: 'enum', ops: OPS_PRES, options: PRIORITIES },
      { key: 'assignee_id', label: 'Agente atribuído', type: 'enum', num: true, ops: OPS_PRES, options: st.agents.map(function (a) { return [a.id, a.name || a.available_name || ('#' + a.id)]; }) },
      { key: 'inbox_id', label: 'Caixa de Entrada', type: 'enum', num: true, ops: OPS_PRES, options: st.inboxes.map(function (i) { return [i.id, i.name]; }) },
      { key: 'team_id', label: 'Nome do Time', type: 'enum', num: true, ops: OPS_PRES, options: st.teams.map(function (t) { return [t.id, t.name]; }) },
      { key: 'contact_id', label: 'Contato', type: 'contact', ops: OPS_PRES },
      { key: 'display_id', label: 'Identificador da conversa', type: 'text', ops: ['equal_to', 'not_equal_to', 'contains', 'does_not_contain'] },
      { key: 'campaign_id', label: 'Campanha', type: 'enum', num: true, ops: OPS_PRES, options: st.campaigns.map(function (c) { return [c.id, c.title || c.name || ('#' + c.id)]; }) },
      { key: 'labels', label: 'Rótulos', type: 'enum', ops: OPS_PRES, options: st.labels.map(function (l) { return [l.title, l.title]; }) },
      { key: 'browser_language', label: 'Idioma do navegador', type: 'text', ops: OPS_TEXT },
      { key: 'country_code', label: 'País', type: 'enum', ops: OPS_TEXT, options: countries(), free: true },
      { key: 'referer', label: 'Link de referência', type: 'text', ops: OPS_TEXT },
      { key: 'created_at', label: 'Criado em', type: 'date', ops: OPS_DATE },
      { key: 'last_activity_at', label: 'Última atividade', type: 'date', ops: OPS_DATE }
    ];
    st.attrs.forEach(function (a) {
      var t = a.attribute_display_type, label = a.attribute_display_name || a.attribute_key, d;
      if (t === 'number') d = { type: 'number', ops: OPS_NUM };
      else if (t === 'date') d = { type: 'date', ops: OPS_DATE };
      else if (t === 'checkbox') d = { type: 'enum', ops: OPS_ENUM, options: [['true', 'Sim'], ['false', 'Não']] };
      else if (t === 'list') d = { type: 'enum', ops: OPS_PRES, options: (a.attribute_values || []).map(function (v) { return [v, v]; }) };
      else d = { type: 'text', ops: OPS_TEXT };
      d.key = a.attribute_key; d.label = label; d.custom = true;
      defs.push(d);
    });
    return defs;
  }
  function defFor(key) {
    return attrDefs().filter(function (d) { return d.key === key; })[0] || { key: key, label: key, type: 'text', ops: OPS_TEXT };
  }
  function needsValue(op) { return op !== 'is_present' && op !== 'is_not_present'; }
  function optLabel(def, v) {
    var o = (def.options || []).filter(function (x) { return String(x[0]) === String(v); })[0];
    if (o) return o[1];
    if (def.type === 'contact') return st.names['contact:' + v] || ('#' + v);
    return String(v);
  }
  function valuesText(def, row) {
    if (!needsValue(row.op)) return '';
    var v = row.values.map(function (x) { return def.type === 'enum' || def.type === 'contact' ? optLabel(def, x) : String(x); }).join(', ');
    return row.op === 'days_before' ? v + (v === '1' ? ' dia' : ' dias') : v;
  }

  function cleanRows(rows) {
    return rows.filter(function (r) { return !needsValue(r.op) || (r.values && r.values.length && r.values.every(function (v) { return v !== '' && v !== null && v !== undefined; })); });
  }
  function toPayload(rows) {
    var n = rows.length;
    return rows.map(function (r, i) {
      return { attribute_key: r.key, filter_operator: r.op, values: needsValue(r.op) ? r.values : [], query_operator: i < n - 1 ? (r.join || 'AND') : null };
    });
  }
  function fromPayload(payload) {
    return (payload || []).map(function (p) {
      var vals = p.values;
      if (!Array.isArray(vals)) vals = vals === undefined || vals === null || vals === '' ? [] : [vals];
      vals = vals.map(function (v) { return v && typeof v === 'object' ? (v.id !== undefined ? v.id : v.value) : v; });
      return { key: p.attribute_key, op: p.filter_operator, values: vals, join: String(p.query_operator || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND' };
    });
  }
  function activePayload() { return st.filters.length ? toPayload(st.filters) : null; }
  function hasKey(k) { return st.filters.some(function (r) { return r.key === k; }); }
  function viewPayload(v) { return (v && v.query && (v.query.payload || v.query)) || []; }
  function isDirty() {
    if (!st.view) return false;
    return JSON.stringify(toPayload(st.filters)) !== JSON.stringify(toPayload(fromPayload(viewPayload(st.view))));
  }

  function persistFilters() {
    store('kanban.filters.' + st.account, JSON.stringify({ rows: st.filters, view: st.view ? st.view.id : null }));
  }
  function restoreFilters() {
    st.filters = []; st.view = null;
    var raw = store('kanban.filters.' + st.account);
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      st.filters = cleanRows(o.rows || []);
      if (o.view) st.view = st.views.filter(function (v) { return v.id === o.view; })[0] || null;
    } catch (e) { st.filters = []; }
  }
  function setFilters(rows, view) {
    st.filters = cleanRows(rows);
    st.view = view || null;
    persistFilters();
    renderHeaderInto();
    refresh();
  }

  function renderChips() {
    var wrap = h('div', { class: 'fchips', id: 'fchips', style: st.filters.length ? null : 'display:none' });
    st.filters.forEach(function (r, i) {
      var d = defFor(r.key), vt = valuesText(d, r);
      wrap.appendChild(h('span', { class: 'fchip' },
        h('span', { class: 'k', text: d.label }), h('span', { class: 'o', text: (OPS[r.op] || r.op).toLowerCase() }), vt ? h('span', { class: 'v', text: vt }) : null,
        h('button', { type: 'button', 'aria-label': 'Remover filtro', onclick: function () {
          var rows = st.filters.slice(); rows.splice(i, 1);
          setFilters(rows, st.view);
        } }, icon('x', 12))));
      if (i < st.filters.length - 1) wrap.appendChild(h('span', { class: 'join', text: r.join === 'OR' ? 'ou' : 'e' }));
    });
    if (st.filters.length) wrap.appendChild(h('button', { class: 'link', type: 'button', text: 'Limpar tudo', onclick: function () { setFilters([], null); } }));
    return wrap;
  }

  /* --- editor de valor de uma linha --- */
  function valueEditor(row, def) {
    if (!needsValue(row.op)) return h('div', { class: 'val none', text: '—' });
    if (def.type === 'text' || def.type === 'number') {
      return h('input', { class: 'inp', type: def.type === 'number' ? 'number' : 'text', placeholder: 'Digite o valor', value: row.values[0] !== undefined ? row.values[0] : '',
        oninput: function (e) { row.values = e.target.value === '' ? [] : [e.target.value]; } });
    }
    if (def.type === 'date') {
      if (row.op === 'days_before') {
        return h('input', { class: 'inp', type: 'number', min: '0', placeholder: 'Número de dias', value: row.values[0] !== undefined ? row.values[0] : '',
          oninput: function (e) { row.values = e.target.value === '' ? [] : [e.target.value]; } });
      }
      return h('input', { class: 'inp', type: 'date', value: row.values[0] || '', oninput: function (e) { row.values = e.target.value ? [e.target.value] : []; } });
    }
    var box = h('div', { class: 'multi' });
    if (def.type === 'contact') {
      var inp = h('input', { class: 'inp', type: 'search', placeholder: 'Buscar contato por nome, e-mail ou telefone' });
      var res = h('div', { class: 'results', style: 'display:none' });
      var timer = null;
      inp.addEventListener('input', function () {
        clearTimeout(timer);
        var q = inp.value.trim();
        if (q.length < 2) { res.style.display = 'none'; return; }
        timer = setTimeout(function () {
          api('/accounts/' + st.account + '/contacts/search?q=' + encodeURIComponent(q)).then(function (r) {
            var list = (r && r.payload) || [];
            res.innerHTML = '';
            list.slice(0, 8).forEach(function (c) {
              res.appendChild(h('button', { type: 'button', onclick: function () {
                st.names['contact:' + c.id] = c.name || c.email || c.phone_number || ('#' + c.id);
                if (row.values.indexOf(c.id) < 0) row.values.push(c.id);
                draw();
              } }, h('span', { text: c.name || '(sem nome)' }), h('small', { text: c.email || c.phone_number || '' })));
            });
            if (!list.length) res.appendChild(h('div', { class: 'none', text: 'Nenhum contato encontrado' }));
            res.style.display = '';
          }).catch(function () { res.style.display = 'none'; });
        }, 250);
      });
      box._extra = h('div', { class: 'picker' }, inp, res);
    }
    function draw() {
      box.innerHTML = '';
      row.values.forEach(function (v, i) {
        box.appendChild(h('span', { class: 'vchip' }, optLabel(def, v), h('button', { type: 'button', 'aria-label': 'Remover', onclick: function () { row.values.splice(i, 1); draw(); } }, icon('x', 10))));
      });
      if (def.type === 'contact') { box.appendChild(box._extra); return; }
      var left = def.options.filter(function (o) { return row.values.map(String).indexOf(String(o[0])) < 0; });
      if (left.length || !def.options.length) {
        var sel = h('select', { class: 'sel add', onchange: function (e) {
          var raw = e.target.value;
          if (raw === '') return;
          row.values.push(def.num ? Number(raw) : raw);
          draw();
        } }, h('option', { value: '', text: row.values.length ? '+ adicionar' : 'Selecionar…' }),
          left.map(function (o) { return h('option', { value: String(o[0]), text: o[1] }); }));
        box.appendChild(sel);
      }
    }
    draw();
    return box;
  }

  function closeModal() { var m = document.getElementById('modal'); if (m) m.remove(); document.removeEventListener('keydown', escClose); }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }

  function openFilterModal() {
    closeModal();
    var defs = attrDefs();
    var rows = st.filters.map(function (r) { return { key: r.key, op: r.op, values: r.values.slice(), join: r.join }; });
    if (!rows.length) rows.push({ key: 'status', op: 'equal_to', values: [], join: 'AND' });
    var list = h('div', { class: 'frows' });

    function draw() {
      list.innerHTML = '';
      rows.forEach(function (r, i) {
        var def = defs.filter(function (d) { return d.key === r.key; })[0] || defFor(r.key);
        if (defs.indexOf(def) < 0) defs.push(def);
        var attrSel = h('select', { class: 'sel', 'aria-label': 'Atributo', onchange: function (e) {
          r.key = e.target.value; var nd = defFor(r.key); r.op = nd.ops[0]; r.values = []; draw();
        } }, defs.map(function (d) { return h('option', { value: d.key, text: d.label, selected: d.key === r.key }); }));
        var opSel = h('select', { class: 'sel', 'aria-label': 'Operador', onchange: function (e) {
          r.op = e.target.value;
          if (!needsValue(r.op)) r.values = [];
          else if (def.type === 'date') r.values = [];
          draw();
        } }, def.ops.map(function (o) { return h('option', { value: o, text: OPS[o], selected: o === r.op }); }));
        list.appendChild(h('div', { class: 'frow' }, attrSel, opSel, valueEditor(r, def),
          h('button', { class: 'ibtn', type: 'button', title: 'Remover', 'aria-label': 'Remover filtro', onclick: function () { rows.splice(i, 1); if (!rows.length) rows.push({ key: 'status', op: 'equal_to', values: [], join: 'AND' }); draw(); } }, icon('x', 14))));
        if (i < rows.length - 1) {
          list.appendChild(h('div', { class: 'fjoin' }, h('select', { class: 'sel mini', 'aria-label': 'Combinar com a próxima', onchange: function (e) { r.join = e.target.value; } },
            h('option', { value: 'AND', text: 'E', selected: r.join !== 'OR' }), h('option', { value: 'OR', text: 'OU', selected: r.join === 'OR' }))));
        }
      });
    }
    draw();

    var nameInp = h('input', { class: 'inp', type: 'text', placeholder: 'Nome da visualização', value: '' });
    var saveBox = h('div', { class: 'savebox', style: 'display:none' }, nameInp,
      h('button', { class: 'btn primary', type: 'button', text: 'Salvar', onclick: function () { saveView(nameInp.value.trim()); } }));

    function collect() {
      var ok = cleanRows(rows);
      if (ok.length < rows.length) toast('Filtros sem valor foram ignorados.');
      return ok;
    }
    function saveView(name) {
      var ok = collect();
      if (!ok.length) { toast('Adicione ao menos um filtro com valor.'); return; }
      if (!name) { toast('Dê um nome para a visualização.'); nameInp.focus(); return; }
      api('/accounts/' + st.account + '/custom_filters', { method: 'POST', body: { name: name, type: 'conversation', query: { payload: toPayload(ok) } } })
        .then(function (v) {
          st.views = st.views.concat(v);
          closeModal();
          setFilters(ok, v);
          toast('Visualização “' + name + '” salva.');
        }).catch(function (e) { toast('Não foi possível salvar (' + e.message + ').'); });
    }
    function updateView() {
      var ok = collect();
      if (!ok.length) { toast('Adicione ao menos um filtro com valor.'); return; }
      api('/accounts/' + st.account + '/custom_filters/' + st.view.id, { method: 'PATCH', body: { name: st.view.name, type: 'conversation', query: { payload: toPayload(ok) } } })
        .then(function (v) {
          var nv = (v && v.id) ? v : Object.assign({}, st.view, { query: { payload: toPayload(ok) } });
          st.views = st.views.map(function (x) { return x.id === nv.id ? nv : x; });
          closeModal();
          setFilters(ok, nv);
          toast('Visualização atualizada.');
        }).catch(function (e) { toast('Não foi possível atualizar (' + e.message + ').'); });
    }

    var foot = h('div', { class: 'mfoot' },
      h('button', { class: 'btn', type: 'button', text: 'Limpar filtros', onclick: function () { closeModal(); setFilters([], null); } }),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', type: 'button', onclick: function () { saveBox.style.display = saveBox.style.display === 'none' ? '' : 'none'; if (saveBox.style.display === '') nameInp.focus(); } }, icon('bookmark'), 'Salvar como visualização'),
      st.view ? h('button', { class: 'btn', type: 'button', text: 'Atualizar “' + st.view.name + '”', onclick: updateView }) : null,
      h('button', { class: 'btn primary', type: 'button', text: 'Aplicar filtros', onclick: function () { var ok = collect(); closeModal(); setFilters(ok, st.view && ok.length ? st.view : null); } }));

    var modal = h('div', { class: 'modal-bg', id: 'modal', onmousedown: function (e) { if (e.target === modal) closeModal(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': 'Filtrar conversas' },
        h('div', { class: 'mhead' }, h('h2', { text: 'Filtrar conversas' }),
          h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Fechar', onclick: closeModal }, icon('x', 16))),
        h('div', { class: 'mbody' }, list,
          h('button', { class: 'link add', type: 'button', onclick: function () { rows.push({ key: 'status', op: 'equal_to', values: [], join: 'AND' }); draw(); } }, icon('plus', 14), 'Adicionar filtro'),
          saveBox),
        foot));
    document.body.appendChild(modal);
    document.addEventListener('keydown', escClose);
  }

  function openViewsPopover(anchor) {
    closePopover();
    var pop = h('div', { class: 'pop views', id: 'pop', onclick: function (e) { e.stopPropagation(); } });
    pop.appendChild(h('button', { class: 'vitem' + (!st.view && !st.filters.length ? ' active' : ''), type: 'button', onclick: function () { closePopover(); setFilters([], null); } }, 'Todas as conversas'));
    if (!st.views.length) pop.appendChild(h('div', { class: 'hint', text: 'Nenhuma visualização salva. Abra “Filtros” e use “Salvar como visualização”. Elas também aparecem como pastas no Chatwoot.' }));
    st.views.forEach(function (v) {
      var del = h('button', { class: 'ibtn', type: 'button', title: 'Excluir visualização', 'aria-label': 'Excluir visualização', onclick: function (e) {
        e.stopPropagation();
        if (!del.dataset.sure) {
          del.dataset.sure = '1'; del.textContent = 'Confirmar';
          del.className = 'ibtn danger';
          setTimeout(function () { if (del.isConnected) { delete del.dataset.sure; del.className = 'ibtn'; del.textContent = ''; del.appendChild(icon('trash', 14)); } }, 3000);
          return;
        }
        api('/accounts/' + st.account + '/custom_filters/' + v.id, { method: 'DELETE' }).then(function () {
          st.views = st.views.filter(function (x) { return x.id !== v.id; });
          if (st.view && st.view.id === v.id) { st.view = null; persistFilters(); }
          closePopover(); renderHeaderInto();
          toast('Visualização excluída.');
        }).catch(function (err) { toast('Não foi possível excluir (' + err.message + ').'); });
      } }, icon('trash', 14));
      pop.appendChild(h('div', { class: 'vrow' },
        h('button', { class: 'vitem' + (st.view && st.view.id === v.id ? ' active' : ''), type: 'button', title: v.name, onclick: function () { closePopover(); setFilters(fromPayload(viewPayload(v)), v); } }, icon('bookmark', 14), h('span', { text: v.name })),
        del));
    });
    var r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - 260, window.innerWidth - 280)) + 'px';
    document.body.appendChild(pop);
  }

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

    var prio = c.priority && PRIO_LABEL[c.priority];
    if (prio) chips.unshift(h('span', { class: 'chip prio p-' + c.priority, text: prio }));
    var isSel = !!st.sel[c.id];
    var el = h('a', {
      class: 'card' + (isSel ? ' picked' : ''), 'data-id': c.id, draggable: 'true', target: EMBED ? '_top' : '_blank', rel: 'noopener',
      href: '/app/accounts/' + st.account + '/conversations/' + c.id,
      ondragstart: function (e) {
        st.dragging = c;
        e.dataTransfer.setData('text/plain', String(c.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { el.classList.add('dragging'); }, 0);
      },
      ondragend: function () { st.dragging = null; el.classList.remove('dragging'); },
      onclick: function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || selCount()) { e.preventDefault(); toggleSel(c, e.shiftKey); }
      },
      oncontextmenu: function (e) {
        e.preventDefault(); e.stopPropagation();
        openMenu(e.clientX, e.clientY, st.sel[c.id] ? selected() : [c]);
      }
    },
      h('div', { class: 'top' },
        avatar(name, sender.thumbnail),
        h('div', { class: 'who' }, h('div', { class: 'name', text: name }), h('div', { class: 'time', text: ago(c.last_activity_at || c.timestamp) })),
        c.unread_count ? h('span', { class: 'unread', text: String(c.unread_count) }) : null),
      h('button', { class: 'cbox pick' + (isSel ? ' on' : ''), type: 'button', 'aria-label': 'Selecionar conversa', 'aria-pressed': isSel ? 'true' : 'false',
        onclick: function (e) { e.preventDefault(); e.stopPropagation(); toggleSel(c, e.shiftKey); } }, isSel ? icon('tick', 12) : null),
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
        if (!conv) return;
        var group = st.sel[conv.id] ? selected() : [conv];
        group = group.filter(function (c) { return columnOf(c) !== key; });
        if (group.length) moveMany(group, key);
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
        items.length ? h('button', { class: 'cbox sm' + (items.every(function (c) { return st.sel[c.id]; }) ? ' on' : ''), type: 'button', title: 'Selecionar todas desta coluna', 'aria-label': 'Selecionar todas desta coluna',
          onclick: function (e) { e.stopPropagation(); setSel(items, !items.every(function (c) { return st.sel[c.id]; })); } },
          items.every(function (c) { return st.sel[c.id]; }) ? icon('tick', 12) : null) : null,
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
    updateSelBar();
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
  }).then(function () {
    return loadConvs().catch(function (e) {
      if (!st.filters.length || e.message === 'NO_SESSION') throw e;
      st.filters = []; st.view = null; persistFilters();
      setTimeout(function () { toast('Os filtros salvos não funcionaram e foram limpos.'); }, 500);
      return loadConvs();
    });
  }).then(start).catch(fail);

  setInterval(function () {
    if (document.hidden || st.dragging || st.draggingCol || st.busy || !st.loaded || !document.getElementById('board')) return;
    refresh();
  }, REFRESH_MS);
})();
