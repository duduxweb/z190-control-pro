# Z190 Control Pro

Aplicação **Node.js + React** para controle e monitoramento de câmeras **Sony PXW-Z190** via rede local (Savona/Web Remote).

---

## Versão atual

| Componente | Versão |
|:---|:---|
| Backend / API | `2.0.0` |
| Dashboard Web | `1.0` (2026-03-10) |

---

## Principais recursos

- Dashboard com status de múltiplas câmeras simultâneas
- Editor individual por câmera
- Cadastro de câmeras (IP, usuário, senha e porta)
- Controle de exposição: ND, íris, shutter, gain
- Controle de white balance (modo + Kelvin)
- Controle de gamma (status e ajustes)
- Gravação e color bars
- Monitor de áudio (CH1–CH4) com indicadores visuais
- Status de bateria e carregador
- Página **Beta** para funções em validação
- Logs de servidor e Savona em tempo real (`logs/`)
- Integração MIDI via mapeamento configurável

---

## Pré-requisitos

Antes de instalar, certifique-se de que sua máquina possui os itens abaixo. Os scripts de instalação verificam automaticamente cada um deles e orientam caso algo esteja faltando.

| Requisito | Versão mínima | Download |
|:---|:---|:---|
| **Node.js** | 18.x ou superior | https://nodejs.org |
| **npm** | 9.x ou superior (incluído no Node.js) | — |
| **Git** | Qualquer versão recente | https://git-scm.com |
| **Rede local** | Acesso TCP à câmera Sony PXW-Z190 | — |

Para verificar se Node.js e npm já estão instalados:

```bash
node --version   # deve retornar v18.x.x ou superior
npm --version    # deve retornar 9.x.x ou superior
```

---

## Instalação

Escolha o método que preferir: o **script autônomo** (recomendado) faz tudo automaticamente em um único comando; a **instalação manual** permite executar cada etapa individualmente.

---

### Opção A — Script de instalação autônoma ✅ Recomendado

O script verifica os pré-requisitos, clona o repositório, instala todas as dependências, configura o `config.json` e prepara o ambiente — sem nenhuma intervenção manual.

#### Linux / macOS

Abra o terminal e execute:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/duduxweb/z190-control-pro/main/install.sh)
```

Ou, se já clonou o repositório:

```bash
bash install.sh
```

#### Windows (PowerShell)

Abra o **PowerShell como Administrador** e execute:

```powershell
# Permitir execução de scripts (apenas na primeira vez)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Executar o instalador
.\install.ps1
```

> **O que o script faz, em ordem:**
> 1. Verifica Git, Node.js 18+ e npm — exibe instruções de instalação se algum estiver faltando
> 2. Clona o repositório (ou atualiza com `git pull` se já existir)
> 3. Instala as dependências do backend (`npm install`)
> 4. Instala o Playwright Chromium (`npx playwright install chromium`)
> 5. No Linux, instala automaticamente as dependências do sistema para o Playwright
> 6. Instala as dependências do frontend React
> 7. Cria o `config.json` a partir do `config.example.json`
> 8. Cria o diretório `logs/`
> 9. Exibe o resumo final com os próximos passos

Após a conclusão, edite o `config.json` com os dados das suas câmeras e execute `npm start`.

---

### Opção B — Instalação manual (passo a passo)

Siga as etapas abaixo caso prefira controle total sobre cada etapa ou esteja em um ambiente sem acesso à internet completo.

#### 1. Clone o repositório

```bash
git clone https://github.com/duduxweb/z190-control-pro.git
cd z190-control-pro
```

#### 2. Instale as dependências do backend

```bash
npm install
```

#### 3. Instale o Playwright Chromium

O projeto utiliza o Playwright para comunicação com a câmera via Savona. É obrigatório instalar o navegador Chromium gerenciado por ele:

```bash
npx playwright install chromium
```

> **Linux:** caso apareça um aviso sobre dependências do sistema, execute também:
> ```bash
> npx playwright install-deps chromium
> ```

#### 4. Instale as dependências do frontend React

> Esta etapa é **opcional** para quem vai apenas operar o sistema. É necessária somente para desenvolvimento ou modificação do frontend.

```bash
cd camera-dashboard-control
npm install
cd ..
```

#### 5. Configure as câmeras

Crie o arquivo de configuração a partir do modelo:

```bash
# Linux / macOS
cp config.example.json config.json

