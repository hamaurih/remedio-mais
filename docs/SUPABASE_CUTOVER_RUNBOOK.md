# Runbook — migração controlada do Supabase

Objetivo: migrar o frontend do Atacadão dos Medicamentos para o Supabase próprio sem indisponibilidade e com rollback imediato.

## Estado atual

- Produção: permanece no backend operacional antigo.
- Homologação: `jzltdocmvvdlyaukwzix`.
- Branch de validação: `agent/prescription-cart-approval`.
- PR #25 deve permanecer em draft até todos os gates abaixo serem aprovados.
- Trier em homologação: `sync_mode=create_only`, automações pausadas e envio/consulta automática de pedidos desabilitados.
- Nunca versionar `TRIER_API_TOKEN`, service-role keys ou credenciais de gateways no GitHub.

## Gate 1 — credenciais Trier

1. Configurar `TRIER_API_TOKEN` como Edge Function Secret no projeto de homologação.
2. Executar `test-connection` e exigir resposta válida.
3. Executar `test-products-endpoint`/diagnóstico de uma página antes de qualquer importação.
4. Não habilitar cron/autosync nesta fase.

Critério de aceite: conexão válida, filial correta e endpoint de produtos respondendo sem erro.

## Gate 2 — primeira carga controlada

1. Manter `sync_mode=create_only`.
2. Importar apenas a primeira página de produtos.
3. Auditar quantidade criada, duplicidades, preço, estoque, nome, slug, código Trier, código de barras e flags de receita.
4. Confirmar que registros manuais de homologação não foram sobrescritos.
5. Somente depois liberar paginação completa de produtos.

Critério de aceite: nenhuma duplicidade de `slug`/`trier_product_id`, nenhum produto ativo sem estoque e nenhum produto ativo sem preço válido.

## Gate 3 — estoque e preço

1. Comparar `stock`, `stock_quantity`, `trier_stock_quantity` e `ecommerce_stock_quantity`.
2. Validar regra canônica: estoque efetivo > 0 ativa o produto, salvo bloqueio explícito legítimo; estoque <= 0 desativa.
3. Rodar `stock_only` e confirmar que a atualização não altera nome, descrição, imagens ou taxonomia.
4. Rodar `price_only` e validar preço base, promoções e datas de promoção.

Critério de aceite: zero divergências críticas de estoque/visibilidade e zero preços inválidos entre produtos vendáveis.

## Gate 4 — qualidade do catálogo

Auditar:

- imagens;
- fabricante/marca;
- categorias e taxonomia;
- código de barras/EAN;
- SKU/código Trier;
- medicamentos controlados e exigência de receita;
- produtos sem preço;
- produtos sem estoque;
- produtos arquivados/manual_disabled;
- duplicidades.

Não bloquear a migração apenas por imagem ausente se o produto estiver corretamente identificado e comercialmente válido; imagem pode entrar em fila de enriquecimento posterior.

## Gate 5 — pedidos e integrações

Com o catálogo validado:

1. Manter `auto_send_orders_enabled=false` até teste explícito.
2. Criar pedido de homologação sem cobrança real.
3. Validar payload de Trier, receita, estoque e auditoria.
4. Testar Meta Events sem enviar dados sensíveis de medicamentos sujeitos a receita.
5. Validar Mercado Pago/Cielo em ambiente seguro de teste, quando aplicável.

Critério de aceite: pedido consistente de ponta a ponta, sem duplicação e sem exposição de dados sensíveis.

## Gate 6 — ambiente Vercel

Antes do corte:

- Production deve receber somente as variáveis do backend aprovado para produção.
- Preview deve continuar isolado na homologação.
- remover dependência de `.env` versionado apenas depois de confirmar as variáveis na Vercel;
- `index.html` deve usar `VITE_SUPABASE_URL` em vez de URL fixa;
- executar `vitest run && vite build` e exigir 100% dos testes aprovados.

## Gate 7 — corte controlado

1. Congelar alterações administrativas no catálogo por uma janela curta.
2. Fazer sincronização final Trier no novo backend.
3. Conferir contagens e amostra de produtos/preços/estoques.
4. Aplicar migrations pendentes.
5. Configurar variáveis Production na Vercel para o Supabase próprio.
6. Gerar novo deployment de produção sem alterar DNS.
7. Testar diretamente o deployment Vercel: home, busca, produto, login, carrinho, receita, checkout e admin.
8. Somente após aprovação, promover/associar o deployment ao domínio oficial.

## Rollback

Se qualquer gate pós-corte falhar:

1. Reapontar as variáveis Production para o backend operacional anterior e promover o último deployment estável da Vercel.
2. Não apagar nem alterar o backend anterior durante a janela de estabilização.
3. Registrar pedidos eventualmente criados durante a janela para reconciliação manual.
4. Investigar no ambiente novo antes de tentar novo corte.

O domínio não deve ser alterado como mecanismo primário de rollback; o rollback deve ocorrer pela Vercel/deployment e configuração de ambiente para minimizar indisponibilidade.

## Condições obrigatórias para retirar o PR #25 de draft

- Trier Secret configurado e conexão aprovada;
- catálogo real carregado e auditado;
- estoque/preço validados;
- checkout com receita aprovado em homologação;
- ambientes Vercel Production/Preview separados;
- plano de rollback comprovado;
- nenhum segredo versionado;
- production não depende do Supabase de homologação.
