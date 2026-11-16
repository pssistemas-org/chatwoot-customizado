/* Chat da equipe (conversas privadas e grupos).
 * Roda no domínio do Chatwoot e usa a sessão já logada (cookie cw_d_session_info) para falar com o servidor do chat
 * (variável CHAT_API_URL) e com a API do Chatwoot (lista de agentes).
 * Dentro do painel do Chatwoot fica carregado em segundo plano para receber mensagens, tocar som e atualizar o contador.
 */
(function () {
  'use strict';

  var API = String(window.TEAMCHAT_API || '').replace(/\/+$/, '');
  var EMBED = window.self !== window.top;
  var qs = new URLSearchParams(location.search);
  var app = document.getElementById('app');

  var st = {
    account: null, me: null, users: {}, rooms: [], active: null, msgs: {}, q: '', visible: !EMBED, drafts: {},
    reply: null, edit: null, file: null, sound: true, sse: null, down: false, sending: false
  };

  /* ---------- utilidades ---------- */
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { /* sem storage */ }
    return null;
  }
  function h(tag, props) {
    var el = document.createElement(tag), k;
    for (k in (props || {})) {
      var v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>', clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>', back: '<path d="m15 18-6-6 6-6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', tick: '<path d="M20 6 9 17l-5-5"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };
  function icon(name, size) {
    var s = size || 16, span = document.createElement('span');
    span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
    return span.firstChild;
  }
  function toast(msg) {
    var t = h('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }
  var AV = [['#dbeafe', '#1d4ed8'], ['#dcfce7', '#15803d'], ['#fef3c7', '#a16207'], ['#fce7f3', '#be185d'], ['#e0e7ff', '#4338ca'], ['#ccfbf1', '#0f766e'], ['#ffedd5', '#c2410c'], ['#f3e8ff', '#7e22ce']];
  function avatar(name, thumb, cls, status) {
    var n = name || '?', sum = 0, i;
    for (i = 0; i < n.length; i++) sum += n.charCodeAt(i);
    var c = AV[sum % AV.length];
    var el = h('div', { class: 'avatar' + (cls ? ' ' + cls : ''), style: 'background:' + c[0] + ';color:' + c[1] });
    if (thumb) { var img = h('img', { src: thumb, alt: '', onerror: function () { img.remove(); el.insertBefore(document.createTextNode(n.charAt(0).toUpperCase()), el.firstChild); } }); el.appendChild(img); }
    else el.appendChild(document.createTextNode(n.charAt(0).toUpperCase()));
    if (status) el.appendChild(h('span', { class: 'dot ' + (status === 'online' ? '' : status === 'busy' ? 'busy' : 'off') }));
    return el;
  }
  function groupAvatar(name, cls) {
    var el = avatar(name, null, cls);
    el.firstChild.textContent = '';
    el.insertBefore(icon('users', cls === 'sm' ? 14 : 18), el.firstChild);
    return el;
  }
  function two(n) { return n < 10 ? '0' + n : String(n); }
  function hm(iso) { var d = new Date(iso); return two(d.getHours()) + ':' + two(d.getMinutes()); }
  function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(iso) {
    var d = new Date(iso), now = new Date();
    if (dayKey(iso) === dayKey(now.toISOString())) return 'Hoje';
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (dayKey(iso) === dayKey(y.toISOString())) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  function listTime(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date(), diff = (now - d) / 86400000;
    if (dayKey(iso) === dayKey(now.toISOString())) return hm(iso);
    if (diff < 2) return 'Ontem';
    if (diff < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    return two(d.getDate()) + '/' + two(d.getMonth() + 1);
  }
  function size(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function linkify(text) {
    var out = [], re = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', text: m[1] }));
      last = m.index + m[1].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function syncWithParent() {
    if (!EMBED) return;
    try {
      var pd = window.parent.document;
      var apply = function () {
        var dark = pd.documentElement.classList.contains('dark') || pd.body.classList.contains('dark');
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      };
      apply();
      var obs = new MutationObserver(apply);
      obs.observe(pd.documentElement, { attributes: true, attributeFilter: ['class'] });
      obs.observe(pd.body, { attributes: true, attributeFilter: ['class'] });
      var css = '';
      [].forEach.call(pd.styleSheets, function (sheet) {
        try { [].forEach.call(sheet.cssRules, function (r) { if (r.type === 5) css += r.cssText + '\n'; }); } catch (e) { /* folha de outro domínio */ }
      });
      if (css) document.head.appendChild(h('style', { text: css }));
    } catch (e) { /* sem acesso ao pai */ }
  }

  /* ---------- APIs ---------- */
  function session() {
    var prefix = 'cw_d_session_info=';
    var part = document.cookie.split('; ').filter(function (c) { return c.indexOf(prefix) === 0; })[0];
    if (!part) return null;
    try { return JSON.parse(decodeURIComponent(part.slice(prefix.length))); } catch (e) { return null; }
  }
  function authHeaders(json) {
    var s = session();
    if (!s) throw new Error('NO_SESSION');
    var hd = { accept: 'application/json' };
    if (json) hd['content-type'] = 'application/json';
    ['access-token', 'token-type', 'client', 'expiry', 'uid'].forEach(function (k) { if (s[k] !== undefined && s[k] !== null) hd[k] = String(s[k]); });
    return hd;
  }
  function parse(r) {
    if (r.status === 204) return null;
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error((j && j.error) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
      return j;
    });
  }
  function cw(path) {
    return fetch('/api/v1' + path, { headers: authHeaders(), credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) throw new Error('NO_SESSION');
      return parse(r);
    });
  }
  function chat(path, method, body) {
    return fetch(API + '/api/accounts/' + st.account + path, {
      method: method || 'GET', headers: authHeaders(!!body), body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { var e = new Error('NO_SESSION'); throw e; }
      return parse(r);
    });
  }
  var blobs = {};
  function fileBlob(f) {
    if (blobs[f.id]) return Promise.resolve(blobs[f.id]);
    return fetch(API + '/api/accounts/' + st.account + '/files/' + f.id, { headers: authHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) { blobs[f.id] = URL.createObjectURL(b); return blobs[f.id]; });
  }

  /* ---------- pessoas e salas ---------- */
  function user(id) { return st.users[id] || { id: id, name: 'Usuário #' + id }; }
  function otherId(room) { var m = room.members.filter(function (x) { return x.user_id !== st.me; })[0]; return m ? m.user_id : null; }
  function title(room) { return room.kind === 'group' ? (room.name || 'Grupo') : user(otherId(room)).name; }
  function roomAvatar(room, cls) {
    if (room.kind === 'group') return groupAvatar(room.name, cls);
    var u = user(otherId(room));
    return avatar(u.name, u.thumb, cls, u.status);
  }
  function roomById(id) { return st.rooms.filter(function (r) { return r.id === id; })[0]; }
  function sortRooms() {
    st.rooms.sort(function (a, b) {
      var ta = a.last_message ? a.last_message.id : 0, tb = b.last_message ? b.last_message.id : 0;
      return tb - ta || b.id - a.id;
    });
  }
  function upsertRoom(room) {
    var i = st.rooms.findIndex ? st.rooms.findIndex(function (r) { return r.id === room.id; }) : -1;
    if (i >= 0) st.rooms[i] = room; else st.rooms.push(room);
    sortRooms();
  }
  function totalUnread() { return st.rooms.reduce(function (n, r) { return n + (r.unread || 0); }, 0); }
  function postUnread() {
    if (!EMBED) return;
    try { window.parent.postMessage({ type: 'feature:unread', n: totalUnread() }, location.origin); } catch (e) { /* sem pai */ }
  }
  function preview(room) {
    var lm = room.last_message;
    if (!lm) return 'Nenhuma mensagem ainda';
    var text = lm.deleted ? 'Mensagem apagada' : (lm.body || (lm.has_file ? 'Anexo' : ''));
    var pre = '';
    if (lm.user_id === st.me) pre = 'Você: ';
    else if (room.kind === 'group') pre = user(lm.user_id).name.split(' ')[0] + ': ';
    return pre + text;
  }

  function loadRooms() {
    return chat('/rooms').then(function (r) { st.rooms = r.rooms; sortRooms(); renderRooms(); postUnread(); });
  }
  function loadUsers() {
    return cw('/accounts/' + st.account + '/agents').then(function (list) {
      (Array.isArray(list) ? list : []).forEach(function (a) {
        st.users[a.id] = { id: a.id, name: a.name || a.available_name || a.email, email: a.email, thumb: a.thumbnail || a.avatar_url || '', status: a.availability_status || '' };
      });
    }).catch(function () { /* sem lista: usa "Usuário #id" */ });
  }

  /* ---------- mensagens ---------- */
  function box(id) { return st.msgs[id] || (st.msgs[id] = { list: [], more: false, loaded: false, loading: false }); }

  function loadMessages(id, before) {
    var b = box(id);
    if (b.loading) return Promise.resolve();
    b.loading = true;
    return chat('/rooms/' + id + '/messages?limit=40' + (before ? '&before=' + before : '')).then(function (r) {
      b.loading = false;
      if (before) { b.list = r.messages.concat(b.list); } else { b.list = r.messages; b.loaded = true; }
      b.more = r.has_more;
      if (st.active === id) renderMsgs(before ? 'prepend' : 'bottom');
    }).catch(function (e) { b.loading = false; fail(e); });
  }

  function upsertMessage(m) {
    var b = box(m.room_id);
    if (b.loaded) {
      var i = b.list.findIndex(function (x) { return x.id === m.id; });
      if (i >= 0) b.list[i] = m; else { b.list.push(m); b.list.sort(function (x, y) { return x.id - y.id; }); }
      b.list.forEach(function (x) { if (x.reply && x.reply.id === m.id) { x.reply.body = m.deleted ? '' : m.body; x.reply.deleted = m.deleted; } });
    }
    var room = roomById(m.room_id);
    if (room && (!room.last_message || m.id >= room.last_message.id)) {
      room.last_message = { id: m.id, user_id: m.user_id, body: m.deleted ? '' : m.body, has_file: !!m.file, deleted: m.deleted, created_at: m.created_at };
      sortRooms();
    }
    return room;
  }

  function atBottom() { var el = document.getElementById('msgs'); return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 90; }

  function onNewMessage(m) {
    var room = roomById(m.room_id);
    if (!room) { loadRooms(); return; }
    var wasBottom = st.active === m.room_id ? atBottom() : false;
    upsertMessage(m);
    var mine = m.user_id === st.me;
    var viewing = st.active === m.room_id && st.visible && !document.hidden;
    if (!mine) {
      if (viewing) { markRead(m.room_id); } else { room.unread = (room.unread || 0) + 1; }
      if (!viewing) { beep(); desktopNotify(room, m); }
    }
    renderRooms(); postUnread();
    if (st.active === m.room_id) renderMsgs(wasBottom || mine ? 'bottom' : 'keep');
  }

  var readTimer = null;
  function markRead(id) {
    var room = roomById(id);
    if (!room) return;
    var had = room.unread;
    room.unread = 0;
    if (had) { renderRooms(); postUnread(); }
    clearTimeout(readTimer);
    readTimer = setTimeout(function () { chat('/rooms/' + id + '/read', 'POST', {}).catch(function () { /* tenta de novo na próxima */ }); }, 150);
  }

  /* ---------- tempo real ---------- */
  function connect() {
    if (st.sse) return;
    var ctrl = new AbortController(), last = Date.now(), wasDown = st.down;
    st.sse = ctrl;
    var dog = setInterval(function () { if (Date.now() - last > 70000) ctrl.abort(); }, 10000);
    fetch(API + '/api/events?account=' + st.account, { headers: authHeaders(), signal: ctrl.signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setConn(true); st.down = false;
      if (wasDown) resync();
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return;
          last = Date.now();
          buf += dec.decode(x.value, { stream: true });
          var i;
          while ((i = buf.indexOf('\n\n')) >= 0) { var blk = buf.slice(0, i); buf = buf.slice(i + 2); handle(blk); }
          return pump();
        });
      }
      return pump();
    }).catch(function () { /* cai para o finally */ }).then(function () {
      clearInterval(dog);
      st.sse = null; st.down = true; setConn(false);
      setTimeout(connect, 2000);
    });
  }
  function handle(blk) {
    var ev = (blk.match(/^event: (.*)$/m) || [])[1], data = (blk.match(/^data: (.*)$/m) || [])[1];
    if (!ev || !data) return;
    var d; try { d = JSON.parse(data); } catch (e) { return; }
    if (d.account_id && Number(d.account_id) !== Number(st.account)) return;
    if (ev === 'message') onNewMessage(d.message);
    else if (ev === 'message_update') { upsertMessage(d.message); renderRooms(); if (st.active === d.message.room_id) renderMsgs('keep'); }
    else if (ev === 'room') {
      var old = roomById(d.room.id);
      if (st.active === d.room.id || !old) upsertRoom(d.room);
      else { d.room.unread = Math.max(d.room.unread, 0); upsertRoom(d.room); }
      renderRooms(); postUnread();
      if (st.active === d.room.id) renderConvHead();
    } else if (ev === 'room_removed') {
      st.rooms = st.rooms.filter(function (r) { return r.id !== d.room_id; });
      if (st.active === d.room_id) { st.active = null; renderConv(); }
      renderRooms(); postUnread();
    } else if (ev === 'read') {
      var r = roomById(d.room_id);
      if (r) { r.unread = d.unread; r.last_read_id = d.last_read_id; renderRooms(); postUnread(); }
    }
  }
  function resync() {
    loadRooms().then(function () { if (st.active) { box(st.active).loaded = false; return loadMessages(st.active); } });
  }
  function setConn(ok) {
    var old = document.getElementById('conn');
    if (ok) { if (old) old.remove(); return; }
    if (!old && document.querySelector('.conv')) document.querySelector('.conv').appendChild(h('div', { class: 'conn', id: 'conn', text: 'Reconectando…' }));
  }

  /* ---------- avisos (som e notificação do navegador) ---------- */
  function beep() {
    if (!st.sound) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var c = beep.ctx || (beep.ctx = new Ctx());
      if (c.state === 'suspended') c.resume();
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1175, t + .12);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.14, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .4);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + .45);
    } catch (e) { /* sem áudio */ }
  }
  function desktopNotify(room, m) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var who = user(m.user_id).name;
      var n = new Notification(room.kind === 'group' ? title(room) + ' · ' + who : who, { body: m.deleted ? '' : (m.body || (m.file ? 'Enviou um anexo' : '')), tag: 'room' + room.id });
      n.onclick = function () {
        window.focus();
        try { window.parent.postMessage({ type: 'feature:open' }, location.origin); window.parent.focus(); } catch (e) { /* sem pai */ }
        selectRoom(room.id);
        n.close();
      };
    } catch (e) { /* navegador bloqueou */ }
  }

  /* ---------- tela ---------- */
  function fail(e) {
    if (e && e.message === 'NO_SESSION') {
      app.innerHTML = '';
      app.appendChild(h('div', { class: 'state' }, h('h2', { text: 'Chat da equipe' }), h('p', null, 'Sessão do Chatwoot não encontrada. ', h('a', { href: '/app/login', target: '_top', text: 'Entre no Chatwoot' }), ' e volte para esta página.')));
    } else toast((e && e.message) || 'Algo deu errado');
  }

  function renderShell() {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'tc' + (st.active ? ' conv-open' : ''), id: 'tc' },
      h('aside', { class: 'list' },
        h('div', { class: 'list-head' },
          h('h1', { text: 'Chat da equipe' }),
          h('button', { class: 'ibtn', id: 'snd', type: 'button', title: 'Som das mensagens', 'aria-label': 'Som das mensagens', onclick: toggleSound }, icon(st.sound ? 'vol' : 'mute')),
          h('button', { class: 'ibtn', type: 'button', title: 'Nova conversa', 'aria-label': 'Nova conversa', onclick: openNewChat }, icon('plus'))),
        h('div', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'Buscar conversa ou pessoa', 'aria-label': 'Buscar', value: st.q, oninput: function (e) { st.q = e.target.value; renderRooms(); } })),
        h('div', { id: 'notice' }),
        h('div', { class: 'rooms', id: 'rooms' })),
      h('section', { class: 'conv', id: 'conv' })));
    renderNotice(); renderRooms(); renderConv();
  }

  function renderNotice() {
    var n = document.getElementById('notice');
    if (!n) return;
    n.innerHTML = '';
    if ('Notification' in window && Notification.permission === 'default') {
      n.appendChild(h('div', { class: 'notice' }, icon('bell', 14), 'Receba avisos de novas mensagens.',
        h('button', { type: 'button', text: 'Ativar', onclick: function () { Notification.requestPermission().then(renderNotice); } })));
    }
  }
  function toggleSound() {
    st.sound = !st.sound; store('teamchat.sound', st.sound ? '1' : '0');
    var b = document.getElementById('snd');
    if (b) { b.innerHTML = ''; b.appendChild(icon(st.sound ? 'vol' : 'mute')); }
    if (st.sound) beep();
  }

  function renderRooms() {
    var el = document.getElementById('rooms');
    if (!el) return;
    var q = st.q.trim().toLowerCase();
    var rooms = st.rooms.filter(function (r) { return !q || title(r).toLowerCase().indexOf(q) >= 0; });
    el.innerHTML = '';
    rooms.forEach(function (r) {
      var lm = r.last_message;
      el.appendChild(h('button', { class: 'room' + (r.id === st.active ? ' active' : '') + (r.unread ? ' unread' : ''), type: 'button', onclick: function () { selectRoom(r.id); } },
        roomAvatar(r),
        h('div', { class: 'meta' },
          h('div', { class: 'row1' }, h('span', { class: 'name', text: title(r) }), h('span', { class: 'time', text: lm ? listTime(lm.created_at) : '' })),
          h('div', { class: 'row2' }, h('span', { class: 'prev', text: preview(r) }), r.unread ? h('span', { class: 'badge', text: r.unread > 99 ? '99+' : String(r.unread) }) : null))));
    });
    // pessoas que ainda não têm conversa (só quando há busca)
    if (q) {
      Object.keys(st.users).map(Number).filter(function (id) {
        return id !== st.me && user(id).name.toLowerCase().indexOf(q) >= 0 &&
          !st.rooms.some(function (r) { return r.kind === 'dm' && otherId(r) === id; });
      }).forEach(function (id) {
        var u = user(id);
        el.appendChild(h('button', { class: 'room', type: 'button', onclick: function () { startDm(id); } },
          avatar(u.name, u.thumb, '', u.status),
          h('div', { class: 'meta' }, h('div', { class: 'row1' }, h('span', { class: 'name', text: u.name })), h('div', { class: 'row2' }, h('span', { class: 'prev', text: 'Iniciar conversa' })))));
      });
    }
    if (!el.children.length) el.appendChild(h('div', { class: 'empty-list', text: q ? 'Nada encontrado.' : 'Nenhuma conversa ainda. Use o + para começar.' }));
  }

  function selectRoom(id) {
    if (st.active) st.drafts[st.active] = (document.getElementById('ta') || {}).value || '';
    st.active = id; st.reply = null; st.edit = null; st.file = null;
    var tc = document.getElementById('tc'); if (tc) tc.classList.add('conv-open');
    renderRooms(); renderConv();
    var b = box(id);
    if (!b.loaded) loadMessages(id); else renderMsgs('bottom');
    if (st.visible && !document.hidden) markRead(id);
  }

  function renderConvHead() {
    var room = roomById(st.active), el = document.getElementById('chead');
    if (!room || !el) return;
    var sub = '';
    if (room.kind === 'group') sub = room.members.length + ' participantes';
    else { var u = user(otherId(room)); sub = u.status === 'online' ? 'Online' : u.status === 'busy' ? 'Ocupado(a)' : (u.email || ''); }
    var nw = h('div', { class: 'conv-head', id: 'chead' },
      h('button', { class: 'ibtn back', type: 'button', 'aria-label': 'Voltar', onclick: function () { st.active = null; var tc = document.getElementById('tc'); if (tc) tc.classList.remove('conv-open'); renderRooms(); renderConv(); } }, icon('back')),
      roomAvatar(room, 'sm'),
      h('div', { class: 't' }, h('b', { text: title(room) }), h('small', { text: sub })),
      room.kind === 'group' ? h('button', { class: 'ibtn', type: 'button', title: 'Participantes', 'aria-label': 'Participantes', onclick: openGroupInfo }, icon('users')) : null);
    el.replaceWith(nw);
  }

  function renderConv() {
    var el = document.getElementById('conv');
    if (!el) return;
    el.innerHTML = '';
    var room = roomById(st.active);
    if (!room) {
      el.appendChild(h('div', { class: 'hello' }, h('h2', { text: 'Chat da equipe' }), h('p', { text: 'Escolha uma conversa ao lado ou comece uma nova com o botão +.' })));
      return;
    }
    el.appendChild(h('div', { class: 'conv-head', id: 'chead' }));
    renderConvHead();
    el.appendChild(h('div', { class: 'msgs', id: 'msgs' }, h('div', { class: 'spacer' }), [0, 1, 2].map(function () { return h('div', { class: 'skel', style: 'height:38px;width:' + (40 + Math.random() * 30) + '%;margin:8px 0' }); })));
    el.appendChild(h('div', { class: 'drop', text: 'Solte o arquivo para enviar' }));
    el.appendChild(h('div', { class: 'composer', id: 'composer' }));
    renderComposer();
    el.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); el.classList.add('dragging'); } });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('dragging'); });
    el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('dragging'); if (e.dataTransfer.files && e.dataTransfer.files[0]) stage(e.dataTransfer.files[0]); });
  }

  /* --- lista de mensagens --- */
  function renderMsgs(mode) {
    var el = document.getElementById('msgs'), room = roomById(st.active);
    if (!el || !room) return;
    var b = box(room.id), prevH = el.scrollHeight, prevTop = el.scrollTop, stick = mode === 'keep' ? atBottom() : false;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'spacer' }));
    if (!b.loaded) { return; }
    if (b.more) el.appendChild(h('button', { class: 'btn more', type: 'button', text: 'Carregar mensagens anteriores', onclick: function () { loadMessages(room.id, b.list[0] && b.list[0].id); } }));
    if (!b.list.length) el.appendChild(h('div', { class: 'hello', style: 'margin:auto' }, h('p', { text: 'Nenhuma mensagem ainda. Diga olá! 👋' })));
    var prev = null;
    b.list.forEach(function (m) {
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) el.appendChild(h('div', { class: 'day', text: dayLabel(m.created_at) }));
      el.appendChild(msgEl(m, prev, room));
      prev = m;
    });
    if (mode === 'bottom' || stick) el.scrollTop = el.scrollHeight;
    else if (mode === 'prepend') el.scrollTop = el.scrollHeight - prevH + prevTop;
    else el.scrollTop = prevTop;
  }

  function isAdmin(room) { var m = room.members.filter(function (x) { return x.user_id === st.me; })[0]; return !!m && m.role === 'admin'; }

  function msgEl(m, prev, room) {
    var mine = m.user_id === st.me, group = room.kind === 'group';
    var first = !prev || prev.user_id !== m.user_id || dayKey(prev.created_at) !== dayKey(m.created_at) || (new Date(m.created_at) - new Date(prev.created_at)) > 300000;
    var u = user(m.user_id);
    var content = [];
    if (m.deleted) {
      content.push('Mensagem apagada');
    } else {
      if (m.reply) {
        content.push(h('button', { class: 'reply', type: 'button', onclick: function () { jumpTo(m.reply.id); } },
          h('b', { text: m.reply.user_id === st.me ? 'Você' : user(m.reply.user_id).name }),
          h('span', { text: m.reply.deleted ? 'Mensagem apagada' : (m.reply.body || (m.reply.has_file ? 'Anexo' : '')) })));
      }
      if (m.file) content.push(fileEl(m.file));
      if (m.body) content.push(h('span', null, linkify(m.body)));
    }
    var meta = h('span', { class: 'mtime' }, m.edited_at && !m.deleted ? 'editada' : null, hm(m.created_at));
    var bubble = h('div', { class: 'bubble' + (m.deleted ? ' del' : '') }, content, meta);
    if (!m.deleted) {
      var tools = h('div', { class: 'tools' }, h('button', { class: 'ibtn sm', type: 'button', title: 'Responder', 'aria-label': 'Responder', onclick: function () { st.reply = m; st.edit = null; renderComposer(true); } }, icon('reply', 14)));
      if (mine && m.body) tools.appendChild(h('button', { class: 'ibtn sm', type: 'button', title: 'Editar', 'aria-label': 'Editar', onclick: function () { st.edit = m; st.reply = null; renderComposer(true); } }, icon('edit', 14)));
      if (mine || (group && isAdmin(room))) {
        var del = h('button', { class: 'ibtn sm', type: 'button', title: 'Apagar', 'aria-label': 'Apagar', onclick: function () {
          if (!del.dataset.sure) {
            del.dataset.sure = '1'; del.className = 'ibtn sm danger'; del.textContent = 'Apagar?';
            setTimeout(function () { if (del.isConnected) { delete del.dataset.sure; del.className = 'ibtn sm'; del.textContent = ''; del.appendChild(icon('trash', 14)); } }, 3000);
            return;
          }
          chat('/messages/' + m.id, 'DELETE').catch(fail);
        } }, icon('trash', 14));
        tools.appendChild(del);
      }
      bubble.appendChild(tools);
    }
    var col = h('div', { class: 'col' }, group && !mine && first ? h('div', { class: 'who', text: u.name }) : null, bubble);
    return h('div', { class: 'm' + (mine ? ' me' : '') + (first ? ' first' : ''), 'data-id': m.id },
      group && !mine ? (first ? h('div', { class: 'av-slot' }, avatar(u.name, u.thumb, 'xs')) : h('div', { class: 'av-slot' })) : null, col);
  }

  function jumpTo(id) {
    var el = document.querySelector('.m[data-id="' + id + '"]');
    if (!el) { toast('Essa mensagem é mais antiga. Carregue as mensagens anteriores.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1500);
  }

  function fileEl(f) {
    if (/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) {
      var img = h('img', { class: 'img', alt: f.name, title: f.name, onclick: function () { openLightbox(f); } });
      fileBlob(f).then(function (u) { img.src = u; }).catch(function () { img.alt = 'Imagem indisponível'; });
      return img;
    }
    return h('button', { class: 'file', type: 'button', title: 'Baixar', onclick: function () { download(f); } },
      h('span', { class: 'fi' }, icon('file', 18)), h('span', null, h('b', { text: f.name }), h('small', { text: size(f.size) })));
  }
  function download(f) {
    fileBlob(f).then(function (u) { var a = h('a', { href: u, download: f.name }); document.body.appendChild(a); a.click(); a.remove(); }).catch(fail);
  }
  function openLightbox(f) {
    fileBlob(f).then(function (u) {
      var lb = h('div', { class: 'lightbox', onclick: function (e) { if (e.target === lb || e.target.classList.contains('x')) lb.remove(); } },
        h('button', { class: 'ibtn x', type: 'button', 'aria-label': 'Fechar' }, icon('x', 20)), h('img', { src: u, alt: f.name }),
        h('button', { class: 'dl', type: 'button', text: 'Baixar', onclick: function () { download(f); } }));
      document.body.appendChild(lb);
    }).catch(fail);
  }

  /* --- campo de mensagem --- */
  function stage(file) {
    if (file.size > 8 * 1024 * 1024) { toast('O arquivo passa de 8 MB.'); return; }
    if (st.edit) { toast('Termine a edição antes de anexar.'); return; }
    st.file = { file: file, url: /^image\//.test(file.type) ? URL.createObjectURL(file) : null };
    renderComposer(true);
  }

  function renderComposer(focus) {
    var el = document.getElementById('composer'), room = roomById(st.active);
    if (!el || !room) return;
    var old = document.getElementById('ta');
    var text = old ? old.value : (st.edit ? st.edit.body : (st.drafts[room.id] || ''));
    if (focus && st.edit && (!old || old.dataset.edit !== String(st.edit.id))) text = st.edit.body;
    el.innerHTML = '';
    if (st.reply) {
      el.appendChild(h('div', { class: 'bar' }, icon('reply', 14),
        h('div', { class: 't' }, h('b', { text: 'Respondendo a ' + (st.reply.user_id === st.me ? 'você' : user(st.reply.user_id).name) + ': ' }), st.reply.body || 'Anexo'),
        h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Cancelar', onclick: function () { st.reply = null; renderComposer(true); } }, icon('x', 14))));
    }
    if (st.edit) {
      el.appendChild(h('div', { class: 'bar' }, icon('edit', 14), h('div', { class: 't' }, h('b', { text: 'Editando mensagem' })),
        h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Cancelar', onclick: function () { st.edit = null; var t = document.getElementById('ta'); if (t) t.value = ''; renderComposer(true); } }, icon('x', 14))));
    }
    if (st.file) {
      el.appendChild(h('div', { class: 'stage' }, st.file.url ? h('img', { src: st.file.url, alt: '' }) : icon('file', 20),
        h('div', { class: 't', text: st.file.file.name + ' · ' + size(st.file.file.size) }),
        h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Remover anexo', onclick: function () { st.file = null; renderComposer(true); } }, icon('x', 14))));
    }
    var fileIn = h('input', { type: 'file', style: 'display:none', onchange: function (e) { if (e.target.files[0]) stage(e.target.files[0]); e.target.value = ''; } });
    var ta = h('textarea', { id: 'ta', rows: '1', placeholder: 'Escreva uma mensagem', 'aria-label': 'Mensagem', 'data-edit': st.edit ? String(st.edit.id) : '' });
    ta.value = text;
    var sendBtn = h('button', { class: 'ibtn send', id: 'sendbtn', type: 'button', title: 'Enviar', 'aria-label': 'Enviar', onclick: send }, icon('send'));
    function fit() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; sendBtn.disabled = !(ta.value.trim() || st.file); }
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } if (e.key === 'Escape' && (st.edit || st.reply)) { st.edit = null; st.reply = null; ta.value = ''; renderComposer(true); } });
    ta.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) { e.preventDefault(); stage(items[0]); }
    });
    el.appendChild(h('div', { class: 'box' },
      h('button', { class: 'ibtn', type: 'button', title: 'Anexar arquivo', 'aria-label': 'Anexar arquivo', onclick: function () { fileIn.click(); } }, icon('clip')), fileIn, ta, sendBtn));
    fit();
    if (focus !== false) setTimeout(function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('Não foi possível ler o arquivo')); };
      r.readAsDataURL(file);
    });
  }

  function send() {
    var ta = document.getElementById('ta'), room = roomById(st.active);
    if (!ta || !room || st.sending) return;
    var text = ta.value.trim();
    if (st.edit) {
      if (!text) return;
      var em = st.edit;
      if (text === em.body) { st.edit = null; ta.value = ''; renderComposer(true); return; }
      st.sending = true;
      chat('/messages/' + em.id, 'PATCH', { body: text }).then(function (r) { st.sending = false; st.edit = null; ta.value = ''; upsertMessage(r.message); renderRooms(); renderMsgs('keep'); renderComposer(true); })
        .catch(function (e) { st.sending = false; fail(e); });
      return;
    }
    if (!text && !st.file) return;
    var file = st.file, reply = st.reply;
    st.sending = true;
    var go = file ? toBase64(file.file).then(function (data) { return { name: file.file.name, mime: file.file.type || 'application/octet-stream', data: data }; }) : Promise.resolve(null);
    go.then(function (f) {
      var body = { body: text }; if (f) body.file = f; if (reply) body.reply_to = reply.id;
      return chat('/rooms/' + room.id + '/messages', 'POST', body);
    }).then(function (r) {
      st.sending = false; st.reply = null; st.file = null; st.drafts[room.id] = '';
      onNewMessage(r.message);
      var t = document.getElementById('ta'); if (t) t.value = '';
      renderComposer(true);
    }).catch(function (e) { st.sending = false; fail(e); });
  }

  /* ---------- nova conversa, grupos ---------- */
  function closeModal() { var m = document.getElementById('modal'); if (m) m.remove(); }
  function modal(titleText, body, foot) {
    closeModal();
    var m = h('div', { class: 'modal-bg', id: 'modal', onmousedown: function (e) { if (e.target === m) closeModal(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': titleText },
        h('div', { class: 'modal-head' }, h('h2', { text: titleText }), h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Fechar', onclick: closeModal }, icon('x'))),
        h('div', { class: 'modal-body' }, body), foot ? h('div', { class: 'modal-foot' }, foot) : null));
    document.body.appendChild(m);
    return m;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); var lb = document.querySelector('.lightbox'); if (lb) lb.remove(); } });

  function peopleList(opts) {
    var wrap = h('div', { class: 'people' });
    var q = '';
    function draw() {
      wrap.innerHTML = '';
      var ids = Object.keys(st.users).map(Number).filter(function (id) { return id !== st.me && (!opts.exclude || opts.exclude.indexOf(id) < 0) && user(id).name.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return user(a).name.localeCompare(user(b).name, 'pt-BR'); });
      ids.forEach(function (id) {
        var u = user(id), on = opts.picked && opts.picked[id];
        wrap.appendChild(h('button', { class: 'person', type: 'button', onclick: function () { if (opts.picked) { if (on) delete opts.picked[id]; else opts.picked[id] = true; draw(); if (opts.onchange) opts.onchange(); } else opts.onpick(id); } },
          avatar(u.name, u.thumb, 'sm', u.status), h('span', { class: 'n' }, u.name, u.email ? h('small', { text: '  ' + u.email }) : null),
          opts.picked ? h('span', { class: 'chk' + (on ? ' on' : '') }, on ? icon('tick', 12) : null) : null));
      });
      if (!ids.length) wrap.appendChild(h('div', { class: 'empty-list', text: 'Ninguém encontrado.' }));
    }
    draw();
    var input = h('input', { class: 'inp', type: 'search', placeholder: 'Buscar pessoa', oninput: function (e) { q = e.target.value.toLowerCase(); draw(); } });
    return h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, input, wrap);
  }

  function startDm(id) {
    closeModal();
    chat('/rooms', 'POST', { kind: 'dm', user_id: id }).then(function (r) { upsertRoom(r.room); st.q = ''; var s = document.querySelector('.search input'); if (s) s.value = ''; selectRoom(r.room.id); }).catch(fail);
  }

  function openNewChat() {
    var mode = 'dm', picked = {}, nameInp = h('input', { class: 'inp', type: 'text', maxlength: '80', placeholder: 'Nome do grupo' });
    var body = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    var createBtn = h('button', { class: 'btn primary', type: 'button', text: 'Criar grupo', onclick: function () {
      var ids = Object.keys(picked).map(Number);
      if (!nameInp.value.trim()) { toast('Dê um nome ao grupo.'); nameInp.focus(); return; }
      if (!ids.length) { toast('Escolha ao menos uma pessoa.'); return; }
      createBtn.disabled = true;
      chat('/rooms', 'POST', { kind: 'group', name: nameInp.value.trim(), members: ids }).then(function (r) { closeModal(); upsertRoom(r.room); selectRoom(r.room.id); }).catch(function (e) { createBtn.disabled = false; fail(e); });
    } });
    var foot = h('div', { style: 'display:none' });
    function draw() {
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'tabs' },
        h('button', { class: 'tab' + (mode === 'dm' ? ' active' : ''), type: 'button', text: 'Mensagem direta', onclick: function () { mode = 'dm'; draw(); } }),
        h('button', { class: 'tab' + (mode === 'group' ? ' active' : ''), type: 'button', text: 'Grupo', onclick: function () { mode = 'group'; draw(); } })));
      if (mode === 'group') body.appendChild(nameInp);
      body.appendChild(peopleList(mode === 'dm' ? { onpick: startDm } : { picked: picked }));
      if (mode === 'group') body.appendChild(h('div', { style: 'display:flex;justify-content:flex-end;gap:8px' }, h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: closeModal }), createBtn));
    }
    modal('Nova conversa', body, null);
    draw();
  }

  function openGroupInfo() {
    var room = roomById(st.active);
    if (!room) return;
    var admin = isAdmin(room);
    var body = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    function draw() {
      room = roomById(st.active); if (!room) { closeModal(); return; }
      body.innerHTML = '';
      if (admin) {
        var nameInp = h('input', { class: 'inp', type: 'text', maxlength: '80', value: room.name || '' });
        body.appendChild(h('div', { style: 'display:flex;gap:8px' }, nameInp,
          h('button', { class: 'btn', type: 'button', text: 'Renomear', onclick: function () { if (nameInp.value.trim() && nameInp.value.trim() !== room.name) chat('/rooms/' + room.id, 'PATCH', { name: nameInp.value.trim() }).then(function () { toast('Nome atualizado.'); }).catch(fail); } })));
      }
      var list = h('div', { class: 'people' });
      room.members.forEach(function (m) {
        var u = user(m.user_id);
        var row = h('div', { class: 'person', style: 'cursor:default' }, avatar(u.name, u.thumb, 'sm', u.status),
          h('span', { class: 'n' }, u.name + (m.user_id === st.me ? ' (você)' : '')), m.role === 'admin' ? h('span', { class: 'pill', text: 'admin' }) : null);
        if (admin && m.user_id !== st.me) {
          row.appendChild(h('button', { class: 'ibtn sm', type: 'button', title: 'Remover do grupo', 'aria-label': 'Remover do grupo', onclick: function () { chat('/rooms/' + room.id + '/members/' + m.user_id, 'DELETE').catch(fail); } }, icon('x', 14)));
        }
        list.appendChild(row);
      });
      body.appendChild(list);
      var actions = h('div', { style: 'display:flex;gap:8px;justify-content:space-between' });
      if (admin) actions.appendChild(h('button', { class: 'btn', type: 'button', text: 'Adicionar pessoas', onclick: addPeople }));
      var leave = h('button', { class: 'btn', type: 'button', text: 'Sair do grupo', onclick: function () {
        if (!leave.dataset.sure) { leave.dataset.sure = '1'; leave.textContent = 'Confirmar saída'; return; }
        chat('/rooms/' + room.id + '/members/' + st.me, 'DELETE').then(closeModal).catch(fail);
      } });
      actions.appendChild(leave);
      body.appendChild(actions);
    }
    function addPeople() {
      var picked = {}, btn = h('button', { class: 'btn primary', type: 'button', text: 'Adicionar', onclick: function () {
        var ids = Object.keys(picked).map(Number);
        if (!ids.length) { toast('Escolha ao menos uma pessoa.'); return; }
        chat('/rooms/' + room.id + '/members', 'POST', { user_ids: ids }).then(function () { admin = isAdmin(roomById(room.id)); draw(); }).catch(fail);
      } });
      body.innerHTML = '';
      body.appendChild(peopleList({ picked: picked, exclude: room.members.map(function (m) { return m.user_id; }) }));
      body.appendChild(h('div', { style: 'display:flex;justify-content:flex-end;gap:8px' }, h('button', { class: 'btn', type: 'button', text: 'Voltar', onclick: draw }), btn));
    }
    modal(room.name || 'Grupo', body, null);
    draw();
    // atualiza a lista se o grupo mudar enquanto a janela está aberta
    var iv = setInterval(function () { if (!document.getElementById('modal')) { clearInterval(iv); return; } if (document.querySelector('#modal .people .person[style]')) { var r = roomById(st.active); if (r && JSON.stringify(r.members) !== iv.sig) { iv.sig = JSON.stringify(r.members); admin = isAdmin(r); draw(); } } }, 800);
  }

  /* ---------- início ---------- */
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'feature:visible') return;
    st.visible = !!e.data.visible;
    if (st.visible) {
      if (st.active) { markRead(st.active); var m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; var ta = document.getElementById('ta'); if (ta) ta.focus(); }
      loadUsers().then(function () { renderRooms(); });
    }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st.visible && st.active) markRead(st.active); });

  function start() {
    st.sound = store('teamchat.sound') !== '0';
    syncWithParent();
    if (!API || API.indexOf('__CHAT_API__') >= 0) {
      app.appendChild(h('div', { class: 'state' }, h('h2', { text: 'Chat da equipe' }), h('p', { text: 'O servidor do chat ainda não foi configurado (variável CHAT_API_URL).' })));
      return;
    }
    app.appendChild(h('div', { class: 'state' }, h('div', { class: 'skel', style: 'height:16px;width:200px;margin:0 auto 10px' }), h('div', { class: 'skel', style: 'height:16px;width:140px;margin:0 auto' })));
    cw('/profile').then(function (p) {
      st.me = Number(p.id);
      st.account = qs.get('account') || p.account_id || (p.accounts && p.accounts[0] && p.accounts[0].id);
      if (!st.account) throw new Error('conta não encontrada');
      return loadUsers();
    }).then(function () { return chat('/rooms'); }).then(function (r) {
      st.rooms = r.rooms; sortRooms();
      renderShell(); postUnread(); connect();
      setInterval(function () { if (!document.hidden) loadUsers().then(function () { renderRooms(); renderConvHead(); }); }, 60000);
    }).catch(fail);
  }
  start();
})();
