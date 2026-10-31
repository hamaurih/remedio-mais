# Incidente checkout Pix — 31/10/2026

## Sintoma e diagnóstico
A tela do passo 4 exibia "Não foi possível criar o pedido".
Em logs do Edge Function `create-cielo-pix` por volta de 21:18–21:25 UTC:
`duplicate key value violates unique constraint "crm_opportunities_tenant_cart_uq"`.
A falha era no INSERT do pedido (função `_shared/prepare-order.ts`), antes do contato com a Cielo.
Não confundir com rejeição de Pix, estoque, CPF ou transação na Cielo.

## Causa raiz
A migration do CRM registrou `trg_crm_sync_order` (AFTER INSERT orders),
que executava antes de `trg_sync_cart_funnel_from_order` por ordem alfabética.
Com o carrinho existente e um pedido novo sem `cart_session_id` no INSERT,
o CRM criava uma oportunidade para o pedido antes de o funil associar o carrinho.
Na associação, a projeção do carrinho atualizava uma oportunidade diferente
com o mesmo cart_session_id e violava a UNIQUE `crm_opportunities_tenant_cart_uq`.
Como trigger e INSERT participam da mesma transação, a compra era revertida.

## Correções no banco e códigos-fonte
1. Renomear exclusivamente o observador CRM para `trg_z_crm_sync_order`.
   Agora a associação do carrinho executa antes da projeção CRM.
2. CRM é projeção best effort: `crm_order_trigger` e `crm_cart_trigger`
   emitem WARNING com SQLSTATE e não cancelam escrita autoritativa em caso de falha.
3. Não remover o índice UNIQUE, não mesclar contatos por telefone e não alterar
   preços, pagamentos, receita, entrega ou comunicação Trier.

## Homologação sem gerar cobrança real
- Listar `pg_trigger` e confirmar ordem, habilitação e eventos dos dois triggers.
- Confirmar corpo das funções de projeção com tratamento de exceção e warning.
- Verificar novos pedidos por quantidade e ausência do erro em logs após a migração.
- Vitest/CI. Teste Pix real requer compra controlada por operador autorizado,
  verificação do pedido/QR/Cielo e posterior conciliação; não gerar cobranças falsas.
- Verificar também cartão, retirada/entrega, produtos com receita e carrinho abandonado.

## Rollback
Renomear `trg_z_crm_sync_order` de volta para `trg_crm_sync_order` é reversível,
mas REINTRODUZ a colisão e não é recomendado enquanto a causa não for tratada.
Se for necessário reverter um guard, restaurar definições do commit anterior,
sem desativar as proteções de pagamento e sem alterar pedidos reais.
