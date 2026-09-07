# Diagnóstico somente leitura — recuperação das imagens antigas

Nenhuma alteração foi feita em código, banco, secrets ou configuração.

## O que foi verificado

- `rwzzhsrcvpcciuatudru.supabase.co` não resolve DNS hoje.
- `jzltdocmvvdlyaukwzix.supabase.co` resolve normalmente (é o backend usado pelo domínio oficial).
- `supabase/config.toml` deste projeto ainda aponta para `rwzzhsrcvpcciuatudru`.
- Consulta às integrações internas do Lovable: o backend vinculado a este projeto Lovable **é** `rwzzhsrcvpcciuatudru`, organização `wpczgwxsriezaubncuom`, instância "Tiny", gerenciado pelo Lovable.
- Estado atual desse backend: **pausado** (por isso o host não responde e o DNS não resolve). Não há indício de exclusão.

## Conclusão

O projeto antigo `rwzzhsrcvpcciuatudru` **não foi deletado** — ele continua existindo internamente e permanece o backend registrado para este projeto Lovable. Ele está apenas pausado/hibernado. Como Storage é armazenado junto ao projeto, os buckets `products` e `banners` e seus objetos, em princípio, continuam lá; enquanto estiver pausado é impossível listar ou baixar objetos (nenhum endpoint responde), então a contagem de objetos não pode ser confirmada agora.

O site publicado hoje aponta para `jzltdocmvvdlyaukwzix`, um projeto Supabase diferente (fixado no código do cliente para o domínio oficial). São dois bancos distintos: as 4.325 URLs preservadas referenciam o Storage do projeto pausado.

## Caminhos concretos de recuperação (nenhum executado)

1. **Retomar o backend pausado** (caminho principal, reversível): reativar `rwzzhsrcvpcciuatudru`. Assim que ele volta a ficar ativo, listar `storage.objects` dos buckets `products` e `banners` e confirmar a contagem real. Sem isso nada pode ser lido.
2. **Copiar os objetos para o projeto em uso**: com o projeto antigo ativo, baixar os objetos dos dois buckets e reenviá-los para os buckets equivalentes em `jzltdocmvvdlyaukwzix`, preservando os mesmos nomes de arquivo — assim as 4.325 URLs podem ser reescritas apenas trocando o host.
3. **Reescrita de URLs no banco atual**: depois da cópia, um update controlado nos produtos substituindo o host antigo pelo novo. Deve ser feito com backup e em lote verificável.
4. **Se algum objeto não existir mais após a retomada**: restaurar a partir de backup/point-in-time do projeto antigo, ou reobter as imagens da origem (Trier / fornecedor) para os produtos faltantes.
5. **Ponto de atenção**: enquanto o projeto antigo estiver pausado, ele pode ser sujeito a políticas de inatividade. A retomada deve ser priorizada antes de qualquer outra tentativa.

## Próximo passo que precisa da sua decisão

Autorizar a retomada do backend pausado `rwzzhsrcvpcciuatudru` — é a única forma de confirmar se as imagens ainda estão lá e de iniciar a cópia. Nada será feito sem sua aprovação.
