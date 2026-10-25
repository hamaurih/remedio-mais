# Motor de Gestão Inteligente de Estoque — Design

## Intenção
Substituir regras fixas como “estoque <= 5” por uma política de reposição por produto, baseada em giro real, importância ABC, prazo de reposição e estoque disponível.

## Fontes
- `trier_product_rotation`: giro 30/90/180/365 dias.
- `inventory_balances`: on hand, reservado, disponível e mínimo por unidade, com fallback para `products.stock`.
- `suppliers.lead_time_days`: prazo real quando houver fornecedor preferencial.
- `supplier_products.minimum_order_qty`: múltiplo mínimo de compra quando cadastrado.
- preço de referência: `price_base` → `price` → `site_price`, apenas para ponderação ABC; preços não serão alterados.

## Política
ABC por valor de consumo no período: unidades Trier × preço de referência.
- A: até ~80% do valor acumulado.
- B: de ~80% até ~95%.
- C: restante.

Demanda diária:
- se houver giro 30d e 90d: 70% da média diária de 30d + 30% da média diária de 90d;
- se só houver 30d: média 30d;
- se só houver 90d: média 90d;
- sem giro 90d: não gera compra automática.

Parâmetros iniciais:
- A: segurança 7 dias + cobertura de compra 21 dias.
- B: segurança 5 dias + cobertura de compra 14 dias.
- C: segurança 3 dias + cobertura de compra 7 dias.
- lead time padrão quando ausente: 3 dias, marcado como estimado.

Fórmulas:
- ponto de reposição = max(estoque mínimo, ceil(demanda diária × (lead time + segurança))).
- estoque-alvo = max(ponto de reposição, ceil(demanda diária × (lead time + segurança + cobertura))).
- compra sugerida = max(0, estoque-alvo - estoque disponível), arredondada pelo MOQ quando houver.
- excesso = estoque disponível > 2 × estoque-alvo.

Estados:
- ruptura: demanda > 0 e disponível <= 0.
- crítico: disponível <= ponto de reposição.
- repor: disponível < estoque-alvo.
- excesso: disponível > 2 × estoque-alvo.
- sem_giro: demanda = 0 e disponível > 0.
- ok: demais casos.

## Arquitetura
Criar RPC aditivo `admin_inventory_management(_abc_days integer default 90, _limit integer default 1000)`, somente para admin. O RPC atual de reposição permanece por compatibilidade.

Home, Estoque, Compra Inteligente e Curva ABC passam a consumir o mesmo RPC, evitando regras divergentes.

## Segurança
- Sem escrita em estoque, preço, pedido ou Trier.
- RPC administrativo, `security definer`, `search_path=''`, checagem explícita de papel admin.
- Revogar PUBLIC/anon; conceder apenas a authenticated.
- Nenhuma alteração em checkout, Cielo ou Order Command.
