# Project TODO - Sony Z190 Control Pro

- [x] Configurar variáveis de ambiente (.env) para IP da câmera, usuário e senha
- [x] Criar schema do banco de dados para presets e configurações
- [x] Implementar módulo de comunicação JSON-RPC com a câmera Sony Z190
- [x] Criar rotas tRPC para controle de lente (Zoom, Foco, Íris)
- [x] Criar rotas tRPC para controle de imagem (WB, Ganho, Shutter, ND)
- [x] Criar rotas tRPC para controle de gravação (REC/STOP, status, timecode)
- [x] Criar rotas tRPC para controle de áudio (Input 1, Input 2, níveis)
- [x] Criar rotas tRPC para monitoramento de status da câmera (ping, firmware, estado)
- [x] Implementar sistema de presets (CRUD completo)
- [x] Desenvolver tema escuro profissional (dark theme)
- [x] Criar Dashboard principal com layout responsivo
- [x] Criar painel de controle de lente (Zoom, Foco, Íris) com sliders
- [x] Criar painel de controle de imagem (WB, Ganho, Shutter, ND)
- [x] Criar painel de controle de gravação com indicador de status
- [x] Criar painel de controle de áudio com medidores de nível
- [x] Criar painel de monitoramento de status da câmera
- [x] Criar painel de presets personalizáveis
- [x] Implementar feedback visual em tempo real
- [x] Otimizar para desktop e tablets
- [x] Escrever testes unitários

## Migração para Standalone + GitHub

- [x] Copiar arquivos standalone (camera-api.js, z190-multi.js, z190-midi.js, etc.) para o projeto
- [x] Criar página de Configuração (IP, usuário, senha) no frontend React
- [x] Criar Dashboard com valores atuais da câmera (WB, Iris, Gain, Shutter, ND) em tempo real
- [x] Adicionar rota tRPC para salvar/carregar configuração da câmera
- [x] Adicionar rota tRPC para testar conexão com a câmera
- [x] Adicionar menu "Configuração" na sidebar
- [x] Push automático para GitHub via user_github remote

## Bridge/Agente Local (WebSocket)

- [ ] Implementar servidor WebSocket no backend para receber conexão do bridge
- [ ] Criar script bridge local (Node.js) que conecta à câmera e ao WebSocket do servidor
- [ ] Adaptar rotas tRPC para enviar/receber comandos via bridge WebSocket
- [ ] Adaptar frontend para mostrar status de conexão do bridge
- [ ] Criar sistema de autenticação do bridge (token seguro)
- [ ] Documentar instalação e uso do bridge local
- [ ] Testes unitários do bridge
