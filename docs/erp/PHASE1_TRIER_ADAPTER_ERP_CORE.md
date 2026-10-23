# ERP Core — Fase 1: Trier Adapter + Contratos Centrais

## Objetivo

Criar a fundação técnica do ERP sem substituir qualquer fluxo produtivo atual.

## Decisão

O Trier continua como dependência transitória. O novo ERP não deve espalhar chamadas Trier por Site, PDV ou IA.

A arquitetura alvo desta fase é:

```text
Site / PDV / WhatsApp-IA
          |
          v
       ERP Core
          |
          v
     Trier Adapter
          |
          v
        Trier
```

No futuro o adaptador pode ser removido/trocado por repositórios nativos do ERP sem reescrever os canais.

## Entregas desta fase

1. Contratos centrais de:
   - canal de venda;
   - produto;
   - preço por canal;
   - estoque;
   - pedido;
   - estado de integração.

2. Pricing engine genérica:
   - site;
   - PDV;
   - IA/WhatsApp;
   - telefone;
   - B2B/marketplace com política inicialmente equivalente ao site.

3. Trier Adapter server-side:
   - produto por código;
   - paginação de produtos;
   - vendedor;
   - cartão;
   - envio de venda e-commerce;
   - retry apenas para falhas transitórias;
   - timeout;
   - token recebido por configuração e nunca exposto ao cliente.

4. Testes sem rede real.

## Regras de segurança

- O adapter fica sob `supabase/functions/_shared/erp`, isto é, server-side.
- Nenhuma variável `VITE_*` contém token Trier.
- Nenhuma função produtiva é migrada para o adapter nesta entrega.
- Nenhum pedido real passa pelo adapter novo.
- Nenhuma tabela de produção é alterada nesta entrega.

## Compatibilidade com o legado

O ERP Core reconhece os canais atuais:
- `site`
- `pdv` / `balcao`
- `whatsapp`
- `source=ia`

e os normaliza para o vocabulário canônico do ERP.

## Gate da Fase 1A

Antes de conectar qualquer função ativa:
- Vitest verde;
- Playwright verde;
- nenhum diff nas Edge Functions críticas;
- shadow mode planejado;
- PR permanece sem merge até revisão.
