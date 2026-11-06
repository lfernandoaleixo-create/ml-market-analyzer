import { ArrowRight } from "lucide-react";
import { calculate, defaultInput } from "@shared/alpha/pricing";
import { money } from "@/alpha/lib/format";

export function JewelryComparison({
  onLoad,
}: {
  onLoad: (mode: "package" | "observed" | "postage") => void;
}) {
  const measured = calculate({
    ...defaultInput,
    price: 98.94,
    weight: 0.263,
    length: 18,
    width: 14,
    height: 18,
    classicRate: 14,
    premiumRate: 19,
    shippingMode: "auto",
  });
  return (
    <section className="jewelry-comparison">
      <h3>Joias: pacote medido e simulador não são a mesma evidência</h3>
      <p>
        O comprovante indica pacote de 18 × 14 × 18 cm e peso físico de 0,263
        kg. Os 3 g do anúncio são da joia isolada. A usuária confirmou que
        R$21,30 é o valor da postagem, não o preço de venda nem um débito do
        Mercado Pago já confirmado.
      </p>
      <p>
        <strong>
          Minas Gerais → Ponta Grossa/PR: postagem comprovada deR$21,30.
        </strong>{" "}
        Esse valor fica como referência histórica do comprovante, não como
        cotação automática por estado nem garantia do débito no Mercado Livre. A
        interface atual usa somente as opções de envio por tabela.
      </p>
      <div className="evidence-comparison">
        <div>
          <span>Estimativa pelas medidas informadas</span>
          <strong>0,756 kg volumétrico</strong>
          <small>
            Faixa acima de 0,5 até 1 kg. A R$98,94: envio{" "}
            {money(measured.shipping)} pela tabela geral.
          </small>
        </div>
        <div>
          <span>Simulador do anúncio no vídeo</span>
          <strong>Envio R$12,95</strong>
          <small>
            A R$98,94. Custo compatível com até 0,3 kg; o peso considerado pelo
            anúncio não está visível.
          </small>
        </div>
      </div>
      <p>
        Não trocamos a fórmula para forçar igualdade. A{" "}
        <a
          href="https://www.mercadolivre.com.br/ajuda/Como-calcular-o-custo-dos-seus_4413"
          target="_blank"
          rel="noreferrer"
        >
          Ajuda oficial
        </a>{" "}
        usa o maior entre o peso físico e o volumétrico, com divisor 6.000. A
        divergência precisa ser reconciliada com as medidas usadas pelo anúncio
        e o detalhe da venda.
      </p>
      <p>
        As taxas observadas a R$98,94 são 14% Clássico e 19% Premium. A lista
        oficial de categorias inclui Colares com redução de 2/4 pontos de R$150
        a R$700, explicando os 12% Clássico a R$150. As taxas-base são
        específicas do exemplo, não universais.
      </p>
      <p>
        O exemplo não ativa o benefício automaticamente. Depois de confirmar
        Colares na lista oficial, marque a opção de redução na última etapa,
        Margem de lucro e tipo de anúncio, para simular preços de R$150 a R$700.
      </p>
      <div className="video-example-buttons">
        <button
          className="link-button"
          type="button"
          onClick={() => onLoad("package")}
        >
          Simular pacote medido a R$98,94 pela tabela <ArrowRight size={11} />
        </button>
      </div>
      <p className="small-note">
        Os exemplos preservam seus custos e todos os impostos editados. Confira
        se pertencem à joia. O valor manual é referência somente desse cenário,
        não uma fórmula de envio para outros preços. Para validar o lucro real,
        ainda precisamos do preço da venda efetiva, custos de
        aquisição/embalagem e débitos da venda no Mercado Pago.
      </p>
      <p>
        <a href="/manus-storage/comparacao-joias-alpha_c52ac16f.md" target="_blank" rel="noreferrer">
          Ler a comparação detalhada e as fontes oficiais
        </a>
      </p>
    </section>
  );
}
