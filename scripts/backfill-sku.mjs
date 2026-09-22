import mysql from "mysql2/promise";

// Auditor legado somente leitura. A aplicação automática foi removida: qualquer
// definição de SKU deve passar pelo fluxo protegido do card e pelas reservas do banco.
const CATEGORY_ABBREVIATIONS = {
  "Acessórios para Veículos": "VEICULOS",
  Agro: "AGRO",
  "Alimentos e Bebidas": "ALIMENTOS",
  Animais: "ANIMAIS",
  "Antiguidades e Coleções": "COLECOES",
  "Arte, Papelaria e Armarinho": "PAPELARIA",
  Bebês: "BEBES",
  "Beleza e Cuidado Pessoal": "BELEZA",
  "Brinquedos e Hobbies": "BRINQUEDOS",
  "Calçados, Roupas e Bolsas": "MODA",
  "Câmeras e Acessórios": "CAMERAS",
  "Carros, Motos e Outros": "CARROS",
  "Casa, Móveis e Decoração": "CASA",
  "Celulares e Telefones": "CELULARES",
  Construção: "CONSTRUCAO",
  Eletrodomésticos: "ELETRODOM",
  "Eletrônicos, Áudio e Vídeo": "ELETRONICOS",
  "Esportes e Fitness": "ESPORTES",
  Ferramentas: "FERRAMENTAS",
  "Festas e Lembrancinhas": "FESTAS",
  Games: "GAMES",
  Imóveis: "IMOVEIS",
  "Indústria e Comércio": "INDUSTRIA",
  Informática: "INFORMATICA",
  Ingressos: "INGRESSOS",
  "Instrumentos Musicais": "INSTRUMENTOS",
  "Joias e Relógios": "JOIAS",
  "Livros, Revistas e Comics": "LIVROS",
  "Música, Filmes e Seriados": "MIDIA",
  Saúde: "SAUDE",
  Serviços: "SERVICOS",
  "Mais Categorias": "OUTROS",
};

function buildSku({ tipoSku, categoryName, productNumber, variantNumber }) {
  const tipo = (tipoSku ?? "").trim();
  const cat = categoryName ? (CATEGORY_ABBREVIATIONS[categoryName] ?? "") : "";
  if (!tipo || !cat || productNumber == null || variantNumber == null) return "";
  return [tipo, cat, productNumber, variantNumber].join("-");
}

if (process.argv.includes("--apply")) {
  console.error(
    "Aplicação bloqueada: este script é somente leitura. Use o card de SKU da aplicação.",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente no ambiente.");
  process.exit(1);
}

const conn = await mysql.createConnection(
  url + (url.includes("?") ? "&" : "?") + 'ssl={"rejectUnauthorized":true}',
);
const [rows] = await conn.execute(
  "SELECT id, tipoSku, categoryName, productNumber, variantNumber, sku FROM sku_sheet_rows ORDER BY id",
);

let calculaveis = 0;
let divergentes = 0;
for (const row of rows) {
  const calculado = buildSku(row);
  if (!calculado) continue;
  calculaveis += 1;
  if (calculado !== (row.sku ?? "")) divergentes += 1;
}

console.log(
  JSON.stringify({
    mode: "read-only",
    total: rows.length,
    calculaveis,
    divergentes,
    atualizadas: 0,
  }),
);
await conn.end();
