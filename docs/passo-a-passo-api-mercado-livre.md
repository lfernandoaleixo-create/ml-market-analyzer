# Passo a passo para obter a API oficial do Mercado Livre

## Guia prático para criar a aplicação e gerar as credenciais (App ID e Secret Key)

**Projeto Mercato — Inteligência de Mercado**

---

## Antes de começar: o que você precisa em mãos

Para que tudo corra sem travas, garanta estes pré-requisitos antes de iniciar:

| Requisito | Detalhe |
|---|---|
| **Conta correta** | Use a conta **principal** do e-commerce (a do CNPJ), e não a de um colaborador. O Mercado Livre recomenda que a aplicação seja criada sob **pessoa jurídica**, pois a conta vira a "proprietária" da integração. |
| **Conta sem pendências** | Verifique se não há dados ou documentos pendentes de validação. Contas com pendência falham na hora de autorizar. |
| **Acesso de quem cria** | Quem criar a aplicação deve estar logado na conta dona — evite criar com um login que depois precise ser transferido. |
| **Definição da URL de retorno** | É a "Redirect URI". O ideal é já ter o domínio final do Mercato (ver o Passo 0 abaixo). |

---

## Passo 0 — (Recomendado) Definir o domínio do Mercato primeiro

A criação da aplicação exige uma **URL de redirecionamento** (Redirect URI) — o endereço para onde o Mercado Livre devolve a autorização. Essa URL precisa ser **fixa e exata**. Por isso, o caminho mais tranquilo é **publicar o Mercato primeiro** para termos um domínio definitivo (algo como `https://mercato.manus.space`).

Se preferir, você pode criar a aplicação agora com uma URL provisória e atualizá-la depois — o Mercado Livre permite editar a Redirect URI a qualquer momento. Mas adiantar a publicação evita retrabalho.

> **Me avise se quiser que eu prepare a publicação do Mercato** para você já ter o domínio fixo em mãos antes de criar a aplicação.

---

## Passo 1 — Acessar o DevCenter (portal de desenvolvedores)

