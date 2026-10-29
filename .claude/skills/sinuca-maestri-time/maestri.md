# Fluxo com terminais no Maestri (parado)

**Só vale com a licença do Maestri ativa.** Desde 2026-10-12 o workspace está travado (fim do teste): sem ask, notas nem check. O fluxo de hoje é por subagente (`SKILL.md`). Este arquivo guarda o outro, para quando a licença voltar. Se voltar, volte também `sinuca-status`, `sinuca-bugs` e `sinuca-perguntas` como notas; hoje são `.outros/status.md`, `.outros/bugs.md` e `.outros/perguntas.md`.

Se você é um **recruta** (terminal `Sinuca *`): leia só o seu `papeis/<papel>.md` e a seção "Relatório" abaixo.

## Terminais

| Papel | Terminal | Modelo | Esforço ao recrutar |
| --- | --- | --- | --- |
| Brainstormer | Boteco | sonnet | high |
| Dev (núcleo) | Taco | sonnet | medium |
| Frontend | Feltro | sonnet | medium |
| Backend | Sala | sonnet | medium |
| QA | Giz | sonnet | medium |
| Artista | Pincel | sonnet, MCP do Blender | xhigh |
| Revisor | Juiz | opus, sem Edit/Write | high |

O esforço ao recrutar é só o ponto de partida: cada lote vai no nível da tabela "Esforço por tarefa" do `SKILL.md` (`despachar --esforco`, abaixo).

Todos reportam ao Principal por ask-back. Recrutas não conversam entre si: QA fala com os donos pela nota `sinuca-bugs`; pedido de mudança em pasta alheia ou em contrato vai ao Principal, que despacha ao dono.

## Regras de economia que só existem aqui

- **Contexto limpo por lote.** Lote aprovado → `/clear` no recruta antes do próximo (`maestri ask "Taco" --raw "/clear\n"`, confirme com um `check`). Rodada de ajuste do mesmo lote: sem `/clear`.
- **Nunca `maestri check` em laço** (despeja a tela toda): use ask-back.
- **Prompt só com o delta**, em arquivo, enviado com `"$(cat arquivo)"`.
- **Notas enxutas.** Ao fechar uma fase, as seções de `sinuca-status` vão para `docs/historico/fase-<n>.md` e a nota fica com um resumo de 3 linhas.

## Setup (uma vez; também serve para retomar)

1. `maestri list` — o nome do Principal é a linha sob `You:`.
2. `bash .claude/skills/sinuca-maestri-time/time.sh setup "<nome do Principal>"` — cria os roles `Sinuca <Papel>` a partir de `papeis/*.md` (o bloco `prompt:inicio`…`prompt:fim`) e as notas no fichário `Sinuca` (pula o que já existe).
3. `bash .claude/skills/sinuca-maestri-time/time.sh recrutar <papel>...` — só os papéis do próximo lote. Recruta com o modelo da tabela e `--continue`, e liga as três notas.
4. Anote os ids de sessão no topo de `sinuca-status` (`find ~/.claude/projects -name '*.jsonl' -mmin -10`). Com isso um reinício do Maestri é recuperável.

Renomeou o terminal do Principal? `time.sh atualizar "<novo nome>"` reescreve os roles (reinicia os recrutas: faça entre lotes). Terminal caiu, virou shell ou voltou vazio: `time.sh religar <papel>` (retoma a última sessão do role).

## Notas (fichário "Sinuca")

- `sinuca-status` — topo: terminal → id de sessão. Uma seção `## L<n>` por lote: o recruta escreve, o Principal acrescenta `Revisão: passou | precisa de ajuste (resumo)`.
- `sinuca-perguntas` — perguntas para o usuário com "o que desbloqueia"; recrutas acrescentam em `## Novas`.
- `sinuca-bugs` — QA registra; o dono marca `[corrigido L<n>]`; QA confirma.

Decisões **não** vão em nota: ficam em `docs/decisoes.md`.

## Despacho

`time.sh despachar <papel> <arquivo>` em segundo plano: espera o recruta ficar livre (sem "esc to interrupt" no `maestri check`), manda `/clear`, espera de novo e só então manda o lote (`--sem-clear` para rodada de ajuste do mesmo lote). `--esforco <nível>` religa o terminal nesse nível antes do `/clear` (o terminal não troca de nível sozinho; sem a opção, fica no último). Depois **encerre o turno**: o ask-back do recruta só se resolve quando o turno do Principal termina, e mensagem mandada a um recruta ocupado entra na fila. Retornou na hora = mensagem na fila: nunca reenviar.

## Relatório (ask-back de todo recruta)

Mesmo formato do `SKILL.md`, enviado com `maestri ask "<Principal>" "$(cat .outros/lote-<n>/relatorio-<papel>.txt)"`: o texto vai num arquivo para crases e aspas não rodarem no shell. Seção do lote em `sinuca-status`.

## Gotchas

| Sintoma | Causa / correção |
| --- | --- |
| Recruta não acha as skills `sinuca-*` | Ele roda em `.maestri/roles/<id>/`: ler `.claude/skills/<nome>/SKILL.md` da raiz pelo caminho |
| Ask-back falha com `No connection` | Principal renomeado: `time.sh atualizar "<nome>"` entre lotes |
| Texto sumiu de nota ou de ask | Crase em aspas duplas rodou no shell: payload sempre em arquivo |
| Chrome do MCP preso | Quem abriu primeiro prende o perfil: todo lote com navegador fecha o Chrome no fim; confira o dono em `/proc/<avô>/cwd` |

Outros sintomas de terminal (global): `orchestrating-maestri-team`.
