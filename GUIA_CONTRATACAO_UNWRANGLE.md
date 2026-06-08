# Guia de Contratação da Unwrangle + Arquitetura de Segurança

**Regra de ouro deste módulo:** a conta de vendedor do Mercado Livre (seu CNPJ) **NUNCA** é usada, citada ou exposta na coleta de dados de concorrentes. Total isolamento.

---

## PARTE 1 — Por que a sua conta ML fica 100% isolada (a garantia técnica)

O sistema terá **duas conexões completamente separadas**, que nunca se cruzam:

| Conexão | Para quê | O que usa | Toca sua conta ML? |
|---|---|---|---|
| **A) API Oficial do ML** | Seus dados (vendas, anúncios, Ads, reputação) | Seu token OAuth oficial | Sim — mas é leitura autorizada da SUA própria conta, 100% legítimo |
| **B) Unwrangle (Radar de Concorrentes)** | Dados públicos de concorrentes | API key da Unwrangle (conta separada) | **NÃO. Jamais.** |

**Pontos de segurança que vou garantir no código:**

1. A chamada à Unwrangle **nunca** envia seu token do ML, seu CNPJ, seu user_id, nem cookies da sua conta.
2. A Unwrangle coleta os dados públicos **a partir da infraestrutura DELES** (proxies residenciais deles). Para o Mercado Livre, quem acessa é a Unwrangle — não o nosso servidor, não o seu IP, não a sua conta.
3. As duas funções ficam em **módulos de código separados**, sem nenhuma ponte entre o token oficial e o cliente da Unwrangle.
4. A API key da Unwrangle fica guardada como **secret** (variável de ambiente protegida), nunca no código nem no frontend.

> Resultado: mesmo no pior cenário hipotético (a Unwrangle ser bloqueada pelo ML), **o bloqueio recai sobre a Unwrangle**, nunca sobre o seu CNPJ. Sua conta de vendedor permanece intocada.

---

## PARTE 2 — Como criar a conta na Unwrangle (passo a passo)

1. **Acesse:** https://www.unwrangle.com/
2. Clique em **"Sign Up"** / **"Get Started"** (canto superior direito).
3. Cadastre-se com um **e-mail da empresa** (sugestão: NÃO use o mesmo e-mail da sua conta de vendedor do ML — use um e-mail administrativo/operacional, para reforçar a separação).
4. Confirme o e-mail (verifique a caixa de entrada/spam).
5. Faça login no painel (dashboard) da Unwrangle.

## PARTE 3 — Escolher o plano

1. No painel, vá em **"Pricing"** ou **"Billing/Subscription"**.
2. Comece pelo plano de entrada: **Starter — US$ 99/mês (100.000 créditos)**. É mais que suficiente para começar.
3. Informe os dados de pagamento (cartão internacional — atenção ao IOF/câmbio, é cobrança em dólar).
4. Confirme a assinatura.

> Dica: muitos provedores oferecem **créditos grátis de teste no signup**. Se a Unwrangle oferecer um trial, podemos validar a integração **antes** de pagar o plano cheio. Veja se aparece "Free trial" / "Free credits" ao criar a conta.

## PARTE 4 — Gerar a API Key

1. No painel da Unwrangle, procure no menu por **"API Keys"**, **"Dashboard"** ou **"Account / Credentials"**.
2. Haverá uma chave já gerada (ou um botão **"Generate API Key" / "Create Key"**).
3. **Copie a API key** (algo como uma sequência longa de letras e números).
4. **NÃO compartilhe essa chave em mensagens de chat, e-mail ou prints públicos.**

## PARTE 5 — Como me entregar a chave com segurança

Você **não** vai colar a chave aqui na conversa. Em vez disso:

1. Eu vou criar um **campo seguro de Secret** no painel do projeto (cartão de Secrets).
2. Você cola a API key **diretamente nesse campo protegido** (fica criptografada, não aparece no código nem para terceiros).
3. Assim que você salvar, eu valido a conexão com um teste e começo a integração.

---

## PARTE 6 — O que farei assim que tiver a chave

1. Criar o cliente isolado da Unwrangle (`server/competitors/unwrangle.ts`) — sem nenhum acesso ao token do ML.
2. Criar as rotas para: buscar concorrentes de um produto, comparar com o seu anúncio, gerar diagnóstico.
3. Construir as telas **Radar de Concorrentes** e **Diagnóstico**.
4. Validar com produtos reais e te mostrar.

---

## Resumo para decisão rápida

- **Onde:** https://www.unwrangle.com/ → Sign Up
- **Plano:** Starter US$ 99/mês (ou trial grátis, se houver)
- **E-mail:** use um e-mail administrativo (não o do vendedor ML)
- **Chave:** gerar no painel e colar no campo seguro de Secrets (eu crio)
- **Garantia:** sua conta ML jamais é usada nessa coleta — isolamento total
