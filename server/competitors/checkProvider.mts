/**
 * Verificação ao vivo do provedor Unwrangle (uso pontual via tsx).
 * Faz até 5 buscas reais e reporta sucesso/erro de cada uma.
 * Roda SEM o retry interno (1 tentativa por chamada) para medir a taxa real.
 */
process.env.UNWRANGLE_RETRY_DELAY_MS = "0";

async function main() {
  const { isConfigured, searchProducts, UnwrangleError } = await import("./unwrangle");
  console.log("isConfigured:", isConfigured());
  if (!isConfigured()) {
    console.log("RESULTADO: chave não configurada.");
    return;
  }

  const term = "palitos de dente";
  let success = 0;
  for (let i = 1; i <= 5; i++) {
    try {
      const res = await searchProducts(term, 1);
      const n = res.results.length;
      const first = res.results[0];
      success++;
      console.log(
        `tentativa ${i}: SUCESSO — ${n} produtos | ex.: "${first?.name?.slice(0, 50)}" preço=${first?.price ?? "-"}`,
      );
    } catch (err) {
      if (err instanceof UnwrangleError) {
        console.log(`tentativa ${i}: FALHA — code=${err.code} | ${err.message.slice(0, 120)}`);
      } else {
        console.log(`tentativa ${i}: ERRO inesperado — ${(err as Error).message.slice(0, 120)}`);
      }
    }
  }
  console.log(`\nRESUMO: ${success}/5 sucessos.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