1. Abra o navegador e acesse: **https://developers.mercadolivre.com.br/**
2. Clique em **"Entrar"** (canto superior) e faça login com a **conta principal do e-commerce**.
3. No menu do seu perfil, acesse o **DevCenter** (ou vá direto em **https://developers.mercadolivre.com.br/devcenter**).

Essa é a área onde ficam todas as suas aplicações.

---

## Passo 2 — Criar uma nova aplicação

1. Dentro do DevCenter, clique no botão **"Criar uma aplicação"**.
2. Preencha as **informações básicas**:

| Campo | O que preencher |
|---|---|
| **Nome** | Um nome único, ex.: `Mercato - Inteligencia de Mercado` |
| **Nome curto** | Usado pelo ML para gerar o URL da aplicação, ex.: `mercato-intel` |
| **Descrição** | Até 150 caracteres. Ex.: `Ferramenta interna de análise de mercado, tendências e concorrência.` (esse texto aparece quando a conta autoriza o app) |
| **Logo** | Opcional. Pode incluir a logo da empresa, respeitando as dimensões pedidas |

---

## Passo 3 — Configurar a autenticação e segurança

Esta é a parte mais importante para a integração funcionar. Você verá os seguintes campos:

### 3.1. URLs de redirecionamento (Redirect URI)

- Preencha com a **raiz do domínio** do Mercato seguida da rota de callback. Exemplo:
  - `https://mercato.manus.space/api/oauth/ml/callback`
- **Atenção:** essa URL precisa ser **idêntica** à que a aplicação usará. Não pode conter informações variáveis. Se a URL não bater exatamente, o login da API falha.

### 3.2. PKCE (Proof Key for Code Exchange)

- É uma camada extra de segurança contra ataques. O uso é **opcional, mas recomendado**.
- **Sugestão:** pode deixar **desabilitado** no início para simplificar a primeira integração. Depois, se quisermos reforçar a segurança, ativamos.

### 3.3. Escopos (permissões) — o ponto-chave da segurança

Aqui você define o que a aplicação pode fazer. Recomendação para começar com **risco mínimo**:

| Escopo | O que permite | Recomendação inicial |
|---|---|---|
| **read (Leitura)** | Usar métodos GET — ou seja, **consultar** produtos, preços, tendências, concorrência | **Marcar** — é o essencial e o mais seguro |
| **offline_access** | Renovar o token automaticamente sem novo login | **Marcar** — evita ter que relogar a cada 6h |
| **write (Escrita)** | Métodos PUT/POST/DELETE — **alterar** anúncios, responder mensagens | **Deixar desmarcado por enquanto** — só ativar quando formos automatizar a nossa própria operação |

> **Recomendação honesta:** comece **apenas com `read` + `offline_access`**. Isso já alimenta toda a inteligência do Mercato (análise, ranking, oportunidades, comparação, monitoramento) sem nenhum poder de alterar a conta — risco praticamente nulo, ideal para tranquilizar a equipe.

### 3.4. Tópicos de notificação

- São avisos automáticos que o ML envia (sobre pedidos, mensagens, itens, etc.).
- **Para começar, pode deixar tudo desmarcado.** Não é necessário para a análise de mercado. Se um dia quisermos alertas em tempo real de pedidos/mensagens, configuramos depois com uma URL de notificações.

---

## Passo 4 — Salvar e obter as credenciais

1. Clique em **"Salvar"** / **"Criar"**.
2. Você será redirecionado para a página inicial, onde a sua aplicação aparece listada.
3. Abra a aplicação (ou clique em **"Editar"**) e localize, na seção **"Configuração da aplicação"**, os dois valores que precisamos:

| Credencial | Também chamada de | O que é |
|---|---|---|
| **App ID** | `client_id` | O identificador numérico da aplicação |
| **Secret Key** | `client_secret` | A chave secreta — **nunca compartilhe publicamente** |

> Para visualizar o Secret, use a opção **"Mostrar"** (há um alternador Ocultar/Mostrar na tela de configuração).

**Esses dois valores — App ID e Secret Key — são exatamente o que você vai me enviar (ou inserir na tela de Configurações do Mercato) para ativarmos os dados ao vivo.**

---

## Passo 5 — Me enviar as credenciais (com segurança)

Quando tiver o **App ID** e o **Secret Key**:

1. Insira-os na tela **Configurações** do Mercato (campos de credenciais), **ou** me avise que você os tem.
2. Eu então implemento a ativação do fluxo OAuth real (troca de código por token e renovação automática via refresh token).
3. A partir daí, a plataforma passa a usar **dados reais e ao vivo** do Mercado Livre, de forma transparente — nenhuma tela muda, só a fonte dos dados.

> **Dica de segurança:** o Secret Key é sensível. O ideal é inseri-lo diretamente no campo seguro de Configurações do Mercato, em vez de enviá-lo em texto em conversas.

---

## Resumo rápido (checklist)

1. **[ ]** (Opcional, recomendado) Publicar o Mercato para ter o domínio fixo.
2. **[ ]** Entrar no DevCenter com a conta principal do e-commerce.
3. **[ ]** Clicar em "Criar uma aplicação" e preencher nome, nome curto e descrição.
4. **[ ]** Configurar a Redirect URI (URL de callback do Mercato).
5. **[ ]** Marcar os escopos **read + offline_access** (deixar write desmarcado por ora).
6. **[ ]** Deixar PKCE e Tópicos como estão (desativados no início).
7. **[ ]** Salvar e copiar o **App ID** e o **Secret Key**.
8. **[ ]** Inserir as credenciais no Mercato (ou me avisar) para ativar os dados ao vivo.

---

## Observações importantes

- **Limite de requisições:** cada aplicação tem um limite de chamadas por hora (por padrão, na casa de **18.000/hora**). O Mercato opera bem abaixo disso, mas é bom saber que o limite existe e é generoso.
- **Sandbox/Teste:** aplicações novas podem iniciar em modo de teste. Para uso real, basta seguir o fluxo normal de autorização da conta.
- **Renovação do Secret:** o Mercado Livre permite programar a renovação do Secret Key (por segurança). Se você renovar, lembre-se de atualizar a credencial no Mercato para não interromper a integração.
- **Revogar acesso:** a qualquer momento, você pode revogar a autorização ou excluir a aplicação pelo DevCenter — o acesso é cortado imediatamente, sem afetar o login normal da conta.

---

*Guia baseado na documentação oficial de desenvolvedores do Mercado Livre (DevCenter, criação de aplicação, escopos read/write/offline_access e autenticação OAuth 2.0).*
