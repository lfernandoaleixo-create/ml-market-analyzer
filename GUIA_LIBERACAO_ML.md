# Guia: Liberar acesso a preços e vendas na API do Mercado Livre

Este guia explica **por que** os preços e a quantidade de vendas de alguns produtos aparecem como "sob consulta" na plataforma Mercato, e **como solicitar a liberação** desses dados junto ao Mercado Livre.

---

## 1. Resumo da situação

A plataforma já está **conectada à API oficial do Mercado Livre** via OAuth (você autorizou e o status aparece como "Conectado / Ao Vivo"). Com isso, os seguintes dados **já chegam reais**:

| Dado | Status atual |
|---|---|
| Nomes e títulos dos produtos | Real (ao vivo) |
| Imagens dos produtos | Real (ao vivo) |
| Marca / atributos | Real (ao vivo) |
| Ranking de mais vendidos por categoria | Real (ao vivo) |
| Tendências de busca (termos em alta) | Real (ao vivo) |
| Lista de categorias | Real (ao vivo) |
| **Preço de cada produto** | **Bloqueado para parte dos produtos** |
| **Quantidade de vendas** | **Bloqueado** |
| **Avaliações / notas** | **Bloqueado** |

O motivo é uma mudança de política do Mercado Livre (em vigor desde 2025): os **endpoints de anúncios e de busca de itens** — que contêm preço, vendas e avaliações — passaram a exigir uma **autorização extra** que não é concedida automaticamente para aplicações "não certificadas".

Tecnicamente, a aplicação recebe:

- `GET /items/{id}` e `GET /items?ids=...` → **403 access_denied**
- `GET /sites/MLB/search` (busca de anúncios) → **403 Forbidden** (endpoint descontinuado para apps novas)
- `GET /products/{id}/items` (ofertas de um produto do catálogo) → **404 "No winners found"** para a maioria dos produtos que não têm uma oferta "vencedora" (buy box)

Isso **não é um defeito da plataforma** — é uma restrição imposta pelo Mercado Livre. O mesmo problema foi relatado publicamente por outras empresas (inclusive com CNPJ e OAuth corretos) e a solução foi **abrir uma solicitação ao suporte de desenvolvedores do Mercado Livre** para liberar os escopos/endpoints.

---

## 2. O que você precisa solicitar

Você vai pedir ao Mercado Livre a **liberação de acesso aos endpoints de itens e busca** para a sua aplicação (Client ID `1790005725650717` — "Mercato Market Intelligence"), incluindo:

- Acesso ao endpoint de **itens** (`/items`, `/items?ids=`) para leitura de preço, condição, frete e quantidade vendida;
- Acesso ao endpoint de **busca de anúncios** por palavra-chave / categoria / vendedor;
- Acesso aos dados de **avaliações** (reviews) dos produtos.

> Importante: o objetivo é **somente leitura** (read), para fins de inteligência de mercado e monitoramento de preços. Deixe isso claro — pedidos de leitura costumam ser mais simples de aprovar do que escrita.

---

## 3. Passo a passo

### Passo 1 — Reúna os dados da aplicação
- **Nome do app:** Mercato Market Intelligence
- **Client ID (App ID):** 1790005725650717
- **Conta vinculada:** sua conta Mercado Livre (a mesma que autorizou)
- **País / site:** Brasil (MLB)
- **Redirect URI cadastrado:** `https://mlmarketanl-kcmkt5tl.manus.space/api/oauth/ml/callback`

### Passo 2 — Acesse o canal de suporte a desenvolvedores
Há dois caminhos (use o que estiver disponível na sua conta):

1. **DevCenter → Suporte/Ajuda:** entre em https://developers.mercadolivre.com.br/, faça login com a sua conta, e procure por **"Suporte"**, **"Ajuda"** ou **"Contato"** (geralmente no topo ou rodapé). Algumas contas têm a opção de abrir um **ticket** diretamente.
2. **Central de Ajuda / Formulário de desenvolvedores:** caso não encontre o ticket no DevCenter, use a Central de Ajuda do Mercado Livre e selecione o tema relacionado a **"Desenvolvedores / API / Aplicações"**.

### Passo 3 — Abra a solicitação
Crie um novo chamado/ticket e cole o texto pronto da seção 4 abaixo (ajuste o que estiver entre colchetes).

