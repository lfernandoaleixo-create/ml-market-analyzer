# Texto pronto para solicitar liberação de endpoints ao Mercado Livre

> Use o texto da **Versão 1** para abrir o chamado no suporte/fórum de desenvolvedores. As demais versões servem como apoio (chat curto, resposta de follow-up e dados de referência).

---

## Dados da aplicação (tenha sempre em mãos)

| Campo | Valor |
|---|---|
| Nome do app | Mercato Market Intelligence |
| Client ID (App ID) | 1790005725650717 |
| Conta / Nickname | LOJADOSRWU |
| CNPJ | 36.562.762/0002-00 |
| Site | Brasil (MLB) |
| Redirect URI | https://mlmarketanl-kcmkt5tl.manus.space/api/oauth/ml/callback |
| Fluxos OAuth ativos | Authorization Code + Client Credentials + Refresh Token |
| Status atual | Aplicativo não certificado / pontuação de segurança travada em 70% |

---

## VERSÃO 1 — Chamado / ticket formal (copie e cole)

**Assunto:** Urgente – Liberação de acesso de leitura aos endpoints de itens e busca (App 1790005725650717, CNPJ 36.562.762/0002-00)

Olá, equipe de Desenvolvedores do Mercado Livre.

Sou responsável pela aplicação **"Mercato Market Intelligence"** (Client ID **1790005725650717**), vinculada à conta empresarial **LOJADOSRWU** (CNPJ **36.562.762/0002-00**). A integração OAuth 2.0 está **completa e funcional** (Authorization Code + Client Credentials + Refresh Token, com redirect URI validado), e já consigo consumir normalmente os endpoints de catálogo (`/products/search`), destaques/mais vendidos (`/highlights/MLB/...`), categorias (`/sites/MLB/categories`) e tendências (`/trends/MLB`).

Porém, estou **bloqueado** justamente nos endpoints que viabilizam o coração do nosso produto, mesmo com token de usuário válido:

- `GET /sites/MLB/search` → **403 forbidden**
- `GET /items/{id}` e `GET /items?ids=...` → **403 / 404**

A aplicação consta como **"não certificada"** e a **pontuação de segurança está travada em 70%**, sem indicação do que falta para concluí-la.

**Solicito, com urgência, a liberação de ACESSO DE LEITURA (read-only)** aos endpoints de **busca de anúncios** (`/sites/MLB/search`) e de **itens** (`/items`), bem como a orientação sobre o processo de **certificação** da aplicação. Não preciso de nenhuma permissão de escrita (não criamos, editamos nem pausamos anúncios de terceiros) — o uso é **estritamente de leitura** para inteligência de mercado.

**Por que é urgente para o nosso negócio:**
- Temos uma operação comercial ativa com CNPJ e a ferramenta já está **em produção**, sendo usada pela nossa equipe para decisões de **precificação e sortimento**.
- Sem o acesso de leitura à busca e aos itens, ficamos **impossibilitados de monitorar preços de mercado**, o que impacta diretamente a competitividade das nossas vendas **dentro do próprio Mercado Livre** (ou seja, é do interesse da plataforma que vendedores como nós precifiquem melhor).
- Estamos com **prazo de lançamento interno** e qualquer dia de atraso na liberação representa decisões comerciais tomadas "no escuro".

**Finalidade detalhada:** ferramenta interna de **inteligência de mercado e monitoramento de preços** — acompanhar variação de preços, ranking de mais vendidos e tendências de busca para apoiar a decisão comercial da nossa loja. Volume de chamadas baixo/moderado, respeitando os limites de rate da API.

**Dados da aplicação:**
- Nome: Mercato Market Intelligence
- Client ID: 1790005725650717
- Conta: LOJADOSRWU — CNPJ 36.562.762/0002-00
- Site: Brasil (MLB)
- Redirect URI: https://mlmarketanl-kcmkt5tl.manus.space/api/oauth/ml/callback

Caso exista um formulário específico de certificação ou um processo de aprovação, peço, por gentileza, que me enviem o passo a passo e o prazo estimado, para que possamos priorizá-lo imediatamente.

Agradeço a atenção e a urgência no retorno.

Atenciosamente,
[Seu nome completo]
[E-mail de contato] — [Telefone/WhatsApp]
Responsável pela conta LOJADOSRWU (CNPJ 36.562.762/0002-00)

---

## VERSÃO 2 — Mensagem curta para chat ao vivo / fórum (copie e cole)

Olá! Preciso de ajuda **urgente** com a app **Mercato Market Intelligence** (Client ID **1790005725650717**, conta **LOJADOSRWU**, CNPJ **36.562.762/0002-00**).

Minha integração OAuth está completa e funcional, mas recebo **403 forbidden** em `GET /sites/MLB/search` e **403/404** em `GET /items`. O app está como **"não certificado"** e a **segurança trava em 70%**.

Sou **vendedor com CNPJ** e a ferramenta (uso interno, **somente leitura**, para monitorar preços e me manter competitivo dentro do ML) já está em produção. **Como faço para certificar a aplicação e liberar o acesso de leitura à busca e aos itens?** Há um formulário ou processo? Qual o prazo? Obrigado pela urgência!

---

## VERSÃO 3 — Resposta caso peçam mais detalhes (copie e cole)

