/**
 * z190-discover.js v3 — Descobre propriedades Savona da Sony PXW-Z190
 *
 * Lista baseada no log real do console do browser da câmera.
 * Usa GetValue + GetStatus em todas as propriedades conhecidas.
 *
 * Uso:
 *   node z190-discover.js              → todos os valores
 *   node z190-discover.js --json       → saída JSON pura
 *   node z190-discover.js --filter Camera.Audio
 *   node z190-discover.js --status     → também roda GetStatus
 */
'use strict';
const { chromium } = require('playwright');

const CAMS = [{ ip: '192.168.100.41', user: 'admin', pass: 'ABCD1234' }];

const argv      = process.argv.slice(2);
const JSON_MODE = argv.includes('--json') || argv.includes('-j');
const DO_STATUS = argv.includes('--status') || argv.includes('-s');
const fi        = argv.findIndex(a => a === '--filter' || a === '-f');
const FILTER    = fi >= 0 ? (argv[fi + 1] || '') : '';

const log   = (...a) => { if (!JSON_MODE) process.stderr.write(a.join(' ') + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════
// Propriedades confirmadas pelo log real do browser da Z190
// + lista estendida de props conhecidas da série PXW/FX
// ══════════════════════════════════════════════════════════════
const GETVALUE_PROPS = [
  // ── Confirmadas no log do browser ──
  "P.Clip.Mediabox.Mode",
  "P.Clip.Mediabox.Speed",
  "P.Clip.Mediabox.Status",
  "P.Clip.Mediabox.TimeCode.Type",
  "P.Clip.Mediabox.TimeCode.Value",
  "P.Clip.Mediabox.TimeCode.Locked",
  "P.Clip.Mediabox.SimulRec.Enabled",
  "P.Clip.Mediabox.SimulRec.Mode",
  "System.Config",
  "Camera.WhiteBalance.AutoAdjust.Enabled",
  "Button.Assign",
  "Camera.WhiteBalance.Mode",
  "Camera.WhiteBalance.ColorTemperature.MemoryValue",
  "Camera.WhiteBalance.ColorTemperature.Value",

  // ── Camera / Iris ──
  "Camera.Iris.Value",
  "Camera.Iris.SettingMethod",
  "Camera.Iris.Close.Enabled",
  "Camera.Iris.FNumber",

  // ── Camera / Gain ──
  "Camera.Gain.Value",
  "Camera.Gain.SettingMethod",
  "Camera.Gain.Mode",

  // ── Camera / Shutter ──
  "Camera.Shutter.Value",
  "Camera.Shutter.Mode",
  "Camera.Shutter.Enabled",
  "Camera.Shutter.ECS.Enabled",
  "Camera.Shutter.ECS.Frequency",
  "Camera.Shutter.SettingMethod",
  "Camera.Shutter.Speed",

  // ── Camera / ND Filter ──
  "Camera.NDFilter.Value",
  "Camera.NDFilter.SettingMethod",

  // ── Camera / White Balance ──
  "Camera.WhiteBalance.SettingMethod",
  "Camera.WhiteBalance.R_Gain",
  "Camera.WhiteBalance.B_Gain",

  // ── Camera / Zoom ──
  "Camera.Zoom.Value",
  "Camera.Zoom.Position",
  "Camera.Zoom.Velocity",
  "Camera.Zoom.Mode",
  "Camera.Zoom.DigitalEnabled",
  "Camera.Zoom.ClearImageZoom.Enabled",

  // ── Camera / Focus ──
  "Camera.Focus.Distance",
  "Camera.Focus.Distance.Unit",
  "Camera.Focus.Position",
  "Camera.Focus.SettingMethod",
  "Camera.Focus.Mode",
  "Camera.Focus.FaceDetection.Enabled",
  "Camera.Focus.AF.Speed",
  "Camera.Focus.AF.Sensitivity",
  "Camera.Focus.AF.TransitionSpeed",
  "Camera.Focus.MF.Assist.Enabled",

  // ── Camera / Color Bars ──
  "Camera.ColorBar.Enabled",
  "Camera.ColorBar.Type",

  // ── Camera / Record ──
  "Camera.Record.Status",
  "Camera.Record.Format",

  // ── Camera / SlowAndQuick ──
  "Camera.SlowAndQuickMotion.Enabled",
  "Camera.SlowAndQuickMotion.FrameRate",

  // ── Camera / Timecode ──
  "Camera.TC.Value",
  "Camera.TC.Mode",
  "Camera.TC.RunMode",
  "Camera.TC.DropFrame",

  // ── Camera / Video Format ──
  "Camera.VideoFormat.Value",
  "Camera.VideoFormat.FrameRate",
  "Camera.VideoFormat.ScanMode",
  "Camera.VideoFormat.Codec",
  "Camera.System.Frequency",
  "Camera.System.Format",

  // ── Camera / Picture Profile / Paint ──
  "Camera.PictureProfile.Value",
  "Camera.PictureProfile.Number",
  "Paint.Gamma.Enabled",
  "Paint.Gamma.Value",
  "Paint.Gamma.BlackGamma.Level",
  "Paint.Gamma.BlackGamma.Range",
  "Paint.Knee.Enabled",
  "Paint.Knee.Point",
  "Paint.Knee.Slope",
  "Paint.Color.Mode",
  "Paint.Color.Saturation",
  "Paint.Detail.Level",
  "Paint.NoiseReduction",
  "Paint.WhiteClip.Enabled",
  "Paint.WhiteClip.Level",
  "Paint.BlackLevel",
  "Paint.SkinDetail.Enabled",

  // ── Camera / Exposure ──
  "Camera.Exposure.Mode",
  "Camera.Exposure.Compensation",
  "Camera.Exposure.AELevel",
  "Camera.Exposure.AESpeed",
  "Camera.Exposure.AGCLimit",
  "Camera.Exposure.AutoSlowShutter.Enabled",
  "Camera.Exposure.SpotMeter.Enabled",
  "Camera.Exposure.BackLight.Enabled",

  // ── Camera / Audio ──
  "Camera.Audio.Input1.Level",
  "Camera.Audio.Input2.Level",
  "Camera.Audio.Input1.Source",
  "Camera.Audio.Input2.Source",
  "Camera.Audio.Input1.Phantom",
  "Camera.Audio.Input2.Phantom",
  "Camera.Audio.Input1.LowCut",
  "Camera.Audio.Input2.LowCut",
  "Camera.Audio.Monitor.Level",
  "Camera.Audio.HeadPhone.Level",
  "Camera.Audio.Limiter.Enabled",
  "Camera.Audio.WindFilter.Enabled",

  // ── Camera / Display ──
  "Camera.Display.Peaking.Enabled",
  "Camera.Display.Peaking.Level",
  "Camera.Display.Zebra.Enabled",
  "Camera.Display.Zebra.Level",
  "Camera.Display.Histogram.Enabled",
  "Camera.Display.SafeArea.Enabled",
  "Camera.Display.Marker.Center.Enabled",
  "Camera.Display.Marker.Aspect.Enabled",

  // ── Camera / OIS ──
  "Camera.OIS.Enabled",
  "Camera.OIS.Mode",

  // ── P.Control (painel) ──
  "P.Control.ColorTemperature.Slider",
  "P.Control.Shutter.Value.Up",
  "P.Control.Shutter.Value.Down",
  "P.Control.ProxyRec.StartStop",
  "P.Control.u2x500.AutoBlackBalance",
  "P.Control.Iris.Up",
  "P.Control.Iris.Down",
  "P.Control.Gain.Up",
  "P.Control.Gain.Down",
  "P.Control.ND.Up",
  "P.Control.ND.Down",
  "P.Control.Zoom.Tele",
  "P.Control.Zoom.Wide",
  "P.Control.Focus.Near",
  "P.Control.Focus.Far",
  "P.Control.Rec.StartStop",

  // ── System ──
  "System.Version",
  "System.Model",
  "System.Serial",
  "System.Storage.A.Remain",
  "System.Storage.B.Remain",
  "System.Storage.A.Status",
  "System.Storage.B.Status",
  "System.Battery.Level",
  "System.Battery.Remain",
  "System.Temperature",

  // ── Network ──
  "Network.WiFi.Enabled",
  "Network.IP.Address",
  "Network.Streaming.Enabled",
  "Network.Streaming.Status",
];

// Propriedades para testar com GetStatus (retorna enabled/disabled/available)
const GETSTATUS_PROPS = [
  "Camera.SlowAndQuickMotion.Enabled",
  "Camera.Shutter.Enabled",
  "Camera.WhiteBalance.ColorTemperature.Value",
  "Camera.Iris.SettingMethod",
  "Camera.Iris.Close.Enabled",
  "Camera.WhiteBalance.SettingMethod",
  "Camera.ColorBar.Enabled",
  "Camera.Zoom.Value",
  "Camera.Focus.Distance",
  "Camera.Focus.SettingMethod",
  "Camera.Focus.Distance.Unit",
  "P.Control.Shutter.Value.Up",
  "P.Control.Shutter.Value.Down",
  "Camera.Gain.Mode",
  "P.Control.ProxyRec.StartStop",
  "Camera.NDFilter.SettingMethod",
  "Camera.Gain.SettingMethod",
  "Camera.Shutter.SettingMethod",
  "Camera.NDFilter.Value",
  "P.Control.u2x500.AutoBlackBalance",
  "Paint.Gamma.Enabled",
];

// ══════════════════════════════════════════════════════════════
// Browser helpers
// ══════════════════════════════════════════════════════════════
async function createCtx(cam) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ httpCredentials: { username: cam.user, password: cam.pass } });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}
async function destroyCtx(c) {
  try { await c?.ctx?.close(); } catch {}
  try { await c?.browser?.close(); } catch {}
}
async function gotoRM(page, ip) {
  await page.goto(`http://${ip}/rmt.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForURL(/\/rm(t)?\.html$/i, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}
async function waitSavona(page) {
  await page.waitForFunction(() => {
    try { return !!(window.client && window.client.property && window.client.system); }
    catch { return false; }
  }, { timeout: 20000 });
}
function savonaCall(page, method, params) {
  return page.evaluate(({ method, params }) => new Promise(resolve => {
    try {
      const parts = method.split('.');
      let obj = window.client;
      for (const p of parts.slice(0, -1)) obj = obj[p];
      obj[parts.at(-1)]({ params, onresponse: r => resolve(r) });
    } catch(e) { resolve({ error: String(e) }); }
  }), { method, params });
}

// ══════════════════════════════════════════════════════════════
// GetValue em batches
// ══════════════════════════════════════════════════════════════
async function getValueBatch(page, props) {
  const results = {};
  const BATCH = 20;
  const filtered = FILTER ? props.filter(p => p.startsWith(FILTER)) : props;

  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH);
    const params = {};
    for (const p of batch) params[p] = ["*"];
    try {
      const r = await savonaCall(page, 'property.GetValue', params);
      if (r?.result && typeof r.result === 'object') {
        for (const [k, v] of Object.entries(r.result)) {
          if (v !== null && v !== undefined) results[k] = v;
        }
      }
    } catch {}
    await sleep(30);
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// GetStatus em batches
// ══════════════════════════════════════════════════════════════
async function getStatusBatch(page, props) {
  const results = {};
  for (const prop of props) {
    try {
      const params = { [prop]: null };
      const r = await savonaCall(page, 'property.GetStatus', params);
      if (r?.result && typeof r.result === 'object') {
        for (const [k, v] of Object.entries(r.result)) {
          if (v !== null && v !== undefined) results[k] = v;
        }
      }
    } catch {}
    await sleep(20);
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// Informações do sistema
// ══════════════════════════════════════════════════════════════
async function getSystemInfo(page) {
  const info = {};

  // System.GetVersion
  try {
    const r = await savonaCall(page, 'system.GetVersion', undefined);
    if (r?.result) info.version = r.result;
  } catch {}

  // System.GetCapabilities
  try {
    const r = await savonaCall(page, 'system.GetCapabilities', undefined);
    if (r?.result) info.capabilities = r.result;
  } catch {}

  // Capability.GetValue para props específicas
  const capProps = ["Camera.Shutter.Speed", "Camera.Iris.Value", "Camera.Gain.Value",
                    "Camera.NDFilter.Value", "Camera.Zoom.Value", "Camera.Focus.Position"];
  for (const prop of capProps) {
    try {
      const r = await savonaCall(page, 'capability.GetValue', [prop]);
      if (r?.result !== undefined && r?.result !== null) info[`cap:${prop}`] = r.result;
    } catch {}
    await sleep(20);
  }

  // Process.GetList
  try {
    const r = await savonaCall(page, 'process.GetList', undefined);
    if (r?.result) info.processList = r.result;
  } catch {}

  return info;
}

// ══════════════════════════════════════════════════════════════
// Formata saída texto
// ══════════════════════════════════════════════════════════════
function formatText(values, statuses, sysInfo) {
  const LINE = '─'.repeat(70);
  const DLINE = '═'.repeat(70);

  // Agrupa por categoria
  const groups = {};
  for (const [k, v] of Object.entries(values)) {
    const parts = k.split('.');
    const cat = parts.slice(0, parts[0] === 'P' ? 3 : 2).join('.');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push([k, v]);
  }

  let out = `\n${DLINE}\n`;
  out += ` Z190 — Propriedades Savona (valores atuais)\n`;
  out += ` Total GetValue: ${Object.keys(values).length}  |  GetStatus: ${Object.keys(statuses).length}\n`;
  out += `${DLINE}\n`;

  for (const cat of Object.keys(groups).sort()) {
    out += `\n▶ ${cat}  (${groups[cat].length})\n${LINE}\n`;
    for (const [k, v] of groups[cat].sort(([a], [b]) => a.localeCompare(b))) {
      const vs = JSON.stringify(v);
      out += `  ${k.padEnd(54)} = ${vs}\n`;
    }
  }

  if (Object.keys(statuses).length > 0) {
    out += `\n▶ GetStatus (enabled/disabled/available)\n${LINE}\n`;
    for (const [k, v] of Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b))) {
      out += `  ${k.padEnd(54)} = ${JSON.stringify(v)}\n`;
    }
  }

  if (Object.keys(sysInfo).length > 0) {
    out += `\n▶ Sistema / Capabilities\n${LINE}\n`;
    for (const [k, v] of Object.entries(sysInfo)) {
      out += `  ${k}\n`;
      const lines = JSON.stringify(v, null, 2).split('\n');
      for (const l of lines) out += `    ${l}\n`;
    }
  }

  out += `\n${DLINE}\n`;
  out += ` GetValue: ${Object.keys(values).length} props  |  GetStatus: ${Object.keys(statuses).length} props\n`;
  return out;
}

// ══════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════
(async () => {
  const cam = CAMS[0];
  log(`[z190-discover] Conectando em ${cam.ip}...`);

  const { browser, ctx, page } = await createCtx(cam);
  try {
    await gotoRM(page, cam.ip);
    await waitSavona(page);
    log(`[z190-discover] Savona pronto.`);

    log(`[z190-discover] GetValue (${GETVALUE_PROPS.length} props)...`);
    const values = await getValueBatch(page, GETVALUE_PROPS);
    log(`[z190-discover] ${Object.keys(values).length} valores recebidos.`);

    let statuses = {};
    if (DO_STATUS) {
      log(`[z190-discover] GetStatus (${GETSTATUS_PROPS.length} props)...`);
      statuses = await getStatusBatch(page, GETSTATUS_PROPS);
      log(`[z190-discover] ${Object.keys(statuses).length} status recebidos.`);
    }

    log(`[z190-discover] Informações do sistema...`);
    const sysInfo = await getSystemInfo(page);

    if (JSON_MODE) {
      process.stdout.write(JSON.stringify({
        total_values:   Object.keys(values).length,
        total_statuses: Object.keys(statuses).length,
        values,
        statuses,
        system: sysInfo,
      }, null, 2) + '\n');
    } else {
      process.stdout.write(formatText(values, statuses, sysInfo));
    }

    log(`[z190-discover] Concluído.`);
  } finally {
    await destroyCtx({ browser, ctx });
  }
})();