# Windows (PowerShell)
Copy-Item config.example.json config.json
```

Abra o `config.json` e preencha os dados de cada câmera:

```json
{
  "cameras": [
    {
      "id": "cam1",
      "name": "Câmera Principal",
      "ip": "192.168.100.41",
      "user": "admin",
      "password": "SUA_SENHA",
      "port": 80
    }
  ]
}
```

> ⚠️ O arquivo `config.json` está listado no `.gitignore` e **nunca será enviado ao repositório** — suas credenciais ficam protegidas localmente.

#### 6. Crie o diretório de logs

```bash
# Linux / macOS
mkdir -p logs

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path logs
```

---

## Execução

### Iniciar o servidor principal

```bash
npm start
```

O sistema ficará disponível nos seguintes endereços:

| Serviço | URL |
|:---|:---|
| Dashboard principal | `http://localhost:3000` |
| Proxy Sony — Web Remote original | `http://localhost:3000/sony/rmt.html?cameraId=<id>` |
| Página Beta | `http://localhost:3000/beta` |

### Frontend em modo de desenvolvimento (opcional)

Necessário apenas para modificar o código React:

```bash
cd camera-dashboard-control
npm run dev
```

---

## Estrutura do projeto

```
z190-control-pro/
├── install.sh                    # Script de instalação — Linux / macOS
├── install.ps1                   # Script de instalação — Windows
├── server.js                     # API + static + proxy /sony
├── z190-status.js                # Leitura de status da câmera (Savona/Playwright)
├── z190-multi.js                 # Comandos de controle (Savona/Playwright)
├── z190-midi.js                  # Integração MIDI
├── z190-midi-server.js           # Servidor MIDI
├── z190-discover.js              # Descoberta de câmeras na rede
├── logger.js                     # Escrita de logs em arquivo
├── camera-api.js                 # Camada de abstração da API da câmera
├── config.example.json           # Modelo de configuração (copiar para config.json)
├── config.json                   # Configuração local — câmeras e presets (não versionado)
├── midi-mapping.json             # Mapeamento de controles MIDI
├── camera-dashboard-control/     # Frontend React (Vite + TypeScript)
├── docs-suport/                  # Dump dos arquivos originais da página Sony
└── logs/                         # Logs gerados pela aplicação (não versionado)
```

---

## Comandos CLI úteis

É possível controlar a câmera diretamente pela linha de comando, sem abrir o dashboard:

```bash
# Ajuste de gain
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 gain 6dB

# Ajuste de shutter
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 shutter 1/100

# Ajuste de white balance
node z190-multi.js --ip 192.168.100.41 --user admin --password ABCD1234 wb-mode "Memory A"

# Leitura de status (formato JSON)
node z190-status.js --ip 192.168.100.41 --user admin --password ABCD1234 --json --fast
```

---

## Logs

Os logs são gravados em `logs/` por categoria, com timestamp automático. Úteis para diagnóstico de:

- Comando enviado e resposta da câmera
- Timeout de conexão
- Falha de status ou polling

---

## Página Beta

A rota `/beta` foi criada para testes sem impactar o dashboard principal:

- `/beta`
- `/beta/:cameraId`

Contém funções em validação (black, output, color bars) e console detalhado.

---

## Solução de problemas

| Problema | Solução |
|:---|:---|
| `Error: browserType.launch: Executable doesn't exist` | Execute `npx playwright install chromium` |
| Dashboard não conecta à câmera | Verifique IP, usuário e senha no `config.json`. Confirme conectividade: `ping <ip>` |
| Porta 3000 já em uso | Encerre o processo que usa a porta ou ajuste em `server.js` |
| Dependências do Playwright faltando (Linux) | Execute `npx playwright install-deps chromium` |
| PowerShell bloqueia o script (Windows) | Execute: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |

---

## Histórico de mudanças

Consulte o arquivo [`CHANGELOG.md`](./CHANGELOG.md).

---

## Licença

Este projeto é de uso interno. Consulte os termos com o mantenedor antes de redistribuir.
