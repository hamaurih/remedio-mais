# ERP Core — Registro de Segurança da Fase 0

## Estado

Este documento registra riscos; ele não altera permissões de produção nesta fase.

## Achados prioritários do Supabase Advisor

### P0/P1 a tratar antes de cutover do ERP Core

1. Views expostas com comportamento SECURITY DEFINER:
   - `store_settings_public`
   - `ai_sales_summary`

2. SECURITY DEFINER executável por `anon` em RPCs que precisam revisão de exposição.
   Exemplos relevantes:
   - `admin_cart_funnel_list`
   - `admin_cart_funnel_summary`
   - `admin_list_sellers`
   - outras funções internas/triggers reportadas pelo advisor.

3. Tabelas com RLS habilitado e sem policy:
   - `_maintenance_tokens`
   - `legacy_media_refs`
   - `pos_delivery_quotes`
   - `prescription_email_log`

4. Policies permissivas redundantes precisam consolidação gradual, sem remover acesso necessário ao site/admin.

## Regra de correção

Nenhuma permissão será removida em massa.

Para cada função/view/policy:
1. identificar todos os consumidores;
2. classificar como pública, autenticada, admin, seller, trigger ou backend;
3. criar teste de autorização;
4. corrigir em homologação;
5. rodar advisors;
6. testar regressão;
7. promover isoladamente;
8. manter rollback.

## Exceções públicas intencionais

Funções como configurações públicas de Meta/GA podem precisar acesso anônimo, mas devem retornar apenas configuração explicitamente pública e mínima.

## Critério para fechar Segurança da Fase 0

- riscos inventariados: concluído;
- nenhum risco novo introduzido na branch;
- correção dos P0 será executada antes de qualquer cutover de ERP Core;
- fluxo produtivo atual permanece inalterado durante esta etapa.
