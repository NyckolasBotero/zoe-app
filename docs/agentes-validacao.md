# Agentes de validação

Definidos em `.claude/agents/`. Rode-os depois de cada entrega, um de cada vez (os testes e2e usam o mesmo servidor local e não podem rodar em paralelo).

| Agente | Quando usar | O que faz |
|---|---|---|
| `validador-causa-raiz` | Teste falhou ou comportamento estranho | Reproduz, compara com o commit anterior e diz se a falha é do app ou do teste |
| `validador-regressao-ui-ux` | Toda atualização | Build, testes, suíte completa, screenshots mobile/desktop claro/escuro, coerência de textos, nomes, permissões e documentação |
| `validador-zoe-sod` | Toda atualização | Confere regras e falas da Zoe e do Sod e se as mudanças não os atrapalham |

Ordem sugerida: regressão e UI/UX, depois Zoe e Sod, e a causa raiz para cada falha NOVA.
