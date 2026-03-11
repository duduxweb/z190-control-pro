# Changelog

Todas as mudancas relevantes deste projeto ficam registradas aqui.

## [2.0.0] - 2026-03-10

### Adicionado

- Arquitetura multi-camera no backend (`/api/cameras`, `/api/dashboard/status`, presets e camera ativa).
- Dashboard inicial com cards por camera e status operacional.
- Editor individual por camera com controles separados por card.
- Pagina `Beta` (`/beta`, `/beta/:cameraId`) para funcoes em teste.
- Sistema de logs em arquivo com `logger.js` e pasta `logs/`.
- Link direto para pagina Sony original por camera.

### Melhorado

- Polling/refresh de status para janela curta (foco em menor atraso operacional).
- Fila de comandos por camera para reduzir conflito de chamadas simultaneas.
- Normalizacao de status de foco, WB, gamma, bateria e picture size/system frequency.
- Mapeamento ND para valores reais de cam (ex.: `5`, `32`, `64`, `128`).
- Ajustes de gamma com sequencia equivalente ao comportamento da Sony.
- Ajustes de white balance (modo + Kelvin) com fluxo mais robusto.
- Shutter manual com consulta de capacidades para selecionar valor suportado.
- Audio monitor com suporte a niveis discretos (`0..4`/`L0..L4`) e escala visual consistente.

### Corrigido

- Timeouts e quedas por excesso de sessoes simultaneas Savona.
- Divergencias de estado entre clique no frontend e retorno de status.
- Inconsistencias de formacao de foco/distancia no dashboard.
- Falhas de execucao em alguns comandos de iris/ND/gamma.

## [1.0.0] - 2026-03-10

### Dashboard Web (marco visual/funcional)

- Versao `1.0` registrada no layout do app.
- Dashboard inicial responsivo para operador.
- Editor de camera com modo rapido e detalhado (broadcast).
- Reorganizacao dos cards de controle.
- Console de operacao no painel.
- Separacao de funcoes estaveis x funcoes de teste (Beta).

## [Anterior] - legado

- Scripts CLI originais de controle (`z190-multi.js`, `z190-status.js`) e painel base.
- Proxy/web legacy e utilitarios de MIDI.
