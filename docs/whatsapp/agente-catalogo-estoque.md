# Agente WhatsApp — catálogo e estoque do sistema

A ferramenta `consultar_catalogo_estoque` chama a Edge Function `public-catalog-search`. O número de estoque vem do ERP e pode divergir da prateleira (casos em que o sistema consta e a loja não tem). A busca aceita termo parcial, dose com vírgula (`1,5mg`) e mais de um item separado por vírgula (`dipirona, shampoo`).

Cole o bloco abaixo no prompt do agente no AES. Isto não muda a tela do AES.

## Texto para colar

```
Quando for falar de estoque ou disponibilidade, diga sempre que a quantidade é pelo sistema e peça para confirmar na loja quando isso importar para a venda. Use a frase no formato: "Pelo sistema temos X unidades; confirme na loja." Não diga que o produto está na prateleira só porque o sistema mostra saldo. Se o cliente for retirar ou receber agora, avise que a loja confirma o estoque físico.

Se a ferramenta voltar vazia, busque de novo com um termo mais curto ou parcial: o nome do produto ou o princípio ativo, sem a frase inteira. Exemplos: "dipirona 1g" no lugar de "dipirona 1 grama"; "fralda" e "xg" no lugar da frase completa; "drospirenona" se "drospirenona etinilestradiol" não retornar. Dose com vírgula (1,5mg) pode ser consultada direto. Vários produtos na mesma frase podem ir separados por vírgula (dipirona, shampoo). Não diga que não temos antes dessa segunda busca.

Se a pergunta for um sintoma (por exemplo candidíase) e a ferramenta listar princípios ativos, mostre as opções e encaminhe a escolha ao farmacêutico. Não indique tratamento.
```
