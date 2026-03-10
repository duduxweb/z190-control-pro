# Z190 Control Madruga v2.0

Aplicação Node.js standalone para controle remoto profissional da câmera Sony PXW-Z190 via rede local.

## Requisitos

- Node.js 18 ou superior
- Câmera Sony PXW-Z190 na mesma rede local
- (Opcional) Controladora MIDI para integração MIDI

## Instalação

```bash
git clone https://github.com/duduxweb/z190-control-pro.git
cd z190-control-pro
npm install
```

## Uso

### Iniciar o painel de controle

```bash
npm start
```

Acesse `http://localhost:3000` no navegador.

### Iniciar o servidor MIDI (opcional)

```bash
npm run midi
```

### Atualizar via GitHub

```bash
git pull origin main
npm install
```

## Estrutura do Projeto

```
├── server.js                  # Servidor Express com proxy reverso e API REST
├── camera-api.js              # Módulo de comunicação com a câmera (HTTP/CGI)
├── z190-multi.js              # CLI para controle via Savona/Playwright
├── z190-midi.js               # Integração MIDI para controladora
├── z190-midi-server.js        # Servidor web para configuração MIDI
├── z190-colorbars-100.js      # Controle de color bars
├── z190-multi-colorbars.js    # Controle multi-colorbars
├── z190-menu-colorbars.js     # Menu de colorbars
├── z190_colorbars_panel_v5.html # Painel de colorbars (versão original)
├── savona.min.js              # Biblioteca Savona da Sony (WebSocket)
├── midi-mapping.json          # Mapeamento MIDI → funções da câmera
├── config.example.json        # Template de configuração
├── public/
│   ├── index.html             # Interface web principal (Dashboard + Config)
│   ├── savona.min.js          # Savona para uso no frontend
│   └── savona-panel.html      # Painel Savona original
└── zcontrol-web/              # Versão web (React+tRPC) arquivada
```

## Configuração

Na primeira execução, acesse `http://localhost:3000` e configure:

1. **IP da câmera** (ex: 192.168.100.41)
2. **Usuário** (ex: admin)
3. **Senha** (ex: ABCD1234)
4. **Porta** (ex: 80)

Use o botão **Testar Conexão** para verificar a comunicação antes de salvar.

A configuração é salva em `config.json` (criado automaticamente, não versionado).

## Proxy Reverso

O servidor funciona como proxy reverso para a câmera, injetando autenticação Basic automaticamente:

- `/cam/*` → Câmera (com auth)
- `/rmt.html` → Página de controle remoto da câmera
- `/sony/*` → Endpoints Sony (com auth)

## Dashboard

O dashboard exibe em tempo real os valores atuais da câmera:

- **White Balance**: Modo, método, temperatura Kelvin
- **Exposição**: Íris, ganho, velocidade do obturador
- **Filtro ND**: Método e valor
- **Gravação**: Color bars, status

Os dados são atualizados automaticamente a cada 3 segundos via polling.

## Versão Web (Arquivada)

A pasta `zcontrol-web/` contém uma versão web completa com React 19 + tRPC + Tailwind CSS 4, projetada para rodar na nuvem com sistema de Bridge WebSocket. Esta versão está arquivada para referência futura.

## Licença

MIT
