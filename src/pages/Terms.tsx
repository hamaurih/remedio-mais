import { LegalPage } from "@/components/LegalPage";

export default function Terms() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes Termos regulam o uso do site da Farmácia Atacadão dos Medicamentos. Ao utilizar o site, você concorda com as
        condições abaixo.
      </p>
      <h2 className="text-xl font-bold mt-6">Cadastro e responsabilidade</h2>
      <p>
        As informações fornecidas no cadastro devem ser verdadeiras e atualizadas. O usuário é responsável pela guarda das
        credenciais de acesso à sua conta.
      </p>
      <h2 className="text-xl font-bold mt-6">Produtos e disponibilidade</h2>
      <p>
        As imagens dos produtos são meramente ilustrativas. Preços e promoções podem sofrer alterações sem aviso prévio.
        Os produtos estão sujeitos à disponibilidade de estoque.
      </p>
      <h2 className="text-xl font-bold mt-6">Medicamentos sob prescrição</h2>
      <p>
        A venda de medicamentos com exigência de receita ou de controle especial está sujeita à análise da receita pela
        equipe farmacêutica antes da liberação. A loja poderá cancelar pedidos cuja receita não atenda aos requisitos legais.
      </p>
      <h2 className="text-xl font-bold mt-6">Pagamentos</h2>
      <p>
        Os pagamentos são processados por intermediadores autorizados. Em caso de não aprovação, o pedido será cancelado
        automaticamente.
      </p>
      <h2 className="text-xl font-bold mt-6">Alterações</h2>
      <p>
        Estes Termos podem ser atualizados a qualquer momento. A versão vigente é sempre a publicada nesta página.
      </p>
    </LegalPage>
  );
}
