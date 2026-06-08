import { LegalPage } from "@/components/LegalPage";

export default function Returns() {
  return (
    <LegalPage title="Trocas e Devoluções">
      <p>
        Em conformidade com o Código de Defesa do Consumidor e com a regulamentação sanitária da ANVISA, as trocas e
        devoluções na Farmácia Atacadão dos Medicamentos seguem as regras abaixo.
      </p>
      <h2 className="text-xl font-bold mt-6">Direito de arrependimento</h2>
      <p>
        Para compras realizadas pelo site, você tem até 7 (sete) dias corridos, a partir do recebimento, para desistir do
        pedido. O produto deve estar lacrado, sem indícios de uso e na embalagem original.
      </p>
      <h2 className="text-xl font-bold mt-6">Produtos não devolvíveis</h2>
      <p>
        Por força de regulamentação sanitária, <strong>medicamentos e produtos termolábeis não podem ser devolvidos após o
        recebimento</strong>, exceto em caso de defeito comprovado, prazo de validade vencido ou divergência entre o produto
        entregue e o pedido.
      </p>
      <h2 className="text-xl font-bold mt-6">Troca por defeito ou divergência</h2>
      <p>
        Caso receba um produto com avaria, validade vencida ou diferente do pedido, entre em contato em até 7 dias úteis
        pelos canais de atendimento. A troca será realizada após análise.
      </p>
      <h2 className="text-xl font-bold mt-6">Como solicitar</h2>
      <p>
        Entre em contato pelo WhatsApp ou pelo e-mail informados na página de contato, com o número do pedido e fotos do
        produto. Nossa equipe orientará os próximos passos.
      </p>
    </LegalPage>
  );
}
