const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const bcrypt = require('bcrypt');
const DADOS_BOLAO = require('./dados_bolao.json');

const app = express();
const server = http.createServer(app); 

const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

io.on('connection', (socket) => {
  console.log('📡 Novo utilizador conectado ao tempo real:', socket.id);
});

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resultados (
        jogo_num INTEGER PRIMARY KEY,
        resultado VARCHAR(10) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query('ALTER TABLE resultados ALTER COLUMN resultado TYPE VARCHAR(10)').catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS palpites_fase_final (
        participante TEXT NOT NULL,
        jogo_num INTEGER NOT NULL,
        palpite CHAR(1) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (participante, jogo_num)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        usuario TEXT PRIMARY KEY,
        senha TEXT NOT NULL,
        perfil1 TEXT NOT NULL,
        perfil2 TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT
      )
    `);

    console.log('✅ Banco de dados pronto');
  } catch (error) {
    console.error('❌ Erro ao inicializar o banco de dados:', error.message);
  }
}
init();

// ============================================================
//  CONSTANTES DA COPA 2026
// ============================================================

const COPA_LEAGUE_ID = '4429'; // FIFA World Cup no TheSportsDB
const COPA_SEASON    = '2026';

// Primeiro número de jogo do mata-mata
const PRIMEIRO_JOGO_MATAMATA = 73;

// Cache em memória do calendário completo da Copa
let cachedCopaEvents = null;
let cacheLoadedAt    = null;

// ============================================================
//  DICIONÁRIO E NORMALIZAÇÃO DE NOMES
// ============================================================

const TEAM_DICTIONARY = {
  "South Africa": "África do Sul", "South Korea": "Coreia do Sul",
  "Czech Republic": "Tchéquia", "Czechia": "Tchéquia",
  "Spain": "Espanha", "Germany": "Alemanha",
  "Netherlands": "Países Baixos", "Holland": "Países Baixos",
  "England": "Inglaterra", "France": "França", "Croatia": "Croácia",
  "Belgium": "Bélgica", "Switzerland": "Suíça", "Cameroon": "Camarões",
  "Japan": "Japão", "Morocco": "Marrocos",
  "USA": "Estados Unidos", "United States": "Estados Unidos",
  "Turkey": "Turquia", "Ivory Coast": "Costa do Marfim",
  "Cote d'Ivoire": "Costa do Marfim", "Sweden": "Suécia",
  "New Zealand": "Nova Zelândia", "Egypt": "Egito",
  "Saudi Arabia": "Arábia Saudita", "Cape Verde": "Cabo Verde",
  "Iraq": "Iraque", "Norway": "Noruega", "Algeria": "Argélia",
  "Austria": "Áustria", "Jordan": "Jordânia", "Colombia": "Colômbia",
  "DR Congo": "RD Congo", "Uzbekistan": "Uzbequistão",
  "Mexico": "México", "Canada": "Canadá", "Brazil": "Brasil",
  "Qatar": "Catar", "Portugal": "Portugal", "Argentina": "Argentina",
  "Uruguay": "Uruguai", "Venezuela": "Venezuela", "Ecuador": "Equador",
  "Chile": "Chile", "Paraguay": "Paraguai", "Bolivia": "Bolívia",
  "Peru": "Peru", "Costa Rica": "Costa Rica", "Honduras": "Honduras",
  "Panama": "Panamá", "Jamaica": "Jamaica",
  "Trinidad and Tobago": "Trinidad e Tobago",
  "Nigeria": "Nigéria", "Ghana": "Gana", "Senegal": "Senegal",
  "Tunisia": "Tunísia", "Mali": "Mali",
  "Iran": "Irã", "Australia": "Austrália", "China": "China",
  "Indonesia": "Indonésia", "Vietnam": "Vietnã", "Thailand": "Tailândia",
  "Wales": "País de Gales", "Scotland": "Escócia", "Ireland": "Irlanda",
  "Slovakia": "Eslováquia", "Poland": "Polônia", "Hungary": "Hungria",
  "Romania": "Romênia", "Greece": "Grécia", "Ukraine": "Ucrânia",
  "Serbia": "Sérvia", "Denmark": "Dinamarca", "Finland": "Finlândia",
  "Iceland": "Islândia", "Israel": "Israel",
  "Bosnia-Herzegovina": "Bósnia-Herzegovina",
  "Bosnia and Herzegovina": "Bósnia-Herzegovina",
  "Curacao": "Curaçao", "Curaçao": "Curaçao",
  "Haiti": "Haiti",
};

function normalizeTeamName(name) {
  if (!name) return '';
  const translated = TEAM_DICTIONARY[name] || name;
  return translated.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function teamsMatch(nameA, nameB) {
  const a = normalizeTeamName(nameA);
  const b = normalizeTeamName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  const sliceA = a.slice(0, Math.min(a.length, 5));
  const sliceB = b.slice(0, Math.min(b.length, 5));
  return a.includes(sliceB) || b.includes(sliceA);
}

// ============================================================
//  BUSCA O CALENDÁRIO COMPLETO DA COPA (COM CACHE DE 6H)
// ============================================================

async function getCopaEvents() {
  const agora = Date.now();
  if (!cachedCopaEvents || !cacheLoadedAt || (agora - cacheLoadedAt) > 6 * 60 * 60 * 1000) {
    console.log('🔄 Carregando calendário completo da Copa 2026...');
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/1/eventsseason.php?id=${COPA_LEAGUE_ID}&s=${COPA_SEASON}`;
      const res = await fetch(url);
      const data = await res.json();
      cachedCopaEvents = data.events || [];
      cacheLoadedAt = agora;
      console.log(`✅ ${cachedCopaEvents.length} jogos carregados da Copa 2026`);
    } catch (err) {
      console.error('❌ Falha ao carregar calendário da Copa:', err.message);
      cachedCopaEvents = cachedCopaEvents || [];
    }
  }
  return cachedCopaEvents;
}

