# Contrato candidato ERP → A&S (offline, não conectado)

`planCrmStage` é uma função pura de proposta. Não executa CRM, HTTP, pg_net, banco, fila, ativação ou mudança de pedido. Seu retorno não é confirmação de sincronização.

## Autoridade e correlação
- ERP controla pedido, preço por canal, pagamento, receita por item e logística. A&S controla conversa e qualificação comercial anterior ao pedido.
- `tenantId + orderId + conversationId` devem corresponder a um vínculo verificado no servidor. O contrato não cria esse vínculo por telefone, nome ou e-mail.
- `eventId` identifica uma ocorrência, não apenas `tipo:orderId`; `version` é inteiro crescente por pedido, gerado transacionalmente na origem. `updated_at` isolado não basta.
- Receptor deve validar envelope/autenticidade/autorização/tenant antes da função, manter inbox e dedupe duráveis, serializar por agregado e atualizar checkpoint atomicamente somente após confirmação da aplicação. Nada disso está implementado nesta fatia.
- `origin=aes` nunca retorna movimento de volta. Origem e cadeia causal precisam ser autenticadas, não confiadas ao payload público.
- Eventos de receita isolados retornam `snapshot_required`, sem regredir funil. Worker futuro deve buscar snapshot ERP completo e autoritativo com todas dimensões.

## Configuração de estágios
IDs numéricos são fornecidos por configuração por tenant/funil. Nenhum ID A&S real está no código. Chaves:

| Chave | Evidência ERP |
|---|---|
| triage | novo / em_atendimento, sem estado operacional mais avançado |
| confirmed | aprovado / confirmado / pago; ou cobrança na entrega |
| awaiting_payment | aguardando_pagamento, apenas timing upfront explícito |
| processing | em_separacao / separando / picking / packed |
| pickup_ready | pronto_retirada / pronto_para_retirada / delivery_status=pickup_ready |
| shipping | saiu_para_entrega / shipped / out_for_delivery |
| completed | entregue / retirado / finalizado / concluido / delivered / picked_up |
| cancelled | cancelado / cancelled: exige ID próprio de Cancelado, nunca fallback para Perdido |
| lost | reservado para perda de oportunidade anterior ao pedido; não derivado de pedido cancelado/refund |

ID ausente/inválido → `unmapped`; estado desconhecido → `unknown_state`; timing desconhecido em aguardando_pagamento → `payment_timing_required`. Evidência terminal contraditória (concluído e cancelado no mesmo snapshot) retorna `conflicting_state` e exige reconciliação, em vez de inventar precedência. Receita e refund não são gatilhos de movimento. O estágio de conclusão não é apagado por refund.

**Pagamento não libera dispensação:** validação da original e requisitos por item continuam responsabilidade das guardas operacionais existentes. Esta prévia só mostra pendências e não autoriza separação. Site pode cobrar antes da original validada. Pagamento na entrega não espera aprovação antecipada. Retirada exige `pickup_ready`, nunca reaproveitar o ID de Saiu para entrega.

## Gates antes de qualquer ativação
1. Confirmar projeto/deploy efetivo de cada ferramenta (divergência de refs observada não prova falha).
2. Resolver código incompleto de ingestão em trabalho separado; verificar paridade com PRs ERP Core #53–63, sem importar migrações implicitamente.
3. Mapear stages reais do funil de preparação; manter funil atual e históricos. Nenhum default alterado por esta entrega.
4. Implementar vínculo/tenant/autenticação, inbox/outbox, versões/dedupe/retry, ack e reconciliação com testes isolados.
5. Homologar consentimento/pausa humana, receita por item, original, entrega/retirada e pagamento na entrega. Não usar simulador como se fosse sandbox.
6. Aprovação separada de deploy/ativação. `dispatched` é enfileirado, não ACK A&S.

## Referência A&S observada — 31/10/2026

Fonte: inspeção DOM/UI comunicada pelo coordenador após salvar e reler o Kanban. **Observado na UI, não homologado em integração.** Funil de preparação13443, vazio e não padrão; original2143 permanece padrão/intacto. Não usar esta tabela como configuração automática.

| Chave candidata | Etapa | ID observado |
|---|---|---|
| triage | Triagem | 95172 |
| — (qualificação A&S) | Consulta e Orçamento | 95173 |
| confirmed | Confirmação do Pedido | 95174 |
| awaiting_payment | Aguardando Pagamento | 95175 |
| processing | Processamento e Separação | 95176 |
| pickup_ready | Pronto para Retirada | 95177 |
| shipping | Em Entrega | 95178 |
| completed | Concluído | 95179 |
| lost (pré-pedido) | Perdido | 95180 |
| cancelled | Cancelado | 95181 |

Concluído marcado Ganho; Perdido marcado Perdido; Cancelado sem categoria financeira. Refund continua dimensão de pagamento. Nomes/flags da UI não implementam guardas operacionais. Configuração futura deve validar tenant + funil e pertencimento de cada stage ID antes de entregar mapa à função pura. Nenhuma configuração executável ou transporte foi adicionado.
