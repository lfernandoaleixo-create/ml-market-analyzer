import mysql from "mysql2/promise";
import fs from "node:fs";

// Abreviações aprovadas (espelho de shared/skuSheet.ts).
const CATEGORY_ABBREVIATIONS = {
  "Acessórios para Veículos": "VEICULOS",
  "Agro": "AGRO",
  "Alimentos e Bebidas": "ALIMENTOS",
  "Animais": "ANIMAIS",
  "Antiguidades e Coleções": "COLECOES",
  "Arte, Papelaria e Armarinho": "PAPELARIA",
  "Bebês": "BEBES",
  "Beleza e Cuidado Pessoal": "BELEZA",
  "Brinquedos e Hobbies": "BRINQUEDOS",
  "Calçados, Roupas e Bolsas": "MODA",
  "Câmeras e Acessórios": "CAMERAS",
  "Carros, Motos e Outros": "CARROS",
  "Casa, Móveis e Decoração": "CASA",
  "Celulares e Telefones": "CELULARES",
  "Construção": "CONSTRUCAO",
  "Eletrodomésticos": "ELETRODOM",
  "Eletrônicos, Áudio e Vídeo": "ELETRONICOS",
  "Esportes e Fitness": "ESPORTES",
  "Ferramentas": "FERRAMENTAS",
  "Festas e Lembrancinhas": "FESTAS",
  "Games": "GAMES",
  "Imóveis": "IMOVEIS",
  "Indústria e Comércio": "INDUSTRIA",
  "Informática": "INFORMATICA",
  "Ingressos": "INGRESSOS",
  "Instrumentos Musicais": "INSTRUMENTOS",
  "Joias e Relógios": "JOIAS",
  "Livros, Revistas e Comics": "LIVROS",
  "Música, Filmes e Seriados": "MIDIA",
  "Saúde": "SAUDE",
  "Serviços": "SERVICOS",
  "Mais Categorias": "OUTROS",
};

function buildSku({ tipoSku, categoryName, productNumber, variantNumber }) {
  const tipo = (tipoSku ?? "").trim();
  const cat = categoryName ? (CATEGORY_ABBREVIATIONS[categoryName] ?? "") : "";
  if (!tipo || !cat || productNumber == null || variantNumber == null) return "";
  return [tipo, cat, productNumber, variantNumber].join("-");
}
function buildSkuKit(base, gerar) {
  if (!gerar || !base) return "";
  return `${base}-KITINS`;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente no ambiente.");
  process.exit(1);
}

const conn = await mysql.createConnection(url + (url.includes("?") ? "&" : "?") + 'ssl={"rejectUnauthorized":true}');
const [rows] = await conn.execute(
  "SELECT id, tipoSku, categoryName, productNumber, variantNumber, gerarSkuKit FROM sku_sheet_rows",
);

let total = rows.length;
let comCat = 0;
let atualizadas = 0;
for (const r of rows) {
  if (r.categoryName) comCat++;
  const sku = buildSku(r);
  const skuKit = buildSkuKit(sku, !!r.gerarSkuKit);
  // Só grava quando há um SKU calculável (Tipo + Categoria + números).
  if (sku) {
    await conn.execute("UPDATE sku_sheet_rows SET sku=?, skuKit=? WHERE id=?", [sku, skuKit, r.id]);
    atualizadas++;
  }
}
console.log(JSON.stringify({ total, comCat, atualizadas }));
await conn.end();
