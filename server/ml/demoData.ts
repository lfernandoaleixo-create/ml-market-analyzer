import type { MlCategory, MlProduct, MlSeller, MlTrend } from "@shared/ml";

/**
 * Deterministic demo data generator for the Mercado Livre domain.
 *
 * Goal: produce rich, realistic, and STABLE data so the entire app (rankings,
 * potential analysis, comparisons, historical charts) works end-to-end before
 * official API credentials are available. Determinism is important so that the
 * same query yields the same products across requests and the monitoring cron
 * produces coherent time-series.
 */

// ---- Deterministic PRNG (mulberry32) -------------------------------------

function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(seed: string) {
  const rand = mulberry32(hashString(seed));
  return {
    next: rand,
    int: (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min,
    float: (min: number, max: number) => rand() * (max - min) + min,
    pick: <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)],
    bool: (p = 0.5) => rand() < p,
  };
}

// ---- Catalog -------------------------------------------------------------

export const DEMO_CATEGORIES: MlCategory[] = [
  { id: "MLB1051", name: "Celulares e Telefones", totalItems: 1_240_000, demandIndex: 96 },
  { id: "MLB1648", name: "Informática", totalItems: 980_000, demandIndex: 91 },
  { id: "MLB1000", name: "Eletrônicos, Áudio e Vídeo", totalItems: 870_000, demandIndex: 88 },
  { id: "MLB1430", name: "Calçados, Roupas e Bolsas", totalItems: 2_100_000, demandIndex: 84 },
  { id: "MLB1574", name: "Casa, Móveis e Decoração", totalItems: 1_560_000, demandIndex: 79 },
  { id: "MLB1276", name: "Esportes e Fitness", totalItems: 720_000, demandIndex: 77 },
  { id: "MLB1246", name: "Beleza e Cuidado Pessoal", totalItems: 640_000, demandIndex: 82 },
  { id: "MLB1132", name: "Brinquedos e Hobbies", totalItems: 510_000, demandIndex: 71 },
  { id: "MLB5672", name: "Acessórios para Veículos", totalItems: 1_120_000, demandIndex: 74 },
  { id: "MLB1196", name: "Livros, Revistas e Comics", totalItems: 430_000, demandIndex: 58 },
  { id: "MLB1499", name: "Indústria e Comércio", totalItems: 390_000, demandIndex: 63 },
  { id: "MLB1953", name: "Saúde e Bem-estar", totalItems: 350_000, demandIndex: 69 },
];

