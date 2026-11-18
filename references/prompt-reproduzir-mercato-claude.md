# Prompt — reproduzir o Mercato atual em ambiente isolado

Autoria: Manus e Fernando. Copie o bloco abaixo no Claude Code depois de baixar o guia e abrir a pasta de trabalho. A descriptografia deve ser feita localmente com a chave separada; não cole a chave ou o cofre neste prompt.

```text
Quero que você reproduza o estado atual do Mercato da Toujours/Grupo Fox a partir do pacote técnico entregue, sem inventar uma reconstrução e sem alterar a loja real. Me chame de Fernando e responda em português.

Primeiro leia LEIA-PRIMEIRO-REPRODUCAO.md, ARQUITETURA-E-FLUXOS.md, INTEGRIDADE.json, cofre-inventario-sem-valores.json e CLAUDE.md do guia. Não abra cofre-integracoes-confidencial.json nem .project-config.json, não procure senhas e não envie banco/cofre para prompts, logs ou Git. O pacote completo está criptografado: se ainda não foi aberto localmente pelo usuário, me explique o comando do utilitário e peça que eu execute com minha chave, sem você ler a chave.

Confira a versão e hashes dos arquivos de code/. Crie uma cópia isolada de trabalho; não sobrescreva o Mercato existente e não conecte o clone ao banco de produção. A origem autorizada também é https://github.com/lfernandoaleixo-create/ml-market-analyzer. Não faça reset destrutivo, force push, migrations automáticas, reparos ou backfills.

Preserve inicialmente o código, rotas, telas, PWA/ícone Toujours, regras, cálculos, tipos e contratos exatamente como fornecidos. Registre problemas existentes e dependências ausentes, sem “corrigi-los” silenciosamente. Não renumere/reconstrua nenhum SKU, variante/kit ou índice, não reutilize excluídos e mantenha reservas, tombstones, CAS, colaboração e repetição manual deliberada. A reprodução não autoriza mudar dados reais. Dados SKU exigem explicação, “Tem certeza?” e autorização explícita de Luis/Guilherme/Fernando/Bruno.

Use Node22 e o pnpm do packageManager/lockfile. Comece com pnpm install --frozen-lockfile, pnpm check, testes focados, pnpm exec vitest run --exclude '**/*.live.test.ts' e pnpm build, sem segredos de produção e com APIs simuladas. Não declare que algo foi testado se não foi.

Para dados, use apenas uma cópia do snapshot em banco NOVO, VAZIO E ISOLADO, com importação revisada pelo responsável. Não execute o dump na origem, nem pnpm db:push para restaurar. Preserve todos os IDs, valores e logs; compare contagens/hashes. Antes de ligar o servidor com dados restaurados, um responsável deve neutralizar tokens OAuth/integrações/agendas no clone para que ele não rotacione o refresh token ou escreva no ambiente original. Não faça essa limpeza nos arquivos de backup nem no banco real. Não conecte credenciais reais por conta própria.

Me dê uma matriz de reprodução: funcionalidade, código presente, dados preservados, dependência externa, teste efetuado, resultado e pendência. Login Manus, armazenamento/LLM gerenciados, domínio, OAuth ML/Google e backups/agendas não passam a funcionar só porque o código foi copiado. Se quiser rodar fora do Manus, proponha provisionamento/adaptadores e peça autorização antes de substituir essas peças. “Página abriu” não comprova reprodução completa.

Para manutenção/publicação do Mercato original, siga PROMPT-CLAUDE-CODE.md: branch/PR no GitHub, integração no mesmo projeto Manus, testes/checkpoint correto e publicação verificada quando eu pedir. A chave mrc_read_... é só leitura comercial, não edita código nem publica. Não crie API de shell/execução arbitrária ou exponha dados reais publicamente.

Comece apresentando o inventário da cópia e as dependências que faltam, sem alterar dados, conectar serviços reais ou publicar nada.
```
