/* Servidor do chat interno da equipe.
 * - Login: reaproveita a sessão do Chatwoot (o navegador manda os mesmos cabeçalhos da API do Chatwoot,
 *   o servidor confere em /api/v1/profile e na lista de agentes da conta).
 * - Dados: schema "teamchat" no Postgres (pode ser o mesmo do Chatwoot; não mexe nas tabelas dele).
 * - Tempo real: Server-Sent Events (GET /api/events).
 */
'use strict';
const http = require('http');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const CHATWOOT_URL = (process.env.CHATWOOT_URL || '').replace(/\/+$/, '');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || CHATWOOT_URL || '').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
const MAX_FILE = Number(process.env.MAX_FILE_BYTES) || 8 * 1024 * 1024;
const MAX_BODY = 4000;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const AUDIO_MIMES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/opus'];
const baseMime = (m) => String(m || '').split(';')[0].trim().toLowerCase();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX) || 10
});
const q = (text, params) => pool.query(text, params).then((r) => r.rows);

/* ---------- utilidades ---------- */
const N = (v) => (v === null || v === undefined ? null : Number(v));
const B = (v) => v === true || v === 't' || v === 'true';
const ARR = (v) => { if (Array.isArray(v)) return v.map(Number); if (typeof v === 'string' && /^\{.*\}$/.test(v)) return v.slice(1, -1).split(',').filter(Boolean).map(Number); return []; };
const J = (v, d) => { if (v === null || v === undefined) return d; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return d; } } return v; };
const TS = (col) => `to_char(${col} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);

function send(res, status, body, extra) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, res._cors || {}, extra || {}));
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; let chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { tooBig = true; chunks = []; if (size > limit * 3) req.destroy(); return; }
      if (!tooBig) chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'Arquivo grande demais'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(bad('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/* ---------- banco ---------- */
async function migrate() {
  const sql = [
    'create schema if not exists teamchat',
    `create table if not exists teamchat.rooms (
       id bigserial primary key, account_id int not null,
       kind text not null check (kind in ('dm','group')), name text, dm_key text unique,
       created_by int not null, created_at timestamptz not null default now())`,
    `create table if not exists teamchat.members (
       room_id bigint not null references teamchat.rooms(id) on delete cascade, user_id int not null,
       role text not null default 'member', last_read_id bigint not null default 0,
       joined_at timestamptz not null default now(), primary key (room_id, user_id))`,
    'create index if not exists teamchat_members_user on teamchat.members (user_id)',
    `create table if not exists teamchat.files (
       id bigserial primary key, room_id bigint not null, name text not null, mime text not null,
       size int not null, data bytea not null, created_at timestamptz not null default now())`,
    `create table if not exists teamchat.messages (
       id bigserial primary key, room_id bigint not null references teamchat.rooms(id) on delete cascade,
       user_id int not null, body text not null default '', reply_to bigint, file_id bigint,
       edited_at timestamptz, deleted_at timestamptz, created_at timestamptz not null default now())`,
    'create index if not exists teamchat_messages_room on teamchat.messages (room_id, id desc)',
    'alter table teamchat.messages add column if not exists card text',
    "alter table teamchat.messages add column if not exists mentions int[] not null default '{}'",
    'alter table teamchat.messages add column if not exists forwarded boolean not null default false'
  ];
  for (const s of sql) await q(s);
}

/* ---------- autenticação (sessão do Chatwoot) ---------- */
const AUTH_HEADERS = ['access-token', 'token-type', 'client', 'expiry', 'uid'];
const authCache = new Map();
const agentsCache = new Map();

function cwHeaders(req) {
  const h = { accept: 'application/json' };
  AUTH_HEADERS.forEach((k) => { if (req.headers[k]) h[k] = String(req.headers[k]); });
  return h;
}

async function cw(path, req) {
  if (!CHATWOOT_URL) throw new HttpError(500, 'CHATWOOT_URL não configurada');
  const r = await fetch(CHATWOOT_URL + path, { headers: cwHeaders(req) });
  if (r.status === 401 || r.status === 403) throw new HttpError(401, 'Sessão do Chatwoot inválida');
  if (!r.ok) throw new HttpError(502, 'Chatwoot respondeu ' + r.status);
  return r.json();
}

async function authenticate(req) {
  if (!req.headers['access-token'] || !req.headers.uid || !req.headers.client) throw new HttpError(401, 'Sem sessão');
  const key = [req.headers.uid, req.headers.client, req.headers['access-token']].join('|');
  const hit = authCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.user;
  const p = await cw('/api/v1/profile', req);
  const user = { id: Number(p.id), name: p.name || p.available_name || p.email, accounts: (p.accounts || []).map((a) => ({ id: Number(a.id), role: a.role })) };
  authCache.set(key, { at: Date.now(), user, key });
  if (authCache.size > 500) for (const [k, v] of authCache) if (Date.now() - v.at > 60000) authCache.delete(k);
  return user;
}

async function accountAgents(req, acc) {
  const key = acc + '|' + req.headers['access-token'];
  const hit = agentsCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.ids;
  const list = await cw('/api/v1/accounts/' + acc + '/agents', req);
  const ids = new Set((Array.isArray(list) ? list : []).map((a) => Number(a.id)));
  agentsCache.set(key, { at: Date.now(), ids });
  return ids;
}

async function needAccount(req, acc) {
  const user = await authenticate(req);
  if (!user.accounts.some((a) => a.id === acc)) throw new HttpError(403, 'Sem acesso a esta conta');
  return user;
}

/* ---------- tempo real (SSE) ---------- */
const streams = new Map(); // userId -> Set(res)
function broadcast(userIds, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  new Set(userIds.map(Number)).forEach((u) => {
    (streams.get(u) || []).forEach((res) => { try { res.write(payload); } catch (e) { /* conexão caiu */ } });
  });
}
setInterval(() => streams.forEach((set) => set.forEach((res) => { try { res.write(': ping\n\n'); } catch (e) { /* ignora */ } })), 25000).unref();

/* ---------- salas ---------- */
const ROOM_SQL = `
  select r.id, r.account_id, r.kind, r.name, r.created_by, ${TS('r.created_at')} as created_at, m.last_read_id,
    (select coalesce(json_agg(json_build_object('user_id', mm.user_id, 'role', mm.role) order by mm.joined_at, mm.user_id), '[]'::json)
       from teamchat.members mm where mm.room_id = r.id) as members,
    (select count(*) from teamchat.messages x where x.room_id = r.id and x.id > m.last_read_id and x.user_id <> m.user_id and x.deleted_at is null) as unread,
    (select count(*) from teamchat.messages x where x.room_id = r.id and x.id > m.last_read_id and x.user_id <> m.user_id and x.deleted_at is null and m.user_id = any(x.mentions)) as unread_mentions,
    (select row_to_json(lm) from (select id, user_id, case when deleted_at is null then left(body, 200) else '' end as body,
        (file_id is not null and deleted_at is null) as has_file, (card is not null and deleted_at is null) as has_card,
        (select f.mime from teamchat.files f where f.id = file_id) as file_mime, (deleted_at is not null) as deleted, ${TS('created_at')} as created_at
        from teamchat.messages where room_id = r.id order by id desc limit 1) lm) as last_message
  from teamchat.rooms r join teamchat.members m on m.room_id = r.id and m.user_id = $2`;

function shapeRoom(r) {
  const lm = J(r.last_message, null);
  return {
    id: N(r.id), account_id: N(r.account_id), kind: r.kind, name: r.name, created_by: N(r.created_by), created_at: r.created_at,
    last_read_id: N(r.last_read_id), unread: N(r.unread) || 0, unread_mentions: N(r.unread_mentions) || 0,
    members: J(r.members, []).map((m) => ({ user_id: N(m.user_id), role: m.role })),
    last_message: lm ? { id: N(lm.id), user_id: N(lm.user_id), body: lm.body, has_file: B(lm.has_file), has_card: B(lm.has_card), file_mime: lm.file_mime || null, deleted: B(lm.deleted), created_at: lm.created_at } : null
  };
}

async function getRoom(roomId, userId) {
  const rows = await q(ROOM_SQL + ' where r.id = $1', [roomId, userId]);
  return rows[0] ? shapeRoom(rows[0]) : null;
}
async function listRooms(acc, userId) {
  const rows = await q(ROOM_SQL + ` where r.account_id = $1
    order by coalesce((select max(id) from teamchat.messages where room_id = r.id), 0) desc, r.id desc`, [acc, userId]);
  return rows.map(shapeRoom);
}
async function roomMembers(roomId) {
  const rows = await q('select user_id, role from teamchat.members where room_id = $1 order by joined_at, user_id', [roomId]);
  return rows.map((r) => ({ user_id: N(r.user_id), role: r.role }));
}
async function needMember(roomId, acc, userId) {
  const rows = await q(`select m.role, r.kind, r.account_id from teamchat.members m join teamchat.rooms r on r.id = m.room_id
    where m.room_id = $1 and m.user_id = $2`, [roomId, userId]);
  if (!rows[0] || N(rows[0].account_id) !== acc) throw new HttpError(404, 'Conversa não encontrada');
  return { role: rows[0].role, kind: rows[0].kind };
}
async function pushRoom(roomId, acc, extraUsers) {
  const members = await roomMembers(roomId);
  const ids = members.map((m) => m.user_id).concat(extraUsers || []);
  for (const uid of new Set(ids)) {
    const room = await getRoom(roomId, uid);
    if (room) broadcast([uid], 'room', { account_id: acc, room });
    else broadcast([uid], 'room_removed', { account_id: acc, room_id: roomId });
  }
}

/* ---------- mensagens ---------- */
const MSG_SQL = `
  select m.id, m.room_id, m.user_id, case when m.deleted_at is null then m.body else '' end as body, m.reply_to,
    ${TS('m.created_at')} as created_at, ${TS('m.edited_at')} as edited_at, (m.deleted_at is not null) as deleted,
    f.id as file_id, f.name as file_name, f.mime as file_mime, f.size as file_size, m.card, m.mentions, m.forwarded,
    (select row_to_json(rp) from (select r.id, r.user_id, case when r.deleted_at is null then left(r.body, 120) else '' end as body,
        (r.deleted_at is not null) as deleted, (r.file_id is not null) as has_file from teamchat.messages r where r.id = m.reply_to) rp) as reply
  from teamchat.messages m left join teamchat.files f on f.id = m.file_id and m.deleted_at is null`;

function shapeMsg(r) {
  const reply = J(r.reply, null);
  return {
    id: N(r.id), room_id: N(r.room_id), user_id: N(r.user_id), body: r.body, created_at: r.created_at, edited_at: r.edited_at || null,
    deleted: B(r.deleted), reply_to: N(r.reply_to),
    reply: reply ? { id: N(reply.id), user_id: N(reply.user_id), body: reply.body, deleted: B(reply.deleted), has_file: B(reply.has_file) } : null,
    file: r.file_id ? { id: N(r.file_id), name: r.file_name, mime: r.file_mime, size: N(r.file_size) } : null,
    card: r.deleted === true || B(r.deleted) ? null : J(r.card, null), mentions: ARR(r.mentions), forwarded: B(r.forwarded)
  };
}
async function getMsg(id) {
  const rows = await q(MSG_SQL + ' where m.id = $1', [id]);
  return rows[0] ? shapeMsg(rows[0]) : null;
}

function cleanCard(c) {
  if (c === null || c === undefined) return null;
  if (typeof c !== 'object' || !['conversation', 'contact'].includes(c.type) || !Number(c.id)) throw bad('Cartão inválido');
  const url = (v) => (typeof v === 'string' && /^(https?:\/\/|\/)/.test(v) ? v.slice(0, 500) : '');
  return JSON.stringify({
    type: c.type, id: Number(c.id), name: String(c.name || '').slice(0, 120), subtitle: String(c.subtitle || '').slice(0, 200),
    thumb: url(c.thumb), status: String(c.status || '').slice(0, 20)
  });
}
function cleanMentions(ids, text, members, self) {
  const ok = new Set(members.map((m) => m.user_id));
  let out = Array.isArray(ids) ? ids.map(Number).filter((x) => ok.has(x)) : [];
  if (/(^|\s)@todos\b/i.test(text)) out = Array.from(ok);
  return Array.from(new Set(out)).filter((x) => x !== self);
}

const rate = new Map();
function limit(userId) {
  const now = Date.now();
  const arr = (rate.get(userId) || []).filter((t) => now - t < 10000);
  if (arr.length >= 30) throw new HttpError(429, 'Muitas mensagens em pouco tempo');
  arr.push(now); rate.set(userId, arr);
}

/* ---------- rotas ---------- */
async function route(req, res, url) {
  const p = url.pathname;
  let m;

  if (p === '/health') return send(res, 200, { ok: true });

  if (p === '/api/events' && req.method === 'GET') {
    const acc = Number(url.searchParams.get('account'));
    const user = await needAccount(req, acc);
    res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' }, corsHeaders(req)));
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ user_id: user.id })}\n\n`);
    if (!streams.has(user.id)) streams.set(user.id, new Set());
    streams.get(user.id).add(res);
    req.on('close', () => { const set = streams.get(user.id); if (set) { set.delete(res); if (!set.size) streams.delete(user.id); } });
    return null;
  }

  m = p.match(/^\/api\/accounts\/(\d+)\/(.*)$/);
  if (!m) throw new HttpError(404, 'Rota não encontrada');
  const acc = Number(m[1]); const rest = m[2];
  const user = await needAccount(req, acc);
  const body = (req.method === 'POST' || req.method === 'PATCH') ? await readBody(req, rest.match(/messages$/) ? Math.ceil(MAX_FILE * 1.4) + 65536 : 65536) : {};

  // GET rooms
  if (rest === 'rooms' && req.method === 'GET') return send(res, 200, { rooms: await listRooms(acc, user.id) });

  // POST rooms (dm ou grupo)
  if (rest === 'rooms' && req.method === 'POST') {
    const agents = await accountAgents(req, acc);
    if (body.kind === 'dm') {
      const other = Number(body.user_id);
      if (!other || other === user.id || !agents.has(other)) throw bad('Pessoa inválida');
      const key = `${acc}:${Math.min(user.id, other)}:${Math.max(user.id, other)}`;
      const created = await q(`with r as (insert into teamchat.rooms (account_id, kind, dm_key, created_by) values ($1, 'dm', $2, $3)
          on conflict (dm_key) do nothing returning id)
        insert into teamchat.members (room_id, user_id) select r.id, u from r, unnest($4::int[]) u returning room_id`, [acc, key, user.id, [user.id, other]]);
      const rows = await q('select id from teamchat.rooms where dm_key = $1', [key]);
      const roomId = N(rows[0].id);
      if (created.length) await pushRoom(roomId, acc);
      return send(res, created.length ? 201 : 200, { room: await getRoom(roomId, user.id) });
    }
    if (body.kind === 'group') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) throw bad('Dê um nome ao grupo');
      const ids = Array.from(new Set((body.members || []).map(Number).filter((x) => x && x !== user.id)));
      if (!ids.length) throw bad('Escolha ao menos uma pessoa');
      if (ids.some((x) => !agents.has(x))) throw bad('Há pessoas que não fazem parte da conta');
      const rows = await q(`with r as (insert into teamchat.rooms (account_id, kind, name, created_by) values ($1, 'group', $2, $3) returning id)
        insert into teamchat.members (room_id, user_id, role) select r.id, u, case when u = $3 then 'admin' else 'member' end
        from r, unnest($4::int[]) u returning room_id`, [acc, name, user.id, [user.id].concat(ids)]);
      const roomId = N(rows[0].room_id);
      await pushRoom(roomId, acc);
      return send(res, 201, { room: await getRoom(roomId, user.id) });
    }
    throw bad('Tipo de conversa inválido');
  }

  // rooms/:id/...
  m = rest.match(/^rooms\/(\d+)(?:\/(.*))?$/);
  if (m) {
    const roomId = Number(m[1]); const sub = m[2] || '';
    const mem = await needMember(roomId, acc, user.id);

    if (sub === '' && req.method === 'PATCH') {
      if (mem.kind !== 'group') throw bad('Só grupos podem ser renomeados');
      if (mem.role !== 'admin') throw new HttpError(403, 'Só administradores do grupo podem renomear');
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) throw bad('Nome inválido');
      await q('update teamchat.rooms set name = $1 where id = $2', [name, roomId]);
      await pushRoom(roomId, acc);
      return send(res, 200, { room: await getRoom(roomId, user.id) });
    }

    if (sub === 'members' && req.method === 'POST') {
      if (mem.kind !== 'group') throw bad('Só grupos têm participantes');
      if (mem.role !== 'admin') throw new HttpError(403, 'Só administradores do grupo podem adicionar pessoas');
      const agents = await accountAgents(req, acc);
      const ids = Array.from(new Set((body.user_ids || []).map(Number).filter(Boolean)));
      if (!ids.length || ids.some((x) => !agents.has(x))) throw bad('Pessoas inválidas');
      await q(`insert into teamchat.members (room_id, user_id, last_read_id)
        select $1::bigint, u, coalesce((select max(id) from teamchat.messages where room_id = $1::bigint), 0) from unnest($2::int[]) u on conflict do nothing`, [roomId, ids]);
      await pushRoom(roomId, acc);
      return send(res, 200, { room: await getRoom(roomId, user.id) });
    }

    m = sub.match(/^members\/(\d+)$/);
    if (m && req.method === 'DELETE') {
      const target = Number(m[1]);
      if (mem.kind !== 'group') throw bad('Só grupos têm participantes');
      if (target !== user.id && mem.role !== 'admin') throw new HttpError(403, 'Só administradores do grupo podem remover pessoas');
      await q('delete from teamchat.members where room_id = $1 and user_id = $2', [roomId, target]);
      const left = await roomMembers(roomId);
      if (!left.length) {
        await q('delete from teamchat.files where room_id = $1', [roomId]);
        await q('delete from teamchat.rooms where id = $1', [roomId]);
      } else if (!left.some((x) => x.role === 'admin')) {
        await q('update teamchat.members set role = \'admin\' where room_id = $1 and user_id = $2', [roomId, left[0].user_id]);
      }
      if (left.length) await pushRoom(roomId, acc, [target]); else broadcast([target], 'room_removed', { account_id: acc, room_id: roomId });
      return send(res, 200, { ok: true });
    }

    if (sub === 'messages' && req.method === 'GET') {
      const before = Number(url.searchParams.get('before')) || 0;
      const lim = Math.min(Number(url.searchParams.get('limit')) || 40, 100);
      const rows = await q(MSG_SQL + ' where m.room_id = $1' + (before ? ' and m.id < $3' : '') + ' order by m.id desc limit $2',
        before ? [roomId, lim, before] : [roomId, lim]);
      const msgs = rows.map(shapeMsg).reverse();
      return send(res, 200, { messages: msgs, has_more: rows.length === lim });
    }

    if (sub === 'messages' && req.method === 'POST') {
      limit(user.id);
      let text = String(body.body || '').trim().slice(0, MAX_BODY);
      let file = body.file || null;
      let card = cleanCard(body.card);
      let forwarded = false, copyFileId = null;
      if (body.forward_from) {
        // encaminhar: copia o conteúdo de uma mensagem que o usuário pode ver
        const src = await q(`select m.body, m.card, m.file_id, m.deleted_at is not null as deleted, r.account_id, m.room_id
          from teamchat.messages m join teamchat.rooms r on r.id = m.room_id where m.id = $1`, [Number(body.forward_from)]);
        if (!src[0] || N(src[0].account_id) !== acc || B(src[0].deleted)) throw new HttpError(404, 'Mensagem não encontrada');
        await needMember(N(src[0].room_id), acc, user.id);
        text = String(src[0].body || ''); card = src[0].card || null; copyFileId = src[0].file_id ? N(src[0].file_id) : null; file = null; forwarded = true;
      }
      if (!text && !file && !card && !copyFileId) throw bad('Mensagem vazia');
      let replyTo = null;
      if (body.reply_to && !forwarded) {
        const r = await q('select id from teamchat.messages where id = $1 and room_id = $2', [Number(body.reply_to), roomId]);
        if (r[0]) replyTo = N(r[0].id);
      }
      const members = await roomMembers(roomId);
      const mentions = forwarded ? [] : cleanMentions(body.mentions, text, members, user.id);
      const common = [roomId, user.id, text, replyTo, card, mentions, forwarded];
      const ins = 'insert into teamchat.messages (room_id, user_id, body, reply_to, file_id, card, mentions, forwarded)';
      let rows;
      if (file) {
        const data = Buffer.from(String(file.data || ''), 'base64');
        if (!data.length) throw bad('Arquivo vazio');
        if (data.length > MAX_FILE) throw new HttpError(413, 'Arquivo grande demais (máx. ' + Math.round(MAX_FILE / 1048576) + ' MB)');
        const name = String(file.name || 'arquivo').replace(/[\r\n"\\/]/g, '_').slice(0, 160);
        const mime = baseMime(file.mime) || 'application/octet-stream';
        rows = await q(`with f as (insert into teamchat.files (room_id, name, mime, size, data) values ($1::bigint, $2::text, $3::text, $4::int, $5::bytea) returning id)
          ${ins} select $1::bigint, $6::int, $7::text, $8::bigint, f.id, $9::text, $10::int[], $11::boolean from f returning id`,
        [roomId, name, mime, data.length, data, user.id, text, replyTo, card, mentions, forwarded]);
      } else if (copyFileId) {
        rows = await q(`with f as (insert into teamchat.files (room_id, name, mime, size, data) select $1::bigint, name, mime, size, data from teamchat.files where id = $2::bigint returning id)
          ${ins} select $1::bigint, $3::int, $4::text, null::bigint, f.id, $5::text, $6::int[], $7::boolean from f returning id`,
        [roomId, copyFileId, user.id, text, card, mentions, forwarded]);
      } else {
        rows = await q(`${ins} values ($1::bigint, $2::int, $3::text, $4::bigint, null, $5::text, $6::int[], $7::boolean) returning id`, common);
      }
      const id = N(rows[0].id);
      await q('update teamchat.members set last_read_id = greatest(last_read_id, $1::bigint) where room_id = $2 and user_id = $3', [id, roomId, user.id]);
      const msg = await getMsg(id);
      broadcast(members.map((x) => x.user_id), 'message', { account_id: acc, message: msg });
      return send(res, 201, { message: msg });
    }

    if (sub === 'read' && req.method === 'POST') {
      const upTo = Number(body.message_id) || 0;
      const rows = await q(`update teamchat.members set last_read_id = greatest(last_read_id, case when $3::bigint > 0 then $3::bigint
          else coalesce((select max(id) from teamchat.messages where room_id = $1), 0) end)
        where room_id = $1 and user_id = $2 returning last_read_id`, [roomId, user.id, upTo]);
      const room = await getRoom(roomId, user.id);
      broadcast([user.id], 'read', { account_id: acc, room_id: roomId, last_read_id: N(rows[0].last_read_id), unread: room ? room.unread : 0 });
      return send(res, 200, { ok: true });
    }
  }

  // mensagens: editar / apagar
  m = rest.match(/^messages\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const rows = await q('select m.id, m.room_id, m.user_id, m.deleted_at is not null as deleted from teamchat.messages m join teamchat.rooms r on r.id = m.room_id where m.id = $1 and r.account_id = $2', [id, acc]);
    if (!rows[0]) throw new HttpError(404, 'Mensagem não encontrada');
    const roomId = N(rows[0].room_id); const author = N(rows[0].user_id);
    const mem = await needMember(roomId, acc, user.id);
    if (B(rows[0].deleted)) throw new HttpError(404, 'Mensagem apagada');

    if (req.method === 'PATCH') {
      if (author !== user.id) throw new HttpError(403, 'Só quem enviou pode editar');
      const text = String(body.body || '').trim().slice(0, MAX_BODY);
      if (!text) throw bad('Mensagem vazia');
      const mem2 = await roomMembers(roomId);
      await q('update teamchat.messages set body = $1, edited_at = now(), mentions = $3::int[] where id = $2', [text, id, cleanMentions(body.mentions, text, mem2, user.id)]);
    } else if (req.method === 'DELETE') {
      if (author !== user.id && !(mem.kind === 'group' && mem.role === 'admin')) throw new HttpError(403, 'Você não pode apagar esta mensagem');
      await q('update teamchat.messages set deleted_at = now() where id = $1', [id]);
      await q('delete from teamchat.files where id = (select file_id from teamchat.messages where id = $1)', [id]);
    } else throw new HttpError(405, 'Método não permitido');
    const msg = await getMsg(id);
    const ids = (await roomMembers(roomId)).map((x) => x.user_id);
    broadcast(ids, 'message_update', { account_id: acc, message: msg });
    for (const uid of ids) { const room = await getRoom(roomId, uid); if (room) broadcast([uid], 'room', { account_id: acc, room }); }
    return send(res, 200, { message: msg });
  }

  // arquivos
  m = rest.match(/^files\/(\d+)$/);
  if (m && req.method === 'GET') {
    const rows = await q('select room_id, name, mime, data from teamchat.files where id = $1', [Number(m[1])]);
    if (!rows[0]) throw new HttpError(404, 'Arquivo não encontrado');
    await needMember(N(rows[0].room_id), acc, user.id);
    const known = IMAGE_MIMES.includes(rows[0].mime) || AUDIO_MIMES.includes(rows[0].mime);
    const mime = known ? rows[0].mime : 'application/octet-stream';
    const inline = IMAGE_MIMES.includes(rows[0].mime) && url.searchParams.get('download') !== '1';
    const data = Buffer.isBuffer(rows[0].data) ? rows[0].data : Buffer.from(String(rows[0].data).replace(/^\\x/, ''), 'hex');
    res.writeHead(200, Object.assign({
      'content-type': mime, 'content-length': data.length, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=86400',
      'content-disposition': (inline ? 'inline' : 'attachment') + '; filename="' + encodeURIComponent(rows[0].name) + '"'
    }, corsHeaders(req)));
    res.end(data);
    return null;
  }

  throw new HttpError(404, 'Rota não encontrada');
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin.replace(/\/+$/, ''))) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

const server = http.createServer(async (req, res) => {
  const cors = corsHeaders(req);
  res._cors = cors;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, Object.assign({
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type, access-token, token-type, client, uid, expiry',
      'access-control-max-age': '86400'
    }, cors));
    return res.end();
  }
  try {
    const url = new URL(req.url, 'http://x');
    const r = await route(req, res, url);
    if (r === undefined && !res.headersSent) send(res, 204);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) { /* ignora */ } return; }
    const status = e.status || 500;
    if (status >= 500) console.error('Erro:', e);
    send(res, status, { error: e.message || 'Erro interno' }, cors);
    return;
  }
});
migrate().then(() => {
  server.listen(PORT, () => console.log('Chat da equipe ouvindo na porta ' + PORT));
}).catch((e) => { console.error('Falha ao preparar o banco:', e); process.exit(1); });
