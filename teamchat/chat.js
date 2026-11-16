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
    reply: null, edit: null, file: null, card: null, rec: null, mention: null, mentionIds: {}, sound: true, sse: null, down: false, sending: false
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
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    forward: '<path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
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
  function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // texto da mensagem: destaca @menções e transforma links em âncoras
  function renderText(m) {
    var text = m.body || '', tokens = (m.mentions || []).map(function (id) { return '@' + user(id).name; });
    if (/(^|\s)@todos\b/i.test(text)) tokens.push('@todos');
    if (!tokens.length) return linkify(text);
    tokens.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp('(' + tokens.map(esc).join('|') + ')(?![\\wÀ-ÿ])', 'gi'), out = [], last = 0, x;
    while ((x = re.exec(text))) {
      if (x.index > last) out = out.concat(linkify(text.slice(last, x.index)));
      var mine = x[1].toLowerCase() === '@todos' || (m.mentions || []).indexOf(st.me) >= 0 && x[1].toLowerCase() === ('@' + user(st.me).name).toLowerCase();
      out.push(h('span', { class: 'mention' + (mine ? ' me' : ''), text: x[1] }));
      last = x.index + x[1].length;
    }
    if (last < text.length) out = out.concat(linkify(text.slice(last)));
    return out;
  }
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
    var text = lm.deleted ? 'Mensagem apagada' : (lm.body || (lm.has_card ? 'Card compartilhado' : lm.has_file ? (/^audio\//.test(lm.file_mime || '') ? 'Mensagem de voz' : 'Anexo') : ''));
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
      if (viewing) { markRead(m.room_id); } else { room.unread = (room.unread || 0) + 1; if ((m.mentions || []).indexOf(st.me) >= 0) room.unread_mentions = (room.unread_mentions || 0) + 1; }
      if (!viewing) { beep(); desktopNotify(room, m); }
    }
    renderRooms(); postUnread();
    if (st.active === m.room_id) renderMsgs(wasBottom || mine ? 'bottom' : 'keep');
  }

  var readTimer = null;
  function markRead(id) {
    var room = roomById(id);
    if (!room) return;
    var had = room.unread || room.unread_mentions;
    room.unread = 0; room.unread_mentions = 0;
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
      var n = new Notification(room.kind === 'group' ? title(room) + ' · ' + who : who, { body: m.deleted ? '' : (((m.mentions || []).indexOf(st.me) >= 0 ? 'Mencionou você: ' : '') + (m.body || (m.card ? 'Compartilhou um card' : m.file ? (/^audio\//.test(m.file.mime) ? 'Enviou um áudio' : 'Enviou um anexo') : ''))), tag: 'room' + room.id });
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
          h('div', { class: 'row2' }, h('span', { class: 'prev', text: preview(r) }), r.unread_mentions ? h('span', { class: 'badge at', title: 'Você foi mencionado', text: '@' }) : null, r.unread ? h('span', { class: 'badge', text: r.unread > 99 ? '99+' : String(r.unread) }) : null))));
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
    st.active = id; st.reply = null; st.edit = null; st.file = null; st.card = null; closeMention();
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
      if (m.forwarded) content.push(h('div', { class: 'fwd' }, icon('forward', 12), 'Encaminhada'));
      if (m.file) content.push(fileEl(m.file));
      if (m.card) content.push(cardEl(m.card));
      if (m.body) content.push(h('span', null, renderText(m)));
    }
    var meta = h('span', { class: 'mtime' }, m.edited_at && !m.deleted ? 'editada' : null, hm(m.created_at));
    var bubble = h('div', { class: 'bubble' + (m.deleted ? ' del' : '') }, content, meta);
    if (!m.deleted) {
      var tools = h('div', { class: 'tools' }, h('button', { class: 'ibtn sm', type: 'button', title: 'Responder', 'aria-label': 'Responder', onclick: function () { st.reply = m; st.edit = null; renderComposer(true); } }, icon('reply', 14)));
      tools.appendChild(h('button', { class: 'ibtn sm', type: 'button', title: 'Encaminhar', 'aria-label': 'Encaminhar', onclick: function () { openForward(m); } }, icon('forward', 14)));
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

  function fmtDur(t) { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + two(t % 60); }
  function audioEl(f) {
    var a = h('audio', { preload: 'metadata' });
    a.controls = true;
    fileBlob(f).then(function (u) {
      a.src = u;
      // gravações do navegador chegam sem duração: força o cálculo
      a.addEventListener('loadedmetadata', function () {
        if (a.duration === Infinity) {
          a.currentTime = 1e101;
          a.addEventListener('timeupdate', function fix() { a.removeEventListener('timeupdate', fix); a.currentTime = 0; });
        }
      });
    }).catch(function () { a.replaceWith(h('small', { text: 'Áudio indisponível' })); });
    return h('div', { class: 'audio' }, a);
  }
  function openChatwoot(path) {
    try { window.parent.postMessage({ type: 'feature:navigate', path: path }, location.origin); } catch (e) { /* sem pai */ }
  }
  function cardPath(c) { return '/app/accounts/' + st.account + (c.type === 'contact' ? '/contacts/' : '/conversations/') + c.id; }
  function cardEl(c) {
    var statusLabel = { open: 'Aberta', resolved: 'Resolvida', pending: 'Pendente', snoozed: 'Adiada' }[c.status] || '';
    return h('div', { class: 'card' },
      h('div', { class: 'card-top' }, avatar(c.name, c.thumb, 'sm'),
        h('div', { class: 'card-t' }, h('b', { text: c.name || (c.type === 'contact' ? 'Contato' : 'Conversa #' + c.id) }),
          h('small', { text: c.subtitle || '' }))),
      h('div', { class: 'card-foot' },
        h('span', { class: 'card-kind', text: (c.type === 'contact' ? 'Contato' : 'Conversa #' + c.id) + (statusLabel ? ' · ' + statusLabel : '') }),
        h('button', { class: 'card-open', type: 'button', text: 'Abrir', onclick: function () { openChatwoot(cardPath(c)); } })));
  }

  function fileEl(f) {
    if (/^audio\//.test(f.mime)) return audioEl(f);
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
    if (st.rec && st.rec.roomId !== room.id) cancelRec();
    el.innerHTML = '';
    if (st.rec) { renderRecBar(el); return; }
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
    if (st.card) {
      el.appendChild(h('div', { class: 'stage' }, icon(st.card.type === 'contact' ? 'user' : 'chat', 20),
        h('div', { class: 't', text: (st.card.type === 'contact' ? 'Contato: ' : 'Conversa: ') + st.card.name }),
        h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Remover card', onclick: function () { st.card = null; renderComposer(true); } }, icon('x', 14))));
    }
    var fileIn = h('input', { type: 'file', style: 'display:none', onchange: function (e) { if (e.target.files[0]) stage(e.target.files[0]); e.target.value = ''; } });
    var ta = h('textarea', { id: 'ta', rows: '1', placeholder: 'Escreva uma mensagem', 'aria-label': 'Mensagem', 'data-edit': st.edit ? String(st.edit.id) : '' });
    ta.value = text;
    var sendBtn = h('button', { class: 'ibtn send', id: 'sendbtn', type: 'button', title: 'Enviar', 'aria-label': 'Enviar', onclick: send }, icon('send'));
    var micBtn = h('button', { class: 'ibtn mic', id: 'micbtn', type: 'button', title: 'Gravar áudio', 'aria-label': 'Gravar áudio', onclick: startRec }, icon('mic', 18));
    function fit() {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
      var any = !!(ta.value.trim() || st.file || st.card);
      sendBtn.style.display = any || st.edit ? '' : 'none'; micBtn.style.display = any || st.edit ? 'none' : '';
      sendBtn.disabled = !any;
    }
    ta.addEventListener('input', function () { fit(); mentionCheck(ta, room); });
    ta.addEventListener('click', function () { mentionCheck(ta, room); });
    ta.addEventListener('blur', function () { setTimeout(closeMention, 150); });
    ta.addEventListener('keydown', function (e) {
      if (st.mention) {
        var mm = st.mention;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mm.i = (mm.i + (e.key === 'ArrowDown' ? 1 : mm.items.length - 1)) % mm.items.length; drawMention(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(ta, mm.items[mm.i]); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } if (e.key === 'Escape' && (st.edit || st.reply)) { st.edit = null; st.reply = null; ta.value = ''; renderComposer(true); } });
    ta.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) { e.preventDefault(); stage(items[0]); }
    });
    var attachBtn = h('button', { class: 'ibtn', type: 'button', title: 'Anexar', 'aria-label': 'Anexar', onclick: function () { toggleAttach(attachBtn, fileIn); } }, icon('clip'));
    el.appendChild(h('div', { class: 'box' }, attachBtn, fileIn, ta, room.kind === 'group' ? h('button', { class: 'ibtn', type: 'button', title: 'Mencionar alguém', 'aria-label': 'Mencionar alguém', onclick: function () {
      var p = ta.selectionStart || ta.value.length, before = ta.value.slice(0, p), pre = before && !/\s$/.test(before) ? ' ' : '';
      ta.value = before + pre + '@' + ta.value.slice(p); ta.focus(); var np = (before + pre + '@').length; ta.setSelectionRange(np, np); mentionCheck(ta, room);
    } }, icon('at')) : null, micBtn, sendBtn));
    fit();
    if (focus !== false) setTimeout(function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }

  /* --- menções (@) em grupos --- */
  function norm(t) { return String(t).toLowerCase().normalize ? String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(t).toLowerCase(); }
  function closeMention() { st.mention = null; var p = document.getElementById('mention'); if (p) p.remove(); }
  function mentionCheck(ta, room) {
    if (room.kind !== 'group') { closeMention(); return; }
    var pos = ta.selectionStart, before = ta.value.slice(0, pos), m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (!m) { closeMention(); return; }
    var q = norm(m[2]), start = pos - m[2].length - 1;
    var items = room.members.filter(function (x) { return x.user_id !== st.me; }).map(function (x) { return { id: x.user_id, name: user(x.user_id).name, thumb: user(x.user_id).thumb }; })
      .filter(function (x) { return norm(x.name).split(/\s+/).some(function (w) { return w.indexOf(q) === 0; }) || norm(x.name).indexOf(q) === 0; });
    if ('todos'.indexOf(q) === 0) items.unshift({ id: 0, name: 'todos', all: true });
    items = items.slice(0, 6);
    if (!items.length) { closeMention(); return; }
    st.mention = { items: items, i: st.mention && st.mention.i < items.length ? st.mention.i : 0, start: start, end: pos };
    drawMention();
  }
  function drawMention() {
    var mm = st.mention, comp = document.getElementById('composer');
    if (!mm || !comp) return;
    var p = document.getElementById('mention');
    if (!p) { p = h('div', { class: 'mention-pop', id: 'mention', role: 'listbox' }); comp.appendChild(p); }
    p.innerHTML = '';
    mm.items.forEach(function (it, i) {
      p.appendChild(h('button', { class: 'person' + (i === mm.i ? ' sel' : ''), type: 'button', role: 'option', onmousedown: function (e) { e.preventDefault(); pickMention(document.getElementById('ta'), it); } },
        it.all ? h('span', { class: 'avatar sm all' }, icon('users', 14)) : avatar(it.name, it.thumb, 'xs'),
        h('span', { class: 'n', text: it.all ? 'todos — avisar o grupo inteiro' : it.name })));
    });
  }
  function pickMention(ta, it) {
    var mm = st.mention; if (!mm || !ta || !it) return;
    var ins = '@' + it.name + ' ';
    ta.value = ta.value.slice(0, mm.start) + ins + ta.value.slice(mm.end);
    var np = mm.start + ins.length; ta.setSelectionRange(np, np); ta.focus();
    closeMention(); ta.dispatchEvent(new Event('input'));
  }
  // ids dos participantes citados no texto (o servidor revalida)
  function mentionIdsIn(text, room) {
    if (room.kind !== 'group') return [];
    return room.members.filter(function (x) {
      if (x.user_id === st.me) return false;
      return new RegExp('(^|\\s)@' + esc(user(x.user_id).name) + '(?![\\wÀ-ÿ])', 'i').test(text);
    }).map(function (x) { return x.user_id; });
  }

  /* --- gravação de áudio --- */
  var REC_MAX = 300;
  function startRec() {
    var room = roomById(st.active);
    if (!room || st.rec) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('Este navegador não permite gravar áudio.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      var mime = types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
      var mr;
      try { mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); toast('Não foi possível iniciar a gravação.'); return; }
      var rec = { mr: mr, stream: stream, chunks: [], t0: Date.now(), cancel: false, roomId: room.id, timer: null, reply: st.reply };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        clearInterval(rec.timer);
        if (st.rec === rec) st.rec = null;
        if (rec.cancel) { renderComposer(true); return; }
        var type = baseOf(mr.mimeType || mime || 'audio/webm'), blob = new Blob(rec.chunks, { type: type });
        if (blob.size < 1000) { toast('Gravação muito curta.'); renderComposer(true); return; }
        sendAudio(blob, rec.roomId, rec.reply);
      };
      mr.start(1000);
      st.rec = rec;
      rec.timer = setInterval(function () {
        var s = (Date.now() - rec.t0) / 1000, t = document.getElementById('rectime');
        if (t) t.textContent = fmtDur(s);
        if (s >= REC_MAX) stopRec(false);
      }, 250);
      renderComposer(false);
    }).catch(function () { toast('Não foi possível usar o microfone. Libere a permissão no navegador.'); });
  }
  function baseOf(m) { return String(m).split(';')[0].trim().toLowerCase(); }
  function stopRec(cancel) { var r = st.rec; if (!r) return; r.cancel = !!cancel; try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) { r.cancel = true; } }
  function cancelRec() { var r = st.rec; if (!r) return; stopRec(true); st.rec = null; }
  function renderRecBar(el) {
    el.appendChild(h('div', { class: 'recbar' },
      h('button', { class: 'ibtn', type: 'button', title: 'Descartar', 'aria-label': 'Descartar gravação', onclick: function () { cancelRec(); renderComposer(true); } }, icon('trash')),
      h('span', { class: 'recdot' }), h('span', { class: 'rectime', id: 'rectime', text: fmtDur((Date.now() - st.rec.t0) / 1000) }),
      h('span', { class: 'rechint', text: 'Gravando…' }),
      h('button', { class: 'ibtn send', type: 'button', title: 'Enviar áudio', 'aria-label': 'Enviar áudio', onclick: function () { stopRec(false); } }, icon('send'))));
  }
  function sendAudio(blob, roomId, reply) {
    var ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm', d = new Date();
    st.sending = true;
    toBase64(blob).then(function (data) {
      var body = { body: '', file: { name: 'audio-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '.' + ext, mime: blob.type, data: data } };
      if (reply && reply.room_id === roomId) body.reply_to = reply.id;
      return chat('/rooms/' + roomId + '/messages', 'POST', body);
    }).then(function (r) { st.sending = false; if (st.reply === reply) st.reply = null; onNewMessage(r.message); renderComposer(true); })
      .catch(function (e) { st.sending = false; renderComposer(true); fail(e); });
  }

  /* --- menu de anexos e cards do Chatwoot --- */
  function closeAttach() { var p = document.getElementById('attach'); if (p) p.remove(); document.removeEventListener('mousedown', outsideAttach, true); }
  function outsideAttach(e) { var p = document.getElementById('attach'); if (p && !p.contains(e.target) && !(e.target.closest && e.target.closest('.box .ibtn'))) closeAttach(); }
  function toggleAttach(btn, fileIn) {
    if (document.getElementById('attach')) { closeAttach(); return; }
    var pop = h('div', { class: 'attach-pop', id: 'attach' },
      h('button', { type: 'button', onclick: function () { closeAttach(); fileIn.click(); } }, icon('file', 16), 'Arquivo, imagem ou áudio'),
      h('button', { type: 'button', onclick: function () { closeAttach(); openCardPicker('conversation'); } }, icon('chat', 16), 'Conversa do Chatwoot'),
      h('button', { type: 'button', onclick: function () { closeAttach(); openCardPicker('contact'); } }, icon('user', 16), 'Contato do Chatwoot'));
    document.getElementById('composer').appendChild(pop);
    setTimeout(function () { document.addEventListener('mousedown', outsideAttach, true); }, 0);
  }
  function toCard(type, x) {
    if (type === 'contact') {
      return { type: 'contact', id: x.id, name: x.name || x.email || x.phone_number || 'Contato #' + x.id, subtitle: x.email || x.phone_number || '', thumb: x.thumbnail || '' };
    }
    var sender = (x.meta && x.meta.sender) || x.contact || {};
    var last = x.messages && x.messages.length ? x.messages[x.messages.length - 1] : null;
    return { type: 'conversation', id: x.id, name: sender.name || 'Conversa #' + x.id, subtitle: (last && (last.content || (last.attachments && last.attachments.length ? 'Anexo' : ''))) || '', thumb: sender.thumbnail || '', status: x.status || '' };
  }
  function pickerFetch(type, q) {
    var base = '/accounts/' + st.account;
    if (type === 'contact') {
      return cw(q ? base + '/contacts/search?q=' + encodeURIComponent(q) : base + '/contacts?page=1').then(function (r) { return ((r && r.payload) || []).map(function (x) { return toCard('contact', x); }); });
    }
    return cw(q ? base + '/conversations/search?q=' + encodeURIComponent(q) : base + '/conversations?status=all&assignee_type=all&page=1').then(function (r) {
      var list = (r && r.data && r.data.payload) || (r && r.payload) || [];
      return list.map(function (x) { return toCard('conversation', x); });
    });
  }
  function openCardPicker(type) {
    var list = h('div', { class: 'people' }), timer = null, seq = 0;
    function load(q) {
      var my = ++seq;
      list.innerHTML = ''; list.appendChild(h('div', { class: 'empty-list', text: 'Buscando…' }));
      pickerFetch(type, q).then(function (cards) {
        if (my !== seq) return;
        list.innerHTML = '';
        cards.slice(0, 40).forEach(function (c) {
          list.appendChild(h('button', { class: 'person', type: 'button', onclick: function () { st.card = c; closeModal(); renderComposer(true); } },
            avatar(c.name, c.thumb, 'sm'), h('span', { class: 'n' }, c.name, h('small', { text: '  ' + (type === 'contact' ? c.subtitle : '#' + c.id + (c.subtitle ? ' · ' + c.subtitle.slice(0, 40) : '')) }))));
        });
        if (!cards.length) list.appendChild(h('div', { class: 'empty-list', text: 'Nada encontrado.' }));
      }).catch(function () { if (my !== seq) return; list.innerHTML = ''; list.appendChild(h('div', { class: 'empty-list', text: 'Não foi possível buscar no Chatwoot.' })); });
    }
    var input = h('input', { class: 'inp', type: 'search', placeholder: type === 'contact' ? 'Buscar contato por nome, e-mail ou telefone' : 'Buscar conversa por contato, e-mail ou mensagem', oninput: function (e) { clearTimeout(timer); var q = e.target.value.trim(); timer = setTimeout(function () { load(q); }, 300); } });
    modal(type === 'contact' ? 'Compartilhar contato' : 'Compartilhar conversa', h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, input, list), null);
    load(''); setTimeout(function () { input.focus(); }, 0);
  }

  /* --- destinatários: encaminhar mensagem / compartilhar card --- */
  function openRecipients(opts) {
    var picked = {}, comment = opts.comment ? h('input', { class: 'inp', type: 'text', maxlength: '500', placeholder: 'Adicionar um comentário (opcional)' }) : null;
    var q = '', list = h('div', { class: 'people' });
    var sendBtn = h('button', { class: 'btn primary', type: 'button', text: opts.button || 'Enviar', disabled: true });
    function count() { return Object.keys(picked).length; }
    function sync() { sendBtn.disabled = !count(); sendBtn.textContent = (opts.button || 'Enviar') + (count() ? ' (' + count() + ')' : ''); }
    function row(key, avatarEl, name, sub) {
      var on = !!picked[key];
      return h('button', { class: 'person', type: 'button', onclick: function () { if (picked[key]) delete picked[key]; else picked[key] = true; draw(); sync(); } },
        avatarEl, h('span', { class: 'n' }, name, sub ? h('small', { text: '  ' + sub }) : null), h('span', { class: 'chk' + (on ? ' on' : '') }, on ? icon('tick', 12) : null));
    }
    function draw() {
      list.innerHTML = '';
      st.rooms.filter(function (r) { return !q || title(r).toLowerCase().indexOf(q) >= 0; }).forEach(function (r) {
        list.appendChild(row('r' + r.id, roomAvatar(r, 'sm'), title(r), r.kind === 'group' ? 'grupo' : ''));
      });
      Object.keys(st.users).map(Number).filter(function (id) {
        return id !== st.me && user(id).name.toLowerCase().indexOf(q) >= 0 && !st.rooms.some(function (r) { return r.kind === 'dm' && otherId(r) === id; });
      }).forEach(function (id) { var u = user(id); list.appendChild(row('u' + id, avatar(u.name, u.thumb, 'sm', u.status), u.name, '')); });
      if (!list.children.length) list.appendChild(h('div', { class: 'empty-list', text: 'Nada encontrado.' }));
    }
    draw();
    sendBtn.addEventListener('click', function () {
      var keys = Object.keys(picked); if (!keys.length) return;
      sendBtn.disabled = true;
      var text = comment ? comment.value.trim() : '', done = 0, errs = 0, sentTo = [];
      keys.reduce(function (p, key) {
        return p.then(function () {
          return (key.charAt(0) === 'r' ? Promise.resolve(Number(key.slice(1))) : chat('/rooms', 'POST', { kind: 'dm', user_id: Number(key.slice(1)) }).then(function (r) { upsertRoom(r.room); return r.room.id; }))
            .then(function (roomId) { return opts.run(roomId, text).then(function () { sentTo.push(roomId); }); }).then(function () { done++; }).catch(function () { errs++; });
        });
      }, Promise.resolve()).then(function () {
        closeModal(); renderRooms();
        toast(errs ? (done ? 'Enviado para ' + done + ', falhou em ' + errs + '.' : 'Não foi possível enviar.') : (opts.done || 'Enviado.'));
        if (opts.open && sentTo.length === 1 && keys.length === 1) selectRoom(sentTo[0]);
      });
    });
    var body = h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      opts.preview || null,
      h('input', { class: 'inp', type: 'search', placeholder: 'Buscar conversa ou pessoa', oninput: function (e) { q = e.target.value.toLowerCase(); draw(); } }), list, comment,
      h('div', { style: 'display:flex;justify-content:flex-end;gap:8px' }, h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: closeModal }), sendBtn));
    modal(opts.title, body, null);
  }
  function openForward(m) {
    openRecipients({ title: 'Encaminhar mensagem', button: 'Encaminhar', done: 'Mensagem encaminhada.',
      preview: h('div', { class: 'fwd-prev', text: m.body || (m.card ? 'Card: ' + m.card.name : m.file ? m.file.name : 'Mensagem') }),
      run: function (roomId) { return chat('/rooms/' + roomId + '/messages', 'POST', { forward_from: m.id }).then(function (r) { onNewMessage(r.message); }); } });
  }
  function shareCards(cards, quote) {
    cards = (cards || []).filter(function (c) { return c && (c.type === 'conversation' || c.type === 'contact') && c.id; }).slice(0, 20);
    if (!cards.length) return;
    if (!st.me) { st.pendingShare = cards; st.pendingQuote = quote; return; }
    openRecipients({ title: quote ? 'Enviar mensagem' : cards.length > 1 ? 'Compartilhar ' + cards.length + ' cards' : 'Compartilhar card', button: 'Compartilhar', comment: true, open: true, done: 'Compartilhado.',
      preview: h('div', { class: 'fwd-prev', text: quote || cards.map(function (c) { return c.name; }).join(', ') }),
      run: function (roomId, text) {
        if (quote) text = '“' + quote + '”' + (text ? '\n' + text : '');
        return cards.reduce(function (p, c, i) {
          return p.then(function () { return chat('/rooms/' + roomId + '/messages', 'POST', { body: i === 0 ? text : '', card: c }).then(function (r) { onNewMessage(r.message); }); });
        }, Promise.resolve());
      } });
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
      chat('/messages/' + em.id, 'PATCH', { body: text, mentions: mentionIdsIn(text, room) }).then(function (r) { st.sending = false; st.edit = null; ta.value = ''; upsertMessage(r.message); renderRooms(); renderMsgs('keep'); renderComposer(true); })
        .catch(function (e) { st.sending = false; fail(e); });
      return;
    }
    if (!text && !st.file && !st.card) return;
    var file = st.file, reply = st.reply, card = st.card;
    st.sending = true;
    var go = file ? toBase64(file.file).then(function (data) { return { name: file.file.name, mime: file.file.type || 'application/octet-stream', data: data }; }) : Promise.resolve(null);
    go.then(function (f) {
      var body = { body: text, mentions: mentionIdsIn(text, room) }; if (f) body.file = f; if (card) body.card = card; if (reply) body.reply_to = reply.id;
      return chat('/rooms/' + room.id + '/messages', 'POST', body);
    }).then(function (r) {
      st.sending = false; st.reply = null; st.file = null; st.card = null; closeMention(); st.drafts[room.id] = '';
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
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'chat:share') { shareCards(e.data.cards, String(e.data.quote || '').slice(0, 500)); return; }
    if (e.data.type !== 'feature:visible') return;
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
      if (st.pendingShare) { var pc = st.pendingShare, pq = st.pendingQuote; st.pendingShare = null; st.pendingQuote = ''; shareCards(pc, pq); }
      setInterval(function () { if (!document.hidden) loadUsers().then(function () { renderRooms(); renderConvHead(); }); }, 60000);
    }).catch(fail);
  }
  start();
})();
