# ERP Core — Mapa de Dependências do Fluxo Crítico

## Fluxo público atual preservado

```text
Cliente
  -> Carrinho
  -> Checkout
  -> create-cielo-pix / create-cielo-card
  -> Cielo
  -> cielo-webhook OU check-cielo-status
  -> orders.payment_status = approved
  -> send-order-to-trier
  -> Trier / SGF
  -> orders.trier_sent = true
```

## Dependências críticas

| Componente | Responsabilidade atual | Dependências | Regra para a migração |
|---|---|---|---|
| Checkout | coleta dados, endereço, frete e inicia pagamento | Auth, catálogo, preço, receita, Cielo | congelado na Fase 0 |
| create-cielo-pix | cria pedido/pagamento Pix | orders, Cielo, preços/estoque | congelado |
| create-cielo-card | cria pedido/pagamento cartão | orders, Cielo, preços/estoque | congelado |
| cielo-webhook | confirma evento da Cielo | payment_events, orders, Trier, Meta | congelado |
| check-cielo-status | reconcilia pagamento pendente | Cielo, orders, Trier, Meta | congelado |
| send-order-to-trier | transforma pedido pago em venda Trier | orders, order_items, trier_settings, Trier API | congelado |
| trier | catálogo/preço/estoque transitórios | Trier API, products | permanece como fonte transitória |
| public-catalog-search | catálogo público | products, preços por canal | não migrar até ERP Product Service existir |

## Invariantes obrigatórias

1. Pedido do site só pode ser enviado ao Trier após aprovação de pagamento.
2. Primeira aprovação Cielo deve continuar disparando envio automático se `auto_send_orders_enabled=true`.
3. Reprocessamento não pode duplicar venda já enviada.
4. Falha Trier não pode apagar nem invalidar o pedido pago.
5. Estado comercial do pedido e estado de integração Trier são independentes.
6. Pedidos IA/WhatsApp permanecem bloqueados do Trier enquanto essa regra de transição estiver vigente.
7. Nenhum novo ERP Core poderá escrever no fluxo produtivo antes do shadow mode.

## Baseline observado

- Janela: 7 dias anteriores a 2026-10-23.
- Pedidos pagos elegíveis do fluxo site: 66.
- Enviados ao Trier: 66.
- Pagos elegíveis sem envio: 0.
- Logs recentes observados: respostas HTTP 200 / status ok.
- Pedido amostra: `ADM-261023-E85B6D`, Pix aprovado, Trier HTTP 200, 1 tentativa.

## Próxima arquitetura

```text
Site / PDV / IA
       |
       v
   ERP Core
       |
       +--> Trier Adapter (temporário)
       |
       +--> ERP Database (cresce gradualmente)
```

O Trier Adapter não será chamado diretamente pelos canais. O objetivo é permitir remover o Trier futuramente sem reescrever Site, PDV ou IA.
