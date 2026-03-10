// z190-multi-colorbars.js (v3) — tenta múltiplos métodos de SET e loga resultados
// Uso: node z190-multi-colorbars.js on | off

const { chromium } = require('playwright');

const CAMS = [
  { ip: '192.168.9.105', user: 'admin', pass: 'ABCD1234' },
  // { ip: '192.168.9.106', user: 'admin', pass: 'ABCD1234' },
];

const ACTION = (process.argv[2] || '').toLowerCase();
if (!['on','off'].includes(ACTION)) {
  console.error('Uso: node z190-multi-colorbars.js on|off');
  process.exit(1);
}

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
async function stable(page){
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
}
async function withRetryEval(page, fn, desc, maxRetries=3) {
  for (let i=0; i<maxRetries; i++) {
    try { return await page.evaluate(fn); }
    catch (e) {
      if (String(e).includes('Execution context was destroyed')) { await stable(page); continue; }
      throw e;
    }
  }
  throw new Error(`Falha em ${desc}: contexto instável após ${maxRetries} tentativas`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const rows = [];

  for (const cam of CAMS) {
    const ctx = await browser.newContext({ httpCredentials: { username: cam.user, password: cam.pass } });
    const page = await ctx.newPage();
    const url = `http://${cam.ip}/rm.html`;
    const wantEnabled = ACTION === 'on';

    const row = { ip: cam.ip, ok: false, mode: null, usedType: null, tries: {} };

    try {
      await gotoRM(page, url);
      await waitSavonaClient(page);

      // Lê modo e status atuais
      const info = await withRetryEval(page, () => new Promise((resolve) => {
        const names = {
          "System.OperationMode": ["*"],
          "Camera.ColorBar.Enabled": ["*"],
          "Camera.ColorBar.Type": ["*"]
        };
        window.client.property.GetValue({ params: names, onresponse: (resp) => resolve(resp && (resp.result || resp.error)) });
      }), 'GetValue(initial)');

      row.mode = info && info["System.OperationMode"];
      const currentEnabled = info && info["Camera.ColorBar.Enabled"];
      let type = (info && info["Camera.ColorBar.Type"]) || "SMPTE";
      row.usedType = type;

      // Função util para ler status
      async function readStatus(tag){
        const r = await withRetryEval(page, () => new Promise((resolve)=>{
          window.client.property.GetValue({
            params: { "Camera.ColorBar.Enabled":["*"], "Camera.ColorBar.Type":["*"] },
            onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
          });
        }), `GetValue(${tag})`);
        row.tries[tag] = { after: { enabled: r && r["Camera.ColorBar.Enabled"], type: r && r["Camera.ColorBar.Type"] } };
        return r;
      }

      // T1: SetValue com Enabled + Type
      await page.addInitScript(({enabled, type}) => { window.__wantEnabled__=enabled; window.__ctype__=type; }, { enabled: wantEnabled, type });
      const t1 = await withRetryEval(page, () => new Promise((resolve)=>{
        window.client.property.SetValue({
          params: { "Camera.ColorBar.Enabled": !!window.__wantEnabled__, "Camera.ColorBar.Type": window.__ctype__ },
          onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
        });
      }), 'SetValue(E+T)');
      row.tries['SetValue(E+T)'] = { resp: t1 };
      const s1 = await readStatus('after SetValue(E+T)');
      if (s1 && s1["Camera.ColorBar.Enabled"] === wantEnabled) { row.ok = true; rows.push(row); await ctx.close(); continue; }

      // T2: UpdateValue com ambos
      const t2 = await withRetryEval(page, () => new Promise((resolve)=>{
        window.client.property.UpdateValue({
          params: { "Camera.ColorBar.Enabled": !!window.__wantEnabled__, "Camera.ColorBar.Type": window.__ctype__ },
          onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
        });
      }), 'UpdateValue(E+T)');
      row.tries['UpdateValue(E+T)'] = { resp: t2 };
      const s2 = await readStatus('after UpdateValue(E+T)');
      if (s2 && s2["Camera.ColorBar.Enabled"] === wantEnabled) { row.ok = true; rows.push(row); await ctx.close(); continue; }

      // T3: SetValue apenas Enabled
      const t3 = await withRetryEval(page, () => new Promise((resolve)=>{
        window.client.property.SetValue({
          params: { "Camera.ColorBar.Enabled": !!window.__wantEnabled__ },
          onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
        });
      }), 'SetValue(E-only)');
      row.tries['SetValue(E-only)'] = { resp: t3 };
      const s3 = await readStatus('after SetValue(E-only)');
      if (s3 && s3["Camera.ColorBar.Enabled"] === wantEnabled) { row.ok = true; rows.push(row); await ctx.close(); continue; }

      // T4: System.SetProperties (lote)
      const t4 = await withRetryEval(page, () => new Promise((resolve)=>{
        window.client.system.SetProperties({
          params: { "Camera.ColorBar.Enabled": !!window.__wantEnabled__, "Camera.ColorBar.Type": window.__ctype__ },
          onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
        });
      }), 'System.SetProperties(E+T)');
      row.tries['System.SetProperties(E+T)'] = { resp: t4 };
      const s4 = await readStatus('after System.SetProperties(E+T)');
      if (s4 && s4["Camera.ColorBar.Enabled"] === wantEnabled) { row.ok = true; rows.push(row); await ctx.close(); continue; }

      // Se nada mudou, marca como falha mas entrega todo o diagnóstico
      rows.push(row);
      await ctx.close();
    } catch (e) {
      row.error = String(e);
      rows.push(row);
      try { await ctx.close(); } catch {}
    }
  }

  console.dir(rows, { depth: null });
  await browser.close();
})();
