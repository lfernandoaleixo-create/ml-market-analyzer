# Inteligência de Concorrentes — Proposta Técnica (Caminho B)

**Documento para decisão (apresentação ao sócio)**
Projeto: Mercato — Central de Gestão da Loja
Data: junho de 2026

---

## 1. O que queremos resolver

Hoje usamos o **AvantPro** para olhar concorrentes, mas ele tem duas limitações para uma operação que quer escalar:

1. **É passivo:** só mostra os dados dos anúncios que **você abre/navega** manualmente. Não faz uma varredura ativa do mercado.
2. **É uma ferramenta de terceiros, fora do nosso sistema:** os dados não se conectam aos *nossos* números (vendas reais, custos, margem, Ads), então não dá para cruzar "anúncio do concorrente X vs. minha margem real".

**O objetivo:** trazer a inteligência de concorrentes **para dentro do nosso painel**, de forma **ativa** (buscar os melhores anúncios que competem com os nossos, varrendo a categoria inteira) e **cruzada com os nossos dados reais**, para responder perguntas como:

> "Por que o concorrente com preço mais alto que o meu vende mais?"
> "Quais são os 10 anúncios mais fortes que competem com o meu produto X?"
> "Quando um concorrente baixa preço ou fica sem estoque?"

---

## 2. Por que NÃO dá para o nosso servidor "raspar" o ML diretamente (a verdade técnica)

| Aspecto | Extensão (AvantPro) | Nosso servidor raspando direto |
|---|---|---|
| De onde sai a requisição | Seu navegador, seu IP residencial, sua sessão logada | IP de datacenter (nuvem) |
| Como o ML enxerga | "O próprio usuário navegando" — indetectável | Robô óbvio — detectável e bloqueável |
| Risco para a conta/CNPJ | Praticamente nulo | **Alto: CAPTCHA, bloqueio de IP e risco de associação ao CNPJ** |

**Conclusão:** replicar o scraping "por dentro" do nosso servidor é frágil e **expõe a conta de vendedor**. Não é o caminho de uma operação séria.

---

## 3. A solução: API terceira de dados (Caminho B)

Em vez do nosso servidor raspar o ML (arriscado), **contratamos um fornecedor especializado** que já tem toda a infraestrutura de coleta (proxies residenciais, anti-bloqueio, escala). Nós apenas **chamamos a API deles** e recebemos os dados estruturados (JSON), que exibimos no nosso painel.

### Como funciona, na prática

```
Nosso painel  →  API do fornecedor  →  (fornecedor coleta no ML)  →  dados estruturados  →  Nosso painel
```

1. No nosso sistema, você pesquisa um produto ou seleciona um anúncio seu.
2. Nosso servidor chama a API do fornecedor (ex.: "me traga todos os vendedores deste produto").
3. O fornecedor retorna: preço de cada concorrente, volume de vendas histórico, reputação, tipo de envio (Full), parcelamento, etc.
4. Cruzamos com os SEUS dados (preço, margem, vendas) e geramos o **diagnóstico**.

### Por que é SEGURO para a sua conta

- **A coleta acontece na infraestrutura do fornecedor, não no seu IP nem no nosso servidor.** O Mercado Livre nunca vê o seu CNPJ ou o nosso app fazendo scraping.
- Para o ML, é o fornecedor (uma terceira parte, com milhões de requisições de muitos clientes) que acessa as páginas públicas — exatamente como fazem AvantPro, Nubimetrics, GoSmarter etc.
- **Não usamos o token oficial do ML para isso** (o token oficial continua só para os SEUS dados). Ou seja, não há risco de "queimar" o app oficial.

---

## 4. Fornecedores e valores (pesquisa de mercado — junho/2026)

O modelo de cobrança é por **crédito/consulta** (assinatura mensal com pacote de créditos). Cada consulta = alguns créditos.

