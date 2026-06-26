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
//  CONSTANTES E INTEGRAÇÃO (API-FOOTBALL)
// ============================================================
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_URL = 'https://v3.football.api-sports.io';
const COPA_LEAGUE_ID = '1'; 
const COPA_SEASON = '2026';
const PRIMEIRO_JOGO_MATAMATA = 73;

let cachedCopaEvents = null;
let cacheLoadedAt = null;

async function getCopaEvents() {
  const agora = Date.now();
  // Cache de 1 hora para economizar cota da API
  if (!cachedCopaEvents || !cacheLoadedAt || (agora - cacheLoadedAt) > 60 * 60 * 1000) {
    console.log('🔄 Buscando calendário completo na API-Football...');
    try {
      const url = `${API_FOOTBALL_URL}/fixtures?league=${COPA_LEAGUE_ID}&season=${COPA_SEASON}`;
      const res = await fetch(url, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
      });
      const data = await res.json();
      
      let eventos = data.response || [];
      eventos.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
      
      cachedCopaEvents = eventos;
      cacheLoadedAt = agora;
      console.log(`✅ ${cachedCopaEvents.length} jogos carregados da API`);
    } catch (err) {
      console.error('❌ Falha ao carregar calendário da API-Football:', err.message);
      cachedCopaEvents = cachedCopaEvents || [];
    }
  }
  return cachedCopaEvents;
}

function invalidateCopaCache() {
  cachedCopaEvents = null;
  cacheLoadedAt = null;
}

async function sincronizarResultados() {
  const salvos = [];
  const erros = [];

  try {
    const todosEventos = await getCopaEvents();
    if (todosEventos.length === 0) throw new Error("Nenhum evento carregado da API");

    // Varre todos os 104 jogos e atualiza quem já encerrou (Tempo Normal, Prorrogação ou Pênaltis)
    for (let i = 0; i < todosEventos.length; i++) {
      const evento = todosEventos[i];
      const jogoNum = i + 1;
      const status = evento.fixture.status.short;
      
      if (['FT', 'AET', 'PEN'].includes(status)) {
        const placar = `${evento.goals.home}-${evento.goals.away}`;
        const eventoAdaptado = { strHomeTeam: evento.teams.home.name, strAwayTeam: evento.teams.away.name };
        await salvarResultado(jogoNum, placar, eventoAdaptado, salvos, erros);
      }
    }
  } catch (err) {
    erros.push(`Erro geral de sync: ${err.message}`);
  }
  return { salvos, erros };
}

