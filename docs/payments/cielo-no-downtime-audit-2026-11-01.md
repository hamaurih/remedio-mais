# Auditoria de pagamento Cielo — ajuste sem indisponibilidade (01/11/2026)

## Objetivo
Preservar atendimento normal do site, Pix e cartão. Nenhuma cobrança automática é gerada para testar produção.

## Erros corrigidos no código
- A função Pix e a função cartão tinham `saveError.code` acessado sem verificar `saveError`. Em atualização sem retorno de linha e sem erro, a referência nula disparava exceção **após** a Cielo responder. Corrigido com `saveError?.code` e status seguro de conciliação.
- Resposta da Cielo com corpo ilegível/incompleto deve manter o pedido em `payment_review`, nunca induzir uma nova cobrança.
- Pix HTTP 408, 429 ou 5xx não equivale a pagamento recusado. É classificado como resultado incerto e exige consulta/conciliação.
- Cartão: após recusa 4xx, somente uma recusa **persistida com êxito no ERP** habilita o cliente a reiniciar a intenção e tentar novamente. Timeout ou captura indefinida preserva o identificador anterior.

## Evidência anterior à alteração
No banco de produção, nas 48 horas auditadas: 15 Pix e 4 cartões aprovados, nenhum aprovado sem referência Cielo, data de pagamento ou status `pago`. O site tinha deployment Vercel READY e idempotência global OFF.

## Riscos que permanecem
- O `MerchantOrderId` enviado à Cielo hoje é UUID com hífens, enquanto a documentação de consulta determina caracteres alfanuméricos. Uma mudança nesse campo exige atualização coordenada de webhook, consulta e testes de compatibilidade com pedidos anteriores. **Não alterar no mesmo release da idempotência**, para não interromper confirmação de pagamentos atuais.
- A proteção de idempotência exige **ambos** os Edge Functions com o helper novo e o `VITE_CIELO_CHECKOUT_IDEMPOTENCY` habilitado. Sem isso, permanece OFF, mesmo que a proteção de persistência esteja ativa.
- O índice UNIQUE garante uma cobrança por *chave*; múltiplos dispositivos sem a mesma chave não estão abrangidos.
- Não é possível garantir disponibilidade absoluta de Cielo, rede, Supabase e dispositivos dos clientes.
- Homologar um caso de cartão recusado/capturado e Pix com credenciais de teste **em sandbox isolado**, sem registrar pedidos de teste em produção.

## Rollout seguro
1. Validar Vitest + Playwright, Vercel preview e diff.
2. Publicar a camada web sem mudar flag; obter status READY.
3. Atualizar Edge Functions isoladamente e conferir o código da versão ACTIVE em cada uma. Não publicar funções concorrentes.
4. Verificar boot, erros, último lote de pedidos e taxa de aprovação. Caso falha, devolver bundle da versão anterior.
5. Somente após o ponto 3 e teste controlado, ativar flag e repetir smoke tests.
6. Qualquer bloqueio de permissão ou segurança interrompe a implantação; não tentar caminhos alternativos para contorná-lo.

## Referências oficiais
- Consulta MerchantOrderId: https://docs.cielo.com.br/ecommerce-cielo/reference/consulta-merchantorderid-api
- Consulta PaymentId: https://docs.cielo.com.br/ecommerce-cielo/reference/consulta-paymentid-api
- Implantação individual de Edge Function: https://supabase.com/docs/guides/functions/deploy
