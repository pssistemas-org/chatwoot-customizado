/* Item "Kanban" no menu lateral do Chatwoot.
 * Ao clicar, o kanban abre ao lado do menu (o menu lateral continua visível),
 * ocupando a área de conteúdo. Qualquer troca de tela do Chatwoot fecha o kanban.
 * Carregado em todas as páginas do painel pelo Dockerfile.
 */
(function () {
  'use strict';
  if (window.__featuresInjected) return;
  window.__featuresInjected = true;
  var FEATURES = [];

  function createFeature(cfg) {
  var ID = cfg.id, LABEL = cfg.label, HASH = cfg.hash, ICON = cfg.icon;
  var startedAt = Date.now();
  var panel = null;
  var frame = null;
  var isOpen = false;
  var openPath = '';
  var hidden = [];   // itens do menu cujo destaque foi apagado enquanto o kanban está aberto
  var applied = [];  // estilos aplicados no item Kanban (para remover ao fechar)

  function accountId() {
    var m = location.pathname.match(/\/app\/accounts\/(\d+)/);
    return m ? m[1] : null;
  }
  function pageUrl(id) { return '/app/accounts/' + id + '/dashboard' + HASH; }
  // __V__ é trocado pelo Dockerfile a cada build, para o navegador nunca usar uma versão antiga em cache
  function frameUrl(id) { return cfg.frameUrl(id); }
  function pathKey() { return location.pathname + location.search; }

  /* ---------- cor de fundo ---------- */
  function alphaOf(el) {
    var c = getComputedStyle(el).backgroundColor || '';
    if (!c || c === 'transparent') return 0;
    var nums = c.match(/-?\d*\.?\d+/g) || [];
    if (c.indexOf('/') >= 0) return parseFloat(c.split('/')[1]);
    if (c.indexOf('rgba') === 0 || c.indexOf('hsla') === 0) return nums.length >= 4 ? parseFloat(nums[3]) : 1;
    return 1;
  }
  function isDark() {
    return document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
  }

  /* ---------- painel ao lado do menu ---------- */
  function sidebarRight() {
    var right = 0;
    [].forEach.call(document.querySelectorAll('aside'), function (a) {
      var r = a.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left <= 4 && r.right > right) right = r.right;
    });
    return right;
  }

  function position() {
    if (!panel) return;
    syncLabel();
    panel.style.left = sidebarRight() + 'px';
    panel.style.background = isDark() ? '#111113' : '#fcfcfd';
  }

  var lastHover = null, hiddenStray = [];
  function fireLeave(el, rel) {
    ['pointerout', 'mouseout'].forEach(function (t) { try { el.dispatchEvent(new MouseEvent(t, { bubbles: true, relatedTarget: rel })); } catch (e) { /* ignora */ } });
    ['pointerleave', 'mouseleave'].forEach(function (t) { try { el.dispatchEvent(new MouseEvent(t, { bubbles: false, relatedTarget: rel })); } catch (e) { /* ignora */ } });
  }
  function dismissStray() {
    for (var el = lastHover; el && el !== document.documentElement; el = el.parentElement) fireLeave(el, panel);
    setTimeout(function () {
      if (!panel || panel.style.display === 'none') return;
      var pr = panel.getBoundingClientRect();
      [].forEach.call(document.body.querySelectorAll('*'), function (el) {
        if (el === panel || panel.contains(el) || el.closest('aside, nav, [id$="-panel"], [id$="-link"], [id$="-fab"], [role="alert"], [class*="toast"], [class*="snackbar"]')) return;
        var cs = getComputedStyle(el);
        if ((cs.position !== 'fixed' && cs.position !== 'absolute') || cs.visibility === 'hidden' || cs.display === 'none') return;
        var z = parseInt(cs.zIndex, 10);
        if (!(z >= 30)) return;
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.width > 520 || r.height > 420) return;
        if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return;
        if (el.contains(panel)) return;
        hiddenStray.push([el, el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
        el.style.setProperty('visibility', 'hidden', 'important');
      });
    }, 60);
  }
  function restoreStray() {
    hiddenStray.forEach(function (h) { if (h[1]) h[0].style.setProperty('visibility', h[1], h[2]); else h[0].style.removeProperty('visibility'); });
    hiddenStray = [];
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = ID + '-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:30;display:none;' +
      'border-left:1px solid rgba(128,128,128,.25)';
    frame = document.createElement('iframe');
    frame.title = LABEL;
    frame.setAttribute('allow', 'microphone; clipboard-write; autoplay');
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent';
    panel.appendChild(frame);
    document.body.appendChild(panel);
    window.addEventListener('resize', position);
    // Ao entrar no painel, fecha submenus/tooltips do Chatwoot que ficaram "presos" por cima do Kanban.
    document.addEventListener('mouseover', function (e) { if (!panel.contains(e.target)) lastHover = e.target; }, true);
    panel.addEventListener('mouseenter', dismissStray);
    panel.addEventListener('mouseleave', restoreStray);
    // o menu pode expandir/recolher: reposiciona ao fim de cada transição
    document.addEventListener('transitionend', position, true);
    return panel;
  }

  /* ---------- destaque do item ativo do menu ---------- */
  // "Pílula" de destaque: elemento grande com fundo visível. Ícones (desenhados com máscara + background-color)
  // e elementos pequenos NÃO contam, senão o ícone sumiria ao apagar o fundo.
  function isPill(el) {
    if (alphaOf(el) <= 0.02) return false;
    var cs = getComputedStyle(el);
    if ((cs.webkitMaskImage && cs.webkitMaskImage !== 'none') || (cs.maskImage && cs.maskImage !== 'none')) return false;
    var r = el.getBoundingClientRect();
    return r.width >= 28 && r.height >= 28;
  }

  function pathFrom(root, el) {
    var path = [];
    while (el && el !== root) {
      path.unshift([].indexOf.call(el.parentElement.children, el));
      el = el.parentElement;
    }
    return path;
  }

  // Itens que o Chatwoot marca como ativos na barra lateral (fundo de destaque no link ou num elemento interno).
  function activeItems() {
    var out = [];
    var aside = null;
    [].forEach.call(document.querySelectorAll('aside a[href]'), function (a) {
      if (a.closest('[data-feat-link]')) return;
      aside = a.closest('aside');
      var parent = a.parentElement;
      if (isPill(a)) { out.push({ el: a, role: 'a', path: [] }); return; }
      if (parent && parent !== aside && parent.querySelectorAll('a[href]').length === 1 && isPill(parent)) {
        out.push({ el: parent, role: 'parent', path: [] }); return;
      }
      var inner = [].slice.call(a.querySelectorAll('*')).filter(isPill)[0];
      if (inner) out.push({ el: inner, role: 'desc', path: pathFrom(a, inner) });
    });
    return out;
  }

  function kanbanTarget(s) {
    var link = document.getElementById(ID + '-link');
    if (!link) return null;
    var a = link.tagName === 'A' ? link : link.querySelector('a');
    if (!a) return null;
    if (s.role === 'parent') return link;
    var el = a;
    (s.path || []).forEach(function (i) { el = el && el.children[i]; });
    return el || a;
  }

  function setActive(on) {
    // restaura o que foi apagado nos outros itens
    hidden.forEach(function (h) {
      if (h.style === null) h.el.removeAttribute('style'); else h.el.setAttribute('style', h.style);
    });
    hidden = [];
    applied.forEach(function (x) { x.el.style.removeProperty(x.prop); });
    applied = [];
    if (!on) return;

    var act = activeItems();
    var sample = act[0];
    var tgt;
    if (sample) {
      // copia o visual do item ativo (fundo, cor do texto, sombra) para o Kanban
      var cs = getComputedStyle(sample.el);
      var textColor = getComputedStyle(sample.el.closest('a') || sample.el).color;
      tgt = kanbanTarget(sample);
      if (tgt) {
        [['background-color', cs.backgroundColor], ['box-shadow', cs.boxShadow]].forEach(function (p) {
          tgt.style.setProperty(p[0], p[1], 'important'); applied.push({ el: tgt, prop: p[0] });
        });
        var link = document.getElementById(ID + '-link');
        var a = link && (link.tagName === 'A' ? link : link.querySelector('a'));
        if (a) { a.style.setProperty('color', textColor, 'important'); applied.push({ el: a, prop: 'color' }); }
      }
    } else {
      tgt = kanbanTarget({ role: 'a', path: [] });
      if (tgt) { tgt.style.setProperty('background-color', 'rgba(128,128,128,.16)', 'important'); applied.push({ el: tgt, prop: 'background-color' }); }
    }
    // apaga o destaque do item da tela que estava ativa antes
    act.forEach(function (x) {
      hidden.push({ el: x.el, style: x.el.getAttribute('style') });
      x.el.style.setProperty('background-color', 'transparent', 'important');
      x.el.style.setProperty('box-shadow', 'none', 'important');
    });
  }

  function setHash(on) {
    try {
      var url = location.pathname + location.search + (on ? HASH : '');
      if (on !== (location.hash === HASH)) history.replaceState(history.state, '', url);
    } catch (e) { /* sem history: segue sem hash */ }
  }

  function openKanban() {
    var id = accountId();
    if (!id) return;
    FEATURES.forEach(function (f) { if (f !== api) f.close(); });
    ensurePanel();
    var src = frameUrl(id);
    if (frame.getAttribute('data-src') !== src) { frame.setAttribute('data-src', src); frame.src = src; }
    openPath = pathKey();
    position();
    panel.style.display = 'block';
    isOpen = true;
    setActive(true);
    setHash(true);
    tellFrame(true);
  }

  function closeKanban() {
    if (!isOpen) return;
    panel.style.display = 'none';
    isOpen = false;
    setActive(false);
    setHash(false);
    tellFrame(false);
  }

  /* ---------- item do menu ---------- */
  function removeAll() {
    [ID + '-link', ID + '-fab'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // troca o nome do item de referência por "Kanban" em textos e atributos (tooltip, aria-label, title...)
  function relabel(root, orig) {
    if (!orig) return;
    var all = [root].concat([].slice.call(root.querySelectorAll('*')));
    all.forEach(function (el) {
      [].slice.call(el.attributes).forEach(function (at) {
        if (['href', 'id', 'class', 'style'].indexOf(at.name) >= 0) return;
        if (at.value.indexOf(orig) >= 0) el.setAttribute(at.name, at.value.split(orig).join(LABEL));
      });
    });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue.indexOf(orig) >= 0) n.nodeValue = n.nodeValue.split(orig).join(LABEL);
    }
  }

  function pickReference() {
    var links = [].slice.call(document.querySelectorAll('nav a[href*="/app/accounts/"], aside a[href*="/app/accounts/"]'))
      .filter(function (a) { return !a.closest('[data-feat-link]'); });
    var idle = links.filter(function (a) {
      var p = a.parentElement;
      return !isPill(a) && !(p && p !== a.closest('aside') && p.querySelectorAll('a[href]').length === 1 && isPill(p)) &&
        ![].slice.call(a.querySelectorAll('*')).some(isPill);
    });
    var pool = idle.length ? idle : links;
    return pool.filter(function (a) { return /\/contacts/.test(a.getAttribute('href')); })[0] || pool[0] || null;
  }

  function labelOf(ref) {
    var t = ref.getAttribute('aria-label') || ref.getAttribute('title');
    if (t && t.trim()) return t.trim();
    var walker = document.createTreeWalker(ref, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) return n.nodeValue.trim();
    return '';
  }

  // Deixa só a linha principal do item: remove sub-listas (filhos do grupo), links extras e a seta de expandir.
  // Devolve o elemento do cabeçalho (menor ancestral do nome que contém o ícone).
  function simplify(clone) {
    var wk = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT), tn, L = null;
    while ((tn = wk.nextNode())) if (tn.nodeValue.trim() && tn.parentElement && !tn.parentElement.closest('svg')) { L = tn.parentElement; break; }
    if (!L) return null;
    var ICON_SEL = 'svg, i, [class*="i-"]';
    var H = L;
    while (H !== clone && !(H.querySelector(ICON_SEL) && !L.contains(H.querySelector(ICON_SEL)))) H = H.parentElement;
    // tudo que vem depois do cabeçalho (nos níveis acima) são os filhos do grupo
    for (var n = H; n && n !== clone; n = n.parentElement) {
      while (n.nextElementSibling) n.nextElementSibling.remove();
    }
    // setas/ícones que vêm depois do nome (indicador de expandir)
    [].slice.call(clone.querySelectorAll(ICON_SEL)).forEach(function (ic) {
      if (!clone.contains(ic)) return;
      if (L.compareDocumentPosition(ic) & 4) {
        var par = ic.parentElement;
        ic.remove();
        if (par && par !== H && par !== clone && !par.textContent.trim() && !par.querySelector(ICON_SEL)) par.remove();
      }
    });
    // se o nome do item vem junto de textos de filhos dentro do mesmo bloco, mantém só o primeiro texto
    var texts = [], w2 = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT), t2;
    while ((t2 = w2.nextNode())) if (t2.nodeValue.trim() && !(t2.parentElement && t2.parentElement.closest('svg'))) texts.push(t2);
    texts.slice(1).forEach(function (t) { if (!L.contains(t)) { var pe = t.parentElement; t.remove(); if (pe && pe !== clone && !pe.textContent.trim() && !pe.querySelector(ICON_SEL)) pe.remove(); } });
    // links extras (sub-itens que sobraram)
    [].slice.call(clone.querySelectorAll('a')).forEach(function (a, i) { if (i > 0 && clone.contains(a) && !H.contains(a)) a.remove(); });
    [].slice.call(clone.querySelectorAll('ul, ol')).forEach(function (u) { if (clone.contains(u) && !u.querySelector(ICON_SEL)) u.remove(); });
    return H;
  }

  function trySidebar(id) {
    var link = document.getElementById(ID + '-link');
    if (link) {
      var a0 = link.tagName === 'A' ? link : link.querySelector('a');
      if (a0) a0.setAttribute('href', pageUrl(id));
      return true;
    }
    var ref = pickReference();
    if (!ref) return false;
    // se o item é um grupo (ex.: Contatos com sub-itens), clona o grupo inteiro e depois remove os filhos
    var item = ref.closest('li') || ref;
    var aside0 = ref.closest('aside, nav');
    while (item.parentElement && item.parentElement.closest('li') && aside0 && aside0.contains(item.parentElement.closest('li'))) item = item.parentElement.closest('li');
    var clone = item.cloneNode(true);
    var head = simplify(clone);
    var orig = labelOf(ref);
    clone.id = ID + '-link';
    clone.setAttribute('data-feat-link', ID);
    var anchor = clone.tagName === 'A' ? clone : clone.querySelector('a');
    if (!anchor && head) {
      // cabeçalho do grupo não é um link: vira um link
      anchor = document.createElement('a');
      if (head.className) anchor.className = head.className;
      while (head.firstChild) anchor.appendChild(head.firstChild);
      if (head === clone) clone.appendChild(anchor); else head.replaceWith(anchor);
    }
    if (!anchor) return false;
    anchor.setAttribute('href', pageUrl(id));
    anchor.removeAttribute('aria-current');
    clone.removeAttribute('aria-current');
    [anchor, clone].forEach(function (el) {
      el.className = el.className.split(/\s+/).filter(function (c) { return !/active/i.test(c); }).join(' ');
      el.removeAttribute('style');
    });

    var wk0 = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT), t0, own = '';
    while ((t0 = wk0.nextNode())) if (t0.nodeValue.trim() && !(t0.parentElement && t0.parentElement.closest('svg'))) { own = t0.nodeValue.trim(); break; }
    if (own && own !== orig) relabel(clone, own);
    relabel(clone, orig);
    anchor.setAttribute('title', LABEL);
    anchor.setAttribute('aria-label', LABEL);

    // troca o ícone
    var icon = anchor.querySelector('svg, [class*="i-"], i');
    if (icon) {
      var wrap = document.createElement('span');
      wrap.innerHTML = ICON;
      wrap.style.display = 'inline-flex';
      icon.replaceWith(wrap);
    }
    // marca os textos do item para mostrar o nome só quando o menu estiver expandido
    var wk = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT), tn, seen = [];
    while ((tn = wk.nextNode())) {
      var pe = tn.parentElement;
      if (tn.nodeValue.trim() && pe && !pe.closest('svg') && seen.indexOf(pe) < 0) { seen.push(pe); pe.setAttribute('data-feat-label', anchor.contains(pe) ? 'a' : 'o'); }
    }
    var prev = cfg.after ? document.getElementById(cfg.after + '-link') : null;
    if (cfg.after && !prev) return false;
    var host = prev || item;
    host.parentNode.insertBefore(clone, host.nextSibling);
    syncLabel();
    if (isOpen) setActive(true);
    return true;
  }

  // Menu recolhido: só o ícone (nome no tooltip). Menu expandido: ícone + nome.
  var RAIL_MAX = 110;
  function syncLabel() {
    var link = document.getElementById(ID + '-link');
    if (!link) return;
    var collapsed = sidebarRight() <= RAIL_MAX;
    var shown = false;
    [].forEach.call(link.querySelectorAll('[data-feat-label]'), function (el) {
      var pos = getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') return; // tooltips ficam como estão
      if (collapsed) { el.style.setProperty('display', 'none', 'important'); return; }
      el.style.removeProperty('display');
      if (el.getAttribute('data-feat-label') === 'a' && !shown && getComputedStyle(el).position !== 'absolute') {
        shown = true;
        if (getComputedStyle(el).display === 'none') el.style.setProperty('display', 'inline');
      }
    });
  }

  function fab(id) {
    var el = document.getElementById(ID + '-fab');
    if (el) { el.setAttribute('href', pageUrl(id)); return; }
    el = document.createElement('a');
    el.id = ID + '-fab';
    el.href = pageUrl(id);
    el.title = LABEL;
    el.innerHTML = ICON + '<span style="margin-left:6px">' + LABEL + '</span>';
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:31;display:flex;align-items:center;' +
      'padding:8px 14px;border-radius:999px;background:#2781f6;color:#fff;font:600 13px/1 Inter,sans-serif;' +
      'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(el);
  }

  function tick() {
    syncLabel();
    var id = accountId();
    if (!id) { removeAll(); if (isOpen) closeKanban(); return; }
    if (trySidebar(id)) {
      var f = document.getElementById(ID + '-fab');
      if (f) f.remove();
    } else if (cfg.fab !== false && Date.now() - startedAt > 8000) {
      fab(id);
    }
    if (isOpen) position();
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // clique no item Kanban: abre (ou fecha) sem recarregar a página
    if (t.closest('#' + ID + '-link' + (cfg.fab === false ? '' : ', #' + ID + '-fab'))) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // novo separador: segue o link
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) closeKanban(); else openKanban();
      return;
    }
    // clique em qualquer outro link do menu (mesmo da tela atual): fecha o kanban e deixa o Chatwoot navegar
    if (isOpen && t.closest('aside a[href], nav a[href]')) closeKanban();
  }, true);

  // Qualquer troca de rota do Chatwoot (menu, notificação, botão voltar...) fecha o kanban.
  function onRoute() {
    if (isOpen && pathKey() !== openPath) closeKanban();
    else if (!isOpen && location.hash === HASH && accountId()) openKanban();
  }
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(onRoute, 0);
      return r;
    };
  });
  window.addEventListener('popstate', function () {
    if (isOpen && (pathKey() !== openPath || location.hash !== HASH)) closeKanban();
    else onRoute();
  });

  document.addEventListener('transitionend', syncLabel, true);
  window.addEventListener('resize', syncLabel);
  setInterval(function () { tick(); keepAlive(); updateBadge(); }, 1000);
  tick();
  keepAlive();

  // abre direto quando a página carrega com #kanban (link, favorito ou atualizar a página)
  if (location.hash === HASH) {
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (accountId() && sidebarRight() > 0 && document.getElementById(ID + '-link')) { clearInterval(wait); openKanban(); }
      else if (tries > 40) { clearInterval(wait); if (accountId()) openKanban(); }
    }, 250);
  }

  /* ---------- extras: aviso ao iframe, contador (badge) e iframe sempre ativo ---------- */
  var unread = 0;
  function tellFrame(visible) {
    try { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'feature:visible', visible: visible }, location.origin); } catch (e) { /* ignora */ }
  }
  function updateBadge() {
    if (!cfg.badge) return;
    var link = document.getElementById(ID + '-link');
    var a = link && (link.tagName === 'A' ? link : link.querySelector('a'));
    if (!a) return;
    var b = a.querySelector('[data-feat-badge]');
    if (!unread) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('span');
      b.setAttribute('data-feat-badge', '1');
      b.style.cssText = 'position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;' +
        'background:#e5484d;color:#fff;font:600 10px/16px Inter,sans-serif;text-align:center;pointer-events:none;z-index:2';
      if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
      a.appendChild(b);
    }
    b.textContent = unread > 99 ? '99+' : String(unread);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === 'feature:unread') { unread = Number(e.data.n) || 0; updateBadge(); }
    if (e.data.type === 'feature:open') { if (!isOpen) openKanban(); }
    // abre uma conversa/contato do Chatwoot (usado pelos cards do chat); a troca de rota fecha o painel
    if (e.data.type === 'feature:navigate' && typeof e.data.path === 'string' && /^\/app\/accounts\/\d+\/(conversations|contacts)\/\d+$/.test(e.data.path)) {
      try {
        var cid = (e.data.path.match(/\/conversations\/(\d+)$/) || [])[1];
        if (cid && Array.isArray(e.data.messages) && window.__cwxLocate) window.__cwxLocate(cid, e.data.messages.slice(0, 30));
        history.pushState({}, '', e.data.path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      } catch (err) { location.assign(e.data.path); }
    }
  });
  // iframe sempre carregado em segundo plano (recebe mensagens, toca som e atualiza o contador)
  function keepAlive() {
    if (!cfg.keepAlive) return;
    var id = accountId();
    if (!id) return;
    ensurePanel();
    var src = frameUrl(id);
    if (frame.getAttribute('data-src') !== src) { frame.setAttribute('data-src', src); frame.src = src; }
  }
  var api = { id: ID, close: function () { closeKanban(); }, open: function () { openKanban(); } };
  // recebe cards de outras telas (ex.: Kanban) e entrega ao chat, que pergunta para quem enviar
  api.share = function (cards, quote) {
    if (cfg.id !== 'chat') return;
    keepAlive();
    if (!isOpen) openKanban();
    var send = function () { try { frame.contentWindow.postMessage({ type: 'chat:share', cards: cards, quote: quote || '' }, location.origin); } catch (err) { /* ignora */ } };
    var ready = false;
    try { ready = frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.getAttribute('src'); } catch (err) { /* ignora */ }
    if (ready) send(); else frame.addEventListener('load', function once() { frame.removeEventListener('load', once); setTimeout(send, 200); });
  };
  FEATURES.push(api);
  }

  /* ---------- "Chat interno" dentro da conversa: botão no topo + ações em cada mensagem ---------- */
  (function convShare() {
    var btn = null, pop = null, bar = null, selecting = false, selected = {}, cache = {};
    var ICON_FWD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>';
    var ICON_CHK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    function convId() { var m = location.pathname.match(/\/app\/accounts\/(\d+)\/(?:[a-z_\/-]*\/)?conversations\/(\d+)/); return m ? { account: m[1], id: m[2] } : null; }
    function authHeaders() {
      var part = document.cookie.split('; ').filter(function (c) { return c.indexOf('cw_d_session_info=') === 0; })[0], hd = {};
      try {
        var j = JSON.parse(decodeURIComponent(part.slice('cw_d_session_info='.length)));
        ['access-token', 'token-type', 'client', 'expiry', 'uid'].forEach(function (k) { if (j[k] !== undefined && j[k] !== null) hd[k] = String(j[k]); });
      } catch (e) { /* sem sessão */ }
      return hd;
    }
    function api(path) {
      return fetch('/api/v1' + path, { headers: authHeaders(), credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    function panelOpen() {
      return ['chat-panel', 'kanban-panel'].some(function (id) { var p = document.getElementById(id); return p && getComputedStyle(p).display !== 'none'; });
    }
    function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }
    function closePop() { if (pop) { pop.remove(); pop = null; } document.removeEventListener('mousedown', outside, true); }
    function outside(e) { if (pop && !pop.contains(e.target) && !(btn && btn.contains(e.target))) closePop(); }
    function cardFrom(c, ids) {
      var sender = (c.meta && c.meta.sender) || {}, last = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
      return { type: 'conversation', id: c.id, name: sender.name || ('Conversa #' + c.id), subtitle: (last && last.content) || '', thumb: sender.thumbnail || '', status: c.status || '', message_ids: ids || [] };
    }
    function share(cards, quote) {
      closePop();
      var f = FEATURES.filter(function (x) { return x.id === 'chat'; })[0];
      if (f && f.share) f.share(cards, quote);
    }
    function loadConv(cv) {
      var k = cv.account + ':' + cv.id;
      if (!cache[k]) cache[k] = { conv: null, msgs: {} };
      var ce = cache[k];
      return (ce.conv ? Promise.resolve(ce.conv) : api('/accounts/' + cv.account + '/conversations/' + cv.id).then(function (c) { ce.conv = c; return c; })).then(function (c) { return { conv: c, ce: ce }; });
    }
    function loadMsgs(cv, ce) {
      return api('/accounts/' + cv.account + '/conversations/' + cv.id + '/messages').then(function (r) {
        ((r && r.payload) || []).forEach(function (m) { ce.msgs[m.id] = m; });
      }).catch(function () { /* usa o texto da tela */ });
    }
    function domText(id) {
      var li = document.getElementById('message' + id);
      return li ? (li.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    }
    function lineFor(m, id, name) {
      if (m) {
        var who = m.message_type === 0 ? (name || 'Cliente') : ((m.sender && m.sender.name) || 'Equipe');
        return who + ': ' + (m.content || '[anexo]');
      }
      return domText(id);
    }
    // envia uma ou mais mensagens (ids do Chatwoot) como referência ao chat interno
    function shareMessages(ids) {
      var cv = convId(); if (!cv || !ids.length) return;
      ids = ids.slice().sort(function (a, b) { return a - b; }).slice(0, 30);
      loadConv(cv).then(function (o) {
        var need = ids.some(function (id) { return !o.ce.msgs[id]; });
        return (need ? loadMsgs(cv, o.ce) : Promise.resolve()).then(function () { return o; });
      }).then(function (o) {
        var name = ((o.conv.meta && o.conv.meta.sender) || {}).name;
        var lines = ids.map(function (id) { return lineFor(o.ce.msgs[id], id, name); }).filter(Boolean);
        var card = cardFrom(o.conv, ids);
        if (lines.length) card.subtitle = lines[0].replace(/^[^:]*:\s*/, '').slice(0, 200);
        share([card], lines.join('\n').slice(0, 1500));
      }).catch(function () {
        share([{ type: 'conversation', id: Number(cv.id), name: 'Conversa #' + cv.id, subtitle: '', thumb: '', status: '', message_ids: ids }], ids.map(domText).filter(Boolean).join('\n').slice(0, 1500));
      });
    }

    /* --- ações em cada mensagem --- */
    var css = document.createElement('style');
    css.textContent = [
      '.cwx-tools{position:absolute;top:-6px;right:10px;z-index:5;display:none;gap:2px;padding:2px;background:#fff;color:#1c2024;border:1px solid #d9d9e0;border-radius:8px;box-shadow:0 2px 8px rgba(16,24,40,.15)}',
      'li[id^="message"]:hover>.cwx-tools,body.cwx-selecting .cwx-tools{display:flex}',
      '.cwx-tools button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer}',
      '.cwx-tools button:hover{background:#f0f0f3}',
      '.cwx-tools button.on{background:#2781f6;color:#fff}',
      'li.cwx-sel{outline:2px solid #2781f6;outline-offset:2px;border-radius:10px}',
      '@keyframes cwxflash{0%,60%{background:rgba(255,200,0,.45);box-shadow:0 0 0 6px rgba(255,200,0,.45)}100%{background:transparent;box-shadow:0 0 0 0 rgba(255,200,0,0)}}',
      'li.cwx-flash{animation:cwxflash 4s ease-out;border-radius:10px}'
    ].join('\n');
    document.head.appendChild(css);
    function setSelecting(on) {
      selecting = on; document.body.classList.toggle('cwx-selecting', on);
      if (!on) { selected = {}; [].forEach.call(document.querySelectorAll('li.cwx-sel'), function (l) { l.classList.remove('cwx-sel'); }); [].forEach.call(document.querySelectorAll('.cwx-tools .on'), function (b) { b.classList.remove('on'); }); }
      drawBar();
    }
    function toggleSel(id, li, chk) {
      if (selected[id]) delete selected[id]; else selected[id] = true;
      li.classList.toggle('cwx-sel', !!selected[id]); chk.classList.toggle('on', !!selected[id]);
      if (!selecting) { selecting = true; document.body.classList.add('cwx-selecting'); }
      drawBar();
    }
    function drawBar() {
      var n = Object.keys(selected).length;
      if (!selecting) { if (bar) { bar.remove(); bar = null; } return; }
      if (!bar) {
        bar = el('div', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 16px;background:#1c2024;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(16,24,40,.3);font:500 13px Inter,-apple-system,sans-serif');
        bar.id = 'cwx-bar'; document.body.appendChild(bar);
      }
      bar.innerHTML = '';
      bar.appendChild(el('span', '', n ? n + (n === 1 ? ' mensagem selecionada' : ' mensagens selecionadas') : 'Marque as mensagens para enviar'));
      var send = el('button', 'height:30px;padding:0 12px;border:0;border-radius:8px;background:#2781f6;color:#fff;font:inherit;cursor:pointer', 'Enviar ao chat interno');
      send.disabled = !n; send.style.opacity = n ? '1' : '.45';
      send.onclick = function () { if (!n) return; var ids = Object.keys(selected).map(Number); setSelecting(false); shareMessages(ids); };
      var cancel = el('button', 'height:30px;padding:0 10px;border:0;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:inherit;cursor:pointer', 'Cancelar');
      cancel.onclick = function () { setSelecting(false); };
      bar.appendChild(send); bar.appendChild(cancel);
    }
    function decorate() {
      if (!convId() || panelOpen()) return;
      [].forEach.call(document.querySelectorAll('li[id^="message"]'), function (li) {
        var m = /^message(\d+)$/.exec(li.id); if (!m || li.querySelector(':scope>.cwx-tools')) return;
        var id = Number(m[1]);
        if (getComputedStyle(li).position === 'static') li.style.position = 'relative';
        var tools = el('div'); tools.className = 'cwx-tools';
        var chk = el('button'); chk.type = 'button'; chk.title = 'Selecionar mensagem'; chk.innerHTML = ICON_CHK;
        chk.onclick = function (e) { e.stopPropagation(); toggleSel(id, li, chk); };
        var fwd = el('button'); fwd.type = 'button'; fwd.title = 'Enviar ao chat interno'; fwd.innerHTML = ICON_FWD;
        fwd.onclick = function (e) { e.stopPropagation(); shareMessages([id]); };
        tools.appendChild(fwd); tools.appendChild(chk); li.appendChild(tools);
        if (selected[id]) { li.classList.add('cwx-sel'); chk.classList.add('on'); }
      });
    }

    /* --- localizar e destacar a mensagem (vindo do chat interno) --- */
    var pending = null;
    function locate() {
      if (!pending) return;
      var cv = convId();
      if (!cv || String(cv.id) !== String(pending.conv) || Date.now() > pending.until) {
        if (pending && Date.now() > pending.until && cv && String(cv.id) === String(pending.conv)) alert_('Não achei a mensagem na tela. Ela pode ser mais antiga: role a conversa para cima.');
        if (!cv || Date.now() > pending.until) pending = null;
        return;
      }
      var first = null;
      pending.ids.forEach(function (id) {
        var li = document.getElementById('message' + id);
        if (li) { li.classList.remove('cwx-flash'); void li.offsetWidth; li.classList.add('cwx-flash'); first = first || li; }
      });
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); pending = null; }
    }
    function alert_(msg) {
      var t = el('div', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;padding:10px 14px;background:#1c2024;color:#fff;border-radius:10px;font:500 13px Inter,sans-serif', msg);
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 5000);
    }
    window.__cwxLocate = function (conv, ids) {
      if (!ids || !ids.length) return;
      pending = { conv: String(conv), ids: ids.map(Number), until: Date.now() + 12000 };
    };

    /* --- botão no topo da conversa --- */
    function item(label, sub, fn) {
      var b = el('button', 'display:block;width:100%;padding:8px 10px;text-align:left;background:none;border:0;border-radius:8px;cursor:pointer;color:inherit;font:inherit');
      b.appendChild(el('div', 'font-weight:500', label));
      if (sub) b.appendChild(el('div', 'color:#8b8d98;font-size:12px', sub));
      b.onmouseenter = function () { b.style.background = '#f0f0f3'; }; b.onmouseleave = function () { b.style.background = 'none'; };
      b.onclick = fn; return b;
    }
    function place() {
      var r = btn.getBoundingClientRect(), left = Math.max(8, Math.min(window.innerWidth - 308, r.right - 300));
      pop.style.left = left + 'px'; pop.style.top = (r.bottom + 6) + 'px';
    }
    function openPop() {
      if (pop) { closePop(); return; }
      var cv = convId(); if (!cv) return;
      pop = el('div', 'position:fixed;z-index:2147483000;width:300px;padding:6px;background:#fff;color:#1c2024;border:1px solid #e8e8ec;border-radius:12px;box-shadow:0 10px 30px rgba(16,24,40,.18);font:13px/18px Inter,-apple-system,sans-serif');
      pop.id = 'conv-share-pop';
      pop.appendChild(item('Enviar esta conversa', 'Card com o contato, para alguém da equipe', function () {
        loadConv(cv).then(function (o) { share([cardFrom(o.conv)]); }).catch(function () { share([{ type: 'conversation', id: Number(cv.id), name: 'Conversa #' + cv.id, subtitle: '', thumb: '', status: '', message_ids: [] }]); });
      }));
      pop.appendChild(item('Selecionar mensagens…', 'Marque uma ou mais mensagens e envie', function () { closePop(); setSelecting(true); }));
      document.body.appendChild(pop); place();
      setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
    }
    function mount() {
      var cv = convId();
      if (!cv || panelOpen()) { if (btn) btn.style.display = 'none'; if (pop && !cv) closePop(); if (selecting && !cv) setSelecting(false); return; }
      if (!btn) {
        btn = el('button', 'position:fixed;z-index:2147482000;display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid #d9d9e0;border-radius:15px;background:#fff;color:#1c2024;cursor:pointer;box-shadow:0 2px 8px rgba(16,24,40,.12);font:500 12px Inter,-apple-system,sans-serif');
        btn.id = 'conv-share-btn'; btn.type = 'button'; btn.title = 'Enviar esta conversa ou mensagens para o chat interno';
        btn.innerHTML = ICON_FWD + '<span>Chat interno</span>';
        btn.onclick = openPop; document.body.appendChild(btn);
      }
      btn.style.display = 'flex';
      var host = document.querySelector('.conversation-details-wrap, [class*="conversation-details-wrap"], .conversations-view'), r = host && host.getBoundingClientRect();
      if (r && r.width > 200) { btn.style.top = Math.max(r.top + 12, 8) + 'px'; btn.style.left = Math.max(r.left + 12, 8) + 'px'; btn.style.right = 'auto'; }
      else { btn.style.top = '10px'; btn.style.right = '340px'; btn.style.left = 'auto'; }
      if (pop) place();
    }
    setInterval(function () { mount(); decorate(); locate(); }, 700);
    window.addEventListener('resize', mount);
  })();

  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'chat:share' || !Array.isArray(e.data.cards)) return;
    var chatFeat = FEATURES.filter(function (f) { return f.id === 'chat'; })[0];
    if (chatFeat && chatFeat.share) chatFeat.share(e.data.cards, e.data.quote);
  });
  createFeature({
    id: 'kanban', label: 'Kanban', hash: '#kanban',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/></svg>',
    frameUrl: function (id) { return '/kanban/index.html?embed=1&account=' + id + '&v=__V__'; }
  });
  createFeature({
    id: 'chat', label: 'Chat da equipe', hash: '#chat', after: 'kanban', fab: false, badge: true, keepAlive: true,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 11a4 4 0 1 0-8 0M3 20v-1a5 5 0 0 1 5-5h2"/><circle cx="9" cy="7" r="3.2"/><path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H16l-3 3v-3a2.5 2.5 0 0 1-1-2V13a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 21 13z"/></svg>',
    frameUrl: function (id) { return '/teamchat/index.html?embed=1&account=' + id + '&v=__V__'; }
  });
})();
