## Plano: Painel Administrativo Completo — Farmácia Atacadão

O projeto **já possui** boa parte da infraestrutura admin: rotas `/admin/*` protegidas por `useAuth` + `user_roles`, layout com menu lateral, dashboard com cards, e CRUDs de Produtos, Categorias, Banners, Pedidos, Receitas e Configurações. Vou **evoluir** o que existe sem refazer, focando nas lacunas reais.

### O que vou fazer

**1. Banco de dados (migration única)**
Adicionar colunas faltantes nas tabelas existentes (sem renomear nem quebrar). Em PT-BR mantendo os nomes atuais quando já existem:
- `products`: `short_description`, `sku`, `barcode`, `gallery_images` (text[]), `discount_percentage` (gerado), `promotion_start`, `promotion_end`, `minimum_stock`, `product_badge`, `custom_warning`, `seo_title`, `seo_description`
- `categories`: `description`, `image_url`, `show_in_menu`, `show_on_home`
- `banners`: `mobile_image_url`, `start_date`, `end_date`, `position` (enum text: hero/mosaico/secundario/receita/rodape)
- `orders`: `updated_at`, status estendido (texto livre, validado no app)
- `prescriptions`: `internal_notes`, `updated_at`
- `store_settings`: `served_neighborhoods`, `footer_text`, `sanitary_notice`, `legal_name`, `cnpj`, `pharmacist_name`, `crf`, `sanitary_license`, `afe`
- Triggers `touch_updated_at` onde faltar

**2. Dashboard (`AdminDashboard.tsx`)**
Ampliar cards: total produtos, ativos, **estoque baixo**, **em oferta**, pedidos, receitas. Adicionar 3 listas rápidas (últimos produtos / pedidos / receitas).

**3. Produtos (`AdminProducts.tsx`)**
- Busca por nome, filtro por categoria e por status (ativo / inativo / oferta / estoque baixo)
- Tabela enriquecida (foto, fabricante, preço promo, badge "em oferta", estoque destacado em vermelho se baixo)
- Botão ativar/desativar inline
- Formulário em **abas** (Básico, Imagens, Preço, Estoque, Vitrine, Regulatório, SEO) com:
  - galeria de imagens (upload múltiplo + preview + remover)
  - desconto % calculado automático
  - datas de promoção
  - todos os toggles de vitrine (7 prateleiras)
  - selo manual + tarja select
  - SEO
- Confirmação ao excluir, máscara de preço BRL

**4. Categorias (`AdminCategories.tsx`)**
Adicionar campos `description`, `image_url` (upload), `show_in_menu`, `show_on_home`, drag-free ordering por número.

**5. Nova página Ofertas (`/admin/ofertas`)**
Listagem dedicada de produtos com `on_sale=true` ou `promo_price`. Filtros: ativas / futuras / expiradas. Alertas visuais para: sem preço promocional, expirada, sem estoque. Ações rápidas: editar promo, remover da oferta.

**6. Banners (`AdminBanners.tsx`)**
Adicionar campos: imagem mobile, posição (select), data início/fim, preview, reordenar.

**7. Pedidos (`AdminOrders.tsx`)**
Status estendido (Novo, Em atendimento, Aguardando pagamento, Separando, Saiu para entrega, Retirado, Finalizado, Cancelado). Drawer/modal de detalhes com itens, endereço, botão "Abrir WhatsApp" e "Copiar mensagem".

**8. Receitas (`AdminPrescriptions.tsx`)**
Visualizador de arquivo (imagem/PDF), status estendido, observação interna, botão WhatsApp.

**9. Configurações (`AdminSettings.tsx`)**
Adicionar todos os campos legais e operacionais novos.

**10. Integração Home**
A Home **já lê** `shelves: string[]` do produto. Vou manter compatibilidade — os novos toggles `show_on_*` no form gravam no mesmo array `shelves` (chave única). Sem mudanças em `ProductShelf`, `ProductCard`, `Index.tsx`.

**11. Rota de login admin**
Já existe `/auth`. Vou adicionar redirect explícito `/admin/login` → `/auth` para alinhar com a spec, sem duplicar tela.

### O que NÃO vou tocar
- Home, `ProductCard`, `ProductShelf`, `ProductCarousel`, `Header`, `CategoryNav`, Footer
- Carrinho, envio de receita, fluxo WhatsApp
- Layout responsivo público

### Detalhes técnicos
- Migration única com `IF NOT EXISTS` em todos os `ADD COLUMN`
- `discount_percentage` como coluna gerada: `GENERATED ALWAYS AS (CASE WHEN price>0 AND promo_price IS NOT NULL THEN ROUND((1 - promo_price/price)*100) ELSE 0 END) STORED`
- Galeria: `text[]` com URLs públicas do bucket `products`
- Upload mobile banner em bucket `banners` existente
- Validação client-side com mensagens claras (toast sonner já em uso)
- Máscara BRL via `formatBRL` existente em `@/lib/store`

### Ordem de execução
1. Migration (aguardar aprovação)
2. Refatorar `AdminProducts` (form em abas, galeria, filtros)
3. Atualizar `AdminCategories`, `AdminBanners`, `AdminOrders`, `AdminPrescriptions`, `AdminSettings`
4. Criar `AdminOffers` + rota
5. Expandir `AdminDashboard`
6. Smoke test visual da home (garantir que nada quebrou)

Aprovar para eu começar pela migration?
