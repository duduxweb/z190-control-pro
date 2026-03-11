'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch {
    return { camera: { ip: '192.168.100.41', user: 'admin', password: 'ABCD1234', port: 80 } };
  }
}

const argv = minimist(process.argv.slice(2), {
  string: ['ip', 'user', 'password', 'pass'],
  boolean: ['json', 'j', 'fast', 'f'],
  default: { port: 80 },
});
const JSON_ONLY = argv.json || argv.j;
const FAST_MODE = Boolean(argv.fast || argv.f);
const log = (...args) => {
  if (!JSON_ONLY) process.stderr.write(args.join(' ') + '\n');
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toNum(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    for (const key of ['_n', 'cam', 'value', 'current']) {
      if (key in value) {
        const parsed = toNum(value[key]);
        if (parsed != null) return parsed;
      }
    }
  }
  return null;
}

function toStr(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    for (const key of ['cam', 'value', 'current', '_n']) {
      if (key in value) return String(value[key]);
    }
    for (const key of ['status', 'state', 'mode', 'result', 'enabled']) {
      if (key in value) return String(value[key]);
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch {}
  }
  return String(value);
}

function normalizeBlackStatus(raw) {
  if (raw == null) return '-';
  if (typeof raw === 'boolean') return raw ? 'Running' : 'Idle';
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'string') return raw || '-';
  if (typeof raw === 'object') {
    for (const key of ['status', 'state', 'mode', 'result', 'cam', 'current', 'value']) {
      if (raw[key] != null && raw[key] !== '') return String(raw[key]);
    }
    try {
      const text = JSON.stringify(raw);
      return text && text !== '{}' ? text : '-';
    } catch {
      return '-';
    }
  }
  return String(raw);
}

function normalizeAudioLevel(raw) {
  const numeric = toNum(raw);
  if (numeric != null) {
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 4) {
      return `L${numeric}`;
    }
    if (numeric < 0 && numeric >= -90) {
      return `${Number(numeric.toFixed(1))}dB`;
    }
    return `${Number(numeric.toFixed(0))}%`;
  }

  const text = toStr(raw);
  if (!text) return '-';
  return /db|%/i.test(text) ? text : text;
}

function findStringInObjectByToken(input, token) {
  if (!input || typeof input !== 'object') return null;
  const stack = [input];
  const normalizedToken = String(token || '').toLowerCase();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    for (const [key, value] of Object.entries(current)) {
      if (key.toLowerCase().includes(normalizedToken)) {
        const text = toStr(value);
        if (text) return text;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return null;
}

async function createCtx(cam) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    httpCredentials: {
      username: cam.user,
      password: cam.password || cam.pass || '',
    },
  });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

async function destroyCtx(resources) {
  try { await resources?.ctx?.close(); } catch {}
  try { await resources?.browser?.close(); } catch {}
}

