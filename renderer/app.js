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
  const input = document.querySelector(`[data-name-input="${account}"]`);
  if (input && !input.hidden) return;
  if (el) el.textContent = name;
}

function setStats(list) {
  if (!Array.isArray(list)) return;
  list.forEach((stat, account) => {
    const el = document.querySelector(`[data-latency-for="${account}"]`);
    if (!el) return;
    const ping = formatMs(stat && stat.pingMs);
    const avg = formatMs(stat && stat.avgMs);
    const load = formatMs(stat && stat.loadMs);
    el.textContent = `Ping ${ping}`;
    el.classList.remove('good', 'ok', 'bad');
    if (typeof stat?.pingMs === 'number') {
      el.classList.add(stat.pingMs < 80 ? 'good' : stat.pingMs < 160 ? 'ok' : 'bad');
    }
    el.title = `Servidor do jogo huntera.com.br:443\nPing atual: ${ping}\nMédia (20 amostras): ${avg}\nCarregamento da página: ${load}`;
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
    const input = document.querySelector(`[data-name-input="${account}"]`);
    if (!input) return;
    let previous = el.textContent;

    const close = () => {
      input.hidden = true;
      el.hidden = false;
      el.classList.remove('editing');
    };

    const finish = async (cancel) => {
      if (input.hidden) return;
      const next = cancel ? previous : input.value;
      close();
      if (cancel) {
        el.textContent = previous;
        return;
      }
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

    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      previous = el.textContent;
      el.hidden = true;
      el.classList.add('editing');
      input.hidden = false;
      input.value = previous;
      input.focus();
      input.select();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(false);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    });

    input.addEventListener('blur', () => finish(false));
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