async function salvarResultado(jogoNum, placar, evento, salvos, erros) {
  try {
    const { rows } = await pool.query('SELECT resultado FROM resultados WHERE jogo_num = $1', [jogoNum]);
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
//  CRON E ROTAS ADMIN
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

cron.schedule('0 3 * * *', () => {
  invalidateCopaCache();
  console.log('🗑️  [CRON] Cache da Copa invalidado');
});

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

app.post('/api/admin/preview-matamata', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    invalidateCopaCache();
    const eventos = await getCopaEvents();
    const preview = eventos.slice(72).map((e, i) => ({
      jogo_num: 73 + i,
      data: e.fixture.date,
      status: e.fixture.status.short,
      mandante: e.teams.home.name,
      visitante: e.teams.away.name,
      placar: `${e.goals.home}-${e.goals.away}`
    }));
    res.json({ total_encerrados: eventos.length, preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  ROTAS FRONT-END
// ============================================================

app.get('/api/matamata-info', async (req, res) => {
  try {
    const eventos = await getCopaEvents();
    if (!eventos || eventos.length === 0) return res.json([]);
    const matamata = eventos.slice(72).map((e, index) => {
       return {
         jogo: 73 + index,
         data: e.fixture.date, 
         status: e.fixture.status.short,
         mandante: e.teams.home.name,
         visitante: e.teams.away.name,
       };
    });
    res.json(matamata);
  } catch(error) {
    res.status(500).json({ error: 'Erro ao buscar dados do mata-mata' });
  }
});

app.get('/api/dados-bolao', (req, res) => res.json(DADOS_BOLAO));

app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT chave, valor FROM configuracoes');
    const conf = {};
    rows.forEach(r => conf[r.chave] = r.valor);
    res.json(conf);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar configurações' }); }
});

app.post('/api/config', async (req, res) => {
  const { chave, valor } = req.body;
  try {
    await pool.query('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor=$2', [chave, valor]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro ao salvar configuração' }); }
});

app.post('/api/admin/usuarios', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const { rows } = await pool.query('SELECT usuario, perfil1, perfil2 FROM usuarios ORDER BY usuario');
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar usuários' }); }
});

app.post('/api/admin/usuarios/senha', async (req, res) => {
  const { senhaAdmin, usuarioTarget, novaSenha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senhaAdmin !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const hashedNovaSenha = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE usuarios SET senha=$1 WHERE usuario=$2', [hashedNovaSenha, usuarioTarget]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro ao redefinir senha' }); }
});

app.post('/api/admin/usuarios/delete', async (req, res) => {
  const { senhaAdmin, usuarioTarget } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senhaAdmin !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });
  try {
    await pool.query('DELETE FROM usuarios WHERE usuario=$1', [usuarioTarget]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro ao excluir usuário' }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { usuario, senha, perfil1, perfil2 } = req.body;
  if (!usuario || !senha || !perfil1) return res.status(400).json({ error: 'Dados obrigatórios.' });
  try {
    const check = await pool.query('SELECT usuario FROM usuarios WHERE perfil1=$1 OR perfil1=$2 OR perfil2=$1 OR perfil2=$2', [perfil1, perfil2 || '']);
    if (check.rows.length > 0) return res.status(400).json({ error: 'Um dos perfis escolhidos já foi vinculado.' });
    const hashedPassword = await bcrypt.hash(senha, 10);
    await pool.query('INSERT INTO usuarios (usuario, senha, perfil1, perfil2) VALUES ($1, $2, $3, $4)', [usuario, hashedPassword, perfil1, perfil2 || null]);
    res.json({ ok: true, perfis: [perfil1, perfil2].filter(Boolean) });
  } catch (err) { res.status(400).json({ error: 'Nome de usuário já existe.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario=$1', [usuario]);
    if (rows.length > 0) {
      const user = rows[0];
      let isMatch = false;
      try { isMatch = await bcrypt.compare(senha, user.senha); } catch (bcryptError) {}
      if (!isMatch && senha === user.senha) {
        const hashedPassword = await bcrypt.hash(senha, 10);
        await pool.query('UPDATE usuarios SET senha=$1 WHERE usuario=$2', [hashedPassword, usuario]);
        isMatch = true;
      }
      if (isMatch) return res.json({ ok: true, perfis: [user.perfil1, user.perfil2].filter(Boolean) });
    }
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  } catch (error) { res.status(500).json({ error: 'Erro no servidor' }); }
});

app.get('/api/resultados', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT jogo_num, resultado FROM resultados');
    const obj = {};
    rows.forEach(r => obj[r.jogo_num] = r.resultado);
    res.json(obj);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar resultados' }); }
});

app.post('/api/resultados/:num', async (req, res) => {
  const num = parseInt(req.params.num);
  const { resultado } = req.body;
  if (!resultado) return res.status(400).json({ error: 'Inválido' });
  try {
    await pool.query('INSERT INTO resultados (jogo_num, resultado) VALUES ($1, $2) ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()', [num, resultado]);
    io.emit('atualizacao_placar', { jogo: num, placar: resultado });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro ao salvar' }); }
});

app.delete('/api/resultados/:num', async (req, res) => {
  try {
    await pool.query('DELETE FROM resultados WHERE jogo_num=$1', [parseInt(req.params.num)]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.delete('/api/resultados', async (req, res) => {
  try {
    await pool.query('DELETE FROM resultados');
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.get('/api/palpites-finais', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT participante, jogo_num, palpite FROM palpites_fase_final');
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
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
  if (!participante || !jogo_num || !['V','E','D'].includes(palpite)) return res.status(400).json({ error: 'Dados inválidos' });
  try {
    const dKey = getFaseDeadlineKey(parseInt(jogo_num));
    if (dKey) {
      const confRow = await pool.query('SELECT valor FROM configuracoes WHERE chave = $1', [dKey]);
      if (confRow.rows.length > 0 && confRow.rows[0].valor) {
        if (new Date() > new Date(confRow.rows[0].valor)) return res.status(403).json({ error: 'O prazo encerrou.' });
      }
    }
    await pool.query('INSERT INTO palpites_fase_final (participante, jogo_num, palpite) VALUES ($1, $2, $3) ON CONFLICT (participante, jogo_num) DO UPDATE SET palpite=$3, updated_at=NOW()', [participante, parseInt(jogo_num), palpite]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Erro ao registrar palpite' }); }
});

app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha === ADMIN_SENHA) res.json({ ok: true }); else res.status(401).json({ error: 'Não autorizado' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT} com WebSocket ativo`));
