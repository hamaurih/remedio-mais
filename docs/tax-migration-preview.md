# Migração IBS/CBS

Página administrativa: `/admin/migracao-tributaria`, no grupo Financeiro.
Reutiliza o layout ERP e os componentes shadcn locais: Card, Alert, Badge,
Button, Checkbox, Input, Label e Progress. Não instala componentes ou dependências.

## Flag de interface

`tax_migration_preview` lê `VITE_TAX_MIGRATION_PREVIEW` no build Vite:

| Valor | Comportamento |
| --- | --- |
| `demo` (padrão) | Exibe a página em demonstração, inclusive depois de 2026. |
| `off` | Oculta o link e redireciona o acesso direto para `/admin`. |
| `effective` | Demonstração até 01/01/2027, 00h de Brasília; depois, rótulo “Efetivo (somente UI)”. |

Valores desconhecidos desativam a página. A flag nunca autoriza nem implementa
cobrança, emissão de NF-e, alteração do checkout ou sincronização ERP.
Uma eventual implementação fiscal exige um projeto separado e validação contábil.

## Cálculo e armazenamento

Valores são calculados em centavos, com arredondamento por tributo. O preço
aceita vírgula ou ponto decimal e até duas casas, sem separador de milhar.
Em 2026, CBS de 0,9% e IBS de 0,1% aparecem como destaque informativo, sem
repasse. Em 2027, o cenário soma 11,3% ao preço base, como hipótese de repasse
integral da referência TCU de 28/10/2026, sujeita a resolução do Senado.
Não calcula a carga fiscal definitiva, IBS de 2027, créditos, substituição de
PIS/Cofins ou tratamentos específicos de medicamentos. As fontes oficiais estão
vinculadas na página.

O checklist usa `remedio-mais:tax-migration:v1:<id-do-admin>` no localStorage.
Não sincroniza entre navegadores. Falhas de leitura bloqueiam as marcações e
oferecem nova tentativa; falhas de escrita não exibem confirmação falsa.
Marcar itens documenta a preparação e não executa ações fiscais.

## Superfície e reversão

Nos arquivos existentes, somente se acrescentam a importação/rota em `App.tsx`
e a importação/entrada de navegação em `AdminLayout.tsx`. Nenhuma integração,
regra de acesso existente, migração Supabase ou configuração de implantação muda.
Para ocultar a funcionalidade, usar `off` em um novo build; para remover o
acréscimo, reverter o commit da feature.
