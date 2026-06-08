import { LegalPage } from "@/components/LegalPage";

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        A Farmácia Atacadão dos Medicamentos respeita a sua privacidade e está comprometida com a proteção dos dados pessoais
        que coleta, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
      </p>
      <h2 className="text-xl font-bold mt-6">Dados que coletamos</h2>
      <ul className="list-disc pl-5">
        <li>Dados de cadastro: nome, e-mail, telefone, CPF e endereço de entrega.</li>
        <li>Dados de pedido: produtos adquiridos, valor, forma de pagamento e histórico de compras.</li>
        <li>Receitas médicas enviadas para análise farmacêutica de medicamentos controlados.</li>
        <li>Dados de navegação: cookies e identificadores para melhorar a experiência no site.</li>
      </ul>
      <h2 className="text-xl font-bold mt-6">Como usamos seus dados</h2>
      <p>
        Utilizamos seus dados para processar pedidos, emitir notas fiscais, realizar entregas, prestar atendimento, cumprir
        obrigações legais e regulatórias (ANVISA, CFF) e melhorar nossos serviços.
      </p>
      <h2 className="text-xl font-bold mt-6">Compartilhamento</h2>
      <p>
        Compartilhamos seus dados apenas com prestadores essenciais para a operação (processadora de pagamento, transportadora)
        e com órgãos públicos quando exigido por lei.
      </p>
      <h2 className="text-xl font-bold mt-6">Seus direitos</h2>
      <p>
        Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados a qualquer momento, entrando em contato
        pelos nossos canais de atendimento.
      </p>
    </LegalPage>
  );
}
