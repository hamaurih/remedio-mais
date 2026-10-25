# Motor de Gestão Inteligente de Estoque Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implantar um único motor de política de estoque por produto e utilizá-lo em Home, Estoque, Compra Inteligente e Curva ABC.

**Architecture:** Um RPC Postgres concentra cálculo e leitura de dados; TypeScript contém constantes/rótulos compartilhados para UI e testes. O RPC atual permanece intacto.

**Tech Stack:** React, TypeScript, Vitest, Supabase/Postgres.

**Spec:** `docs/superpowers/specs/2026-10-25-inventory-management-engine-design.md`

## Global Constraints
- Não alterar preços manuais do site.
- Não escrever estoque nem criar pedido automaticamente.
- Não alterar Cielo, Trier de envio, checkout ou Order Command.
- Lead time ausente usa 3 dias e deve ser identificável como estimado.

## Review Focus
- Produto A com demanda alta deve ficar crítico mesmo com estoque > 5.
- Produto C de giro muito baixo pode estar OK com estoque < 5.
- Produto sem giro não pode gerar sugestão automática.
- Reserva precisa reduzir estoque disponível.
- MOQ precisa arredondar compra para cima.

### Task 1: Contrato e política TypeScript
**Files:** Create `src/lib/inventoryPolicy.ts`; Create `src/test/inventoryPolicy.test.ts`.
- RED: testes dos cinco cenários acima.
- GREEN: constantes A/B/C, status e função pura de cálculo usada como referência de comportamento.

### Task 2: Motor SQL administrativo
**Files:** Create `supabase/migrations/20261025165000_inventory_management_engine.sql`; Test `src/test/inventoryManagementEngineContract.test.ts`.
- RED: contrato do RPC, segurança, parâmetros, ABC, lead time, fórmula e resumo.
- GREEN: RPC aditivo `admin_inventory_management`.

### Task 3: Consumidores do motor
**Files:** Modify `AdminHome.tsx`, `AdminStock.tsx`, `AdminSmartPurchasing.tsx`, `AdminCurveABC.tsx`; Test integration contract.
- Home troca “estoque <= 5” por ruptura/crítico/repor/excesso.
- Estoque ganha visão gerencial por ABC/cobertura/ponto/alvo/status.
- Compra Inteligente deixa horizonte manual global e usa política ABC.
- Curva ABC usa classificação omnicanal do novo motor.

### Task 4: Verificação
- Vitest completo.
- Playwright desktop/mobile.
- Vercel preview.
- Homologação da migration em Supabase branch somente após confirmação do custo.