const PRODUCT_TEMPLATES: Record<string, { names: string[]; brands: string[]; priceRange: [number, number] }> = {
  MLB1051: {
    names: [
      "Smartphone {brand} {model} 256GB 8GB RAM",
      "Celular {brand} {model} 128GB Tela 6.7",
      "Smartphone {brand} {model} 5G Dual Chip",
      "Capa Case {brand} Antichoque Premium",
      "Carregador Turbo {brand} 65W USB-C",
      "Fone de Ouvido Bluetooth {brand} TWS",
    ],
    brands: ["Samsung", "Motorola", "Xiaomi", "Apple", "Realme", "LG"],
    priceRange: [89, 5999],
  },
  MLB1648: {
    names: [
      "Notebook {brand} {model} i5 16GB SSD 512GB",
      "Notebook {brand} Ryzen 7 16GB SSD 1TB",
      "Mouse Gamer {brand} 16000 DPI RGB",
      "Teclado Mecânico {brand} ABNT2 RGB",
      "Monitor {brand} 27 144Hz Full HD",
      "SSD {brand} 1TB NVMe M.2",
    ],
    brands: ["Dell", "Lenovo", "Acer", "Logitech", "Redragon", "Kingston"],
    priceRange: [49, 8999],
  },
  MLB1000: {
    names: [
      "Smart TV {brand} 50 4K UHD",
      "Soundbar {brand} 200W Bluetooth",
      "Fone {brand} Cancelamento de Ruído",
      "Caixa de Som {brand} Portátil 40W",
      "Projetor {brand} Full HD 1080p",
      "Echo Dot {brand} Assistente Virtual",
    ],
    brands: ["LG", "Samsung", "JBL", "Sony", "Philips", "TCL"],
    priceRange: [79, 4599],
  },
  MLB1430: {
    names: [
      "Tênis {brand} Corrida Masculino",
      "Camiseta {brand} Dry-Fit Esportiva",
      "Mochila {brand} Impermeável 30L",
      "Jaqueta {brand} Corta-Vento",
      "Tênis {brand} Casual Feminino",
      "Boné {brand} Aba Curva",
    ],
    brands: ["Nike", "Adidas", "Olympikus", "Mizuno", "Puma", "Fila"],
    priceRange: [39, 899],
  },
  MLB1574: {
    names: [
      "Air Fryer {brand} 5L Digital",
      "Cafeteira {brand} Expresso Automática",
      "Jogo de Panelas {brand} Antiaderente",
      "Aspirador Robô {brand} Inteligente",
      "Luminária LED {brand} Mesa",
      "Organizador Multiuso {brand} Closet",
    ],
    brands: ["Mondial", "Philco", "Britânia", "Electrolux", "Tramontina", "Mor"],
    priceRange: [29, 2299],
  },
  MLB1276: {
    names: [
      "Halteres {brand} Ajustável 20kg",
      "Bicicleta Ergométrica {brand}",
      "Corda de Pular {brand} Speed",
      "Kit Faixas Elásticas {brand}",
      "Suplemento Whey {brand} 900g",
      "Garrafa Térmica {brand} 1L",
    ],
    brands: ["Kikos", "Acte", "Polimet", "Growth", "Max Titanium", "Stanley"],
    priceRange: [19, 1599],
  },
  MLB1246: {
    names: [
      "Perfume {brand} Eau de Parfum 100ml",
      "Sérum Facial {brand} Vitamina C",
      "Secador de Cabelo {brand} 2000W",
      "Kit Skincare {brand} Hidratação",
      "Base Líquida {brand} Alta Cobertura",
      "Protetor Solar {brand} FPS 60",
    ],
    brands: ["Natura", "O Boticário", "La Roche", "Vult", "Avène", "Taiff"],
    priceRange: [15, 699],
  },
  MLB1132: {
    names: [
      "Lego {brand} Blocos de Montar 500pç",
      "Boneca {brand} Articulada",
      "Carrinho de Controle Remoto {brand}",
      "Quebra-Cabeça {brand} 1000 Peças",
      "Pelúcia {brand} Macia 40cm",
      "Jogo de Tabuleiro {brand} Família",
    ],
    brands: ["Lego", "Estrela", "Hasbro", "Grow", "Mattel", "Candide"],
    priceRange: [25, 899],
  },
  MLB5672: {
    names: [
      "Pneu {brand} Aro 15 195/65",
      "Central Multimídia {brand} Android 9",
      "Câmera de Ré {brand} HD",
      "Kit Palhetas {brand} Limpador",
      "Bateria Automotiva {brand} 60Ah",
      "Suporte Veicular {brand} Celular",
    ],
    brands: ["Pirelli", "Multilaser", "Bosch", "Moura", "Goodyear", "H-Tech"],
    priceRange: [29, 1299],
  },
  MLB1196: {
    names: [
      "Livro {brand} Best-Seller Capa Dura",
      "Box Coleção {brand} 3 Volumes",
      "E-reader {brand} 8GB",
      "Agenda {brand} 2026 Planner",
      "Mangá {brand} Edição Especial",
      "Livro Infantil {brand} Ilustrado",
    ],
    brands: ["Intrínseca", "Sextante", "Kindle", "Cdc", "Panini", "Companhia"],
    priceRange: [19, 599],
  },
  MLB1499: {
    names: [
      "Furadeira {brand} Impacto 750W",
      "Compressor de Ar {brand} 50L",
      "Kit Ferramentas {brand} 100 Peças",
      "Balança Digital {brand} 40kg",
      "Gerador {brand} 2.5KVA",
      "Parafusadeira {brand} 12V",
    ],
    brands: ["Bosch", "Makita", "Vonder", "Tramontina", "Schulz", "DeWalt"],
    priceRange: [49, 3499],
  },
  MLB1953: {
    names: [
      "Termômetro Digital {brand} Infravermelho",
      "Massageador {brand} Relaxante",
      "Medidor de Pressão {brand} Digital",
      "Oxímetro {brand} Dedo",
      "Cadeira Massageadora {brand}",
      "Kit Primeiros Socorros {brand}",
    ],
    brands: ["G-Tech", "Relaxmedic", "Omron", "Multilaser", "RelaxMaster", "Western"],
    priceRange: [19, 2999],
  },
};

