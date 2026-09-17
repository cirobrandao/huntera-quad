function setZoomLabel(account, zoom) {
  const el = document.querySelector(`[data-zoom-for="${account}"]`);
  if (el) el.textContent = `${Math.round(zoom * 100)}%`;
}

function bindActions(root) {
  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-action');
      const accountAttr = btn.getAttribute('data-account');
      const payload = { type };
      if (accountAttr !== null) payload.account = Number(accountAttr);
      if (type === 'clear-account') {
        const ok = window.confirm(
          `Limpar cookies e dados da Conta ${Number(accountAttr) + 1}? Você precisará fazer login de novo nessa conta.`
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

bindActions(document);

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
  });
}

if (window.hunteraQuad && typeof window.hunteraQuad.onZoom === 'function') {
  window.hunteraQuad.onZoom(({ account, zoom }) => setZoomLabel(account, zoom));
}
