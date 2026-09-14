# Projects Aligner — Design Spec

Data: 2026-09-13

## Contexto e problema

O usuário é engenheiro de software e organiza seus projetos de trabalho em uma
"fila" de 8 slots. Cada slot representa um projeto em desenvolvimento por 7
dias úteis (às vezes estendido com dias bônus informativos). Hoje esse
controle é feito manualmente em texto (ver `filaborderless.png` na raiz do
repo), no formato:

```
(Contexto - Número) - Cliente - Checklist ( ) | Estimativa ( ) | Deploy ( ) | Video ( )
LOGIN: email; senha
```

O objetivo é substituir esse controle manual por um aplicativo desktop local,
visual, que mostre todos os projetos da fila ao mesmo tempo, com apenas os
dados essenciais do dia visíveis de cara, e permita entrar em cada projeto
para ver/editar informações mais pontuais (contexto, credenciais, env,
fotos, vídeo, estimativa).

Não há necessidade de sincronização, multiusuário, nuvem ou criptografia:
tudo roda 100% local, para uso individual do próprio usuário.

## Escopo

Dentro do escopo desta spec/implementação:
- App desktop Electron para Windows, com atalho de fácil acesso.
- Persistência local em arquivo JSON + pasta de uploads para fotos.
- Tela macro com os slots da fila e ações rápidas do dia (checklist, deploy).
- Tela de detalhe do projeto com contexto/lembrete, estimativa, env/hospedagem,
  credenciais, vídeo e fotos.
- Lógica de dias úteis, avisos de deploy obrigatório/vídeo, e o cálculo
  automático do status de deploy (nunca implantado / pendente / atualizado).

Fora do escopo (não fazer agora):
- Multiusuário, sincronização em nuvem, criptografia de dados sensíveis.
- Notificações do sistema operacional (toasts fora do app).
- Edição de itens de checklist customizados por projeto (ficou definido como
  um único toggle diário).
- Deslocamento automático dos gatilhos de deploy/vídeo por conta dos dias
  bônus (bônus é só informativo).

## Arquitetura

- **Electron**: processo principal (Node.js) + janela de renderização
  (HTML/CSS/JS puro, sem framework de UI). Sem necessidade de React/Vue dado o
  volume pequeno de dados (até 8 projetos ativos).
- **Persistência**: arquivo `data/projects.json`, lido/escrito pelo processo
  principal via `fs`, exposto ao renderer via `ipcMain`/`ipcRenderer` (ou
  `contextBridge` com `contextIsolation` ativado, por segurança básica do
  Electron).
- **Fotos**: salvas como arquivos reais em `data/uploads/<projectId>/`,
  referenciadas no JSON por caminho relativo. Cópia do arquivo original ao
  ser anexado (drag-and-drop ou seletor de arquivo).
- **Empacotamento**: `electron-builder`, gerando instalador Windows (NSIS)
  que cria atalho na área de trabalho / menu iniciar. Não é necessário
  auto-update.
- **Sem banco de dados**: JSON é suficiente pelo volume de dados; facilita
  também inspeção/backup manual do próprio usuário (copiar o arquivo).

## Modelo de dados

Arquivo `data/projects.json`, lista de projetos:

```jsonc
{
  "projects": [
    {
      "id": "uuid",
      "numero": "557",
      "cliente": "João Paulo",
      "contextoMacro": "Floricultura",
      "dataEntradaFila": "2026-09-08",     // YYYY-MM-DD
      "diasBonus": 0,                       // inteiro, informativo
      "ativo": true,                        // false = fora da fila (concluído/não recomprado)

      "checklistHistorico": {               // um registro por dia útil marcado
        "2026-09-08": true,
        "2026-09-09": true
      },

      "ultimoDeploy": null,                 // ISO timestamp ou null
      "ultimoChecklistFeitoEm": null,       // ISO timestamp da última marcação de checklist como feito, ou null

      "estimativa": { "feita": false, "nota": "" },
      "video":      { "feito": false, "nota": "" },

      "contexto": "texto livre de notas/alinhamentos",
      "lembreteProximoDia": "",             // texto do lembrete pendente, "" = sem lembrete

      "env": {
        "backendUrl": "",
        "frontendUrl": "",
        "gatewayPagamento": "",
        "chavesApi": [ { "nome": "", "valor": "" } ],
        "envRaw": ""                         // conteúdo bruto colado do .env, texto livre
      },

      "credenciais": [
        { "titulo": "Admin", "login": "", "senha": "", "nota": "" }
      ],

      "fotos": [ "uploads/<id>/foto1.png" ]
    }
  ]
}
```

Notas:
- `id` é gerado internamente (uuid), não é o "número" do projeto (que é dado
  pelo usuário e pode até repetir/mudar sem quebrar referências).
- Sem histórico de deploys — só o timestamp do último. Não há necessidade de
  auditoria/histórico de status de deploy.

## Regras de negócio

