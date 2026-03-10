/**
 * camera-api.js — Módulo de comunicação com a câmera Sony PXW-Z190
 *
 * Usa a API Savona (JSON-RPC via HTTP) da câmera para:
 *  - Ler valores atuais (GetValue)
 *  - Definir valores (SetValue)
 *  - Incrementar/decrementar (UpdateValue)
 *
 * A câmera Sony Z190 expõe uma API JSON-RPC no endpoint:
 *   http://<IP>/command/inquiry.cgi (leitura)
 *   http://<IP>/command/main.cgi (escrita)
 *
 * Porém, a forma mais confiável é via o protocolo Savona que roda
 * dentro do rmt.html. Este módulo implementa chamadas HTTP diretas
 * ao endpoint CGI da câmera como fallback, e também serve como
 * proxy para o frontend usar o Savona via WebSocket.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      camera: { ip: '192.168.100.41', user: 'admin', password: 'ABCD1234', port: 80 }
    };
  }
}

function getAuth() {
  const cfg = getConfig();
  return 'Basic ' + Buffer.from(`${cfg.camera.user}:${cfg.camera.password}`).toString('base64');
}

function getCameraUrl(path_) {
  const cfg = getConfig();
  return `http://${cfg.camera.ip}:${cfg.camera.port}${path_}`;
}

/**
 * Faz uma requisição HTTP para a câmera com autenticação Basic.
 */
async function cameraFetch(urlPath, options = {}) {
  const url = getCameraUrl(urlPath);
  const auth = getAuth();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 8000);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': auth,
        'Accept': '*/*',
        'User-Agent': 'Z190-Control/2.0',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/**
 * Tenta ler o status da câmera via CGI inquiry.
 * A Sony Z190 suporta vários endpoints CGI:
 *  - /command/inquiry.cgi?inq=camera (status geral)
 *  - /osc/state (estado OSC)
 *
 * Como a API principal é via Savona/WebSocket, este módulo
 * implementa leitura via HTTP GET dos endpoints disponíveis.
 */
async function getCameraStatus() {
  const cfg = getConfig();
  const result = {
    connected: false,
    raw: {},
    wb_mode: null,
    wb_method: null,
    wb_kelvin: null,
    iris_value: null,
    iris_method: null,
    gain_value: null,
    gain_method: null,
    shutter_value: null,
    shutter_mode: null,
    nd_method: null,
    nd_value: null,
    colorbars_enabled: null,
    colorbars_type: null,
  };

  try {
    // Primeiro, verificar se a câmera está acessível
    const pingRes = await cameraFetch('/rmt.html', { timeout: 5000 });
    if (!pingRes.ok) {
      return { ...result, error: `Camera respondeu com status ${pingRes.status}` };
    }
    result.connected = true;

    // Tentar ler via endpoint CGI (se disponível)
    // A Z190 pode ter diferentes endpoints dependendo do firmware
    const endpoints = [
      '/command/inquiry.cgi?inq=camera',
      '/api/camera/status',
    ];

    for (const ep of endpoints) {
      try {
        const res = await cameraFetch(ep, { timeout: 3000 });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const data = await res.json();
            result.raw[ep] = data;
            // Tentar extrair valores
            parseStatusData(data, result);
          } else {
            const text = await res.text();
            result.raw[ep] = text.substring(0, 500);
          }
        }
      } catch {
        // Endpoint não disponível, continuar
      }
    }

    return result;
  } catch (e) {
    return { ...result, error: `Erro de conexao: ${e.message}` };
  }
}

/**
 * Tenta extrair valores de status de dados retornados pela câmera.
 */
function parseStatusData(data, result) {
  if (!data || typeof data !== 'object') return;

  // Mapear campos conhecidos
  const mappings = {
    'Camera.WhiteBalance.Mode': 'wb_mode',
    'Camera.WhiteBalance.SettingMethod': 'wb_method',
    'Camera.WhiteBalance.ColorTemperature.Value': 'wb_kelvin',
    'Camera.Iris.Value': 'iris_value',
    'Camera.Iris.SettingMethod': 'iris_method',
    'Camera.Gain.Value': 'gain_value',
    'Camera.Gain.SettingMethod': 'gain_method',
    'Camera.Shutter.Value': 'shutter_value',
    'Camera.Shutter.Mode': 'shutter_mode',
    'Camera.NDFilter.SettingMethod': 'nd_method',
    'Camera.NDFilter.Value': 'nd_value',
    'Camera.ColorBar.Enabled': 'colorbars_enabled',
    'Camera.ColorBar.Type': 'colorbars_type',
  };

  for (const [cameraKey, resultKey] of Object.entries(mappings)) {
    if (data[cameraKey] !== undefined) {
      result[resultKey] = extractValue(data[cameraKey]);
    }
  }

  // Busca recursiva em objetos aninhados
  function searchNested(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (mappings[fullKey]) {
        result[mappings[fullKey]] = extractValue(v);
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        searchNested(v, fullKey);
      }
    }
  }
  searchNested(data);
}

/**
 * Extrai um valor legível de um campo da câmera.
 */
function extractValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'object') {
    if (val._n !== undefined) return val._n;
    if (val.cam !== undefined) return val.cam;
    if (val.value !== undefined) return val.value;
    if (val.current !== undefined) return val.current;
    const keys = Object.keys(val);
    if (keys.length === 1) return val[keys[0]];
    // Para MemoryValue com modo, retornar o objeto
    return val;
  }
  return val;
}

/**
 * Testa a conexão com a câmera.
 */
async function testConnection(ip, user, password, port) {
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const url = `http://${ip}:${port}/rmt.html`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: { 'Authorization': auth },
      signal: controller.signal
    });
    clearTimeout(timeout);

    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? 'Camera acessivel!' :
               response.status === 401 ? 'Credenciais invalidas (401)' :
               `Resposta: ${response.status}`
    };
  } catch (e) {
    return { ok: false, status: 0, message: `Erro: ${e.message}` };
  }
}

module.exports = {
  getCameraStatus,
  testConnection,
  cameraFetch,
  getConfig,
};