function invalidateCopaCache() {
  cachedCopaEvents = null;
  cacheLoadedAt = null;
}

// ============================================================
//  RETORNA OS JOGOS DO MATA-MATA JÁ ENCERRADOS,
//  ORDENADOS POR DATA/HORA — na mesma sequência em que
//  o bolão numera (73, 74, 75...)
// ============================================================

function getJogosMataMataEncerrados(eventos) {
  return eventos
    .filter(e =>
      (e.strStatus === 'FT' || e.strStatus === 'AET') &&
      e.intHomeScore !== null && e.intHomeScore !== undefined &&
      e.intAwayScore !== null && e.intAwayScore !== undefined
    )
    .sort((a, b) => {
      // Ordena por data e depois por horário
      const dtA = new Date(`${a.dateEvent}T${a.strTime || '00:00'}:00Z`);
      const dtB = new Date(`${b.dateEvent}T${b.strTime || '00:00'}:00Z`);
      return dtA - dtB;
    });
}

// ============================================================
//  SINCRONIZAÇÃO PRINCIPAL
// ============================================================

async function sincronizarResultados() {
  const salvos = [];
  const erros  = [];

  try {
    // ── 1) FASE DE GRUPOS (jogos 1-72): cruza por nome de time ──
    const d = new Date();
    const datas = [];
    for (let offset = 0; offset <= 1; offset++) {
      const dia = new Date(d);
      dia.setDate(dia.getDate() - offset);
      datas.push(
        dia.getFullYear() + '-' +
        String(dia.getMonth() + 1).padStart(2, '0') + '-' +
        String(dia.getDate()).padStart(2, '0')
      );
    }

    let eventosDia = [];
    for (const dateStr of datas) {
      const url = `https://www.thesportsdb.com/api/v1/json/1/eventsday.php?d=${dateStr}&s=Soccer`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.events) eventosDia = eventosDia.concat(data.events);
    }

    for (const e of eventosDia) {
      if (e.strStatus !== 'FT' && e.strStatus !== 'AET') continue;
      if (e.intHomeScore === null || e.intAwayScore === null) continue;

      const apiHome = normalizeTeamName(e.strHomeTeam);
      const apiAway = normalizeTeamName(e.strAwayTeam);

      // Só procura nos jogos da fase de grupos (1-72)
      const jogoMatch = DADOS_BOLAO.jogos.find(j => {
        if (j.jogo > 72) return false;
        return teamsMatch(j.mandante, apiHome) && teamsMatch(j.visitante, apiAway);
      });

      if (jogoMatch) {
        await salvarResultado(jogoMatch.jogo, `${e.intHomeScore}-${e.intAwayScore}`, e, salvos, erros);
      }
    }

    // ── 2) MATA-MATA (jogos 73+): cruza por ordem cronológica ──
    const todosEventosCopa = await getCopaEvents();
    const mataMataEncerrados = getJogosMataMataEncerrados(todosEventosCopa);

    for (let i = 0; i < mataMataEncerrados.length; i++) {
      const e = mataMataEncerrados[i];
      const jogoNum = PRIMEIRO_JOGO_MATAMATA + i; // 73, 74, 75...
      const placar  = `${e.intHomeScore}-${e.intAwayScore}`;
      await salvarResultado(jogoNum, placar, e, salvos, erros);
    }

  } catch (err) {
    erros.push(`Erro geral: ${err.message}`);
  }

  return { salvos, erros };
}

