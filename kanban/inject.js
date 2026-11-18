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
    var CHAT_API = '__CHAT_API__';
    var ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
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
        ce.loaded = true;
      }).catch(function () { ce.loaded = true; /* usa o texto da tela */ });
    }
    function domText(id) {
      var li = rowFor(id);
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

    /* --- editar mensagem enviada ao cliente (WhatsApp via Evolution API) --- */
    var EDIT_WINDOW = 15 * 60 * 1000;
    function isEditable(m) {
      if (!m || m.message_type !== 1 || m.private || !m.source_id || !m.content) return false;
      var t = typeof m.created_at === 'number' ? m.created_at * 1000 : Date.parse(m.created_at);
      return !isNaN(t) && Date.now() - t < EDIT_WINDOW;
    }
    function toast(msg, bad) {
      var t = el('div', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;max-width:420px;padding:10px 14px;background:' + (bad ? '#b42318' : '#1c2024') + ';color:#fff;border-radius:10px;font:500 13px Inter,-apple-system,sans-serif;box-shadow:0 10px 30px rgba(16,24,40,.3)', msg);
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 5500);
    }
    function editRequest(cv, id, text) {
      if (!CHAT_API || CHAT_API.indexOf('__CHAT') === 0) return Promise.reject(new Error('O servidor do chat ainda não foi configurado (CHAT_API_URL).'));
      var hd = authHeaders(); hd['content-type'] = 'application/json';
      return fetch(CHAT_API.replace(/\/+$/, '') + '/api/accounts/' + cv.account + '/whatsapp/edit', { method: 'POST', headers: hd, body: JSON.stringify({ message_id: id, text: text }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || j.message || ('Erro ' + r.status)); return j; }); });
    }
    function applyEdit(row, oldText, newText) {
      var w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null), n, o = norm(oldText);
      while ((n = w.nextNode())) { if (norm(n.nodeValue) === o) { n.nodeValue = newText; break; } }
    }
    function openEditor(cv, id, row) {
      var ce = cache[cv.account + ':' + cv.id], m = ce && ce.msgs[id];
      if (!isEditable(m)) { toast('O WhatsApp só permite editar até 15 minutos depois do envio.', true); return; }
      var back = el('div', 'position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;background:rgba(16,24,40,.45)');
      var box = el('div', 'width:min(480px,92vw);padding:18px;background:#fff;color:#1c2024;border-radius:14px;box-shadow:0 20px 50px rgba(16,24,40,.3);font:14px/20px Inter,-apple-system,sans-serif');
      box.appendChild(el('div', 'font-weight:600;font-size:15px;margin-bottom:4px', 'Editar mensagem'));
      box.appendChild(el('div', 'color:#667085;font-size:12px;margin-bottom:10px', 'A mensagem será editada também no WhatsApp do cliente (até 15 minutos depois do envio).'));
      var ta = el('textarea', 'width:100%;min-height:110px;padding:10px;border:1px solid #d0d5dd;border-radius:10px;font:inherit;resize:vertical;box-sizing:border-box');
      ta.value = m.content; ta.maxLength = 4000; box.appendChild(ta);
      var err = el('div', 'color:#b42318;font-size:12px;min-height:16px;margin-top:6px'); box.appendChild(err);
      var foot = el('div', 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px');
      var cancel = el('button', 'height:34px;padding:0 14px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:inherit;font:inherit;cursor:pointer', 'Cancelar');
      var save = el('button', 'height:34px;padding:0 16px;border:0;border-radius:8px;background:#2781f6;color:#fff;font:inherit;font-weight:500;cursor:pointer', 'Salvar');
      function close() { back.remove(); document.removeEventListener('keydown', onKey, true); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save.click(); } }
      cancel.onclick = close;
      save.onclick = function () {
        var text = ta.value.trim();
        if (!text) { err.textContent = 'A mensagem não pode ficar vazia.'; return; }
        if (text === String(m.content).trim()) { close(); return; }
        save.disabled = true; save.textContent = 'Salvando…'; err.textContent = '';
        editRequest(cv, id, text).then(function () {
          var old = m.content; m.content = text; applyEdit(row, old, text); close(); toast('Mensagem editada no WhatsApp.');
        }).catch(function (e) { save.disabled = false; save.textContent = 'Salvar'; err.textContent = e.message || 'Não foi possível editar.'; });
      };
      foot.appendChild(cancel); foot.appendChild(save); box.appendChild(foot); back.appendChild(box);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
      document.body.appendChild(back); document.addEventListener('keydown', onKey, true); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    /* --- ações em cada mensagem --- */
    var css = document.createElement('style');
    css.textContent = [
      '.cwx-tools{position:absolute;top:-6px;right:10px;z-index:5;display:none;gap:2px;padding:2px;background:#fff;color:#1c2024;border:1px solid #d9d9e0;border-radius:8px;box-shadow:0 2px 8px rgba(16,24,40,.15)}',
      '[data-cwx-id]:hover>.cwx-tools{display:flex}',
      '.cwx-tools button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer}',
      '.cwx-tools button:hover{background:#f0f0f3}',
      '.cwx-tools button.on{background:#2781f6;color:#fff}',
      '.cwx-chk{display:none;position:absolute;left:8px;top:50%;margin-top:-9px;z-index:6;place-items:center;width:18px;height:18px;padding:0;border:1.5px solid #98a2b3;border-radius:50%;background:#fff;color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.12);transition:border-color .12s}',
      '.cwx-chk svg{width:11px;height:11px;opacity:0}',
      '.cwx-chk:hover{border-color:#2781f6}',
      'body.cwx-selecting .cwx-chk{display:grid}',
      '.cwx-chk.on{background:#2781f6;border-color:#2781f6}',
      '.cwx-chk.on svg{opacity:1}',
      'body.cwx-selecting [data-cwx-id]{padding-left:36px!important;box-sizing:border-box}',
      '.cwx-sel{background:rgba(39,129,246,.08)!important;outline:1px dashed #2781f6;outline-offset:-1px;border-radius:10px}',
      '@keyframes cwxflash{0%,60%{background:rgba(255,200,0,.45);box-shadow:0 0 0 6px rgba(255,200,0,.45)}100%{background:transparent;box-shadow:0 0 0 0 rgba(255,200,0,0)}}',
      '.cwx-flash{animation:cwxflash 4s ease-out;border-radius:10px}'
    ].join('\n');
    document.head.appendChild(css);
    function setSelecting(on) {
      selecting = on; document.body.classList.toggle('cwx-selecting', on);
      if (!on) { selected = {}; [].forEach.call(document.querySelectorAll('.cwx-sel'), function (l) { l.classList.remove('cwx-sel'); }); [].forEach.call(document.querySelectorAll('.cwx-chk.on'), function (b) { b.classList.remove('on'); }); }
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
    // acha as linhas de mensagem da tela: por id ("message123") e, se o Chatwoot usar outro formato, pelo texto
    var lastFetch = 0;
    function norm(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
    function rowFor(id) { return document.getElementById('message' + id) || document.querySelector('[data-cwx-id="' + id + '"]'); }
    function outsideOwn(n) { return !(n.closest && n.closest('#chat-panel,#kanban-panel,#cwx-bar,#kanban-link,#chat-link')); }
    function textRows() {
      var cv = convId(), k = cv.account + ':' + cv.id, ce = cache[k];
      if (!ce) { loadConv(cv).catch(function () { /* tenta depois */ }); return []; }
      if (Date.now() - lastFetch > 6000) { lastFetch = Date.now(); loadMsgs(cv, ce); }
      var byText = {}; Object.keys(ce.msgs).forEach(function (id) { var m = ce.msgs[id], t = norm(m.content); if (m.message_type !== 2 && t.length > 1) (byText[t] = byText[t] || []).push(Number(id)); });
      var out = [], used = {}, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())) {
        var t = norm(n.nodeValue); if (t.length < 2 || !byText[t]) continue;
        var p = n.parentElement; if (!p || !outsideOwn(p)) continue;
        var row = p.closest('li') || p.closest('[class*="message"]'); if (!row || !outsideOwn(row) || row.id === 'app') continue;
        if (row.dataset.cwxId) { used[row.dataset.cwxId] = 1; continue; }
        var ids = byText[t].filter(function (id) { return !used[id]; }); if (!ids.length) continue;
        used[ids[ids.length - 1]] = 1; out.push({ el: row, id: ids[ids.length - 1] });
      }
      return out;
    }
    function decorate() {
      if (!convId() || panelOpen()) return;
      var rows = [];
      [].forEach.call(document.querySelectorAll('[id^="message"]'), function (e) { var m = /^message[-_]?(\d+)$/.exec(e.id); if (m) rows.push({ el: e, id: Number(m[1]) }); });
      [].forEach.call(document.querySelectorAll('[data-message-id]'), function (e) { if (/^\d+$/.test(e.getAttribute('data-message-id'))) rows.push({ el: e, id: Number(e.getAttribute('data-message-id')) }); });
      if (!rows.length || selecting) rows = rows.concat(textRows());
      var cvn = convId(), cen = cvn && cache[cvn.account + ':' + cvn.id];
      if (cvn && !cen) { loadConv(cvn).catch(function () { /* tenta depois */ }); return; }
      if (cen && Date.now() - lastFetch > 6000) { lastFetch = Date.now(); loadMsgs(cvn, cen); }
      // mensagens mais antigas que as carregadas: busca o tipo delas para ignorar avisos do sistema
      var unknown = rows.map(function (r) { return r.id; }).filter(function (id) { return cen && !cen.msgs[id] && !(cen.tried || (cen.tried = {}))[id]; });
      if (unknown.length) {
        unknown.forEach(function (id) { cen.tried[id] = 1; });
        api('/accounts/' + cvn.account + '/conversations/' + cvn.id + '/messages?before=' + (Math.max.apply(null, unknown) + 1)).then(function (r) { ((r && r.payload) || []).forEach(function (m) { cen.msgs[m.id] = m; }); }).catch(function () { /* segue sem o tipo */ });
      }
      if (cen && !cen.loaded) return;
      rows = rows.filter(function (r) { var m = cen && cen.msgs[r.id]; return !(m && m.message_type === 2); });
      rows.forEach(function (r) {
        var row = r.el, id = r.id; row.dataset.cwxId = String(id);
        if (row.querySelector(':scope>.cwx-tools')) return;
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
        var tools = el('div'); tools.className = 'cwx-tools';
        var fwd = el('button'); fwd.type = 'button'; fwd.title = 'Enviar ao chat interno'; fwd.innerHTML = ICON_FWD;
        fwd.onclick = function (e) { e.stopPropagation(); shareMessages([id]); };
        var m0 = cen && cen.msgs[id];
        if (m0 && m0.message_type === 1 && !m0.private && m0.source_id) {
          var edit = el('button'); edit.type = 'button'; edit.className = 'cwx-edit'; edit.title = 'Editar mensagem (WhatsApp)'; edit.innerHTML = ICON_EDIT;
          edit.onclick = function (e) { e.stopPropagation(); openEditor(convId() || cvn, id, row); };
          tools.appendChild(edit);
          // some depois dos 15 minutos permitidos pelo WhatsApp
          row.addEventListener('mouseenter', function () { edit.style.display = isEditable(cache[cvn.account + ':' + cvn.id].msgs[id]) ? '' : 'none'; });
        }
        tools.appendChild(fwd); row.appendChild(tools);
        var chk = el('button'); chk.type = 'button'; chk.className = 'cwx-chk'; chk.title = 'Selecionar mensagem'; chk.innerHTML = ICON_CHK;
        chk.onclick = function (e) { e.stopPropagation(); toggleSel(id, row, chk); };
        row.appendChild(chk);
        if (selected[id]) { row.classList.add('cwx-sel'); chk.classList.add('on'); }
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
        var li = rowFor(id);
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

    /* --- itens no menu nativo "Mais ações" (⋮) da conversa --- */
    function iconSpan() { var sp = document.createElement('span'); sp.style.cssText = 'display:inline-flex;width:16px;height:16px;flex:none'; sp.innerHTML = ICON_FWD.replace('width="14" height="14"', 'width="16" height="16"'); return sp; }
    function makeItem(proto, label, fn) {
      var c = proto.cloneNode(true); c.setAttribute('data-cwx-item', '1'); c.removeAttribute('id'); c.removeAttribute('disabled');
      var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, null), n, done = false;
      while ((n = w.nextNode())) { if (norm(n.nodeValue)) { if (!done) { n.nodeValue = label; done = true; } else n.nodeValue = ''; } }
      var ic = c.querySelector('svg, [class*="i-lucide"], [class*=" i-"], [class^="i-"]');
      if (ic) ic.replaceWith(iconSpan()); else c.insertBefore(iconSpan(), c.firstChild);
      c.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); fn();
        // fecha o menu nativo
        setTimeout(function () { ['mousedown', 'mouseup', 'click'].forEach(function (t) { document.body.dispatchEvent(new MouseEvent(t, { bubbles: true })); }); }, 0);
      }, true);
      return c;
    }
    function nativeMenu() {
      var cv = convId(); if (!cv || panelOpen()) return;
      var t = document.evaluate("//*[text()[contains(normalize-space(.),'Enviar Transcri')]]", document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!t || !outsideOwn(t)) return;
      var item = t.closest('li,[role="menuitem"],button,a');
      if (!item) { item = t; while (item.parentElement && item.parentElement.children.length < 2) item = item.parentElement; }
      while (item && item.parentElement && item.parentElement.children.length === 1 && !/^(UL|OL)$/.test(item.parentElement.tagName)) item = item.parentElement;
      if (!item || !item.parentElement || item.parentElement.querySelector('[data-cwx-item]')) return;
      var first = makeItem(item, 'Enviar conversa ao chat interno', function () {
        loadConv(cv).then(function (o) { share([cardFrom(o.conv)]); }).catch(function () { share([{ type: 'conversation', id: Number(cv.id), name: 'Conversa #' + cv.id, subtitle: '', thumb: '', status: '', message_ids: [] }]); });
      });
      var second = makeItem(item, 'Selecionar mensagens para o chat interno', function () { setSelecting(true); decorate(); });
      item.after(first); first.after(second);
    }
    function mount() {
      var cv = convId();
      if (!cv && selecting) setSelecting(false);
      if (cv) nativeMenu();
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