async function gotoRM(page, cam) {
  await page.goto(`http://${cam.ip}:${cam.port || 80}/rmt.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForURL(/\/rm(t)?\.html$/i, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function waitSavona(page) {
  await page.waitForFunction(() => {
    try {
      return !!(window.client && window.client.property && window.client.system && window.client.notify);
    } catch {
      return false;
    }
  }, { timeout: 20000 });
}

function savonaGet(page, params) {
  return page.evaluate((payload) => new Promise((resolve) => {
    try {
      window.client.property.GetValue({
        params: payload,
        onresponse: (reply) => resolve(reply?.result || reply?.error || null),
      });
    } catch {
      resolve(null);
    }
  }), params);
}

function savonaGetStatus(page, params) {
  return page.evaluate((payload) => new Promise((resolve) => {
    try {
      window.client.property.GetStatus({
        params: payload,
        onresponse: (reply) => resolve(reply?.result || reply?.error || null),
      });
    } catch {
      resolve(null);
    }
  }), params);
}

async function withSavona(cam, operation) {
  const needRetry = (error) => /Target page|Target closed|Execution context|Navigation|Protocol error|closed|Timeout/i.test(String(error || ''));

  for (let attempt = 0; attempt < 3; attempt++) {
    let resources = null;
    try {
      resources = await createCtx(cam);
      await gotoRM(resources.page, cam);
      await waitSavona(resources.page);
      return await operation(resources.page);
    } catch (error) {
      if (attempt === 2 || !needRetry(error)) throw error;
      await sleep(200);
    } finally {
      await destroyCtx(resources);
    }
  }

  throw new Error('Falha ao inicializar sessao Savona.');
}

(async () => {
  const cfg = getConfig();
  const cam = argv.ip ? {
    ip: argv.ip,
    user: argv.user || cfg.camera.user || 'admin',
    password: argv.password || argv.pass || cfg.camera.password || cfg.camera.pass || '',
    port: Number(argv.port || cfg.camera.port || 80),
  } : cfg.camera;
  log(`[z190-status] Conectando em ${cam.ip}...`);

  const out = await withSavona(cam, async (page) => {
    log('[z190-status] Savona pronto. Lendo parametros...');

    const exp = await savonaGet(page, {
      'Camera.Iris.Value': ['*'],
      'Camera.Iris.SettingMethod': ['*'],
      'Camera.Iris.Close.Enabled': ['*'],
      'Camera.Iris.Mode': ['*'],
      'Camera.Gain.Value': ['*'],
      'Camera.Gain.SettingMethod': ['*'],
      'Camera.Gain.Mode': ['*'],
      'Camera.Shutter.Value': ['*'],
      'Camera.Shutter.Mode': ['*'],
      'Camera.Shutter.Enabled': ['*'],
      'Camera.Shutter.ECS.Enabled': ['*'],
      'Camera.Shutter.SettingMethod': ['*'],
      'Camera.Shutter.Slow.Enabled': ['*'],
      'Camera.Shutter.Slow.Frames': ['*'],
      'Camera.NDFilter.Value': ['*'],
      'Camera.NDFilter.SettingMethod': ['*'],
      ...(FAST_MODE ? {} : { 'Camera.NDFilter.Enabled': ['*'] }),
    });
    await sleep(FAST_MODE ? 15 : 50);

    const wb = await savonaGet(page, {
      'Camera.WhiteBalance.Mode': ['*'],
      'Camera.WhiteBalance.SettingMethod': ['*'],
      'Camera.WhiteBalance.AutoAdjust.Enabled': ['*'],
      'Camera.WhiteBalance.ColorTemperature.Value': ['*'],
      'Camera.WhiteBalance.ColorTemperature.MemoryValue': ['*'],
    });
    await sleep(FAST_MODE ? 15 : 50);

    const optics = await savonaGet(page, {
      'Camera.Zoom.Value': ['*'],
      ...(FAST_MODE ? {} : { 'Camera.Zoom.Velocity': ['*'] }),
      'Camera.Focus.Distance': ['*'],
      'Camera.Focus.Distance.Unit': ['*'],
      'Camera.Focus.SettingMethod': ['*'],
      ...(FAST_MODE ? {} : { 'Camera.Focus.Velocity': ['*'] }),
      ...(FAST_MODE ? {} : { 'Camera.ColorBar.Enabled': ['*'] }),
      ...(FAST_MODE ? {} : { 'Camera.ColorBar.Type': ['*'] }),
      ...(FAST_MODE ? {} : { 'Camera.Lens.Mount': ['*'] }),
    });
    await sleep(FAST_MODE ? 15 : 50);

    const rec = await savonaGet(page, {
      'Clip.Recorder.Status': ['*'],
      ...(FAST_MODE ? {} : {
        'P.Clip.Mediabox.Mode': ['*'],
        'P.Clip.Mediabox.Status': ['*'],
        'P.Clip.Mediabox.Speed': ['*'],
        'P.Clip.Mediabox.TimeCode.Value': ['*'],
        'P.Clip.Mediabox.TimeCode.Type': ['*'],
        'P.Clip.Mediabox.TimeCode.Locked': ['*'],
        'P.Clip.Mediabox.SimulRec.Enabled': ['*'],
        'P.Clip.Mediabox.SimulRec.Mode': ['*'],
        'P.Clip.Mediabox.ClipName': ['*'],
        'P.Clip.Mediabox.TotalClips': ['*'],
        'P.Clip.Mediabox.ClipPosition': ['*'],
      }),
    });
    await sleep(FAST_MODE ? 15 : 50);

    const fmt = await savonaGet(page, {
      'P.Clip.Mediabox.Video.Format.FrameRate': ['*'],
      ...(FAST_MODE ? {} : { 'P.Clip.Mediabox.Video.Format.Encoding': ['*'] }),
      'P.Clip.Mediabox.Video.Format.Width': ['*'],
      'P.Clip.Mediabox.Video.Format.Height': ['*'],
      'P.Clip.Mediabox.Video.Format.Scanning.Format': ['*'],
      ...(FAST_MODE ? {} : { 'P.Clip.Mediabox.Video.Format.BitRate.Value': ['*'] }),
      ...(FAST_MODE ? {} : { 'P.Clip.Mediabox.Video.Format.Chroma.Subsampling': ['*'] }),
      ...(FAST_MODE ? {} : { 'Camera.SlowAndQuickMotion.Enabled': ['*'] }),
      ...(FAST_MODE ? {} : { 'Camera.SlowAndQuickMotion.FrameRate': ['*'] }),
      'Camera.ShootingMode': ['*'],
      'Camera.ShootingMode.QFHD.RecOut': ['cam'],
    });
    await sleep(FAST_MODE ? 15 : 50);

    const paint = await savonaGet(page, {
      'Paint.Gamma.Enabled': ['*'],
      'Paint.Gamma.Type': ['*'],
      'Paint.Gamma.Value': ['*'],
      ...(FAST_MODE ? {} : { 'Paint.Gamma.HDR.Value': ['*'] }),
    });
    await sleep(FAST_MODE ? 10 : 50);

    const sys = await savonaGet(page, {
      'System.Frequency': ['*'],
      'Camera.SystemFrequency': ['*'],
      'P.Clip.Mediabox.Video.Format.SystemFrequency': ['*'],
      'System.Battery.Active.Remain.Display': ['*'],
      'System.Battery.Active.Remain.Percentage': ['*'],
      'System.Battery.Active.Type': ['*'],
      'Output.Audio.Level': ['*'],
      ...(FAST_MODE ? {} : {
        'System.Config': ['*'],
        'System.Battery.Active.Remain.Minute': ['*'],
        'System.Battery.Active.Remain.Voltage': ['*'],
        'Storage.Drive.Status': ['*'],
        'Storage.Media.AvailableTime': ['*'],
        'Storage.Media.File.Status': ['*'],
        'Storage.Media.WriteProtected': ['*'],
        'System.Storage': ['*'],
        'Network.RemoteControl.Allow': ['*'],
        'Camera.WhiteBalance.AutoAdjust.Enabled': ['*'],
      }),
    });
    await sleep(FAST_MODE ? 10 : 30);

    const black = await savonaGetStatus(page, {
      'P.Control.u2x500.AutoBlackBalance': ['*'],
    });
    await sleep(FAST_MODE ? 5 : 20);
    const blackValue = await savonaGet(page, {
      'P.Control.u2x500.AutoBlackBalance': ['*'],
    });
    const blackStatusRaw = black?.['P.Control.u2x500.AutoBlackBalance'];
    const blackValueRaw = blackValue?.['P.Control.u2x500.AutoBlackBalance'];
    const blackRaw = blackStatusRaw ?? blackValueRaw;

    const ndRaw = exp?.['Camera.NDFilter.Value'];
    const ndMethod = toStr(exp?.['Camera.NDFilter.SettingMethod']);
    const ndNum = toNum(ndRaw);
    const ndPresetValues = [5, 32, 64, 128];
    const ndPresetLabels = ['Clear', '1/4', '1/16', '1/64'];
    const nearestNdLabel = ndNum == null
      ? null
      : ndPresetLabels[ndPresetValues.reduce((bestIdx, value, idx) => (
        Math.abs(value - ndNum) < Math.abs(ndPresetValues[bestIdx] - ndNum) ? idx : bestIdx
      ), 0)];
    const ndValue = ndMethod === 'Automatic'
      ? 'Auto'
      : nearestNdLabel ?? (ndNum != null ? String(ndNum) : toStr(ndRaw) ?? '-');

    const wbMode = toStr(wb?.['Camera.WhiteBalance.Mode']);
    const memRaw = wb?.['Camera.WhiteBalance.ColorTemperature.MemoryValue'];
    const ctRaw = wb?.['Camera.WhiteBalance.ColorTemperature.Value'];
    let wbKelvin = null;
    if (memRaw && typeof memRaw === 'object') {
      const modeValue = memRaw[wbMode];
      if (modeValue != null && modeValue !== '') wbKelvin = parseInt(modeValue, 10) || null;
    }
    if (wbKelvin == null) wbKelvin = toNum(ctRaw);

    const irisClosed = exp?.['Camera.Iris.Close.Enabled'];
    const irisRaw = exp?.['Camera.Iris.Value'];
    const irisValue = irisClosed === true
      ? 'Close'
      : (toNum(irisRaw) != null ? Number(toNum(irisRaw).toFixed(1)) : toStr(irisRaw));

    const clipRecStatus = rec?.['Clip.Recorder.Status'] || {};
    const mediaboxStatus = toStr(rec?.['P.Clip.Mediabox.Status']) ?? '-';
    const audioRaw = sys?.['Output.Audio.Level'];
    const audio = audioRaw && typeof audioRaw === 'object'
      ? {
          ch1: normalizeAudioLevel(audioRaw['ch.1']),
          ch2: normalizeAudioLevel(audioRaw['ch.2']),
          ch3: normalizeAudioLevel(audioRaw['ch.3']),
          ch4: normalizeAudioLevel(audioRaw['ch.4']),
        }
      : {
          ch1: '-',
          ch2: '-',
          ch3: '-',
          ch4: '-',
        };
    const width = toNum(fmt?.['P.Clip.Mediabox.Video.Format.Width']);
    const height = toNum(fmt?.['P.Clip.Mediabox.Video.Format.Height']);
    const scan = toStr(fmt?.['P.Clip.Mediabox.Video.Format.Scanning.Format']);
    const fps = toStr(fmt?.['P.Clip.Mediabox.Video.Format.FrameRate']);
    const pictureSize = width && height
      ? [ `${width}x${height}`, scan, fps ].filter(Boolean).join(' ')
      : '-';
    const sysConfig = sys?.['System.Config'];
    const systemFrequency = toStr(sys?.['System.Frequency'])
      || toStr(sys?.['Camera.SystemFrequency'])
      || toStr(sys?.['P.Clip.Mediabox.Video.Format.SystemFrequency'])
      || findStringInObjectByToken(sysConfig, 'Frequency')
      || '-';

    return {
      iris: irisValue,
      iris_method: toStr(exp?.['Camera.Iris.SettingMethod']),
      iris_mode: toStr(exp?.['Camera.Iris.Mode']),
      iris_closed: irisClosed ?? false,
      gain: toStr(exp?.['Camera.Gain.Value']),
      gain_method: toStr(exp?.['Camera.Gain.SettingMethod']),
      gain_mode: toStr(exp?.['Camera.Gain.Mode']),
      shutter: toStr(exp?.['Camera.Shutter.Value']),
      shutter_mode: toStr(exp?.['Camera.Shutter.Mode']),
      shutter_enabled: exp?.['Camera.Shutter.Enabled'] ?? null,
      shutter_ecs: exp?.['Camera.Shutter.ECS.Enabled'] ?? null,
      shutter_method: toStr(exp?.['Camera.Shutter.SettingMethod']),
      nd: ndValue,
      nd_method: ndMethod,
      nd_mode: toStr(exp?.['Camera.NDFilter.SettingMethod']) === 'Automatic' ? 'Auto' : toStr(exp?.['Camera.NDFilter.SettingMethod']) ?? '-',
      wb_mode: wbMode,
      wb_method: toStr(wb?.['Camera.WhiteBalance.SettingMethod']),
      wb_kelvin: wbKelvin,
      wb_kelvin_memA: memRaw?.['Memory A'] ? parseInt(memRaw['Memory A'], 10) : null,
      wb_kelvin_memB: memRaw?.['Memory B'] ? parseInt(memRaw['Memory B'], 10) : null,
      wb_kelvin_preset: memRaw?.['Preset'] ? parseInt(memRaw['Preset'], 10) : null,
      wb_atw_active: wb?.['Camera.WhiteBalance.AutoAdjust.Enabled'] ?? null,
      zoom: toNum(optics?.['Camera.Zoom.Value']),
      zoom_velocity: toNum(optics?.['Camera.Zoom.Velocity']),
      focus_distance: toStr(optics?.['Camera.Focus.Distance']),
      focus_unit: toStr(optics?.['Camera.Focus.Distance.Unit']),
      focus_method: toStr(optics?.['Camera.Focus.SettingMethod']),
      lens_mount: toStr(optics?.['Camera.Lens.Mount']),
      colorbars: optics?.['Camera.ColorBar.Enabled'] ?? null,
      colorbars_type: toStr(optics?.['Camera.ColorBar.Type']),
      rec_main: clipRecStatus?.main ?? toStr(clipRecStatus) ?? '-',
      rec_proxy: clipRecStatus?.proxy ?? null,
      rec_sd: clipRecStatus?.sd ?? null,
      rec_streaming: clipRecStatus?.streaming ?? null,
      mediabox_status: mediaboxStatus,
      mediabox_mode: toStr(rec?.['P.Clip.Mediabox.Mode']),
      timecode: toStr(rec?.['P.Clip.Mediabox.TimeCode.Value']),
      timecode_type: toStr(rec?.['P.Clip.Mediabox.TimeCode.Type']),
      timecode_locked: rec?.['P.Clip.Mediabox.TimeCode.Locked'] ?? null,
      simul_rec: rec?.['P.Clip.Mediabox.SimulRec.Enabled'] ?? null,
      clip_name: toStr(rec?.['P.Clip.Mediabox.ClipName']),
      video_fps: toStr(fmt?.['P.Clip.Mediabox.Video.Format.FrameRate']),
      video_codec: toStr(fmt?.['P.Clip.Mediabox.Video.Format.Encoding']),
      video_width: width,
      video_height: height,
      video_scan: scan,
      video_bitrate: toNum(fmt?.['P.Clip.Mediabox.Video.Format.BitRate.Value']),
      video_chroma: toStr(fmt?.['P.Clip.Mediabox.Video.Format.Chroma.Subsampling']),
      picture_size: pictureSize,
      system_frequency: systemFrequency,
      shooting_mode: toStr(fmt?.['Camera.ShootingMode']),
      output_recout: toStr(fmt?.['Camera.ShootingMode.QFHD.RecOut']),
      sqmotion: fmt?.['Camera.SlowAndQuickMotion.Enabled'] ?? null,
      sqmotion_fps: toStr(fmt?.['Camera.SlowAndQuickMotion.FrameRate']),
      black_status: normalizeBlackStatus(blackRaw),
      black_status_lock: normalizeBlackStatus(blackStatusRaw),
      black_status_value: normalizeBlackStatus(blackValueRaw),
      gamma_enabled: paint?.['Paint.Gamma.Enabled'] ?? null,
      gamma_type: toStr(paint?.['Paint.Gamma.Type']),
      gamma_value: toStr(paint?.['Paint.Gamma.Value']),
      battery_display: toStr(sys?.['System.Battery.Active.Remain.Display']),
      battery_pct: toNum(sys?.['System.Battery.Active.Remain.Percentage']),
      battery_min: toNum(sys?.['System.Battery.Active.Remain.Minute']),
      battery_v: toNum(sys?.['System.Battery.Active.Remain.Voltage']),
      battery_type: toStr(sys?.['System.Battery.Active.Type']),
      storage_status: sys?.['Storage.Drive.Status'] ?? null,
      storage_avail: sys?.['Storage.Media.AvailableTime'] ?? null,
      audio,
    };
  });

  process.stdout.write(`${JSON.stringify(out)}\n`);
  log(`[z190-status] OK - ${Object.keys(out).length} campos.`);
})();
