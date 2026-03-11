'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const util = require('util');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function timestamp() {
  return new Date().toISOString();
}

function formatDetails(details) {
  if (details === undefined) return '';
  if (typeof details === 'string') return details;
  return util.inspect(details, { depth: 6, colors: false, compact: true, breakLength: 140 });
}

function logSavona(step, details) {
  const suffix = details === undefined ? '' : ` ${formatDetails(details)}`;
  console.log(`[savona ${timestamp()}] ${step}${suffix}`);
}

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      camera: { ip: '192.168.100.41', user: 'admin', password: 'ABCD1234', port: 80 },
    };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  try {
    await resources?.ctx?.close();
  } catch {}
  try {
    await resources?.browser?.close();
  } catch {}
}

async function gotoRM(page, cam) {
  const target = `http://${cam.ip}:${cam.port || 80}/rmt.html`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForURL(/\/rm(t)?\.html$/i, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function waitSavonaClient(page) {
  await page.waitForFunction(() => {
    try {
      return !!(window.client && window.client.property && window.client.system);
    } catch {
      return false;
    }
  }, { timeout: 20000 });
}

async function savonaCall(page, method, payload) {
  logSavona(`-> ${method}`, payload);
  const response = await page.evaluate(({ methodName, params }) => new Promise((resolve) => {
    try {
      const parts = methodName.split('.');
      let target = window.client;
      for (const part of parts.slice(0, -1)) {
        target = target?.[part];
      }
      const fn = target?.[parts.at(-1)];
      if (typeof fn !== 'function') {
        resolve({ error: `Metodo Savona indisponivel: ${methodName}` });
        return;
      }
      fn.call(target, { params, onresponse: (reply) => resolve(reply ?? null) });
    } catch (error) {
      resolve({ error: error instanceof Error ? error.message : String(error) });
    }
  }), { methodName: method, params: payload });

  if (response?.error) {
    const details = typeof response.error === 'string'
      ? response.error
      : JSON.stringify(response.error);
    logSavona(`<- ${method} ERROR`, details);
    throw new Error(details);
  }

  logSavona(`<- ${method} OK`, response?.result ?? null);
  return response?.result ?? null;
}

async function withSavona(operation) {
  const cfg = getConfig();
  const cam = cfg.camera || {};
  const resources = await createCtx(cam);

  try {
    logSavona('abrindo sessao', { ip: cam.ip, port: cam.port || 80, user: cam.user });
    await gotoRM(resources.page, cam);
    await waitSavonaClient(resources.page);
    logSavona('cliente Savona pronto');
    return await operation({ ...resources, cam });
  } finally {
    logSavona('encerrando sessao');
    await destroyCtx(resources);
  }
}

async function getValues(properties) {
  return withSavona(({ page }) => savonaCall(page, 'property.GetValue', properties));
}

async function setValues(payload) {
  return withSavona(({ page }) => savonaCall(page, 'property.SetValue', payload));
}

async function updateValues(payload) {
  return withSavona(({ page }) => savonaCall(page, 'property.UpdateValue', payload));
}

async function clipRecorder(method, params = ['main']) {
  const normalizedMethod = String(method || '').toLowerCase();
  if (!['start', 'stop'].includes(normalizedMethod)) {
    throw new Error(`Metodo de gravacao invalido: ${method}`);
  }

  return withSavona(({ page }) => savonaCall(
    page,
    `clip.recorder.${normalizedMethod === 'start' ? 'Start' : 'Stop'}`,
    params,
  ));
}

async function executeAction(action, payload = {}) {
  switch (action) {
    case 'colorbars': {
      const nextPayload = {
        'Camera.ColorBar.Enabled': !!payload.enabled,
      };
      if (payload.type) {
        nextPayload['Camera.ColorBar.Type'] = String(payload.type);
      }
      return setValues(nextPayload);
    }

    case 'recording':
      return clipRecorder(payload.start ? 'start' : 'stop');

    case 'ndMode':
      return setValues({
        'Camera.NDFilter.SettingMethod': payload.mode === 'Auto' ? 'Automatic' : { cam: 'Manual' },
      });

    case 'ndValue':
      return setValues({
        'Camera.NDFilter.SettingMethod': { cam: 'Manual' },
        'Camera.NDFilter.Value': { cam: Number(payload.value) },
      });

    case 'irisMode':
      return setValues({
        'Camera.Iris.SettingMethod': payload.mode === 'Auto' ? 'Automatic' : 'Manual',
      });

    case 'irisValue':
      return setValues({
        'Camera.Iris.SettingMethod': 'Manual',
        'Camera.Iris.Close.Enabled': false,
        'Camera.Iris.Value': { _n: Number(String(payload.value).replace(/[^\d.]/g, '')) },
      });

    case 'shutter':
      return setValues({
        'Camera.Shutter.ECS.Enabled': false,
        'Camera.Shutter.Mode': 'Speed',
        'Camera.Shutter.Value': String(payload.value),
      });

    case 'gain':
      return setValues({
        'Camera.Gain.Value': String(payload.value),
      });

    case 'wbMode':
      return setValues({
        'Camera.WhiteBalance.Mode': String(payload.mode),
      });

    case 'wbKelvin':
      return withSavona(async ({ page }) => {
        if (payload.mode) {
          await savonaCall(page, 'property.SetValue', {
            'Camera.WhiteBalance.Mode': String(payload.mode),
          });
          await sleep(60);
        }

        await savonaCall(page, 'property.SetValue', {
          'Camera.WhiteBalance.SettingMethod': 'Manual',
        });

        return savonaCall(page, 'property.SetValue', {
          'P.Control.ColorTemperature.Slider': Number(payload.value),
        });
      });

    case 'zoom':
      return updateValues({
        'Camera.Zoom.Velocity': Number(payload.velocity) || 0,
      });

    default:
      throw new Error(`Acao nao suportada: ${action}`);
  }
}

module.exports = {
  executeAction,
  getConfig,
  getValues,
  setValues,
  updateValues,
};