| Fornecedor | Entrada (mensal) | Créditos inclusos | Observações |
|---|---|---|---|
| **Unwrangle** | a partir de **US$ 99/mês** (~R$ 550) | 100.000 créditos | API pronta para ML (vendedores, preço, vendas, reviews). 1 crédito por consulta. Planos maiores: US$ 249 (300k), US$ 499+ (750k), US$ 999+ (2M) |
| **Oxylabs** | sob consulta (geralmente a partir de ~US$ 99–199) | varia | Robusto, foco enterprise, proxies premium |
| **ScrapingBee** | a partir de ~US$ 49–99 | varia por créditos | Genérico, créditos gastam mais rápido em páginas pesadas |
| **Apify (MercadoLibre Scraper)** | pay-as-you-go | por uso | Flexível, custo por requisição/volume |

> **Recomendado para começar: Unwrangle.** Tem API específica de "vendedores do Mercado Livre" já testada (retorna preço, reputação e indicação de vendas — ex.: "+50 mil vendas"), cobrança transparente (1 crédito/consulta, sem cobrar requisição que falha) e entrada acessível.

### Quanto custa na prática (estimativa de uso)

Com o plano de **US$ 99 (100.000 créditos/mês)**:
- Monitorar **200 produtos seus**, varrendo concorrentes **2x por dia** = ~12.000 consultas/mês.
- Sobra folga enorme dentro de 100.000 créditos.
- **Ou seja: ~R$ 550/mês cobre uma operação robusta de monitoramento.** (O AvantPro custa na mesma faixa, mas é passivo e fora do sistema.)

---

## 5. O que conseguiremos entregar dentro do nosso painel

| Funcionalidade | Descrição |
|---|---|
| **Radar de concorrentes** | Para cada produto seu, listar os anúncios concorrentes mais fortes (preço, vendas, reputação, Full) |
| **Diagnóstico "por que ele vende mais"** | Comparativo automático: reputação, tipo de anúncio, Full, parcelamento, fotos, tempo de anúncio, posição — apontando os fatores além do preço |
| **Comparativo lado a lado** | Meu anúncio vs. concorrente, com os meus dados reais (margem inclusa) |
| **Alertas** | Avisar quando concorrente baixa preço, fica sem estoque ou te ultrapassa |
| **Histórico** | Evolução de preço/vendas do concorrente ao longo do tempo |

Diferencial sobre o AvantPro: **busca ativa** (não só o que você abre) + **cruzamento com seus números reais e margem** + **tudo num só sistema**.

---

## 6. Pontos de atenção / transparência (para alinhar com o sócio)

1. **Zona cinzenta dos Termos do ML:** scraping de dados públicos é uma prática amplamente usada no mercado (AvantPro, Nubimetrics, GoSmarter), mas tecnicamente está numa zona cinzenta dos Termos do Mercado Livre. No Caminho B, **o risco de coleta fica com o fornecedor**, não com a sua conta — mas vale a decisão consciente de usar inteligência de mercado, como já fazem com o AvantPro.
2. **Custo recorrente:** é uma assinatura mensal (a partir de ~R$ 550). Escala conforme o volume de monitoramento.
3. **Dependência de terceiro:** se o fornecedor mudar preço ou o ML mudar o site, pode haver ajustes. Mitigação: a arquitetura permite **trocar de fornecedor** sem refazer o painel.
4. **Dados de vendas são estimativas/faixas:** o ML não expõe número exato de vendas de terceiros; os fornecedores trazem faixas ("+50 mil", "+1000") ou estimativas — suficiente para comparação competitiva.

---

## 7. Recomendação final

**Adotar o Caminho B com a Unwrangle** (ou equivalente), começando no plano de entrada (~US$ 99/mês), integrando ao nosso painel um módulo de **Radar de Concorrentes + Diagnóstico**, mantendo a **API oficial do ML** para os nossos próprios dados (vendas, Ads, reputação).

Resultado: uma ferramenta **mais robusta e ativa que o AvantPro**, **segura para a conta** (coleta fora do nosso IP/CNPJ) e **integrada à nossa operação** (com margem e custos reais).

### Próximo passo para destravar
1. Decisão do sócio: aprovar o custo mensal da API.
2. Criar conta no fornecedor escolhido e gerar a **API key**.
3. Nos passar a chave (de forma segura) para integrarmos.
4. Implementamos o módulo de Radar de Concorrentes e validamos com produtos reais.
