# Templates

Todo prompt vai num arquivo do scratchpad e é enviado com `maestri ask "<Terminal>" "$(cat "<arquivo>")"`. Escreva só o delta: o recruta já tem o role, o `CLAUDE.md` da raiz (o da pasta dele carrega quando ele lê arquivos lá) e lê as notas sozinho.

## Prompt de lote

```text
L<n> (<fase>) — <papel>: <objetivo em 1 linha>.
Antes: releia docs/decisoes.md (histórico em docs/decisoes-arquivo.md, só se precisar) e a seção "L<n-1>" de sinuca-status (histórico em .outros/status-arquivo.md, só se precisar). Leia só: <arquivos de tipos / seção do estudo / doc de design>.
Construa sobre <o que já existe>; não refaça. Fora do escopo: <pastas de outros donos neste lote>.

[Preâmbulo — ajustes da revisão do L<n-1>, por severidade: arquivo, problema, correção]

## Entrega A — <o quê, onde, critério de aceite verificável>
## Entrega B — ...
## Provas — <comandos que têm de passar; o que gravar em .outros/lote-<n>/>
## Doc viva — <CLAUDE.md da pasta mexida (apps/web, apps/sala, packages/*) ou da raiz (comandos, regras) / decisoes.md / skill a atualizar, se o lote mudar algo citado>
## Limites — sem commit/push/deploy; <o que NÃO fazer neste lote>
Ao terminar: seção "## L<n> <papel>" em sinuca-status e relatório no formato padrão via ask-back.
```

## Pedido de revisão (Juiz)

```text
Revise o L<n> (<papel>). Escopo: <arquivos e pastas>. Ignore: <pastas de outros lotes em andamento>.
Em paralelo, <terminal> está no L<n+1> mexendo em <arquivos>: diga se algo do escopo mudou no meio e revise o estado final.
Confira em especial: (1) <critério de aceite do lote> (2) <risco específico> (3) checklist do seu papel.
Rode: <typecheck/test do pacote>. Só leitura. Achados e veredito no formato do seu role.
```

## Varredura de fase (Juiz)

```text
Varredura final da Fase <f>. Trate tudo desde o início da fase como um PR só (git status + arquivos novos).
Confira: fronteiras de dependência de docs/decisoes.md; contratos ↔ uso real; parâmetros físicos todos no objeto de config;
regras sem hardcode; testes que passariam com código errado; arquivos temporários ou de prova fora de .outros/;
CLAUDE.md (raiz e das pastas), decisoes.md, roteiro.md e skills sinuca-* descrevendo o estado atual; créditos de assets CC-BY.
Rode a suíte inteira. Achados e veredito no formato do seu role.
```

## Tema de design (Boteco)

```text
Tema: <tema> (Fase <f>). Seções do estudo: <§x, §y> (sed -n). Restrições: <decisões fixas que tocam o tema>.
Entregue docs/design/<tema>.md no formato do seu papel. Perguntas ao usuário fechadas, recomendada primeiro, também em sinuca-perguntas.
```

## Fechamento de fase (para o usuário)

- O que dá para fazer agora no jogo (em 3–5 linhas, sem jargão).
- Tabela pasta × o que mudou.
- Commits sugeridos na ordem (o usuário commita), com as mensagens.
- Pendências fora do código (conta Cloudflare, assets, decisões em aberto).
- Perguntas abertas de `sinuca-perguntas`.
- Custo da fase por terminal (`cost-tracking`).
