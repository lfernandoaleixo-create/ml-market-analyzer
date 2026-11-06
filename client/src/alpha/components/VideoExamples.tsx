import { ArrowRight } from "lucide-react";

const examples = [
  {
    price: 71.94,
    mode: "auto",
    label: "R$71,94 · sem grátis rápido opcional · envio R$9,15",
  },
  {
    price: 71.94,
    mode: "rapid",
    label: "R$71,94 · oferecendo grátis rápido · envio R$16,45",
  },
  {
    price: 50,
    mode: "auto",
    label: "R$50 · sem grátis rápido opcional · envio R$9,15",
  },
  {
    price: 50,
    mode: "rapid",
    label: "R$50 · oferecendo grátis rápido · envio R$16,45",
  },
  {
    price: 100,
    mode: "auto",
    label: "R$100 · regra obrigatória elegível · envio R$19,15",
  },
] as const;

export function VideoExamples({
  onLoad,
}: {
  onLoad: (price: number, mode: "auto" | "rapid") => void;
}) {
  return (
    <section className="video-examples">
      <h3>O vídeo que você enviou confirma a diferença</h3>
      <p>
        O simulador permanece em Envios no Mercado Livre, não em Full nem Flex.
        Abaixo de R$79, sem oferecer grátis opcional, ele mostra R$9,15 de
        custo; oferecendo, R$16,45. A R$100, mostra R$19,15 e não permite
        retirar a oferta. Trocar Clássico por Premium muda a comissão, não o
        envio nas mesmas condições.
      </p>
      <p>
        A comissão observada é 11,5% no Clássico e 16,5% no Premium, apenas para
        aquele anúncio. “Por conta do comprador” não zera o custo do vendedor: a
        tabela oficial cobra o envio mesmo quando o comprador paga. Não somamos
        uma tarifa fixa antiga nem descontamos mais 50%.
      </p>
      <p>
        <strong>O vídeo não mostra o peso nem as dimensões.</strong> Os valores
        são compatíveis com a faixa acima de2 até3 kg da tabela. Os exemplos
        abaixo usam2,5 kg hipotéticos, não um peso medido. Ao carregar, informe
        o custo real por item; suas alíquotas federais e estaduais atuais são
        mantidas.
      </p>
      <div className="video-example-buttons">
        {examples.map(example => (
          <button
            type="button"
            className="link-button"
            key={`${example.price}-${example.mode}`}
            onClick={() => onLoad(example.price, example.mode)}
          >
            {example.label} <ArrowRight size={11} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