const MODELS = ["Pro", "Max", "Plus", "Ultra", "Lite", "Neo", "Prime", "S23", "A54", "G73", "Edge 40"];
const REPUTATION_LEVELS = ["5_green", "5_green", "4_light_green", "5_green", "3_yellow"];
const POWER_STATUSES: (string | null)[] = ["platinum", "gold", "gold", "silver", null];

function makeSeller(seed: string): MlSeller {
  const r = rngFor(seed + ":seller");
  const adjectives = ["Mega", "Top", "Super", "Prime", "Express", "Smart", "Brasil", "Loja"];
  const nouns = ["Store", "Shop", "Distribuidora", "Comercial", "Imports", "Center", "Outlet"];
  return {
    id: String(r.int(100000000, 999999999)),
    nickname: `${r.pick(adjectives)}${r.pick(nouns)}${r.int(1, 99)}`,
    reputationLevel: r.pick(REPUTATION_LEVELS),
    powerSellerStatus: r.pick(POWER_STATUSES),
    transactions: r.int(120, 85000),
    positiveRatingRatio: Number(r.float(0.86, 0.999).toFixed(3)),
  };
}

function categoryById(id: string): MlCategory {
  return DEMO_CATEGORIES.find((c) => c.id === id) ?? DEMO_CATEGORIES[0];
}

/**
 * Generate a single deterministic product from a seed.
 */
function makeProduct(seed: string, category: MlCategory): MlProduct {
  const r = rngFor(seed);
  const tpl = PRODUCT_TEMPLATES[category.id] ?? PRODUCT_TEMPLATES.MLB1051;
  const brand = r.pick(tpl.brands);
  const model = r.pick(MODELS);
  const title = r.pick(tpl.names).replace("{brand}", brand).replace("{model}", model);

  const [pmin, pmax] = tpl.priceRange;
  const price = Number(r.float(pmin, pmax).toFixed(2));
  const hasDiscount = r.bool(0.55);
  const originalPrice = hasDiscount ? Number((price * r.float(1.1, 1.45)).toFixed(2)) : null;

  const soldQuantity = Math.floor(
    r.float(0, 1) ** 2 * 12000, // skewed toward fewer sales, some big sellers
  );
  const reviewsCount = Math.floor(soldQuantity * r.float(0.02, 0.12));
  const rating = Number(r.float(3.6, 5).toFixed(1));
  const pictureCount = r.int(1, 10);

  return {
    id: "MLB" + (hashString(seed) % 9000000000 + 1000000000),
    title,
    price,
    originalPrice,
    currency: "BRL",
    soldQuantity,
    availableQuantity: r.int(1, 500),
    condition: r.bool(0.92) ? "new" : "used",
    thumbnail: `https://placehold.co/300x300/eef2ff/4f46e5?text=${encodeURIComponent(brand)}`,
    pictureCount,
    permalink: `https://www.mercadolivre.com.br/p/${"MLB" + (hashString(seed) % 90000000)}`,
    freeShipping: r.bool(0.62),
    officialStore: r.bool(0.28),
    catalogPosition: null,
    rating,
    reviewsCount,
    categoryId: category.id,
    categoryName: category.name,
    seller: makeSeller(seed),
    attributes: [
      { name: "Marca", value: brand },
      { name: "Modelo", value: model },
      { name: "Condição", value: r.bool(0.92) ? "Novo" : "Usado" },
    ],
  };
}

/**
 * Search/listing generator. Produces a stable, ranked list for a given
 * keyword + optional category. `count` controls how many products.
 */
