// z190-colorbars-100.js
// Uso:
//   node z190-colorbars-100.js on
//   node z190-colorbars-100.js off
//
// Requisitos: npm i playwright  &&  npx playwright install chromium

const { chromium } = require('playwright');

// Liste suas câmeras aqui:
const CAMS = [
  { ip: '192.168.9.105', user: 'admin', pass: 'ABCD1234' },
  // { ip: '192.168.9.106', user: 'admin', pass: 'ABCD1234' },
];

// Por padrão, o Type que a UI usa é "100%".
const COLORBAR_TYPE = "100%";

const ACTION = (process.argv[2] || '').toLowerCase();
if (!['on','off'].includes(ACTION)) {
  console.error('Uso: node z190-colorbars-100.js on|off');
  process.exit(1);
}
const WANT_ENABLED = ACTION === 'on';

async function gotoRM(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page.waitForURL(/\/rm(s|t)?\.html$/i, { timeout: 15000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
}

async function waitSavonaClient(page) {
  await page.waitForFunction(() => {
    try { return !!(window.client && window.client.property && window.client.notify && window.client.system); }
    catch { return false; }
  }, { timeout: 20000 });
}

async function getColorbarStatus(page, tag) {
  return page.evaluate((t) => new Promise((resolve) => {
    window.client.property.GetValue({
      params: { "Camera.ColorBar.Enabled":["*"], "Camera.ColorBar.Type":["*"] },
      onresponse: r => resolve({ tag: t, data: r && (r.result || r.error) })
    });
  }), tag);
}

async function setColorbar(page, enabled, type) {
  return page.evaluate(({enabled, type}) => new Promise((resolve) => {
    window.client.property.SetValue({
      params: { "Camera.ColorBar.Enabled": !!enabled, "Camera.ColorBar.Type": type },
      onresponse: r => resolve(r && (r.result || r.error))
    });
  }), { enabled, type });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const cam of CAMS) {
    const ctx = await browser.newContext({
      httpCredentials: { username: cam.user, password: cam.pass },
    });
    const page = await ctx.newPage();
    const url = `http://${cam.ip}/rm.html`;
    const row = { ip: cam.ip, before: null, setResp: null, after: null, ok: false };

    try {
      await gotoRM(page, url);
      await waitSavonaClient(page);

      row.before = await getColorbarStatus(page, 'before');

      // Use exatamente o Type que a UI mostrou nos seus logs: "100%"
      row.setResp = await setColorbar(page, WANT_ENABLED, COLORBAR_TYPE);

      // Confirma leitura
      row.after = await getColorbarStatus(page, 'after');
      const enabledAfter = row.after?.data?.["Camera.ColorBar.Enabled"];
      row.ok = (enabledAfter === WANT_ENABLED);

      results.push(row);
    } catch (e) {
      row.error = String(e);
      results.push(row);
    } finally {
      try { await ctx.close(); } catch {}
    }
  }

  console.table(results.map(r => ({
    ip: r.ip,
    ok: r.ok,
    before: r.before?.data,
    setResp: r.setResp,
    after: r.after?.data
  })));
  await browser.close();
})();
