# ERP Product + Price + Stock Services

## Regra de negócio imutável

O preço do Site é uma decisão comercial manual do Atacadão.

- `site_price`: autoridade = ERP/Admin.
- `site_promo_price`: autoridade = ERP/Admin.
- Trier não pode sobrescrever esses campos.
- O ERP Core não recalcula nem grava esses campos automaticamente.
- Durante a transição, `price/ecommerce_price/promo_price` continuam podendo vir do Trier como base/referência operacional conforme a regra atual.
- A regra efetiva exibida no site permanece igual à regra existente; esta etapa não muda preço do cliente.

## Autoridade transitória

| Campo | Autoridade agora | Estado final |
|---|---|---|
| site_price | ERP/Admin | ERP/Admin |
| site_promo_price | ERP/Admin | ERP/Admin |
| whatsapp_price | ERP/Admin | ERP/Admin |
| pdv_price | ERP/Admin | ERP/Admin |
| price/ecommerce_price | Trier transitório | ERP |
| stock/trier_stock_quantity | Trier transitório | ERP |
| imagens/SEO/vitrines | ERP/Admin | ERP/Admin |

## Novo serviço

`erp-product-read` fornece um contrato read-only para o futuro ERP:

- consulta por ID, SKU, EAN ou código Trier;
- busca por nome/código;
- preço efetivo por canal;
- estoque efetivo durante a transição;
- disponibilidade;
- metadados de autoridade.

## Segurança

Nesta fase:
- somente admin autenticado;
- JWT obrigatório;
- somente SELECT;
- não altera produto;
- não altera preço;
- não altera estoque;
- não altera pedido;
- não chama Trier;
- site público ainda não usa este serviço.

## Próximo gate

Após CI verde e validação do endpoint read-only:
1. comparar resultados com o site/PDV/WhatsApp em amostra e catálogo;
2. manter divergência zero;
3. só então considerar uso por um canal via feature flag.
