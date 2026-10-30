# Migração IBS/CBS por produto

Página `/admin/migracao-tributaria`, exclusivamente administrativa, Remédio Mais,
Campina Grande/PB, balcão/site/delivery. Simulação informativa: não escreve dados,
não altera checkout, NF-e, ERP, Trier, schema ou políticas de acesso.

## Catálogo e classificação

Carrega `products` em páginas de 500, ordenadas por ID, até a última página.
Falha de qualquer página rejeita a carga inteira; nenhum total parcial é publicado.
Busca por nome, código de barras, SKU ou NCM abrange todos os itens carregados;
mostra até 50 resultados por busca. Contagens não dependem desse limite visual.

Cada produto tem uma classificação própria. NCM de oito dígitos é obrigatório;
3003/3004 e flags de medicamento identificam candidatos. Conflitos entre flags e
NCM bloqueiam o cálculo. Não medicamento exige confirmação `is_medicine=false`.
CEST 13 válido em medicamento identifica ST; nos demais casos exige `icms_st`
explícito. Lista fiscal positiva/negativa implica monofásico; neutra implica não
monofásico. `monofasico` explícito conflitante bloqueia. Medicamento exige decisão
explícita `art146_zero=true/false`; diagnóstico, nome, tarja e princípio ativo não
atribuem automaticamente alíquota zero.

**Limitação real do catálogo:** o schema versionado de `products` não tem NCM,
CEST, monofásico, lista fiscal, `is_medicine`, ST nem art. 146. `medicine_list_type`
é mapeado pelo Trier para tarja/controle de receita, não lista fiscal positiva,
negativa ou neutra. Nunca é usado como prova de monofasia. Assim, os registros
atuais sem evidência ficam em revisão, sem taxas inventadas. Esta entrega não
faz migração de dados nem reescreve Trier. A cobertura real só se completa quando
uma fonte fiscal validada disponibilizar esses campos no catálogo; isso exige
trabalho de dados separado. A interface não apresenta fixtures ou taxas padrão
como se fossem dados de produção.

## Hipóteses numéricas

Parâmetros solicitados para estudo, sujeitos à validação contábil; não representam
um motor fiscal legal completo. Preço final informado é a base simplificada de
cada percentual, em centavos; arredondamento separado por tributo. Não modela
bases legais distintas, créditos, tarifas, frete, benefícios não classificados ou
custos tributários embutidos na aquisição. Não usar os resultados para emissão.

| Cenário | Regras |
| --- | --- |
| Hoje | ICMS saída 0% para ST, senão 20%; PIS/COFINS monofásico 0%, senão 3,65% Presumido ou 9,25% Real, editável |
| 2026 teste | CBS 0,9% + IBS 0,1%, somente destaque informativo, sem adicionar ao preço |
| 2027 | CBS referência 11,2% (11,3 menos 0,1); medicamento reduzido 4,48%; IBS 0,1% ou 0,04% para medicamento (editável); art. 146 confirmado zera CBS/IBS; ICMS aplicável permanece |
| Split Payment | Percentual editável de 0 a 100% do IBS/CBS de 2027 segregado na liquidação; padrão hipotético 100%; não inclui ICMS na segregação |

Os cards Hoje/2027 chamam de retido/reservado o imposto estimado, sem afirmar
que já existe retenção bancária hoje. Split Payment mostra retenção efetiva **na
hipótese de liquidação simulada**, líquido na conta e saldo tributário a reservar.
Não é imposto adicional: lucro de 2027 e de Split Payment é o mesmo. ICMS e
parcela IBS/CBS não segregada ainda precisam ser reservados após o recebimento.

## Margem, alertas e macro

Custo unitário manual nunca é presumido zero. Para preço P, custo C e tributo T:
lucro antes de imposto = P − C; lucro após = P − C − T; margem = lucro/P.
Imposto consumindo lucro = T/(P − C), indefinido se denominador não positivo.
Preço zero não calcula percentuais de margem. Prejuízo produz alerta.
Preço teórico para preservar lucro atual = (C + lucro atual)/(1 − taxa futura),
arredondado para cima em centavos; é aproximação pela taxa, não sugestão comercial
ou garantia após arredondamento fiscal por componente.

Mudança de taxa usa **pontos percentuais**, inclusive quando hoje é zero (não há
variação relativa definida). Card alerta informa direção e impacto no lucro por
venda. Filtro global permite localizar todos os itens com mudança sem abrir cada
produto. Revisões ficam explicitamente contadas no topo.

Resumo no topo: total carregado, classificados, revisões, mudanças e média simples
por item classificado hoje/2027. Não é média ponderada por faturamento. Pendentes
não entram como taxa zero; com pendências a média é rotulada parcial e a média do
catálogo inteiro é declarada não confiável. Sem classificados, fica indisponível.

## Interface e verificação

Vite/React, npm (lockfile/CI), Tailwind 3, shadcn default/Radix, ícones Lucide,
alias `@`. Reutiliza Card, Alert, Badge, Button, Checkbox, Input, Label, Select e
Progress locais. Registry oficial consultado com `info`, `search`, `docs`, `view`;
nenhum componente instalado ou sobrescrito, nenhuma dependência nova.

Testes cobrem 4.501 produtos em dez páginas, falha de página intermediária,
classificação ausente/conflitante, regimes, neutra, zero art. 146, redução IBS,
ICMS mantido em 2027, Split Payment parcial, margem, busca/seleção, três cenários,
resumo, falha/retry/vazio, permissões e persistência do checklist por administrador.
Fixtures são exclusivas dos testes. Contagens reais dependem de sessão admin e
fonte fiscal; não se declara cobertura fiscal completa sem dados reais.

## Flag, armazenamento e reversão

`VITE_TAX_MIGRATION_PREVIEW`: `demo` padrão; `off`/inválido oculta/redireciona;
`effective` só altera o modo de interface após 01/01/2027 00h Brasília. Nenhuma
flag habilita cobrança. Checklist local por `remedio-mais:tax-migration:v1:<admin>`;
leitura inválida bloqueia marcações e permite retry; erro de escrita não marca
sucesso. Parâmetros/custo são transitórios, não alteram cadastros.
Reversão por commit ou flag `off`, sem migração de banco.

## Fontes oficiais e limites

- [LC 214 compilada, incluindo alterações da LC 227/2026](https://presidencia.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm): arts. 31–35 (liquidação), 133 e 146 (medicamentos).
- [Ministério da Fazenda — textos legais](https://www.gov.br/fazenda/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria/regulamentacao-da-reforma-tributaria/lei-geral-do-ibs-da-cbs-e-do-imposto-seletivo/textos-legais/textos-legais).

Percentuais de referência e parâmetros PB acima são as premissas de estudo
solicitadas, não alíquotas definitivas atribuídas pela lei a todo o catálogo.
