# Arquitetura SaaS para Farmácias

Status: Fundação — fase 1  
Cliente zero: Atacadão dos Medicamentos

## 1. Objetivo

Evoluir o e-commerce atual para uma plataforma SaaS multiempresa e multifilial, preservando a operação do Atacadão dos Medicamentos enquanto os módulos são extraídos e preparados para outras farmácias.

A regra central é simples: nenhuma consulta, configuração, integração ou credencial pode depender de um registro global da aplicação. Todo dado operacional precisa pertencer explicitamente a uma organização e, quando aplicável, a uma filial.

## 2. Diagnóstico do sistema atual

A base atual já cobre catálogo, pedidos, clientes, estoque, pagamentos, receitas, campanhas, auditoria e integração com o Trier. Porém, ela é single-tenant:

- `store_settings` e `trier_settings` usam o registro fixo `id = 1`;
- `user_roles` atribui papéis globais;
- não há organização ou filial associada às tabelas operacionais;
- o token Trier é único no ambiente;
- `products` mistura cadastro mestre, conteúdo comercial, preço, estoque, integração e substituições manuais.

Essa estrutura funciona para o cliente zero, mas não oferece isolamento suficiente para receber outra farmácia.

## 3. Modelo de domínio

### 3.1 Fundação multiempresa

- `organizations`: empresa, grupo ou rede farmacêutica;
- `stores`: filiais e pontos de venda;
- `organization_memberships`: vínculo entre usuário, organização e função;
- `organization_domains`: domínio ou subdomínio usado para resolver a loja;
- `organization_integrations`: configuração não secreta de ERP, fiscal, pagamentos e canais;
- `plans`, `features`, `plan_features`, `subscriptions`: catálogo de planos e módulos;
- `organization_feature_overrides`: liberações ou bloqueios excepcionais por cliente.

### 3.2 Catálogo e operação

A tabela atual `products` não deve apenas receber um `organization_id`. O modelo-alvo separa:

- `catalog_products`: identidade compartilhada do item, como EAN, princípio ativo, fabricante e dados regulatórios;
- `organization_products`: nome comercial, publicação, preço, promoção, imagem e regras daquela farmácia;
- `branch_inventory`: estoque, estoque mínimo, lote e disponibilidade por filial;
- `integration_product_mappings`: códigos do produto em cada ERP e organização.

Essa separação evita duplicar informações regulatórias e permite que cada farmácia controle sua oferta.

## 4. Isolamento obrigatório

Todas as tabelas operacionais deverão conter `organization_id`. Dados dependentes de localização também deverão conter `store_id`.

A autorização não pode depender somente de `admin` ou `seller`. Ela deve validar simultaneamente:

1. usuário autenticado;
2. organização ativa;
3. vínculo ativo em `organization_memberships`;
4. função autorizada;
5. plano e funcionalidade habilitados;
6. filial selecionada, quando aplicável.

As políticas RLS são a barreira principal. Filtros no React são apenas experiência de uso e não constituem segurança.

## 5. Credenciais e integrações

`organization_integrations.config` armazena somente configurações não secretas. Tokens, client secrets, certificados e senhas devem ficar em cofre seguro; a tabela guarda apenas uma referência em `secret_ref`.

Não armazenar segredos no frontend, em colunas JSON comuns ou em variáveis `VITE_*`.

Cada integração precisa receber o contexto explícito de organização e filial. Nenhuma Edge Function deve buscar configuração por `id = 1` depois da fase de compatibilidade.

## 6. Estratégia de migração

### Fase 1 — Fundação aditiva

- criar as tabelas SaaS;
- cadastrar o Atacadão como primeira organização;
- cadastrar a loja atual como primeira filial;
- migrar administradores e vendedores atuais para memberships;
- associar configurações de loja, Trier e pagamentos ao cliente zero;
- manter os fluxos existentes funcionando.

### Fase 2 — Contexto do tenant

- resolver organização pelo domínio;
- criar `TenantProvider` no frontend;
- exigir organização nas Edge Functions;
- alterar autenticação e painel para usar memberships;
- adicionar testes de isolamento entre duas organizações.

### Fase 3 — Separação do catálogo

- criar catálogo mestre;
- separar oferta comercial e estoque por filial;
- migrar os produtos atuais;
- adaptar sincronização Trier;
- impedir gravações sem organização.

### Fase 4 — Comercialização

- onboarding;
- planos e cobrança recorrente;
- liberação de módulos;
- painel da plataforma;
- métricas de uso e suporte.

## 7. Critérios de aceite da fundação

A fundação somente estará concluída quando:

- o Atacadão operar como uma organização cadastrada;
- existir pelo menos uma filial;
- usuários tiverem papéis limitados à organização;
- configurações e integrações possuírem proprietário explícito;
- uma segunda organização de teste não puder consultar dados do Atacadão;
- nenhuma credencial de integração ficar acessível pelo frontend;
- os fluxos atuais continuarem funcionando durante a transição.

## 8. Decisões desta fase

- migração inicialmente aditiva;
- nenhuma remoção de coluna;
- nenhuma alteração imediata no checkout;
- nenhuma emissão fiscal nativa antes do isolamento multiempresa;
- o Atacadão permanece como cliente zero;
- novas funcionalidades deverão nascer com contexto de organização e filial.
