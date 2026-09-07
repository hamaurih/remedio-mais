# Diagnóstico — backend antigo rwzzhsrcvpcciuatudru (somente leitura)

## Resultado das verificações (nada foi alterado)

- `supabase--project_info`: o projeto rwzzhsrcvpcciuatudru **existe, é gerenciado pelo Lovable Cloud e está marcado como não pausado** (instância Tiny, Live/prod = este ref).
- `supabase--cloud_status`: ainda responde que o backend está **pausado**.
- `supabase--read_query` em `storage.objects`: falhou 3 vezes — "pooler indisponível, provavelmente pausado ou acordando".

Ou seja: o conector habilitou `enable_database` (enabled=true), e o projeto consta como ativo nos metadados, mas o banco ainda não voltou a responder. É o estado típico de "acordando" após despause.

## Próximo passo

1. Aguardar alguns minutos e repetir apenas leituras:
   - `SELECT bucket_id, COUNT(*) FROM storage.objects GROUP BY bucket_id` (foco em `products` e `banners`).
2. Se continuar pausado após ~10 minutos, pedir ao usuário para abrir o painel do backend do projeto (View Backend) e confirmar/acionar a retomada.
3. Quando o banco responder: informar contagens por bucket e confirmar se os objetos dos buckets `products` e `banners` estão acessíveis, para então planejar a cópia das imagens para o backend atual.

Nenhuma alteração de código, dados ou configuração será feita em nenhuma etapa deste diagnóstico.
