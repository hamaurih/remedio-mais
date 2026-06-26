
# Frete por distância — Campina Grande

Origem fixa: **Av. Mal. Floriano Peixoto, 4050 – Campina Grande/PB**
Raio máximo: **28 km** (acima disso o checkout bloqueia a entrega)
Cálculo: **Haversine** (linha reta, sem custo de API por pedido)

## Tabela de faixas inicial (editável no admin)

| Distância         | Valor    |
|-------------------|----------|
| 0 – 3 km          | R$ 5,00  |
| 3 – 6 km          | R$ 8,00  |
| 6 – 10 km         | R$ 12,00 |
| 10 – 16 km        | R$ 18,00 |
| 16 – 22 km        | R$ 25,00 |
| 22 – 28 km        | R$ 32,00 |
| acima de 28 km    | bloqueia |

Você ajusta valores, número de faixas e raio máximo direto no admin, sem novo deploy.

## 1. Banco (migration)

- `store_settings`: novas colunas
  - `store_lat numeric`, `store_lng numeric`, `store_geocoded_at timestamptz`
  - `delivery_max_km numeric` (default 28)
  - `delivery_fee_zones jsonb` (default com a tabela acima)
  - `delivery_mode text` (default `'distance'`; alterna entre `'flat'` antigo e `'distance'` novo — permite voltar atrás)
- `customer_addresses`: novas colunas `lat numeric`, `lng numeric`, `place_id text`

## 2. Conectar Google Maps Platform

Necessário para geocodificar a origem 1x e para o autocomplete no checkout. Uso o conector gerenciado da Lovable (chave própria só fica obrigatória quando publicar no domínio customizado — aviso no momento).

## 3. Edge functions

- `geocode-store-address` — chamada pelo admin quando o endereço da loja muda. Geocoda via Google e grava `store_lat/lng`.
- `calculate-delivery-fee` — recebe `{ lat, lng }` do cliente; calcula Haversine; retorna `{ distance_km, fee, allowed, zone_label, reason? }`. Sem segredos no frontend.

## 4. Admin — Configurações > Entrega

Mantém o layout atual da página, só amplio a aba "Entrega":
- Endereço da loja (preenchido) + botão "Recalcular coordenadas"
- Mostra lat/lng atuais e data do último geocode
- Raio máximo (km), default 28
- Editor de faixas (linha por faixa: km inicial, km final, valor, label) com validação de sobreposição
- Switch `delivery_mode`: `Distância (novo)` / `Taxa fixa (antigo)` — fallback de segurança

## 5. Checkout (sem mexer no visual)

- Substituo apenas o input de endereço por **Places Autocomplete** (`PlaceAutocompleteElement`, restrito a Brasil/PB). Mesmo estilo, mesmo lugar.
- Ao escolher endereço:
  - preenche os campos estruturados (rua, número, bairro, cidade, CEP)
  - guarda `lat/lng` no estado
  - chama `calculate-delivery-fee`
  - exibe `Frete: R$ X,XX (X,X km)` na linha de frete existente
  - se `allowed=false`, desabilita o botão "Finalizar" com mensagem: "Fora da área de entrega (máx. 28 km da loja)"
- Se o cliente digitar manual sem usar autocomplete, fallback para geocodificar o endereço no backend antes de calcular.

## 6. O que NÃO muda

- Layout, banners, produtos, campanhas, checkout visual: intocados
- Mercado Pago: frete continua entrando em `total` como hoje
- Trier: frete continua sendo enviado como item "Taxa de Entrega" (já implementado)
- Pedidos antigos e canal WhatsApp/balcão: continuam usando `delivery_fee` flat

## 7. Validações de segurança

- `calculate-delivery-fee` é a única fonte de verdade do valor; o checkout nunca confia em valor enviado pelo cliente
- Webhook do MP já valida `total`; mantemos
- Origem e tabela só editáveis por admin (RLS já cobre `store_settings`)

## Detalhes técnicos

- Haversine direto em JS na edge function — sem dependência externa
- Google Places via `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` no client; geocode da loja via gateway (server-side) com `Authorization` + `X-Connection-Api-Key`
- Carregamento do Maps JS com `loading=async` + callback
- `delivery_fee_zones` formato: `[{ "min_km": 0, "max_km": 3, "fee": 5.0, "label": "Até 3 km" }, ...]`
- Migration inclui GRANTs e RLS preservados; nenhuma policy nova precisa mudar
