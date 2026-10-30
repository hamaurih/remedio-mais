# ERP Core — Fase 0: Baseline de Produção e Regras de Segurança

Data de início: 2026-10-23
Branch isolada: `erp-core-safe-start`

## Objetivo

Preparar a evolução do Atacadão dos Medicamentos para um ERP central omnichannel sem alterar o fluxo crítico atual de venda em produção.

## Regra de arquitetura

O ERP será o sistema central no estado final.
Durante a transição, o Trier continua como dependência operacional temporária para catálogo/preço/estoque e recebimento das vendas.

## Componentes congelados nesta fase

Nenhuma alteração funcional será feita inicialmente em:

- `create-cielo-pix`
- `create-cielo-card`
- `cielo-webhook`
- `check-cielo-status`
- `send-order-to-trier`
- checkout público
- criação de pedidos do site
- regras atuais de aprovação de pagamento
- fluxo atual de envio de vendas do site ao Trier

Mudanças nesses componentes só poderão ocorrer em fase posterior, após teste de regressão, homologação, shadow mode e rollback definidos.

## Baseline validado em 2026-10-23

### Produção web
- Deploy de produção Vercel: READY.
- Domínio oficial permanece associado à produção.

### Trier
- `send-order-to-trier`: ACTIVE, versão 15.
- `auto_send_orders_enabled = true`.
- Integração de vendas configurada.
- Webhook Cielo dispara `send-order-to-trier` na primeira aprovação de pagamento para pedidos do canal site.
- `check-cielo-status` também dispara `send-order-to-trier` na primeira aprovação detectada durante reconciliação.

### Evidência operacional
Janela auditada: últimos 7 dias no momento da criação deste baseline.

- Pedidos pagos: 66
- Pedidos pagos do fluxo site elegíveis: 66
- Pedidos enviados ao Trier: 66
- Pedidos pagos elegíveis sem envio ao Trier: 0

Pedido real mais recente observado no início da fase:
- Código: `ADM-261023-E85B6D`
- Canal: site
- Pagamento: Pix aprovado
- Trier: enviado
- HTTP: 200
- Tentativas: 1
- Erro final: nenhum

## Estratégia de implantação

1. Baseline e inventário de dependências.
2. Auditoria de segurança sem alterar regras críticas.
3. Criação do Trier Adapter em paralelo, inicialmente sem tráfego de produção.
4. ERP Core em homologação.
5. Shadow mode.
6. Comparação automática entre legado e ERP Core.
7. Feature flags.
8. Ativação gradual por responsabilidade.
9. Rollback obrigatório.
10. Retirada de legado apenas após aceite.

## Critérios obrigatórios antes de qualquer cutover

- Testes unitários verdes.
- Testes de integração verdes.
- E2E crítico verde.
- Segurança revisada.
- Banco e RLS revisados.
- Logs e alertas disponíveis.
- Homologação aprovada.
- Divergência entre legado e novo fluxo dentro do limite definido.
- Rollback testado.
- Nenhuma alteração destrutiva simultânea ao cutover.

## Estratégia de banco

Adotar padrão:

`expand -> dual write/shadow -> backfill -> read new -> contract`

Não remover coluna/tabela/regra crítica na mesma etapa em que o novo fluxo for ativado.

## Próximo trabalho autorizado nesta branch

- Mapear dependências do fluxo de pedidos.
- Mapear dependências Trier.
- Mapear riscos SECURITY DEFINER/RLS.
- Definir contratos internos de Produto, Canal, Pedido e Estoque.
- Criar testes de caracterização do comportamento atual.
- Não conectar o ERP Core ao tráfego real ainda.
