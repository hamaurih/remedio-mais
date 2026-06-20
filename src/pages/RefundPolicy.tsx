import { LegalPage } from "@/components/LegalPage";

export default function RefundPolicy() {
  return (
    <LegalPage title="Política de Reembolso">
      <p>
        Esta política descreve como tratamos cancelamentos e reembolsos quando algum produto comprado pelo site não puder ser
        entregue, total ou parcialmente.
      </p>

      <h2 className="text-xl font-bold mt-6">Indisponibilidade de produto</h2>
      <p>
        Se algum produto comprado não estiver disponível no momento da separação do pedido, nossa equipe poderá oferecer:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Substituição</strong> por um item equivalente, mediante aprovação prévia do cliente;</li>
        <li><strong>Cancelamento parcial</strong>, com reembolso apenas do item indisponível;</li>
        <li><strong>Cancelamento total</strong> do pedido, com reembolso integral.</li>
      </ul>

      <h2 className="text-xl font-bold mt-6">Como o reembolso é feito</h2>
      <p>
        Os reembolsos são processados pelo <strong>mesmo meio de pagamento</strong> utilizado na compra, sempre que tecnicamente
        possível. Pagamentos via Mercado Pago (Pix, cartão de crédito/débito ou boleto) seguem as regras e prazos do próprio
        Mercado Pago e da instituição financeira responsável.
      </p>

      <h2 className="text-xl font-bold mt-6">Reembolso parcial</h2>
      <p>
        No reembolso parcial, devolvemos apenas o valor correspondente ao(s) item(ns) indisponível(is). O restante do pedido
        segue normalmente para separação e entrega/retirada.
      </p>

      <h2 className="text-xl font-bold mt-6">Reembolso total</h2>
      <p>
        No reembolso total, devolvemos o valor integral pago, incluindo a taxa de entrega quando aplicável, e o pedido é
        cancelado.
      </p>

      <h2 className="text-xl font-bold mt-6">Prazos</h2>
      <p>
        O prazo de compensação varia conforme o meio de pagamento:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Pix:</strong> normalmente em até alguns minutos após a aprovação do estorno;</li>
        <li><strong>Cartão de crédito:</strong> a devolução aparece na próxima fatura ou na seguinte, conforme regras da operadora;</li>
        <li><strong>Boleto:</strong> reembolso por transferência, mediante dados bancários informados pelo cliente.</li>
      </ul>

      <h2 className="text-xl font-bold mt-6">Direito de arrependimento</h2>
      <p>
        Compras online seguem o direito de arrependimento previsto no <strong>Código de Defesa do Consumidor (art. 49)</strong>:
        o cliente tem até 7 dias corridos, a partir do recebimento do produto, para desistir da compra, observadas as regras
        sanitárias aplicáveis a medicamentos descritas na nossa página de Trocas e Devoluções.
      </p>

      <h2 className="text-xl font-bold mt-6">Como acompanhar</h2>
      <p>
        Após a abertura de uma solicitação de reembolso, o status fica disponível na área do pedido. Você também pode falar com a
        farmácia pelos canais de atendimento informados no rodapé.
      </p>
    </LegalPage>
  );
}
