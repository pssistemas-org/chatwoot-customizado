/* Item "Kanban" no menu lateral do Chatwoot.
 * Ao clicar, o kanban abre ao lado do menu (o menu lateral continua visível),
 * ocupando a área de conteúdo. Qualquer troca de tela do Chatwoot fecha o kanban.
 * Carregado em todas as páginas do painel pelo Dockerfile.
 */
(function () {
  'use strict';
  if (window.__kanbanInjected) return;
  window.__kanbanInjected = true;

  var LABEL = 'Kanban';
  var HASH = '#kanban';
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/></svg>';
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
  function frameUrl(id) { return '/kanban/index.html?embed=1&account=' + id + '&v=__V__'; }
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
        if (el === panel || panel.contains(el) || el.closest('aside, nav, [id^="kanban-"], [role="alert"], [class*="toast"], [class*="snackbar"]')) return;
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
    panel.id = 'kanban-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:30;display:none;' +
      'border-left:1px solid rgba(128,128,128,.25)';
    frame = document.createElement('iframe');
    frame.title = LABEL;
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
      if (a.closest('#kanban-link')) return;
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
    var link = document.getElementById('kanban-link');
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
        var link = document.getElementById('kanban-link');
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
    ensurePanel();
    var src = frameUrl(id);
    if (frame.getAttribute('data-src') !== src) { frame.setAttribute('data-src', src); frame.src = src; }
    openPath = pathKey();
    position();
    panel.style.display = 'block';
    isOpen = true;
    setActive(true);
    setHash(true);
  }

  function closeKanban() {
    if (!isOpen) return;
    panel.style.display = 'none';
    isOpen = false;
    setActive(false);
    setHash(false);
  }

  /* ---------- item do menu ---------- */
  function removeAll() {
    ['kanban-link', 'kanban-fab'].forEach(function (id) {
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
      .filter(function (a) { return !a.closest('#kanban-link'); });
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
    var link = document.getElementById('kanban-link');
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
    clone.id = 'kanban-link';
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
      if (tn.nodeValue.trim() && pe && !pe.closest('svg') && seen.indexOf(pe) < 0) { seen.push(pe); pe.setAttribute('data-kanban-label', anchor.contains(pe) ? 'a' : 'o'); }
    }
    item.parentNode.insertBefore(clone, item.nextSibling);
    syncLabel();
    if (isOpen) setActive(true);
    return true;
  }

  // Menu recolhido: só o ícone (nome no tooltip). Menu expandido: ícone + nome.
  var RAIL_MAX = 110;
  function syncLabel() {
    var link = document.getElementById('kanban-link');
    if (!link) return;
    var collapsed = sidebarRight() <= RAIL_MAX;
    var shown = false;
    [].forEach.call(link.querySelectorAll('[data-kanban-label]'), function (el) {
      var pos = getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') return; // tooltips ficam como estão
      if (collapsed) { el.style.setProperty('display', 'none', 'important'); return; }
      el.style.removeProperty('display');
      if (el.getAttribute('data-kanban-label') === 'a' && !shown && getComputedStyle(el).position !== 'absolute') {
        shown = true;
        if (getComputedStyle(el).display === 'none') el.style.setProperty('display', 'inline');
      }
    });
  }

  function fab(id) {
    var el = document.getElementById('kanban-fab');
    if (el) { el.setAttribute('href', pageUrl(id)); return; }
    el = document.createElement('a');
    el.id = 'kanban-fab';
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
      var f = document.getElementById('kanban-fab');
      if (f) f.remove();
    } else if (Date.now() - startedAt > 8000) {
      fab(id);
    }
    if (isOpen) position();
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // clique no item Kanban: abre (ou fecha) sem recarregar a página
    if (t.closest('#kanban-link, #kanban-fab')) {
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
  setInterval(tick, 1000);
  tick();

  // abre direto quando a página carrega com #kanban (link, favorito ou atualizar a página)
  if (location.hash === HASH) {
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (accountId() && sidebarRight() > 0 && document.getElementById('kanban-link')) { clearInterval(wait); openKanban(); }
      else if (tries > 40) { clearInterval(wait); if (accountId()) openKanban(); }
    }, 250);
  }
})();
