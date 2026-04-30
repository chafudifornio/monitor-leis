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

// 📂 histórico
function carregarDados() {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

// 💾 salvar histórico
function salvarDados(dados) {
  fs.writeFileSync(FILE, JSON.stringify(dados, null, 2));
}

// 🔑 ID único
function gerarId(item) {
  return `${item.tipo}-${item.texto}`;
}

// 🧠 função principal
async function verificar() {
  try {
    let encontrados = [];

    for (const site of SITES) {
      const { data } = await axios.get(site.url);
      const $ = cheerio.load(data);

      $("a, tr").each((i, el) => {
        const texto = $(el).text().trim();
        const link = $(el).find("a").attr("href") || "";

        if (!texto) return;

        if (
          (site.tipo === "Projeto de Lei" &&
            (texto.includes("Lei") || texto.includes("Projeto"))) ||
          (site.tipo === "Portaria" &&
            texto.toLowerCase().includes("portaria"))
        ) {
          encontrados.push({
            tipo: site.tipo,
            texto,
            link,
            id: gerarId({ tipo: site.tipo, texto })
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

// ▶️ executar uma vez (para testes)
setInterval(verificar, 300000); // 5 minutos

// executa imediatamente ao iniciar
verificar();