// z190-menu-colorbars.js
// Uso: node z190-menu-colorbars.js on   |   node z190-menu-colorbars.js off
// Ajuste os PASSOS_* conforme o seu menu (ver comentários).

const { chromium } = require('playwright');

// Liste as câmeras:
const CAMS = [
  { ip: '192.168.9.105', user: 'admin', pass: 'ABCD1234' },
  // { ip: '192.168.9.106', user: 'admin', pass: 'ABCD1234' },
];

// === SEQUÊNCIA DE MENU (AJUSTE ESTES NÚMEROS) ===
// Exemplo-BASE (chute): Menu → Down x3 → Right → Down x1 → Set → (aguarda) → Cancel
const PASSOS = {
  ABRIR_MENU:  true,       // envia "Menu" no começo
  DOWN1:       2,          // nº de vezes "Down" no primeiro nível
  RIGHT1:      2,          // nº de vezes "Right" para entrar no submenu
  DOWN2:       2,          // nº de vezes "Down" até o item "Color Bars"
  ENTER_ITEM:  true,       // envia "Set" para abrir/alternar
  SAIR_COM_CANCEL: true,   // fecha com "Cancel" no final
};

// Tempo entre teclas (ms) – aumente se a UI estiver lenta
const KEY_DELAY = 300;

// =================================================

const ACTION = (process.argv[2] || '').toLowerCase();
if (!['on','off'].includes(ACTION)) {
  console.error('Uso: node z190-menu-colorbars.js on|off');
  process.exit(1);
}

async function gotoRM(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page.waitForURL(/\/rm(s|t)?\.html$/i, { timeout: 15000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
}

async function waitSavonaClient(page) {
  await page.waitForFunction(() => {
    try { return !!(window.client && window.client.property && window.client.button); }
    catch { return false; }
  }, { timeout: 20000 });
}

async function sendKey(page, key) {
  return page.evaluate((k) => new Promise((resolve) => {
    window.client.button.SendKeys({
      params: [k],
      onresponse: () => resolve(true)
    });
  }), key);
}

async function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getStatus(page, tag='status') {
  try {
    const r = await page.evaluate(() => new Promise((resolve) => {
      window.client.property.GetValue({
        params: { "Camera.ColorBar.Enabled":["*"], "Camera.ColorBar.Type":["*"] },
        onresponse: (resp)=> resolve(resp && (resp.result || resp.error))
      });
    }));
    console.log(`[${tag}]`, r);
    return r;
  } catch (e) {
    console.log(`[${tag}] erro`, String(e));
    return null;
  }
}

async function runForCamera(cam, wantOn) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ httpCredentials: { username: cam.user, password: cam.pass } });
  const page = await ctx.newPage();
  const url = `http://${cam.ip}/rm.html`;

  const out = { ip: cam.ip, ok: false, before: null, after: null };

  try {
    await gotoRM(page, url);
    await waitSavonaClient(page);

    out.before = await getStatus(page, 'before');

    // 1) Abrir menu
    if (PASSOS.ABRIR_MENU) { await sendKey(page, "Menu"); await pause(KEY_DELAY); }

    // 2) Navegar até o item de Color Bars
    for (let i=0; i<PASSOS.DOWN1; i++) { await sendKey(page, "DownArrow"); await pause(KEY_DELAY); }
    for (let i=0; i<PASSOS.RIGHT1; i++) { await sendKey(page, "RightArrow"); await pause(KEY_DELAY); }
    for (let i=0; i<PASSOS.DOWN2; i++) { await sendKey(page, "DownArrow"); await pause(KEY_DELAY); }

    // 3) Entrar/alternar
    if (PASSOS.ENTER_ITEM) { await sendKey(page, "Set"); await pause(KEY_DELAY); }

    // Algumas UIs abrem um seletor ON/OFF. Se quiser forçar ON/OFF:
    //   - Se 'wantOn==true', tente LeftArrow/RightArrow antes do Set final
    if (wantOn === true) {
      // tente uma inclinação para o lado "On"
      await sendKey(page, "RightArrow"); await pause(KEY_DELAY);
    } else {
      await sendKey(page, "LeftArrow"); await pause(KEY_DELAY);
    }
    // confirma escolha (caso tenha aberto um seletor)
    await sendKey(page, "Set"); await pause(KEY_DELAY);

    // 4) Sair do menu
    if (PASSOS.SAIR_COM_CANCEL) { await sendKey(page, "Cancel"); await pause(KEY_DELAY); }

    // 5) Confere
    out.after = await getStatus(page, 'after');
    out.ok = (out.after && out.after["Camera.ColorBar.Enabled"] === wantOn) || false;

    await ctx.close(); await browser.close();
    return out;
  } catch (e) {
    out.error = String(e);
    try { await ctx.close(); } catch {}
    try { await browser.close(); } catch {}
    return out;
  }
}

(async () => {
  const wantOn = (ACTION === 'on');
  const reports = [];
  for (const cam of CAMS) {
    const r = await runForCamera(cam, wantOn);
    reports.push(r);
  }
  console.dir(reports, { depth: null });
})();