async function salvarResultado(jogoNum, placar, evento, salvos, erros) {
  try {
    const { rows } = await pool.query(
      'SELECT resultado FROM resultados WHERE jogo_num = $1',
      [jogoNum]
    );
    if (rows.length === 0 || rows[0].resultado !== placar) {
      await pool.query(`
        INSERT INTO resultados (jogo_num, resultado)
        VALUES ($1, $2)
        ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()
      `, [jogoNum, placar]);

      const times = evento ? `${evento.strHomeTeam} x ${evento.strAwayTeam}` : '';
      console.log(`✅ [SYNC] Jogo #${jogoNum} ${times}: ${placar}`);
      io.emit('atualizacao_placar', { jogo: jogoNum, placar });
      salvos.push({ jogo: jogoNum, placar, times });
    }
  } catch (err) {
    erros.push(`Jogo #${jogoNum}: ${err.message}`);
  }
}

// ============================================================
//  CRON: a cada hora (:00 e :30)
// ============================================================

cron.schedule('0 * * * *', async () => {
  console.log('🔄 [CRON] Sincronizando resultados...');
  const { salvos, erros } = await sincronizarResultados();
  if (salvos.length) console.log(`✅ [CRON] ${salvos.length} resultado(s) atualizado(s)`);
  if (erros.length)  console.warn(`⚠️  [CRON] Erros:`, erros);
});

cron.schedule('30 * * * *', async () => {
  await sincronizarResultados();
});

// Invalida o cache todo dia às 3h da manhã
cron.schedule('0 3 * * *', () => {
  invalidateCopaCache();
  console.log('🗑️  [CRON] Cache da Copa invalidado');
});

// ============================================================
//  ROTAS ADMIN EXTRAS
// ============================================================

