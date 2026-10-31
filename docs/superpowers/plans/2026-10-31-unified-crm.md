# Unified CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Expor projeção CRM no ERP sem duplicar transações ou ativar integração.
**Architecture:** Painel read-only dentro de AdminCustomers; funções puras de projeção e contrato candidato A&S, sem transporte.
**Tech Stack:** React 18, TypeScript, Vite, Tailwind 3, shadcn/ui local, Vitest.
**Spec:** docs/crm/unified-crm-design.md

## Global Constraints
- Feature flag OFF; sem migração, deploy, mutação real, credenciais ou mudanças Trier/preços.
- Preservar autorização administrativa e entidades existentes.

## Review Focus
- Convidados não se fundem por telefone; IDs diferentes não compartilham análise.
- Receita original pendente não muda fase comercial nem é liberada por pagamento.
- Retirada e pagamento na entrega não se confundem com entrega/antecipação.
- Eventos fora de ordem, eco e correlação cruzada não geram intenção.
- Erro de leitura não se disfarça como lista vazia; paginação não é histórico completo.

## Task 1 — Projeção e contrato puro
Files: src/lib/unifiedCrm.ts, src/lib/crmIntegrationContract.ts, src/test/unifiedCrm.test.ts, src/test/crmIntegrationContract.test.ts.
- [x] Escrever testes de identidade, origem, dimensões, estados desconhecidos, dedupe/versão/correlação/echo e map obrigatório; executar RED.
- [x] Implementar funções puras mínimas; executar GREEN.

## Task 2 — Painel e verificação
Files: src/components/admin/UnifiedCrmPanel.tsx, src/pages/admin/AdminCustomers.tsx, src/test/unifiedCrmPanel.test.tsx.
- [x] Testar flag/guard, carregando, erro/retry, vazio, filtros e análise local.
- [x] Compor Button, Input, Select, Badge, Alert e Table existentes; query read-only paginada.
- [ ] Rodar suite completa, lint, typecheck e build sem prebuild remoto; inspecionar preview local sem backend real.
- [ ] Revisão independente; apresentar diff ao coordenador antes de qualquer push/PR.

## Resultado e decisões
- Suite histórica: 30 arquivos / 218 testes PASS (não comprova isolamento); tentativa pré-commit bloqueada por rede baseline. Testes CRM isolados por mocks:49/49 PASS. Build PASS. Lint focado: 0 erros, 21 warnings legados; global e tsc têm bloqueios preexistentes documentados.
- Revisão independente concluída; dois achados importantes corrigidos por RED→GREEN (convidado e aliases), escopo reforçado no modal. Cancelado separado de Perdido por requisito explícito posterior.
- Ruling: execução nativa e branch isolada no checkout exclusivo fornecido; usuário optou por implementação no melhor julgamento, sem nova escolha de detalhes.
- Ruling: registry indisponível, manter primitivas locais sem instalar componentes novos. Custo: QA upstream pendente, sem migração de UI.
- Ruling: janela de50 pedidos, filtros locais reiniciam por página; não carregar toda a base nem inferir histórico completo. Custo: busca global ainda não fornecida.
- QA visual Chromium bloqueado pelo ambiente, portanto checklist visual permanece pendente. Publicação somente em draft PR após revisão do coordenador; sem ativação.

## Gate de testes offline posterior
- Correção de isolamento test-only autorizada após negação: mocks baseline cartFunnel/client e barreira fail-closed de transportes.
- Suite offline final31 arquivos /221 PASS com maxWorkers2; timeout5000ms preservado. Lint isolamento0 erros/1 warning legado.
- Tentativa de QA CUA também bloqueada; fixture removida, servidor encerrado.
