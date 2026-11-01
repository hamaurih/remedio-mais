# Idempotência do checkout Pix/cartão — 01/11/2026

## Situação anterior
O checkout bloqueava clique duplo por instância React, mas reenvio da mesma intenção
após refresh, outra aba ou instabilidade de rede podia criar outro pedido e outra cobrança.

## Implementação versionada
1. O navegador calcula SHA-256 de uma intenção canônica (usuário, carrinho, total,
   modalidade, entrega e dados relevantes) somente em memória. Salva **apenas**
   o UUID aleatório da tentativa e o instante, sem número/CVV do cartão, CPF,
   endereço ou payload completo. Duração: 30 minutos; finalização confirmada
   apaga o identificador, permitindo nova compra legítima.
2. O servidor recebe `idempotency_key` UUID, resolve seu escopo autenticado por
   usuário e método de pagamento, e registra em `orders.external_idempotency_key`.
   Reutiliza o índice UNIQUE `orders_external_idempotency_unique` já existente;
   não requer migração nem modificação de estoque ou Trier.
3. O prepare-order consulta primeiro a chave antes de recalcular catálogo/estoque.
   Em disputa de INSERT 23505, recarrega o pedido já persistido e devolve `reused`.
   Isso protege a tentativa mesmo com mudanças posteriores de estoque/preço.
4. Os endpoints Pix e cartão, ao receber `reused`, **não chamam Cielo novamente**.
   Pix pode devolver QR pendente ainda válido; nos demais casos retorna HTTP 202
   com `order_id` para acompanhamento e conciliação. Cartão aprovado pode reexibir
   a aprovação anterior sem nova cobrança.
5. A rota de retorno e a tela de Pix encerram a tentativa apenas quando
   `payment_status=approved`; uma dúvida sobre a transação não limpa o UUID.

## Limites técnicos e release
- A unicidade durável protege a **mesma chave**, inclusive em chamadas simultâneas
  e reinícios de função. Múltiplos dispositivos criando tokens diferentes ainda
  podem ser reconhecidos como intenções independentes; para proteção global
  por cliente são necessárias regras explícitas de negócio contra falsa
  deduplicação de compras legítimas.
- Browsers sem storage seguro ficam fail-closed; não geram UUID novo silencioso.
- Compatibilidade: clientes antigos sem chave continuam no fluxo legado.
- A Cielo documenta bloqueio de duplicidade com condições específicas e não
  deve ser considerada como mecanismo principal de idempotência da loja.
- Deploy Edge deve ser em sequência, somente após CI e preview. **Não integrar
  produção só com code merge**, especialmente no cartão que teve deploy
  bloqueado por configurações de segurança.
- Operação de cartão precisa de teste controlado na Cielo, verificando
  aprovação/captura, persistência ERP, mensagens e envio ao Trier; não fazer
  cobranças fictícias em produção.
- A consulta Cielo por MerchantOrderId tem exigências sobre caracteres; legado
  usa UUID com hífens, e recuperação por essa chave necessita homologação própria.

## Casos de aceite
- Duplo clique e dois POSTs com mesma chave -> só um pedido/cobrança.
- Timeout na cobrança -> pedido em revisão, nova tentativa mesma chave não cobra.
- Pix pendente válido -> mesmo QR em reenvio.
- Mudança real de carrinho/total/método -> nova intenção.
- Pagamento confirmado -> cart e storage liberados para nova compra.
- Retorno webhook e reconciliação não regredirem estado final.
