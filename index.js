const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

require("dotenv").config();

// 🔐 variáveis do .env
const API_KEY = process.env.TRELLO_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const LIST_ID = process.env.TRELLO_LIST;

// 🌐 sites monitorados
const SITES = [
  {
    url: "https://www.legislador.com.br/LegisladorWEB.ASP?WCI=ProjetoTramite&ID=32",
    tipo: "Projeto de Lei",
    base: "https://www.legislador.com.br"
  },
  {
    url: "https://www.camaraesmeraldas.mg.gov.br/downloads/categoria/portarias/32219",
    tipo: "Portaria",
    base: "https://www.camaraesmeraldas.mg.gov.br"
  }
];

const FILE = "dados.json";

// 📂 histórico
function carregarDados() {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

// 💾 salvar histórico
function salvarDados(dados) {
  fs.writeFileSync(FILE, JSON.stringify(dados, null, 2));
}

// 🧼 limpar texto
function limparTexto(texto) {
  return texto.replace(/\s+/g, " ").trim();
}

// 🔗 corrigir link relativo
function normalizarLink(base, link) {
  if (!link) return "";
  if (link.startsWith("http")) return link;
  return base + link;
}

// 🔑 ID mais confiável (usa link)
function gerarId(item) {
  return item.link || item.texto;
}

// 🚫 filtro de lixo
function itemValido(texto) {
  const t = texto.toLowerCase();

  if (texto.length < 15) return false;
  if (t.includes(".pdf")) return false;
  if (t.includes("menu")) return false;
  if (t.includes("download")) return false;
  if (t.includes("voltar")) return false;
  if (t.includes("categoria")) return false;

  return true;
}

// 🧠 principal
async function verificar() {
  try {
    let encontrados = [];

    for (const site of SITES) {
      const { data } = await axios.get(site.url);
      const $ = cheerio.load(data);

      $("a").each((i, el) => {
        const texto = limparTexto($(el).text());
        const linkRaw = $(el).attr("href") || "";

        if (!texto || !itemValido(texto)) return;

        const link = normalizarLink(site.base, linkRaw);

        const isProjeto =
          site.tipo === "Projeto de Lei" &&
          (texto.includes("Lei") || texto.includes("Projeto"));

        const isPortaria =
          site.tipo === "Portaria" &&
          texto.toLowerCase().includes("portaria");

        if (!isProjeto && !isPortaria) return;

        encontrados.push({
          tipo: site.tipo,
          texto,
          link,
          id: gerarId({ link, texto })
        });
      });
    }

    const antigos = carregarDados();

    const novos = encontrados.filter(novo =>
      !antigos.some(antigo => antigo.id === novo.id)
    );

    if (novos.length > 0) {
      console.log("🚨 NOVAS ATUALIZAÇÕES:");

      for (const n of novos) {
        console.log(`➡️ ${n.tipo}: ${n.texto}`);
        await criarCard(n);
      }

      salvarDados(encontrados);
    } else {
      console.log("✔️ Nenhuma mudança");
    }

  } catch (erro) {
    console.log("❌ Erro:", erro.message);
  }
}

// 🧾 criar card no Trello (COM LINK FORMATADO)
async function criarCard(item) {
  try {
    const titulo =
      item.tipo === "Portaria"
        ? "📄 Nova Portaria"
        : "📜 Novo Projeto de Lei";

    const descricao =
      `${item.texto}\n\n🔗 Link:\n${item.link || "sem link"}`;

    await axios.post("https://api.trello.com/1/cards", null, {
      params: {
        key: API_KEY,
        token: TOKEN,
        idList: LIST_ID,
        name: titulo,
        desc: descricao
      }
    });

    console.log("✅ Card criado no Trello!");
  } catch (err) {
    console.log("❌ Erro Trello:", err.message);
  }
}

// ▶️ loop seguro
(async () => {
  await verificar();
  setInterval(verificar, 300000);
})();