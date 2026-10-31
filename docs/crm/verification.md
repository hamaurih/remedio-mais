# Evidências — CRM unificado, 31/10/2026

Base: fb30a18324fb29c970e284cf43f690edc657df3e. Branch isolada `feat/unified-crm-preview`. Registro de validação anterior à publicação do draft PR. Sem deploy autorizado, migração ou chamadas reais de integração.

## Escopo entregue
- Prévia read-only dentro de Clientes, flag `VITE_UNIFIED_CRM_PREVIEW` ausente/OFF por padrão, apenas admin. Filtros consolidado/Site/WhatsApp IA; Balcão identificado como futuro sem leitura de PDV.
- Pedidos e identidade ERP existentes; sem novo cadastro ou negócio transacional. Convidado permanece separado e análise inclui seu próprio pedido sem inventar contato.
- Pagamento, receita original + condições por item e logística separados do estágio comercial derivado. Preços apenas lidos.
- Contrato offline candidato de intenção A&S com correlação, duplicata, ordenação, anti-eco e mapeamento obrigatório.

## Testes e revisão
- RED observado: 17 testes de funções, 3 testes UI, regressão convidado, 9 aliases reais, cancelamento separado e aviso de escopo do modal.
- Suite histórica após correções: **30 arquivos / 218 testes PASS**, `npm test`; esse sucesso NÃO comprova isolamento de rede. Nova tentativa pré-commit foi interrompida por auto-review por tentativa HTTPS Supabase (detalhes abaixo).
- Gates OFF/admin: três testes adicionais verificam não montar query quando não permitido.
- Revisão independente encontrou convidado com análise zerada e aliases `pago/pronto_para_retirada`; corrigidos com regressões RED→GREEN. Aviso de página reforçado dentro do modal.
- Decisão: filtros reiniciam ao trocar página (janela independente), explicitamente escopo local. Não implica busca em toda base. Futuro filtro server-side exige revisão de query/paginação.

## Limitações do ambiente
- `npm ci` bloqueado por package-lock já divergente do package.json. Dependências instaladas com `npm install --ignore-scripts --package-lock=false`, sem editar manifesto/lock. Node local24, projeto exige22.
- shadcn CLI info/search/docs/view tentados: registry recusado pelo proxy. Reutilizadas somente primitivas locais Alert, Badge, Button, Input, Select, Table e ErpPanel.
- QA Chromium desktop/mobile não executou: socket bloqueado no sandbox; única escalada falhou no bootstrap bwrap por filesystem read-only. Nenhum contorno ou acesso a sessão privada. Tentativa adicional do coordenador via CUA oficial na fixture local isolada também falhou com net::ERR_HTTP_RESPONSE_CODE_FAILURE. Fixture usava stubs Supabase/auth e CSP connect-src none; foi removida e servidor encerrado. Testes UI jsdom não substituem inspeção visual.
- `tsc --noEmit -p tsconfig.app.json`: erros já presentes em AdminDashboardCharts.tsx:81, useStoreSettings.ts:33, AdminOrders.tsx:256; nenhum erro novo nos arquivos CRM.
- Lint global: 33 erros / 1414 warnings em arquivos legados, incluindo create-whatsapp-order incompleto. Não corrigidos fora do escopo. Checagem focada sem erros; warnings existentes any nas peças reaproveitadas.
- Build via `npx vite build`: passa; vite.config também gera sitemap. Sem .env nem variáveis de URL/key no processo, então gerador não consulta backend; arquivo sitemap gerado restaurado e não faz parte do patch.

## Antes de liberar
Revisão do diff, QA visual em ambiente permitido, validação do banco/RLS e dependências com Node22/lock reconciliado. Integração A&S, sincronização de leads e histórico completo **não homologados nem implementados**. Flag continua desligada. Ativação externa exige aprovação própria.

## Revisão root adicional
P2 reproduzido em nove casos RED: projeção ignorava fulfillment/delivery quando labels legadas estavam atrasadas. Corrigidos terminal e progresso operacional. Evidência terminal contraditória resulta em A reconciliar / conflicting_state, não escolha silenciosa. Contrato e UI compartilham decisão terminal; teste de conflito também observado RED.

## Bloqueio pré-commit e correção de isolamento
- Nova execução `npm test` interrompida por auto-review: possível acesso HTTPS Supabase fora do escopo. Nenhum git add/commit/push ocorreu no comando encadeado.
- Inspeção estática encontrou caminho baseline `publicUx.test.ts` → `store.save()` → import dinâmico `cartFunnel` → `supabase.rpc('track_cart_funnel')`, sem mock, com catch silencioso. Passar no teste não prova ausência de side effect.
- Nossos testes de UI foram endurecidos com mock explícito de `supabase/client` (Proxy fail-closed) e auth stub, impedindo inicialização do cliente real. Comando focado permitido após essa mudança material: `vitest run src/test/unifiedCrm.test.ts src/test/crmIntegrationContract.test.ts src/test/unifiedCrmPanel.test.tsx src/test/unifiedCrmGate.test.tsx src/test/customerPurchaseInsights.test.ts`: **49/49 PASS em5 arquivos**.
- Não foi usado --no-verify nem bypass de hook. Nenhum hook customizado encontrado; bloqueio ocorreu na execução de testes, antes do Git.
- Publicação pausada até resolver isolamento baseline e revisar evidência; nenhuma afirmação de suite offline completa neste ponto.

## Isolamento corrigido — validação posterior
Autorizada correção exclusivamente de testes pelo coordenador após diagnóstico estático:
- `publicUx.test.ts`: mock explícito de cartFunnel, sem RPC analytics.
- `storefrontM5M9.test.ts`: mock fail-closed do client Supabase; só testa funções puras de filtro, não precisa inicializar auth.
- `networkGuard.ts` instalado por setup antes dos módulos: bloqueia fetch, Node HTTP/HTTPS/socket/TLS, XHR e WebSocket antes de transporte. Registra apenas tipo de transporte, nunca URL/payload/segredo; afterEach falha se tentativa inesperada foi engolida pelo código.
- Três regressões exercitam guardas usando domínio reservado `.invalid`, com erro antes de transporte. Restauração de mocks Vitest não restaura implementações reais substituídas pela guarda.
- Foco de isolamento: **20/20 PASS**. Primeira suite completa isolada:219/221, dois timeouts baseline (publicUxRoutes estoque0; taxMigration resumo) por concorrência; ambos passaram13/13 em execução reduzida, sem alterar timeout5000ms ou assertions.
- **Suite final isolada:31 arquivos / 221 testes PASS**, comando `./node_modules/.bin/vitest run --maxWorkers=2`, mesmas guardas e timeout original. Nenhuma tentativa inesperada registrada.
- Lint do isolamento:0 erros/1 warning any legado. Nenhuma mudança em código produtivo para remover chamadas ou alterar credenciais. Nenhum hook desabilitado.
- Revisão root do isolamento sem bloqueantes. Limite da contabilização: trabalho assíncrono não aguardado pode terminar depois do afterEach; transportes substituídos seguem bloqueados, mas não se afirma garantia absoluta de auditoria de toda tentativa.
