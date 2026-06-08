# Referência de Design (extraída do vídeo do usuário)

## Paleta de cores
- **Fundo geral:** cinza muito claro / off-white (`#F5F6F8` ~ `#F0F2F5`)
- **Cards:** branco (`#FFFFFF`), radius 8–12px, sombra suave `0 4px 15px rgba(0,0,0,0.05)`
- **Texto principal:** cinza-escuro/grafite (`#1F2937` / `#333`)
- **Texto secundário:** cinza médio (`#6B7280`)
- **Accent principal (marca):** verde-menta / teal (`#10B981` ~ `#00C49A`)
- **Positivo (faturado):** verde esmeralda (`#22C55E`)
- **Alerta / a faturar:** laranja/coral (`#F97316` / `#FF8A65`)
- **Categoria/info:** azul claro (`#3B82F6` / `#60A5FA`)
- **Diferenciação:** roxo/lilás (`#A855F7`)
- **Fundos pastel:** versões 10–15% opacidade das cores accent

## Estilo
- Clean, minimalista, moderno, corporativo, card-based, flat com sombras suaves
- Muito whitespace, alta legibilidade

## Tipografia
- Sans-serif geométrica (Inter / Poppins / Roboto)
- KPIs: números grandes bold/semibold (2–3x maior que labels)
- Labels: uppercase, pequenos, regular/medium, cinza

## UI
- Cards brancos, radius 8–12px, sem borda sólida (só sombra)
- Listas com borda lateral esquerda grossa (4px) colorida por categoria
- Divisórias internas `1px solid #E5E7EB`
- Padding cards 16–24px, gap grid 16–24px
- Ícones line-art minimalistas, na cor accent do card
- Gráficos: barras verticais cantos arredondados (verde-menta) + linhas bezier suaves (verde/laranja), gridlines horizontais finas cinza claro

## Dinâmica
- Navegação topo horizontal por abas; aba ativa fica verde-menta + sublinhado
- Spinner circular verde-menta no carregamento
- Accordion suave nas listas (chevron gira)
- Container central com max-width (não full-bleed)

## Layout
- Header: navegação horizontal no topo (não sidebar escura)
- Cabeçalho de página: título + status "última atualização" à direita
- Linha de 4–5 KPIs no topo, depois cards largos/colunas
