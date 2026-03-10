/**
 * z190-status.js v3 — Status completo da Sony PXW-Z190
 * Propriedades 100% confirmadas pelo código-fonte original da Sony (rmt.html).
 */
'use strict';
const { chromium } = require('playwright');
const fs  = require('fs');
const path = require('path');

function getConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8')); }
  catch { return { camera:{ ip:'192.168.100.41', user:'admin', password:'ABCD1234', port:80 } }; }
}

const argv     = process.argv.slice(2);
const JSON_ONLY = argv.includes('--json') || argv.includes('-j');
const log = (...a) => { if (!JSON_ONLY) process.stderr.write(a.join(' ') + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── helpers para extrair valor de objetos Savona ──
function toNum(x) {
  if (x == null) return null;
  if (typeof x === 'number' && isFinite(x)) return x;
  if (typeof x === 'string') { const n = Number(x.replace(/[^\d.-]/g,'')); return isFinite(n)?n:null; }
  if (typeof x === 'object') {
    for (const k of ['_n','cam','value','current']) { if (k in x) { const n=toNum(x[k]); if(n!=null)return n; } }
  }
  return null;
}
function toStr(x) {
  if (x == null) return null;
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    for (const k of ['cam','value','current','_n']) { if (k in x) return String(x[k]); }
  }
  return String(x);
}

// ── browser helpers ──
async function createCtx(cam) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ httpCredentials:{ username:cam.user, password:cam.password||cam.pass } });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}
async function destroyCtx(c) {
  try { await c?.ctx?.close(); } catch {}
  try { await c?.browser?.close(); } catch {}
}
async function gotoRM(page, ip) {
  await page.goto(`http://${ip}/rmt.html`, { waitUntil:'domcontentloaded', timeout:30000 }).catch(()=>{});
  await page.waitForURL(/\/rm(t)?\.html$/i, { timeout:15000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout:15000 }).catch(()=>{});
}
async function waitSavona(page) {
  await page.waitForFunction(() => {
    try { return !!(window.client && window.client.property && window.client.system); }
    catch { return false; }
  }, { timeout:20000 });
}
function savonaGet(page, params) {
  return page.evaluate((p) => new Promise(resolve => {
    try { window.client.property.GetValue({ params:p, onresponse: r => resolve(r?.result || r?.error || null) }); }
    catch(e) { resolve(null); }
  }), params);
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const cfg = getConfig();
  const cam = cfg.camera;
  log(`[z190-status] Conectando em ${cam.ip}...`);

  const { browser, ctx, page } = await createCtx(cam);
  try {
    await gotoRM(page, cam.ip);
    await waitSavona(page);
    log(`[z190-status] Savona pronto. Lendo parâmetros...`);

    // ── Batch 1: Exposição ──
    const exp = await savonaGet(page, {
      "Camera.Iris.Value":           ["*"],
      "Camera.Iris.SettingMethod":   ["*"],
      "Camera.Iris.Close.Enabled":   ["*"],
      "Camera.Iris.Mode":            ["*"],
      "Camera.Gain.Value":           ["*"],
      "Camera.Gain.SettingMethod":   ["*"],
      "Camera.Gain.Mode":            ["*"],
      "Camera.Shutter.Value":        ["*"],
      "Camera.Shutter.Mode":         ["*"],
      "Camera.Shutter.Enabled":      ["*"],
      "Camera.Shutter.ECS.Enabled":  ["*"],
      "Camera.Shutter.SettingMethod":["*"],
      "Camera.Shutter.Slow.Enabled": ["*"],
      "Camera.Shutter.Slow.Frames":  ["*"],
      "Camera.NDFilter.Value":       ["*"],
      "Camera.NDFilter.SettingMethod":["*"],
      "Camera.NDFilter.Enabled":     ["*"],
    });
    await sleep(50);

    // ── Batch 2: White Balance ──
    const wb = await savonaGet(page, {
      "Camera.WhiteBalance.Mode":                       ["*"],
      "Camera.WhiteBalance.SettingMethod":              ["*"],
      "Camera.WhiteBalance.AutoAdjust.Enabled":         ["*"],
      "Camera.WhiteBalance.ColorTemperature.Value":     ["*"],
      "Camera.WhiteBalance.ColorTemperature.MemoryValue":["*"],
    });
    await sleep(50);

    // ── Batch 3: Zoom, Focus, ColorBars ──
    const optics = await savonaGet(page, {
      "Camera.Zoom.Value":              ["*"],
      "Camera.Zoom.Velocity":           ["*"],
      "Camera.Focus.Distance":          ["*"],
      "Camera.Focus.Distance.Unit":     ["*"],
      "Camera.Focus.SettingMethod":     ["*"],
      "Camera.Focus.Velocity":          ["*"],
      "Camera.ColorBar.Enabled":        ["*"],
      "Camera.ColorBar.Type":           ["*"],
      "Camera.Lens.Mount":              ["*"],
    });
    await sleep(50);

    // ── Batch 4: Record / Clip ──
    const rec = await savonaGet(page, {
      "P.Clip.Mediabox.Mode":                              ["*"],
      "P.Clip.Mediabox.Status":                            ["*"],
      "P.Clip.Mediabox.Speed":                             ["*"],
      "P.Clip.Mediabox.TimeCode.Value":                    ["*"],
      "P.Clip.Mediabox.TimeCode.Type":                     ["*"],
      "P.Clip.Mediabox.TimeCode.Locked":                   ["*"],
      "P.Clip.Mediabox.SimulRec.Enabled":                  ["*"],
      "P.Clip.Mediabox.SimulRec.Mode":                     ["*"],
      "P.Clip.Mediabox.ClipName":                          ["*"],
      "P.Clip.Mediabox.TotalClips":                        ["*"],
      "P.Clip.Mediabox.ClipPosition":                      ["*"],
      "Clip.Recorder.Status":                              ["*"],
    });
    await sleep(50);

    // ── Batch 5: Formato de vídeo ──
    const fmt = await savonaGet(page, {
      "P.Clip.Mediabox.Video.Format.FrameRate":            ["*"],
      "P.Clip.Mediabox.Video.Format.Encoding":             ["*"],
      "P.Clip.Mediabox.Video.Format.Width":                ["*"],
      "P.Clip.Mediabox.Video.Format.Height":               ["*"],
      "P.Clip.Mediabox.Video.Format.Scanning.Format":      ["*"],
      "P.Clip.Mediabox.Video.Format.BitRate.Value":        ["*"],
      "P.Clip.Mediabox.Video.Format.Chroma.Subsampling":   ["*"],
      "Camera.SlowAndQuickMotion.Enabled":                 ["*"],
      "Camera.SlowAndQuickMotion.FrameRate":               ["*"],
      "Camera.ShootingMode":                               ["*"],
    });
    await sleep(50);

    // ── Batch 6: Paint / Gamma ──
    const paint = await savonaGet(page, {
      "Paint.Gamma.Enabled":   ["*"],
      "Paint.Gamma.Type":      ["*"],
      "Paint.Gamma.Value":     ["*"],
      "Paint.Gamma.HDR.Value": ["*"],
    });
    await sleep(50);

    // ── Batch 7: Sistema / Storage / Battery ──
    const sys = await savonaGet(page, {
      "System.Config":                            ["*"],
      "System.Battery.Active.Remain.Display":     ["*"],
      "System.Battery.Active.Remain.Minute":      ["*"],
      "System.Battery.Active.Remain.Percentage":  ["*"],
      "System.Battery.Active.Remain.Voltage":     ["*"],
      "System.Battery.Active.Type":               ["*"],
      "Storage.Drive.Status":                     ["*"],
      "Storage.Media.AvailableTime":              ["*"],
      "Storage.Media.File.Status":                ["*"],
      "Storage.Media.WriteProtected":             ["*"],
      "System.Storage":                           ["*"],
      "Network.RemoteControl.Allow":              ["*"],
      "Output.Audio.Level":                       ["*"],
      "Camera.WhiteBalance.AutoAdjust.Enabled":   ["*"],
    });

    // ─── Normaliza ND ───────────────────────────────────────────────────────
    const ndRaw    = exp?.["Camera.NDFilter.Value"];
    const ndMethod = toStr(exp?.["Camera.NDFilter.SettingMethod"]);
    const ndNum    = toNum(ndRaw);
    const ND_MAP   = { 1:"Clear", 2:"1/4", 3:"1/16", 4:"1/64" };
    const nd_value = ndMethod === "Automatic" ? "Auto"
                   : ND_MAP[ndNum] ?? (ndNum != null ? String(ndNum) : toStr(ndRaw) ?? "—");

    // ─── Normaliza Kelvin ───────────────────────────────────────────────────
    const wbMode   = toStr(wb?.["Camera.WhiteBalance.Mode"]);
    const memRaw   = wb?.["Camera.WhiteBalance.ColorTemperature.MemoryValue"];
    const ctRaw    = wb?.["Camera.WhiteBalance.ColorTemperature.Value"];
    let wb_kelvin  = null;
    if (memRaw && typeof memRaw === 'object') {
      const v = memRaw[wbMode];
      if (v != null && v !== "") wb_kelvin = parseInt(v, 10) || null;
    }
    if (wb_kelvin == null) wb_kelvin = toNum(ctRaw);

    // ─── Normaliza Iris ─────────────────────────────────────────────────────
    const irisClosed = exp?.["Camera.Iris.Close.Enabled"];
    const irisRaw    = exp?.["Camera.Iris.Value"];
    const iris_value = irisClosed === true ? "Close"
                     : (toNum(irisRaw) != null ? Number(toNum(irisRaw).toFixed(1)) : toStr(irisRaw));

    // ─── Normaliza Rec Status ───────────────────────────────────────────────
    const clipRecStatus = rec?.["Clip.Recorder.Status"] || {};
    const mediaboxStatus = toStr(rec?.["P.Clip.Mediabox.Status"]) ?? "—";

    // ─── Normaliza Audio ────────────────────────────────────────────────────
    const audioRaw = sys?.["Output.Audio.Level"];
    const audio = audioRaw && typeof audioRaw === 'object' ? {
      ch1: audioRaw["ch.1"] ?? null,
      ch2: audioRaw["ch.2"] ?? null,
      ch3: audioRaw["ch.3"] ?? null,
      ch4: audioRaw["ch.4"] ?? null,
    } : null;

    // ─── Constrói saída final ───────────────────────────────────────────────
    const out = {
      // Exposição
      iris:          iris_value,
      iris_method:   toStr(exp?.["Camera.Iris.SettingMethod"]),
      iris_mode:     toStr(exp?.["Camera.Iris.Mode"]),
      iris_closed:   irisClosed ?? false,

      gain:          toStr(exp?.["Camera.Gain.Value"]),
      gain_method:   toStr(exp?.["Camera.Gain.SettingMethod"]),
      gain_mode:     toStr(exp?.["Camera.Gain.Mode"]),

      shutter:       toStr(exp?.["Camera.Shutter.Value"]),
      shutter_mode:  toStr(exp?.["Camera.Shutter.Mode"]),
      shutter_enabled: exp?.["Camera.Shutter.Enabled"] ?? null,
      shutter_ecs:   exp?.["Camera.Shutter.ECS.Enabled"] ?? null,
      shutter_method: toStr(exp?.["Camera.Shutter.SettingMethod"]),

      nd:            nd_value,
      nd_method:     ndMethod,
      nd_mode:       toStr(exp?.["Camera.NDFilter.SettingMethod"]) === "Automatic" ? "Auto"
                   : toStr(exp?.["Camera.NDFilter.SettingMethod"]) ?? "—",

      // White Balance
      wb_mode:       wbMode,
      wb_method:     toStr(wb?.["Camera.WhiteBalance.SettingMethod"]),
      wb_kelvin:     wb_kelvin,
      wb_kelvin_memA: memRaw?.["Memory A"] ? parseInt(memRaw["Memory A"]) : null,
      wb_kelvin_memB: memRaw?.["Memory B"] ? parseInt(memRaw["Memory B"]) : null,
      wb_kelvin_preset: memRaw?.["Preset"] ? parseInt(memRaw["Preset"]) : null,
      wb_atw_active: wb?.["Camera.WhiteBalance.AutoAdjust.Enabled"] ?? null,

      // Óptica
      zoom:          toNum(optics?.["Camera.Zoom.Value"]),
      zoom_velocity: toNum(optics?.["Camera.Zoom.Velocity"]),
      focus_distance: toStr(optics?.["Camera.Focus.Distance"]),
      focus_unit:    toStr(optics?.["Camera.Focus.Distance.Unit"]),
      focus_method:  toStr(optics?.["Camera.Focus.SettingMethod"]),
      lens_mount:    toStr(optics?.["Camera.Lens.Mount"]),

      // Color Bars
      colorbars:     optics?.["Camera.ColorBar.Enabled"] ?? null,
      colorbars_type: toStr(optics?.["Camera.ColorBar.Type"]),

      // Gravação / Timecode
      rec_main:      clipRecStatus?.main ?? toStr(clipRecStatus) ?? "—",
      rec_proxy:     clipRecStatus?.proxy ?? null,
      rec_sd:        clipRecStatus?.sd ?? null,
      rec_streaming: clipRecStatus?.streaming ?? null,
      mediabox_status: mediaboxStatus,
      mediabox_mode: toStr(rec?.["P.Clip.Mediabox.Mode"]),
      timecode:      toStr(rec?.["P.Clip.Mediabox.TimeCode.Value"]),
      timecode_type: toStr(rec?.["P.Clip.Mediabox.TimeCode.Type"]),
      timecode_locked: rec?.["P.Clip.Mediabox.TimeCode.Locked"] ?? null,
      simul_rec:     rec?.["P.Clip.Mediabox.SimulRec.Enabled"] ?? null,
      clip_name:     toStr(rec?.["P.Clip.Mediabox.ClipName"]),

      // Formato de vídeo
      video_fps:     toStr(fmt?.["P.Clip.Mediabox.Video.Format.FrameRate"]),
      video_codec:   toStr(fmt?.["P.Clip.Mediabox.Video.Format.Encoding"]),
      video_width:   toNum(fmt?.["P.Clip.Mediabox.Video.Format.Width"]),
      video_height:  toNum(fmt?.["P.Clip.Mediabox.Video.Format.Height"]),
      video_scan:    toStr(fmt?.["P.Clip.Mediabox.Video.Format.Scanning.Format"]),
      video_bitrate: toNum(fmt?.["P.Clip.Mediabox.Video.Format.BitRate.Value"]),
      video_chroma:  toStr(fmt?.["P.Clip.Mediabox.Video.Format.Chroma.Subsampling"]),
      shooting_mode: toStr(fmt?.["Camera.ShootingMode"]),
      sqmotion:      fmt?.["Camera.SlowAndQuickMotion.Enabled"] ?? null,
      sqmotion_fps:  toStr(fmt?.["Camera.SlowAndQuickMotion.FrameRate"]),

      // Paint / Gamma
      gamma_enabled: paint?.["Paint.Gamma.Enabled"] ?? null,
      gamma_type:    toStr(paint?.["Paint.Gamma.Type"]),
      gamma_value:   toStr(paint?.["Paint.Gamma.Value"]),

      // Sistema / Bateria
      battery_display: toStr(sys?.["System.Battery.Active.Remain.Display"]),
      battery_pct:   toNum(sys?.["System.Battery.Active.Remain.Percentage"]),
      battery_min:   toNum(sys?.["System.Battery.Active.Remain.Minute"]),
      battery_v:     toNum(sys?.["System.Battery.Active.Remain.Voltage"]),
      battery_type:  toStr(sys?.["System.Battery.Active.Type"]),
      storage_status: sys?.["Storage.Drive.Status"] ?? null,
      storage_avail: sys?.["Storage.Media.AvailableTime"] ?? null,
      audio:         audio,
    };

    const json = JSON.stringify(out);
    process.stdout.write(json + '\n');
    log(`[z190-status] OK — ${Object.keys(out).length} campos.`);

  } finally {
    await destroyCtx({ browser, ctx });
  }
})();
