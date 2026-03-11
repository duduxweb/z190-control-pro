# Z190 Control Pro

Aplicacao Node.js + React para controle e monitoramento de cameras Sony PXW-Z190 via rede local (Savona/Web Remote).

## Versao atual

- Backend/API: `2.0.0` (package.json)
- Dashboard Web: `1.0` (`2026-03-10`)

## Principais recursos

- Dashboard inicial com status de multiplas cameras.
- Editor individual por camera.
- Cadastro de cameras (IP, usuario, senha e porta).
- Controle de exposicao (ND, iris, shutter, gain).
- Controle de white balance (modo + Kelvin).
- Controle de gamma (status e ajustes).
- Gravacao e color bars.
- Monitor de audio (CH1-CH4) e indicadores visuais.
- Status de bateria/carregador.
- Pagina `Beta` para funcoes em validacao.
- Logs de servidor e Savona em tempo real (`logs/`).

## Estrutura

```text
z190-control-pro/
|- server.js                      # API + static + proxy /sony
|- z190-status.js                 # leitura de status da camera (Savona/Playwright)
|- z190-multi.js                  # comandos de controle (Savona/Playwright)
|- logger.js                      # escrita de logs em arquivo
|- config.json                    # configuracao local de cameras/presets
|- camera-dashboard-control/      # frontend React (Vite + TS)
|- docs-suport/                   # dump de arquivos originais da pagina Sony
|- logs/                          # logs gerados pela aplicacao
```

## Requisitos

- Node.js 18+
- npm
- Rede local com acesso a camera Sony PXW-Z190
- Playwright Chromium instalado

## Instalacao

```bash
npm install
npx playwright install chromium
```

Frontend (quando necessario em dev):

```bash
cd camera-dashboard-control
npm install
```

## Execucao

Servidor principal:

```bash
npm start
```

Acesso:

- App: `http://localhost:3000`
- Sony original via proxy: `http://localhost:3000/sony/rmt.html?cameraId=<id>`

Frontend em desenvolvimento (opcional):

```bash
cd camera-dashboard-control
npm run dev
```

## Logs

Os logs sao gravados em `logs/` por categoria (ex.: `server`, `savona`), com timestamp.

Util para diagnostico de:

- comando enviado
- resposta da camera
- timeout de conexao
- falha de status/polling

## Pagina Beta

A rota `Beta` foi criada para testes sem impactar o dashboard principal:

- `/beta`
- `/beta/:cameraId`

Nela ficam funcoes em validacao (ex.: black/output/color bars) e console detalhado.

## Configuracao

As cameras e presets sao salvos em `config.json`.

Campos por camera:

- `id`
- `name`
- `ip`
- `user`
- `password`
- `port`

## Comandos CLI uteis

Exemplos:

```bash
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 gain 6dB
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 shutter 1/100
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 wb-mode "Memory A"
node z190-status.js --ip 192.168.100.41 --user admin --password ABCD1234 --json --fast
```

## Historico de mudancas

Consulte `CHANGELOG.md`.