// Sync manual imediato
app.post('/api/admin/sync-resultados', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    invalidateCopaCache();
    const resultado = await sincronizarResultados();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview do mapeamento do mata-mata (debug)
app.post('/api/admin/preview-matamata', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    invalidateCopaCache();
    const eventos = await getCopaEvents();
    const encerrados = getJogosMataMataEncerrados(eventos);
    const preview = encerrados.map((e, i) => ({
      jogo_num: PRIMEIRO_JOGO_MATAMATA + i,
      data: e.dateEvent,
      horario: e.strTime,
      status: e.strStatus,
      mandante: e.strHomeTeam,
      visitante: e.strAwayTeam,
      placar: `${e.intHomeScore}-${e.intAwayScore}`
    }));
    res.json({
      total_encerrados: encerrados.length,
      proximo_jogo: PRIMEIRO_JOGO_MATAMATA + encerrados.length,
      preview
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  ROTAS EXISTENTES (sem alteração)
// ============================================================

app.get('/api/dados-bolao', (req, res) => {
  res.json(DADOS_BOLAO);
});

app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT chave, valor FROM configuracoes');
    const conf = {};
    rows.forEach(r => conf[r.chave] = r.valor);
    res.json(conf);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

app.post('/api/config', async (req, res) => {
  const { chave, valor } = req.body;
  try {
    await pool.query(`
      INSERT INTO configuracoes (chave, valor)
      VALUES ($1, $2)
      ON CONFLICT (chave) DO UPDATE SET valor=$2
    `, [chave, valor]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

app.post('/api/admin/usuarios', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const { rows } = await pool.query('SELECT usuario, perfil1, perfil2 FROM usuarios ORDER BY usuario');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

app.post('/api/admin/usuarios/senha', async (req, res) => {
  const { senhaAdmin, usuarioTarget, novaSenha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senhaAdmin !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const hashedNovaSenha = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE usuarios SET senha=$1 WHERE usuario=$2', [hashedNovaSenha, usuarioTarget]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

app.post('/api/admin/usuarios/delete', async (req, res) => {
  const { senhaAdmin, usuarioTarget } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senhaAdmin !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    await pool.query('DELETE FROM usuarios WHERE usuario=$1', [usuarioTarget]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { usuario, senha, perfil1, perfil2 } = req.body;
  if (!usuario || !senha || !perfil1) {
    return res.status(400).json({ error: 'Usuário, senha e perfil 1 são obrigatórios.' });
  }
  try {
    const check = await pool.query(
      'SELECT usuario FROM usuarios WHERE perfil1=$1 OR perfil1=$2 OR perfil2=$1 OR perfil2=$2',
      [perfil1, perfil2 || '']
    );
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Um dos perfis escolhidos já foi vinculado a outra conta.' });
    }
    const hashedPassword = await bcrypt.hash(senha, 10);
    await pool.query(
      'INSERT INTO usuarios (usuario, senha, perfil1, perfil2) VALUES ($1, $2, $3, $4)',
      [usuario, hashedPassword, perfil1, perfil2 || null]
    );
    res.json({ ok: true, perfis: [perfil1, perfil2].filter(Boolean) });
  } catch (err) {
    res.status(400).json({ error: 'Nome de usuário já existe ou falha no banco de dados.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario=$1', [usuario]);
    if (rows.length > 0) {
      const user = rows[0];
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(senha, user.senha);
      } catch (bcryptError) {}

      if (!isMatch && senha === user.senha) {
        const hashedPassword = await bcrypt.hash(senha, 10);
        await pool.query('UPDATE usuarios SET senha=$1 WHERE usuario=$2', [hashedPassword, usuario]);
        isMatch = true;
        console.log(`🔄 Usuário [${usuario}] migrado para bcrypt`);
      }

      if (isMatch) {
        const perfis = [user.perfil1, user.perfil2].filter(Boolean);
        return res.json({ ok: true, perfis });
      }
    }
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor durante o login.' });
  }
});

app.get('/api/resultados', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT jogo_num, resultado FROM resultados');
    const obj = {};
    rows.forEach(r => obj[r.jogo_num] = r.resultado);
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar resultados' });
  }
});

app.post('/api/resultados/:num', async (req, res) => {
  const num = parseInt(req.params.num);
  const { resultado } = req.body;
  if (!resultado) return res.status(400).json({ error: 'Inválido' });
  try {
    await pool.query(`
      INSERT INTO resultados (jogo_num, resultado)
      VALUES ($1, $2)
      ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()
    `, [num, resultado]);
    io.emit('atualizacao_placar', { jogo: num, placar: resultado });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar resultado' });
  }
});

app.delete('/api/resultados/:num', async (req, res) => {
  try {
    await pool.query('DELETE FROM resultados WHERE jogo_num=$1', [parseInt(req.params.num)]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar resultado' });
  }
});

app.delete('/api/resultados', async (req, res) => {
  try {
    await pool.query('DELETE FROM resultados');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao resetar banco de resultados' });
  }
});

app.get('/api/palpites-finais', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT participante, jogo_num, palpite FROM palpites_fase_final');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar palpites finais' });
  }
});

const getFaseDeadlineKey = (num) => {
  if (num >= 73 && num <= 88)   return 'deadline_r32';
  if (num >= 89 && num <= 96)   return 'deadline_r16';
  if (num >= 97 && num <= 100)  return 'deadline_qf';
  if (num >= 101 && num <= 102) return 'deadline_sf';
  if (num >= 103 && num <= 104) return 'deadline_final';
  return null;
};

app.post('/api/palpites-finais', async (req, res) => {
  const { participante, jogo_num, palpite } = req.body;
  if (!participante || !jogo_num || !['V','E','D'].includes(palpite)) {
    return res.status(400).json({ error: 'Dados incompletos ou inválidos' });
  }
  try {
    const dKey = getFaseDeadlineKey(parseInt(jogo_num));
    if (dKey) {
      const confRow = await pool.query('SELECT valor FROM configuracoes WHERE chave = $1', [dKey]);
      if (confRow.rows.length > 0 && confRow.rows[0].valor) {
        if (new Date() > new Date(confRow.rows[0].valor)) {
          return res.status(403).json({ error: 'O prazo para os palpites desta fase já encerrou.' });
        }
      }
    }
    await pool.query(`
      INSERT INTO palpites_fase_final (participante, jogo_num, palpite)
      VALUES ($1, $2, $3)
      ON CONFLICT (participante, jogo_num) DO UPDATE SET palpite=$3, updated_at=NOW()
    `, [participante, parseInt(jogo_num), palpite]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar palpite final' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha === ADMIN_SENHA) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Não autorizado' });
  }
});

// ============================================================
//  START
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT} com WebSocket ativo`));
