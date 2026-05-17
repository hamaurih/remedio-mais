## Conector Trier Drogarias

Integração específica entre a Farmácia Atacadão dos Medicamentos e a Trier Sistemas, com toda comunicação passando por edge functions (Bearer Token nunca exposto ao navegador).

### 1. Banco de dados (1 migration)

**Novas tabelas:**
- `trier_settings` (linha única) — ambiente (homologacao/producao), base_url, bearer_token (criptografado por RLS admin-only), page_size, flags de sync (produtos/estoque/preços/descontos/pedidos/status), última conexão testada
- `trier_product_mappings` — vínculo produto ↔ trier_product_id, barcode, status de sync
- `trier_sync_jobs` — histórico de execuções por tipo (products/categories/stock/prices/discounts/all), contadores, erro
- `trier_logs` — log genérico tipado (conexão, produto, estoque, pedido, status, erro)

**Colunas adicionais em `products`:**
`trier_product_id`, `trier_barcode`, `ecommerce_enabled`, `ecommerce_name`, `ecommerce_price`, `ecommerce_stock_quantity`, `cart_quantity_limit`, `sale_observation`, `last_trier_sync_at`, `sync_with_trier`, `lock_manual_price`, `lock_manual_stock`, `source`
(Reaproveita as colunas que já existem da iteração anterior; só adiciona o que falta.)

**Colunas adicionais em `orders`:**
`trier_sent`, `trier_sent_at`, `trier_status`, `trier_status_code`, `trier_numero_nota`, `trier_last_status_check_at`, `trier_error_message`

**RLS:** todas restritas a `has_role(auth.uid(), 'admin')` para leitura/escrita. `trier_settings` nunca exposto a usuários públicos.

### 2. Edge Functions (1 função roteadora `trier`)

Uma única função `trier` com sub-rotas internas (decodificadas pelo path/body) para evitar 10 funções separadas:

| Ação | Endpoint Trier consumido |
|---|---|
| `test-connection` | GET `/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=1` |
| `sync-products` (completo) | `/produto/obter-v1` paginado, filtro `ativo=true&integracaoEcommerce=true` |
| `sync-products-changed` | `/produto/obter-alterados-v1` com `dataInicial`/`dataFinal` |
| `sync-categories` | `/categoria/obter-todos-v1` e `/categoria/obter-alterados-v1` |
| `sync-stock` | `/estoque/obter-todos-v1?integracaoEcommerce=true` paginado |
| `sync-prices` | `/produto/precificacao/obter-todos-v1?removerRestricaoEstoque=true` |
| `sync-discounts` | `/produto/desconto/melhor/obter-todos-v1?removerRestricaoEstoque=true` |
| `sync-all` | encadeia produtos → categorias → estoque → preços → descontos |
| `send-order` | POST `/rest/integracao/venda/ecommerce/` (payload conforme doc) |
| `check-order-status` | GET `/rest/integracao/venda/ecommerce/consultar-venda-v1` (single + lote ≤50) |
| `update-order-status` | POST `/rest/integracao/venda/ecommerce/atualizar-status-v1` |

Cada ação: lê `trier_settings`, monta `Authorization: Bearer <token>`, pagina respeitando `page_size`, upserta no banco usando service role, registra `trier_sync_jobs` e `trier_logs` (token jamais logado).

### 3. Agendamento (pg_cron)

Cron único de 15 em 15 minutos chama a função `trier?action=scheduled`. A função decide o que rodar comparando `now()` com o `interval` configurado em `trier_settings` para cada tipo (estoque mais frequente, preços/descontos intermediário, produtos por "alterados" desde último sync).

### 4. Frontend (admin)

**Nova rota raiz:** `/admin/integrations/trier` com layout próprio em abas (Tabs do shadcn). Substitui a tela provisória `/admin/trier`.

Abas:
1. **Visão Geral** — cards com último sync por tipo, conexão OK/Erro, total de produtos vinculados, pedidos pendentes de envio
2. **Configuração** — formulário (ambiente, base URL com default homologação, token mascarado `••••1234`, page size, switches de cada sync) + botão "Testar conexão"
3. **Sincronização de Produtos** — botões: sincronizar agora (completo) e sincronizar alterados (com date range); lista produtos vinculados
4. **Sincronização de Estoque** — botão + tabela de últimos jobs
5. **Sincronização de Preços e Descontos** — dois botões + jobs
6. **Mapeamento de Campos** — tabela read-only mostrando o mapeamento Trier→Site (documentação viva)
7. **Pedidos E-commerce** — pedidos com status de envio à Trier, botão "Enviar para Trier" e "Reprocessar"
8. **Status de Pedidos** — botão "Atualizar status de pendentes" (lote ≤50)
9. **Logs** — tabela filtrável por tipo/status com modal de detalhes

**Sub-rotas alternativas** (também solicitadas): `/admin/integrations/trier/products`, `/stock`, `/prices`, `/orders`, `/logs` — implementadas como links que abrem a aba correspondente (mesma página, querystring `?tab=`).

**Menu lateral admin:** novo item "Integração Trier" apontando para `/admin/integrations/trier` (remove o link antigo `/admin/trier`).

### 5. Regras de negócio aplicadas no mapeamento

- **Preço:** `ecommerce_price ?? price`. Promoção quando há `percentualDesconto>0` ou `valorPromocao` válido.
- **Estoque:** `ecommerce_stock_quantity ?? stock_quantity`. ≤0 → `active=false` (a menos que `lock_manual_stock=true`).
- **Visibilidade:** `integracaoEcommerce=false` → `active=false`, salvo `sync_with_trier=false` (gerenciado manualmente).
- **Locks manuais:** se `lock_manual_price=true` não sobrescreve preço; se `lock_manual_stock=true` não sobrescreve estoque.
- **Pedidos:** bloqueia envio se algum item sem `trier_product_id` ou estoque local zerado.

### 6. Segurança

- Bearer Token salvo só no banco (RLS admin-only) e lido apenas dentro da edge function via service role
- API Trier nunca chamada pelo frontend — toda chamada vai por `supabase.functions.invoke("trier", ...)`
- UI mostra apenas últimos 4 chars do token
- Logs gravam payloads sanitizados (sem header Authorization)

### O que NÃO muda

Home, ProductCard, ProductShelf, carrinho, WhatsApp, envio de receita, banners, painel atual de produtos/categorias/banners/ofertas/pedidos/receitas/config — tudo intacto. A tela provisória `/admin/trier` é substituída pela nova `/admin/integrations/trier`.

### Ordem de execução

1. Migration (tabelas + colunas + RLS + cron de 15min)
2. Edge function `trier` (roteadora, todas as ações)
3. Páginas admin (layout em abas + sub-rotas)
4. Atualizar menu lateral e App.tsx
5. Smoke test: testar conexão + sync de produtos

### Pontos a confirmar antes de começar

- **Cron automático**: posso já criar com intervalo padrão de 15min (estoque), 1h (preços/descontos), 6h (produtos via "alterados")? Ou prefere começar tudo desligado e ativar manualmente nas configurações?
- **Token atual** (`TRIER_API_TOKEN` já cadastrado como secret): devo migrar para a tabela `trier_settings` e remover o secret? Ou manter o secret como fallback?
- **Pedidos**: o site hoje grava pedido no Supabase apenas como rascunho (sem checkout real). Envio à Trier deve ser **automático** quando pedido é criado, ou só **manual** pelo botão no admin?
