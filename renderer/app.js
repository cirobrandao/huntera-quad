function setZoomLabel(account, zoom) {
  const el = document.querySelector(`[data-zoom-for="${account}"]`);
  if (el) el.textContent = `${Math.round(zoom * 100)}%`;
}

function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function setName(account, name) {
  const el = document.querySelector(`[data-name-for="${account}"]`);
  if (!el || el.isContentEditable) return;
  el.textContent = name;
}

function setStats(list) {
  if (!Array.isArray(list)) return;
  list.forEach((stat, account) => {
    const el = document.querySelector(`[data-latency-for="${account}"]`);
    if (!el) return;
    const ping = formatMs(stat && stat.pingMs);
    const avg = formatMs(stat && stat.avgMs);
    const load = formatMs(stat && stat.loadMs);
    el.textContent = `ping ${ping} · load ${load}`;
    el.title = `Ping atual: ${ping}\nMédia (20 amostras): ${avg}\nCarregamento da página: ${load}`;
  });
}

function bindActions(root) {
  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-action');
      const accountAttr = btn.getAttribute('data-account');
      const payload = { type };
      if (accountAttr !== null) payload.account = Number(accountAttr);
      if (type === 'clear-account') {
        const nameEl = document.querySelector(`[data-name-for="${accountAttr}"]`);
        const label = nameEl ? nameEl.textContent.trim() : `Conta ${Number(accountAttr) + 1}`;
        const ok = window.confirm(
          `Limpar cookies e dados de ${label}? Você precisará fazer login de novo nessa conta.`
        );
        if (!ok) return;
      }
      try {
        const result = await window.hunteraQuad.action(payload);
        if (result && typeof result.zoom === 'number' && accountAttr !== null) {
          setZoomLabel(Number(accountAttr), result.zoom);
        }
      } catch (err) {
        console.error(err);
      }
    });
  });
}

function bindNameEditors() {
  document.querySelectorAll('.account-name').forEach((el) => {
    const account = Number(el.getAttribute('data-name-for'));
    let previous = el.textContent;

    const finish = async (cancel) => {
      if (!el.classList.contains('editing') && el.contentEditable !== 'true') return;
      el.contentEditable = 'false';
      el.classList.remove('editing');
      if (cancel) {
        el.textContent = previous;
        return;
      }
      const next = el.textContent.replace(/\s+/g, ' ').trim();
      try {
        const result = await window.hunteraQuad.action({
          type: 'set-name',
          account,
          name: next,
        });
        if (result && result.name) {
          el.textContent = result.name;
          previous = result.name;
        }
      } catch (err) {
        console.error(err);
        el.textContent = previous;
      }
    };

    el.addEventListener('click', () => {
      if (el.isContentEditable) return;
      previous = el.textContent;
      el.contentEditable = 'true';
      el.classList.add('editing');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    });

    el.addEventListener('blur', () => {
      if (el.classList.contains('editing')) finish(false);
    });
  });
}

bindActions(document);
bindNameEditors();

if (window.hunteraQuad && typeof window.hunteraQuad.onLayout === 'function') {
  window.hunteraQuad.onLayout((data) => {
    const grid = document.getElementById('grid');
    if (!grid || !data) return;
    grid.style.top = '0';
    if (typeof data.gap === 'number') grid.style.gap = data.gap + 'px';
    if (typeof data.label === 'number') {
      document.querySelectorAll('.label').forEach((el) => {
        el.style.height = data.label + 'px';
      });
    }
    if (Array.isArray(data.zooms)) {
      data.zooms.forEach((z, i) => setZoomLabel(i, z));
    }
    if (Array.isArray(data.names)) {
      data.names.forEach((name, i) => setName(i, name));
    }
    if (Array.isArray(data.stats)) setStats(data.stats);
  });
}

if (window.hunteraQuad && typeof window.hunteraQuad.onZoom === 'function') {
  window.hunteraQuad.onZoom(({ account, zoom }) => setZoomLabel(account, zoom));
}

if (window.hunteraQuad && typeof window.hunteraQuad.onNames === 'function') {
  window.hunteraQuad.onNames((names) => {
    if (Array.isArray(names)) names.forEach((name, i) => setName(i, name));
  });
}

if (window.hunteraQuad && typeof window.hunteraQuad.onStats === 'function') {
  window.hunteraQuad.onStats(setStats);
}
