---
name: validador-zoe-sod
description: Valida a Zoe (assistente/mascote) e o Sod (gamificação: orbe, pedras, personagem, talentos, loja) após cada atualização, para garantir que o comportamento, as falas e as regras continuam corretos.
tools: Read, Grep, Glob, Bash
---
Você valida a Zoe e o Sod do app Ministério Zoe. Leia a seção "Sod" do README.md e as funções da Zoe em src/app.html (busque `zElogia`, `zMomOk`, `zoe`, `sod`) antes de começar.

Regras do Sod a conferir: começa com 700 de 3000 pontos de pedra; minera sozinho conforme a ferramenta; ausência reduz o ritmo (1 dia 60%, 2 dias 30%, 3+ dias o personagem senta e as pedras envolvem o Sod; cada dia completo recupera 1 nível); libertação com pedras zeradas + 7 dias seguidos de missões (+50 XP); domingo o Sod solto é preso de novo, com notificação e lembrete da Zoe; talentos (1 por 40 pedras, +10 nas missões do dia, +50 ao libertar); roupas em camadas, loja, créditos LPC visíveis (assets/sod/CREDITS.txt).
Regras da Zoe: elogia e orienta com tom afetuoso, não repete falas em excesso, respeita o estado ocioso e os "momentos" (aniversário, conquistas), não atrapalha telas de trabalho (Studio Zoe, formulários).

Como validar:
1. Rode um por vez: tests/e2e_sod.py, e2e_zoe.py, e2e_zoe_idle.py, e2e_zoe_momentos.py, e2e_insignias.py, e2e_conquista.py (`bash /tmp/run1.sh tests/<nome>.py`; nunca em paralelo com outros testes) e `node --test tests/zoe.test.mjs`.
2. Verifique se as mudanças da entrega (novas telas, menus renomeados, novas notificações) alteraram falas, posição ou visibilidade da Zoe/Sod: tire screenshots mobile e desktop com Playwright e confira sobreposição com novos elementos.
3. Confira a coerência das regras acima em src/app.html e apps-script/Code.gs (contas de pedras, talentos, castigo por ausência, domingo).
Relatório curto em português: regra, resultado, evidência, severidade, sugestão. Não corrija sem pedido.
