/* Adiciona o item "Kanban" ao menu lateral do Chatwoot (e um botão flutuante de reserva).
 * Carregado em todas as páginas do painel pelo Dockerfile.
 */
(function () {
  'use strict';
  if (window.__kanbanInjected) return;
  window.__kanbanInjected = true;

  var LABEL = 'Kanban';
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/></svg>';
  var startedAt = Date.now();

  function accountId() {
    var m = location.pathname.match(/\/app\/accounts\/(\d+)/);
    return m ? m[1] : null;
  }
  function url(id) { return '/kanban/index.html?account=' + id; }

  function removeAll() {
    ['kanban-link', 'kanban-fab'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function trySidebar(id) {
    var link = document.getElementById('kanban-link');
    if (link) {
      var a = link.tagName === 'A' ? link : link.querySelector('a');
      if (a) a.setAttribute('href', url(id));
      return true;
    }
    var ref = document.querySelector('nav a[href*="/contacts"], aside a[href*="/contacts"]');
    if (!ref) return false;
    var item = ref.closest('li') || ref;
    var clone = item.cloneNode(true);
    clone.id = 'kanban-link';
    var anchor = clone.tagName === 'A' ? clone : clone.querySelector('a');
    if (!anchor) return false;
    anchor.setAttribute('href', url(id));
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
    return true;
  }

  function fab(id) {
    var el = document.getElementById('kanban-fab');
    if (el) { el.setAttribute('href', url(id)); return; }
    el = document.createElement('a');
    el.id = 'kanban-fab';
    el.href = url(id);
    el.innerHTML = ICON + '<span style="margin-left:6px">' + LABEL + '</span>';
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:50;display:flex;align-items:center;' +
      'padding:8px 14px;border-radius:999px;background:#1f93ff;color:#fff;font:600 13px/1 sans-serif;' +
      'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(el);
  }

  function tick() {
    var id = accountId();
    if (!id) { removeAll(); return; }
    if (trySidebar(id)) {
      var f = document.getElementById('kanban-fab');
      if (f) f.remove();
    } else if (Date.now() - startedAt > 8000) {
      fab(id);
    }
  }

  setInterval(tick, 1500);
  tick();
})();
