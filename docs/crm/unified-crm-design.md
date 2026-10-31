# CRM unificado — projeção administrativa revisável

Decisão técnica: reutilizar a tela Clientes, pedidos e CustomerPurchaseInsights. O ERP é fonte de verdade; não criar outro cadastro, pedido ou negócio persistido. A primeira fatia é **somente leitura**, desligada por padrão (`VITE_UNIFIED_CRM_PREVIEW=true` habilita explicitamente no build). Não representa sincronização A&S ativa nem importa leads ainda não vinculados a pedidos.

## Comportamento
- Admin vê pedidos de todos os canais disponíveis na tabela orders, com busca e filtros; clientes são identificados somente por user_id, convidados permanecem separados por pedido (nunca fusão automática por telefone).
- Origem, fase comercial derivada, pagamento, receita original/pendências por item e logística aparecem separadamente. Não alterar preço, estoque, receita, status ou elegibilidade Trier.
- Análise reutilizada recebe apenas pedidos do mesmo user_id confirmado (ou apenas o próprio pedido convidado), evitando fusão por identificador fraco do helper legado.
- Lista paginada informa explicitamente a janela e não apresenta métricas como histórico completo.
- Não gerar oportunidades artificiais: acesso à análise existente mostra oportunidades factuais de recompra da janela; leads A&S não importados ficam explicitamente fora desta fatia.

## Contrato candidato (não conectado)
Função pura decide intenção de estágio por snapshot ERP completo, versão crescente por pedido, event_id único por ocorrência, tenant, pedido e conversation_id correlacionados. Eventos isolados de receita não devem regredir estágio. Duplicata, versão antiga, origem A&S e correlação incompatível são ignoradas. Não há transporte, persistência de dedupe, worker, ack ou replay nesta entrega.

Mapeamento stage IDs é configuração obrigatória e validada; nenhum ID de cliente é embutido. Receita é transversal; cobrança não implica receita original validada; pagamento na entrega não depende de aprovação antecipada; pickup_ready tem estágio dedicado antes conclusão. Status desconhecido não vira Triagem silenciosamente.

## Limites e gates
PRs #53–63 estão abertos e preparam serviços/order command; esta fatia evita tocar seus contratos, migrations e funções. Antes de ligar integração: reconciliar deploy/projeto das ferramentas, autenticação e tenant, correlação A&S, payload completo por item, contador transacional monotônico, dedupe persistente, ack de aplicação (pg_net dispatched não é ack), retentativa e reconciliação, teste de retirada e receita. Backend legado create-whatsapp-order incompleto não é corrigido aqui. Nenhuma chamada a endpoint real.
