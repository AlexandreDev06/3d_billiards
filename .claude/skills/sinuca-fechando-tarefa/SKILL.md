---
name: sinuca-fechando-tarefa
description: Use antes de dizer "pronto", reportar um lote ao Principal ou encerrar uma tarefa na sinuca — confere provas, fronteiras, contrato e documentação viva na mesma tarefa.
---

# Fechando uma tarefa na sinuca

Pronto = código + prova + doc viva fechando juntos. Doc desatualizada engana a próxima sessão exatamente onde ela confia.

## Checklist

1. **Provas reais**, com a saída à vista: typecheck, lint e testes do que tocou (comandos na seção "Comandos" do `CLAUDE.md` da raiz). Visual: captura em `.outros/lote-<n>/`. Desempenho prometido: número medido, não estimado.
2. **Fronteira**: `git status` só mostra arquivos da sua pasta (dono em `docs/decisoes.md`). Fora dela = desfazer ou explicar no relatório.
3. **Contrato**: mudou um tipo exportado de `packages/*`? Declare em `Contrato:` no relatório, com o porquê.
4. **Doc viva na mesma tarefa** (skill global `keeping-skills-current`): a mudança tocou algo citado no `CLAUDE.md` da pasta mexida (mapa: `apps/web`, `apps/sala`, `packages/*`) ou no da raiz (comandos, regras), `docs/decisoes.md` (estrutura, "Em aberto" resolvido), `docs/roteiro.md` ou numa skill `sinuca-*`? Corrija agora.
5. **Parâmetros**: número novo de física ou de regra está no objeto de config/preset, não solto no código.
6. **Assets**: CC-BY usado → crédito em `docs/creditos.md`.
7. **Sem lixo**: script, log e captura temporários só em `.outros/`.
8. **Sem commit, push ou deploy.**
9. **Relatório** no formato da skill `sinuca-maestri-time`, em arquivo, via ask-back.

## Não está pronto se

- "Os testes passam" sem a saída mostrada, ou "deve funcionar" sem rodar.
- "Atualizo a doc no próximo lote."
- Teste novo que você não viu falhar com o código errado.
- Ficou alguma chave em `"provisorio"` sem a pergunta correspondente em `sinuca-perguntas`.