Obrigado pelo retorno. Seguem os detalhes solicitados:

- **Tipo de uso:** somente leitura (read-only). Não realizamos nenhuma operação de escrita (não publicamos, editamos, pausamos ou excluímos anúncios; não movimentamos pagamentos).
- **Endpoints necessários:** `GET /sites/MLB/search` (busca de anúncios por palavra-chave/categoria) e `GET /items` / `GET /items?ids=` (leitura de preço, condição, frete e disponibilidade).
- **Finalidade:** inteligência de mercado e monitoramento de preços para a nossa própria loja (LOJADOSRWU, CNPJ 36.562.762/0002-00), visando precificar de forma competitiva dentro do Mercado Livre.
- **Volume estimado:** baixo a moderado, respeitando os limites de rate-limit da API; com cache local para reduzir chamadas.
- **Segurança:** OAuth 2.0 com Authorization Code + Refresh Token; secrets armazenados de forma segura no servidor; redirect URI fixo e validado.

Permaneço à disposição para qualquer informação adicional necessária para a **certificação** e a **liberação dos endpoints**. Reforço o pedido de **prioridade**, pois a ferramenta já está em produção e o bloqueio impacta decisões comerciais diárias.

---

## Onde enviar (em ordem de rapidez)

1. **Fórum oficial de desenvolvedores** — link "Consultar Fórum" no rodapé do DevCenter (respostas de agentes/moderadores do ML).
2. **Suporte do DevCenter** — ícone do seu perfil (canto superior direito) → "Ajuda" / "Suporte" / "Contato".
3. **Central de atendimento da conta vendedor** — peça para ser direcionado ao **suporte de API / Desenvolvedores**, citando o Client ID.

## Dicas finais para acelerar
- Sempre cite **CNPJ + "somente leitura" + "já em produção"** — é a combinação que mais acelera.
- Anexe **prints dos erros 403** se o canal permitir.
- Se pedirem para preencher um formulário de certificação, responda no mesmo dia para não perder a fila.


---

# ATUALIZAÇÃO — Caminho recomendado pelo próprio ML (uso interno do lojista)

> O suporte do ML confirmou que, **para uso interno do próprio lojista, NÃO é necessário certificar** a aplicação. O caminho recomendado é **alinhar com o seu assessor de conta do Mercado Livre**. Em paralelo, vale deixar a candidatura ao **Developer Partner Program (DPP)** rodando (formulário, sem prazo definido).

## Canal 1 (PRIORITÁRIO e mais rápido) — Assessor de conta / Atendimento ao vendedor

Use este texto ao falar com o seu **assessor de conta** ou no chat de atendimento ao vendedor (peça para direcionar ao time de **API/Desenvolvedores**):

**Copie e cole:**

Olá! Sou vendedor com a conta **LOJADOSRWU** (CNPJ **36.562.762/0002-00**) e desenvolvi uma **ferramenta interna** para acompanhar preços e tendências e melhorar a minha precificação dentro do Mercado Livre.

A aplicação é a **"Mercato Market Intelligence"** (Client ID **1790005725650717**), com OAuth completo. Tudo funciona (catálogo, mais vendidos, categorias, tendências), **exceto** dois endpoints, que retornam **403 forbidden**:
- `GET /sites/MLB/search` (busca de anúncios)
- `GET /items` (leitura de preço/condição/frete de anúncios)

Como é **uso interno da minha própria loja** e **somente leitura** (não publico nem altero nada), gostaria de saber **como liberar o acesso de leitura** a esses endpoints para o meu Client ID. O suporte de desenvolvedores me orientou a alinhar isso com vocês (assessor de conta). Pode me ajudar a destravar ou me indicar o time correto? É algo que impacta minhas decisões de preço no dia a dia. Obrigado!

---

## Canal 2 (PARALELO, sem pressa) — Developer Partner Program (DPP)

1. Acesse o formulário de candidatura: **https://forms.gle/aCr148FSTW2P86316**
2. Preencha com os dados do app (use a tabela "Dados da aplicação" no topo deste documento).
3. Na descrição/finalidade, deixe claro:
   - **Uso comercial com CNPJ** (LOJADOSRWU, 36.562.762/0002-00);
   - **Somente leitura** (inteligência de mercado / monitoramento de preços);
   - App **já em produção**;
   - Endpoints necessários: `/sites/MLB/search` e `/items` (read-only).
4. Envie e **guarde o protocolo/confirmação**. Não há SLA divulgado, então trate como processo de fundo.

> Observação: como o ML disse que, para uso interno, **não é obrigatório certificar**, o **Canal 1 (assessor)** é o mais promissor. O DPP fica como reforço.

---

## Resumo dos limites (expectativa realista)

| Dado | Como obter | Depende de liberação? |
|---|---|---|
| Preço (mais vendidos/destaques) | Já disponível (90–100% via `/products/{id}/items`) | Não |
| Preço (busca livre por palavra) | Melhora muito após liberar `/sites/MLB/search` | Sim (assessor/DPP) |
| Ranking, tendências, categorias, catálogo | Já disponível | Não |
| Quantidade de vendas de concorrentes (`sold_quantity`) | Indisponível (dado "só do dono do anúncio") | Não há como (limite estrutural) |