### Dias úteis na fila
Contagem de dias úteis (seg-sex, sem feriados) entre `dataEntradaFila` e a
data atual, inclusive o dia de início (dia 1). `diasBonus` soma ao total de
dias que o projeto "vive" na fila mas **não** desloca os gatilhos abaixo.

### Gatilhos de aviso
- Quando o contador de dias úteis atinge **6 ou 7**: card mostra aviso
  "🚨 Deploy obrigatório".
- Quando atinge exatamente **7**: card mostra também "🎥 Gravar vídeo +
  guardar env".
- Esses avisos somem sozinhos se o projeto for marcado `ativo: false`
  (saiu da fila).

### Status do Deploy (calculado, não é campo editável diretamente)
- **Nunca implantado**: `ultimoDeploy` é `null`.
- **Pendente**: `ultimoChecklistFeitoEm` existe e é posterior a `ultimoDeploy`.
- **Atualizado**: `ultimoDeploy` existe e é mais recente ou igual a
  `ultimoChecklistFeitoEm`, ou nenhum checklist foi marcado como feito ainda.

Ação do usuário "Marcar deploy feito" seta `ultimoDeploy = now()`.
Marcar o checklist do dia de hoje como feito grava a entrada em
`checklistHistorico` e atualiza `ultimoChecklistFeitoEm = now()`, sem mexer em
`ultimoDeploy`; isso pode fazer o status calculado virar "pendente" (se antes
estava "atualizado"). Se o usuário marcar checklist como feito e em seguida
marcar deploy no mesmo dia, o deploy fica "atualizado". `checklistHistorico`
permanece apenas como registro do toggle diário.

### Lembrete para o próximo dia
Campo de texto livre (`lembreteProximoDia`), preenchido no detalhe do
projeto. Aparece em destaque no topo da aba Contexto/Notas toda vez que o
projeto é aberto. Botão "Marcar como resolvido" limpa o campo (`""`). Não
aparece na tela macro — só dentro do detalhe do projeto.

## Telas

### 1. Visão macro (tela principal)
Grid fixo dos slots da fila (até 8 projetos ativos simultâneos). Cada card
mostra:
- `numero - cliente - contextoMacro` (ex: "557 - João Paulo - Floricultura")
- Toggle "Checklist de hoje" (checkbox)
- Indicador de status do Deploy, com cor:
  - cinza = nunca implantado
  - amarelo = pendente
  - verde = atualizado
- Badge de aviso quando aplicável (dias 6/7: deploy obrigatório; dia 7:
  vídeo+env)
- Botão para abrir o detalhe do projeto

Ações da tela macro:
- Adicionar projeto à fila (form simples: número, cliente, contexto macro,
  data de entrada)
- Marcar projeto como inativo/concluído (sai da grid, mas fica salvo no
  JSON com `ativo: false` — não é deletado)
- Editar dias bônus de um projeto

### 2. Detalhe do projeto
Abas ou seções:
- **Contexto/Notas**: lembrete do próximo dia em destaque no topo (com botão
  resolver) + área de notas de contexto livre.
- **Estimativa**: checkbox "feita" + campo de nota (valor, prazo combinado etc.)
- **Deploy**: status atual (calculado) + botão "Marcar deploy feito" +
  data/hora do último deploy.
- **Vídeo**: checkbox "feito" + campo de nota (link/local do vídeo).
- **Env & Hospedagem**: campos de backend URL, frontend URL, gateway de
  pagamento, lista de chaves de API (nome/valor), e uma área de texto livre
  para colar o `.env` bruto como backup.
- **Credenciais**: lista de credenciais (título, login, senha, nota),
  podendo adicionar mais de uma (ex: admin painel, provedor de hospedagem).
- **Fotos**: galeria simples com thumbnails, permite adicionar via seletor
  de arquivo ou drag-and-drop, e remover.

## Testes

Dado que é um app desktop de uso pessoal sem lógica de rede/concorrência,
o foco de testes fica em:
- Testes unitários (Node, sem Electron) para as funções puras de regra de
  negócio: cálculo de dias úteis, cálculo do status de deploy, cálculo dos
  gatilhos de aviso.
- Verificação manual (smoke test) do fluxo completo no app empacotado:
  criar projeto → marcar checklist → ver deploy virar pendente → marcar
  deploy feito → ver status voltar a "atualizado" → abrir detalhe → salvar
  contexto/lembrete/env/credenciais/foto → fechar e reabrir o app → dados
  persistidos corretamente.

## Decisões já validadas com o usuário

- Electron (não app web local nem Tauri).
- Sem criptografia dos dados sensíveis (senhas, chaves) — tudo texto puro.
- Checklist é um único toggle diário, não uma lista de subitens customizável.
- Dias bônus são apenas informativos, não deslocam os gatilhos de deploy/vídeo.
- Lembrete do próximo dia só aparece ao abrir o detalhe do projeto, não na
  tela macro.