### Passo 4 — Acompanhe a resposta
O Mercado Livre normalmente responde por e-mail ou pelo próprio painel de tickets. Pode pedir informações adicionais (ex.: descrição do uso, se haverá escrita, volume de chamadas). Responda com clareza, reforçando que é **uso de leitura para análise de mercado**.

### Passo 5 — Após a liberação
Assim que o Mercado Livre confirmar a liberação, **me avise**. Não é preciso reconfigurar nada do seu lado: a plataforma já está preparada para puxar preço/vendas automaticamente assim que os endpoints responderem. Eu faço um teste rápido para confirmar que os preços passaram a aparecer.

---

## 4. Texto pronto para a solicitação

> **Assunto:** Solicitação de liberação de acesso aos endpoints de itens e busca para aplicação (Client ID 1790005725650717)
>
> Olá, equipe de Desenvolvedores do Mercado Livre.
>
> Sou responsável pela aplicação **"Mercato Market Intelligence"** (Client ID **1790005725650717**), integrada via OAuth 2.0 (Authorization Code + offline_access) e devidamente autorizada pela minha conta. A integração está funcionando para os endpoints de catálogo (`/products/search`), categorias (`/sites/MLB/categories`), tendências (`/trends/MLB`) e destaques (`/highlights/MLB/...`).
>
> No entanto, ao tentar acessar dados de **preço, quantidade vendida e avaliações** dos anúncios, recebo os seguintes erros mesmo com token de usuário válido:
>
> - `GET /items/{id}` e `GET /items?ids=...` → **403 access_denied**
> - `GET /sites/MLB/search` → **403 Forbidden**
> - `GET /products/{id}/items` → **404 "No winners found"** para a maioria dos produtos
>
> Gostaria de solicitar a **liberação de acesso (somente leitura)** aos endpoints de **itens** e de **busca de anúncios**, bem como aos dados de **avaliações**, para a minha aplicação.
>
> **Finalidade:** ferramenta interna de **inteligência de mercado e monitoramento de preços** (acompanhar variação de preços, ranking de mais vendidos e tendências para apoio à decisão comercial). O uso é exclusivamente de **leitura**, sem operações de escrita na conta de terceiros.
>
> **Dados da aplicação:**
> - Nome: Mercato Market Intelligence
> - Client ID: 1790005725650717
> - Site: Brasil (MLB)
> - Redirect URI: https://mlmarketanl-kcmkt5tl.manus.space/api/oauth/ml/callback
> - Conta responsável: [seu nome / e-mail / CNPJ se aplicável]
>
> Caso seja necessário algum processo de **certificação** da aplicação ou o preenchimento de formulário específico, por favor me orientem sobre os passos.
>
> Agradeço desde já.
> [Seu nome]
> [Seu e-mail e telefone de contato]

---

## 5. Observações importantes

- **Tenha um CNPJ/empresa à mão (se possível).** Solicitações de acesso a dados de itens costumam ser aprovadas com mais facilidade para contas com cadastro de empresa, pois o ML trata isso como uso comercial.
- **Enfatize "somente leitura".** Pedir escrita (criar/editar anúncios, pagamentos) aciona uma análise mais rigorosa. Para a Mercato, só precisamos de leitura.
- **O prazo de resposta varia.** Pode levar de alguns dias a algumas semanas, dependendo do volume de análise do ML.
- **Enquanto não liberam:** a plataforma continua 100% funcional com os dados reais de catálogo, ranking, tendências e categorias. Os produtos sem preço aparecem como **"Preço sob consulta"** com um link **"Ver no Mercado Livre"**, sem nenhum dado inventado.

---

## 6. Alternativa (se a liberação demorar ou for negada)

Se o Mercado Livre não liberar os endpoints de itens, ainda é possível obter preços de forma complementar, com algumas ressalvas:

- **Catálogo com buy box:** parte dos produtos (geralmente os mais populares, como eletrônicos) **já retorna preço** pelo endpoint de ofertas do catálogo — esses já aparecem com preço hoje.
- **Foco em ranking e tendências:** a plataforma pode priorizar a inteligência que já temos liberada (mais vendidos, termos em alta, demanda por categoria), que é altamente acionável para decisão comercial mesmo sem o preço de cada anúncio.

Se quiser seguir por uma dessas alternativas em vez de esperar a liberação, me avise que eu ajusto a plataforma para destacar ainda mais esses dados.