export function generateProducts(opts: {
  keyword?: string;
  categoryId?: string;
  count?: number;
}): MlProduct[] {
  const keyword = (opts.keyword ?? "").trim().toLowerCase();
  const count = opts.count ?? 30;
  const category = opts.categoryId
    ? categoryById(opts.categoryId)
    : keywordToCategory(keyword);

  const products: MlProduct[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${category.id}|${keyword}|${i}`;
    const p = makeProduct(seed, category);
    // If a keyword is present, bias the title to include it for relevance.
    if (keyword && i % 3 === 0) {
      p.title = `${capitalize(keyword)} ${p.title}`;
    }
    products.push(p);
  }

  // Rank: a blend of sales and rating, so the "best sellers" feel natural.
  products.sort(
    (a, b) =>
      b.soldQuantity * (0.5 + b.rating / 10) - a.soldQuantity * (0.5 + a.rating / 10),
  );
  products.forEach((p, i) => {
    p.catalogPosition = i + 1;
  });
  return products;
}

function keywordToCategory(keyword: string): MlCategory {
  const map: { match: string[]; id: string }[] = [
    { match: ["celular", "smartphone", "iphone", "fone", "carregador"], id: "MLB1051" },
    { match: ["notebook", "mouse", "teclado", "monitor", "ssd", "pc"], id: "MLB1648" },
    { match: ["tv", "soundbar", "projetor", "som", "echo"], id: "MLB1000" },
    { match: ["tenis", "camiseta", "mochila", "roupa", "bone", "jaqueta"], id: "MLB1430" },
    { match: ["air fryer", "cafeteira", "panela", "aspirador", "luminaria"], id: "MLB1574" },
    { match: ["halter", "bicicleta", "whey", "suplemento", "academia"], id: "MLB1276" },
    { match: ["perfume", "serum", "secador", "skincare", "base", "protetor"], id: "MLB1246" },
    { match: ["lego", "boneca", "carrinho", "brinquedo", "pelucia"], id: "MLB1132" },
    { match: ["pneu", "multimidia", "camera de re", "bateria", "carro"], id: "MLB5672" },
    { match: ["livro", "box", "kindle", "manga", "agenda"], id: "MLB1196" },
    { match: ["furadeira", "compressor", "ferramenta", "gerador"], id: "MLB1499" },
    { match: ["termometro", "massageador", "pressao", "oximetro"], id: "MLB1953" },
  ];
  for (const entry of map) {
    if (entry.match.some((m) => keyword.includes(m))) {
      return categoryById(entry.id);
    }
  }
  // Fallback: deterministic category based on keyword hash.
  if (!keyword) return DEMO_CATEGORIES[0];
  return DEMO_CATEGORIES[hashString(keyword) % DEMO_CATEGORIES.length];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getDemoCategories(): MlCategory[] {
  return DEMO_CATEGORIES;
}

export function getDemoTrends(categoryId?: string): MlTrend[] {
  const cat = categoryId ? categoryById(categoryId) : DEMO_CATEGORIES[0];
  const r = rngFor("trends|" + cat.id);
  const tpl = PRODUCT_TEMPLATES[cat.id] ?? PRODUCT_TEMPLATES.MLB1051;
  const baseTerms = tpl.names.map((n) =>
    n
      .replace("{brand} ", "")
      .replace("{brand}", "")
      .replace("{model}", "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase(),
  );
  const extra = tpl.brands.map((b) => b.toLowerCase());
  const terms = Array.from(new Set([...baseTerms, ...extra])).slice(0, 10);
  return terms
    .map((keyword) => ({
      keyword,
      volumeIndex: r.int(30, 100),
      changePercent: Number(r.float(-25, 60).toFixed(1)),
    }))
    .sort((a, b) => b.volumeIndex - a.volumeIndex);
}

/**
 * Build a single product by its (demo) item id by scanning a category's
 * generated set. Used when we need to resolve a monitored product.
 */
export function findDemoProductById(itemId: string): MlProduct | null {
  for (const cat of DEMO_CATEGORIES) {
    const products = generateProducts({ categoryId: cat.id, count: 40 });
    const found = products.find((p) => p.id === itemId);
    if (found) return found;
  }
  return null;
}
