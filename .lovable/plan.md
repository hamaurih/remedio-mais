# Auditoria (somente leitura) — Geolocalização / Google Maps

Nenhum arquivo, banco, secret ou configuração foi alterado. Todos os testes abaixo foram leituras/chamadas seguras.

## Resumo executivo

O recurso de endereço/frete está **quebrado em produção**. Existem duas chaves Google no projeto:

- Chave própria do cliente (GCP projeto `195834065747`) — usada hoje no navegador **e** preferida pelas Edge Functions.
- Chave gerenciada pela Lovable — só funciona em `*.lovable.app`, mas funciona no servidor.

A chave própria está com **faturamento (Billing) desativado** no Google Cloud e com **Places API (New) não habilitada**, além de estar **restrita por HTTP referrer** (o que bloqueia chamadas de servidor). Resultado: autocomplete não sugere nada e o frete não calcula quando não há coordenadas salvas.

## Resultados por item

| # | Verificação | Resultado | Gravidade |
|---|---|---|---|
| 1 | Chave/browser connector configurada e carregando | Configurada (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY = AIzaSyC7d0…`), presente no build publicado (`assets/AddressAutocomplete-*.js`); o script Maps JS carrega | OK parcial |
| 2 | Places Autocomplete funcional | **NÃO.** `places.googleapis.com/v1/places:autocomplete` com essa chave retorna `403 PERMISSION_DENIED / API_KEY_SERVICE_BLOCKED` + aviso de **Billing desativado** no projeto GCP `195834065747`. Testado com Referer do domínio próprio e do `remedio-mais.lovable.app` — falha nos dois | **Crítica** |
| 3 | Extração de street/number/bairro/cidade/UF/CEP/lat/lng/place_id | Código correto (`extractComponents` cobre route, street_number, sublocality_level_1, admin_area_2/locality, admin_area_1, postal_code; place_id e location vindos de `fetchFields`). Não pôde ser exercitado ponta a ponta porque o autocomplete está bloqueado. Geocodificação equivalente com a chave gerenciada devolveu dados corretos para "Rua Vigário Calixto, 1000, Catolé, Campina Grande-PB" → `-7.2343822, -35.8797458`, CEP 58410-340 | Bloqueado pelo item 2 |
| 4 | ViaCEP conflita/sobrescreve coordenadas | `lookupCep` sobrescreve rua, bairro, cidade e UF, mas **não limpa `lat`/`lng`/`place_id`**. Com coordenadas antigas em memória, o frete continua sendo cotado no ponto antigo | **Alta** |
| 5 | Edição manual após selecionar no Google deixa lat/lng obsoletos | **Confirmado.** No efeito de cotação (`Checkout.tsx`), quando `hasCoords` é verdadeiro o corpo enviado é sempre `{ lat, lng }`; alterar rua/número/bairro/cidade não invalida as coordenadas. O frete pode ser calculado (e cobrado) para o endereço anterior | **Alta** |
| 6 | Endereços salvos sem coordenadas são geocodificados | Fluxo existe (envia `address`, recebe `lat/lng` e persiste em `customer_addresses`), porém **falha hoje** porque a geocodificação de servidor está negada. Base atual: 6 endereços, **4 sem `lat`**, 0 com `place_id` | **Crítica** (efeito do item 9) |
| 7 | Distância: rota ou linha reta | **Linha reta (Haversine)** em `calculate-delivery-fee`. Em Campina Grande isso subestima a distância real de trajeto (tipicamente 20–40%), podendo aplicar faixa de frete menor ou aceitar endereço fora da área de 18 km | Média (regra de negócio) |
| 8 | Endereço e coordenadas da loja | Configurados: "Av. Mal. Floriano Peixoto, 4050 - Malvinas, Campina Grande - PB, 58428-111", `store_lat -7.236629`, `store_lng -35.922702`, geocodificado em 26/06/2026. Modo `distance`, máx. 18 km, 5 faixas (R$ 5 a R$ 24) | OK |
| 9 | APIs/Edge Functions Google no ambiente publicado | `POST /calculate-delivery-fee` com endereço textual responde `200 { ok: false, reason: "geocode_failed" }`. Causa: as funções usam `GOOGLE_MAPS_API_KEY_1` (chave própria) e o gateway devolve `REQUEST_DENIED — "API keys with referer restrictions cannot be used with this API"`. A mesma chamada com a conexão gerenciada retorna `status: OK` | **Crítica** |

## Detalhes técnicos das evidências

- Gateway com a conexão "Amauri's Google Maps Platform": `REQUEST_DENIED` (referrer restriction).
- Gateway com a conexão gerenciada "localização": `OK`, resultado completo com `address_components`, `place_id` e coordenadas.
- Chave do navegador sem Referer, em Geocoding: erro de **Billing não habilitado** no projeto `195834065747` — indica que a chave própria não tem faturamento ativo, o que derruba Places API (New) e futuras chamadas.
- Segredos existentes: `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY_1`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_BROWSER_KEY_1`, `GOOGLE_MAPS_TRACKING_ID` (todos gerenciados por conector). As Edge Functions dão preferência ao sufixo `_1`.
- Observação secundária: o CSP em `vercel.json` não libera `maps.googleapis.com`, `places.googleapis.com` nem `fonts` do Maps em `script-src`/`connect-src`. Não afeta a hospedagem atual da Lovable, mas quebraria um deploy na Vercel.

## Ações necessárias (não executadas)

1. No Google Cloud (projeto `195834065747`): habilitar **Billing**, habilitar **Places API (New)**, **Geocoding API** e **Maps JavaScript API**.
2. Criar/ajustar duas chaves: navegador (restrita aos domínios) e servidor (sem restrição de referrer), e revincular no conector.
3. Invalidar `lat`/`lng`/`place_id` quando o CEP for consultado ou qualquer campo de endereço for editado manualmente.
4. Decidir entre manter Haversine ou migrar para distância por rota (Routes API) nas faixas de frete.
5. Reprocessar os 4 endereços salvos sem coordenadas após a chave voltar a funcionar.

Aprovar este plano significa apenas confirmar o diagnóstico — nenhuma correção será feita sem uma nova instrução sua.
