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
    tipo: "Projeto de Lei"
  },
  {
    url: "https://www.camaraesmeraldas.mg.gov.br/downloads/categoria/portarias/32219",
    tipo: "Portaria"
  }
];

const FILE = "dados.json";

// 📂 histórico seguro
function carregarDados() {
  if (!fs.existsSync(FILE)) return [];

  try {
    const data = fs.readFileSync(FILE, "utf-8");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// 💾 salvar histórico
function salvarDados(dados) {
  fs.writeFileSync(FILE, JSON.stringify(dados, null, 2));
}

// 🧼 limpar texto (remove lixo do site)
function limparTexto(texto) {
  return texto
    .replace(/\s+/g, " ")
    .replace(/[\n\r\t]/g, " ")
    .trim();
}

// 🔑 ID estável (melhor que base64 simples)
function gerarId(item) {
  return item.tipo + "|" + item.texto;
}

// 🚫 filtrar lixo do site
function itemValido(texto) {
  const t = texto.toLowerCase();

  if (texto.length < 15) return false;
  if (t.includes(".pdf")) return false;
  if (t.includes("menu")) return false;
  if (t.includes("download")) return false;
  if (t.includes("voltar")) return false;

  return true;
}

// 🧠 função principal
async function verificar() {
  try {
    let encontrados = [];

    for (const site of SITES) {
      const { data } = await axios.get(site.url);
      const $ = cheerio.load(data);

      $("a, tr").each((i, el) => {
        const texto = limparTexto($(el).text());
        const link = $(el).find("a").attr("href") || "";

        if (!texto || !itemValido(texto)) return;

        const tipo = site.tipo;

        const isProjeto =
          tipo === "Projeto de Lei" &&
          (texto.includes("Lei") || texto.includes("Projeto"));

        const isPortaria =
          tipo === "Portaria" &&
          texto.toLowerCase().includes("portaria");

        if (isProjeto || isPortaria) {
          encontrados.push({
            tipo,
            texto,
            link,
            id: gerarId({ tipo, texto })
          });
        }
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

// 🧾 criar card no Trello
async function criarCard(item) {
  try {
    const titulo =
      item.tipo === "Portaria"
        ? "📄 Nova Portaria"
        : "📜 Novo Projeto de Lei";

    await axios.post("https://api.trello.com/1/cards", null, {
      params: {
        key: API_KEY,
        token: TOKEN,
        idList: LIST_ID,
        name: titulo,
        desc: `${item.texto}\n\n${item.link || ""}`
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