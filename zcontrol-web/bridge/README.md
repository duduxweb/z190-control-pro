# Z190 Bridge Local

Bridge local que conecta a câmera Sony PXW-Z190 ao painel de controle na nuvem via WebSocket.

## Arquitetura

```
┌──────────────────┐     WebSocket      ┌──────────────────┐     HTTP/CGI     ┌──────────────────┐
│  Painel Web      │ ◄═══════════════► │  Bridge Local     │ ◄═════════════► │  Sony PXW-Z190   │
│  (Nuvem/Manus)   │     (Internet)     │  (Rede Local)     │   (Rede Local)  │  (Câmera)        │
└──────────────────┘                    └──────────────────┘                  └──────────────────┘
```

## Requisitos

- Node.js 18+ instalado no computador da rede local
- Acesso à câmera Sony Z190 na mesma rede
- Acesso à internet para conectar ao painel na nuvem

## Instalação

```bash
# 1. Clone o repositório (ou faça git pull se já existe)
git clone https://github.com/SEU_USUARIO/z190-control-pro.git
cd z190-control-pro/bridge

# 2. Instale as dependências
npm install

# 3. Copie o arquivo de configuração
cp config.example.txt .env

# 4. Edite o .env com suas configurações
nano .env
```

## Configuração (.env)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `CAMERA_IP` | IP da câmera na rede local | `192.168.100.41` |
| `CAMERA_USER` | Usuário de acesso à câmera | `admin` |
| `CAMERA_PASSWORD` | Senha de acesso à câmera | `ABCD1234` |
| `CAMERA_PORT` | Porta HTTP da câmera | `80` |
| `BRIDGE_SERVER_URL` | URL WebSocket do painel | `wss://seudominio.manus.space/ws/bridge` |
| `BRIDGE_TOKEN` | Token de autenticação | (obtenha no painel) |
| `STATUS_INTERVAL` | Intervalo de polling (ms) | `2000` |

## Como obter o Token

1. Acesse o painel web na nuvem
2. Vá em **Configuração** no menu lateral
3. Clique em **Mostrar Token**
4. Copie o token e cole no `.env`

## Execução

```bash
# Modo normal
node bridge.mjs

# Modo desenvolvimento (reinicia ao salvar)
npm run dev

# Com PM2 (recomendado para produção)
pm2 start bridge.mjs --name z190-bridge
pm2 save
pm2 startup
```

## Atualização Automática

Configure o cron para verificar atualizações a cada 5 minutos:

```bash
chmod +x auto-update.sh
crontab -e
# Adicione a linha:
*/5 * * * * /caminho/para/bridge/auto-update.sh >> /caminho/para/bridge/update.log 2>&1
```

## Troubleshooting

- **Bridge não conecta ao servidor**: Verifique se a URL WebSocket está correta e se há acesso à internet
- **Câmera não responde**: Verifique IP, porta e credenciais. Teste com `curl http://IP_CAMERA/`
- **Token inválido**: Obtenha um novo token na página de Configuração do painel
- **Reconexão automática**: O bridge reconecta automaticamente com backoff exponencial (1s → 30s)
