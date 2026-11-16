# API externa de vendas — fontes e limites (16/11/2026)

A especificação integral do Grupo Fox está preservada em `api-vendas-grupo-fox-especificacao-2026-11-16.txt`. A ampliação mantém `/sales` e acrescenta `/sales/orders` e `/sales/history`, com escopo financeiro separado e projeções sem dados de compradores.

A documentação oficial de gerenciamento de vendas descreve `order.date_created.from`, `order.date_created.to`, `order.status` e ordenação por data. Informa retenção atual de pedidos de até doze meses e limitações na visibilidade de cancelamentos ao pesquisar como vendedor. Isso não é garantia de início da conta, disponibilidade perpétua ou cobertura de pedidos ocultos. [1]

O Mercato já guarda fotografias importadas de operações em `sales_margin_reports`, não um arquivo permanente de todos os pedidos da loja. As novas rotas não criam tabelas ou automações de arquivamento. Um relatório esparso não comprova cobertura contínua entre sua primeira e última data. Referências externas sem vínculo a pedido verificado não viram IDs ML presumidos.

O relatório Por venda e o relatório Por liberação têm datas e objetivos diferentes. A conciliação não deve confundir data do evento, pagamento, geração do arquivo e criação da venda. [2]

`FEE_AMOUNT` e `TAXES_AMOUNT` não têm o mesmo significado. `TAX_DETAIL` e `TAXES_DISAGGREGATED` documentados pelo Mercado Pago só podem ser projetados quando recebidos em formato reconhecido; não se publicam objetos JSON arbitrários nem se presume a discriminação completa de tributos. [3]

No histórico, a permissão `vendas:read` cobre as métricas comerciais. Valores financeiros exigem também `vendas-detalhe:read`; sem ele, permanecem nulos para impedir que um filtro de um pedido contorne a proteção do detalhe. Não há promoção automática de escopos da chave atual.

## Referências

[1]: https://developers.mercadolibre.com.ni/en_us/custom-shipping/manage-sales "Mercado Libre Developers — Manage sales"
[2]: https://vendedores.mercadolivre.com.br/aprender/nota/como-conciliar-usando-os-relatorios-de-venda-e-liberacao-de-dinheiro "Mercado Livre — Conciliação por venda e por liberação"
[3]: https://www.mercadopago.com.br/developers/pt/docs/reports/account-money/report-fields "Mercado Pago — Campos do relatório dinheiro em conta"
