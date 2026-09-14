# Projects Aligner

App desktop local para substituir a fila manual de projetos. Até 8 projetos ativos, um período compartilhado de 7 dias úteis, e só o que importa do dia visível no cartão. Sem nuvem, sem login e sem criptografia: os dados ficam neste computador.

## O que você vê na fila

Cada projeto é um cartão na vertical, clicável para abrir o detalhe. O cartão mostra número, cliente e contexto separados, mais checklist, estimativa, deploy, vídeo, login e as notas curtas.

No topo, 7 bolinhas acompanham o mesmo calendário para todos os projetos:

- verde: todos os projetos ativos fecharam o dia
- amarela: o dia ainda está aberto e falta algo
- vermelha: o dia virou à meia-noite com pendência; clique nela para ver o que ficou

Quando um projeto fecha os documentos obrigatórios daquele dia, o cartão fica verde e aparece **Dia concluído**. Desmarcar reabre só o dia atual. A sidebar esconde num botão, com a lista encolhendo para o lado.

## O que cada dia exige

| Dia da fila | Obrigatório |
| --- | --- |
| 1 a 5 | Checklist |
| 6 | Checklist e deploy daquele dia |
| 7 | Checklist, deploy daquele dia e vídeo |

Estimativa é opcional. Dias bônus são só informativo e não deslocam essas regras. O deploy do cartão marca ou desmarca só a data de hoje; o histórico com data e hora fica na aba Deploy do projeto, e o último registro pode ser desfeito.

## Rodar em desenvolvimento

Precisa de Node.js.

```bash
npm install
npm start
```

`npm start` abre a janela do Electron com os arquivos desta pasta. Os testes não precisam do Electron:

```bash
npm test
```

## Gerar o instalador

```bash
npm run dist
```

O instalador sai em `dist/Projects Aligner Setup <versão>.exe`. Ele cria atalho na área de trabalho e no menu Iniciar. Para só abrir o app empacotado, sem reinstalar, use `dist/win-unpacked/Projects Aligner.exe`.

`node_modules/` e `dist/` não entram no git. Reinstalar a mesma `appId` não apaga os projetos já salvos.

## Onde ficam os dados

No Windows, em `%APPDATA%\projects-aligner\projects-aligner-data\`. Lá estão o JSON dos projetos e a pasta de fotos. Dá para copiar essa pasta como backup. Não coloque esses arquivos no repositório: credenciais e notas são dados locais.
