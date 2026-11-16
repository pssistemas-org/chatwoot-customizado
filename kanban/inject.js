/* Item "Kanban" no menu lateral do Chatwoot.
 * Ao clicar, o kanban abre ao lado do menu (o menu lateral continua visível),
 * ocupando a área de conteúdo. Carregado em todas as páginas do painel pelo Dockerfile.
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

  function accountId() {
    var m = location.pathname.match(/\/app\/accounts\/(\d+)/);
    return m ? m[1] : null;
  }
  function pageUrl(id) { return '/app/accounts/' + id + '/dashboard' + HASH; }
  function frameUrl(id) { return '/kanban/index.html?embed=1&account=' + id; }

  /* ---------- painel ao lado do menu ---------- */
  function sidebarRight() {
    var right = 0;
    [].forEach.call(document.querySelectorAll('aside'), function (a) {
      var r = a.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left <= 4 && r.right > right) right = r.right;
    });
    return right;
  }

  function isDark() {
    return document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
  }

  function position() {
    if (!panel) return;
    panel.style.left = sidebarRight() + 'px';
    panel.style.background = isDark() ? '#111113' : '#fcfcfd';
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
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(position);
      [].forEach.call(document.querySelectorAll('aside'), function (a) { ro.observe(a); });
    }
    window.addEventListener('resize', position);
    return panel;
  }

  function setActive(on) {
    var link = document.getElementById('kanban-link');
    var a = link && (link.tagName === 'A' ? link : link.querySelector('a'));
    if (a) {
      a.style.background = on ? 'rgba(128,128,128,.16)' : '';
      a.style.fontWeight = on ? '600' : '';
    }
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

  function trySidebar(id) {
    var link = document.getElementById('kanban-link');
    if (link) {
      var a0 = link.tagName === 'A' ? link : link.querySelector('a');
      if (a0) a0.setAttribute('href', pageUrl(id));
      return true;
    }
    var ref = document.querySelector('nav a[href*="/contacts"], aside a[href*="/contacts"]');
    if (!ref) return false;
    var item = ref.closest('li') || ref;
    var clone = item.cloneNode(true);
    clone.id = 'kanban-link';
    var anchor = clone.tagName === 'A' ? clone : clone.querySelector('a');
    if (!anchor) return false;
    anchor.setAttribute('href', pageUrl(id));
    anchor.removeAttribute('aria-current');
    anchor.className = anchor.className.split(/\s+/).filter(function (c) { return !/active/i.test(c); }).join(' ');

    // troca o texto do rótulo
    var walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    var node, last = null;
    while ((node = walker.nextNode())) if (node.nodeValue.trim()) last = node;
    if (last) last.nodeValue = LABEL;

    // troca o ícone
    var icon = anchor.querySelector('svg, [class*="i-"], i');
    if (icon) {
      var wrap = document.createElement('span');
      wrap.innerHTML = ICON;
      wrap.style.display = 'inline-flex';
      icon.replaceWith(wrap);
    }
    item.parentNode.insertBefore(clone, item.nextSibling);
    if (isOpen) setActive(true);
    return true;
  }

  function fab(id) {
    var el = document.getElementById('kanban-fab');
    if (el) { el.setAttribute('href', pageUrl(id)); return; }
    el = document.createElement('a');
    el.id = 'kanban-fab';
    el.href = pageUrl(id);
    el.innerHTML = ICON + '<span style="margin-left:6px">' + LABEL + '</span>';
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:31;display:flex;align-items:center;' +
      'padding:8px 14px;border-radius:999px;background:#2781f6;color:#fff;font:600 13px/1 Inter,sans-serif;' +
      'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(el);
  }

  function tick() {
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
    // clique em qualquer outro link do menu lateral: fecha o kanban e deixa o Chatwoot navegar
    if (isOpen && t.closest('aside a[href], nav a[href]')) closeKanban();
  }, true);

  window.addEventListener('popstate', function () {
    if (isOpen && location.hash !== HASH) closeKanban();
    else if (!isOpen && location.hash === HASH) openKanban();
  });

  setInterval(tick, 1000);
  tick();

  // abre direto quando a página carrega com #kanban (link, favorito ou atualizar a página)
  if (location.hash === HASH) {
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (accountId() && sidebarRight() > 0) { clearInterval(wait); openKanban(); }
      else if (tries > 40) { clearInterval(wait); if (accountId()) openKanban(); }
    }, 250);
  }
})();
