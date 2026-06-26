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
    const saltRounds = 10;
    const hashedNovaSenha = await bcrypt.hash(novaSenha, saltRounds);
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

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(senha, saltRounds);

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
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(senha, saltRounds);
        await pool.query('UPDATE usuarios SET senha=$1 WHERE usuario=$2', [hashedPassword, usuario]);
        isMatch = true;
        console.log(`🔄 Usuário [${usuario}] migrado para Bcrypt com sucesso durante o login.`);
      }

      if (isMatch) {
        const perfis = [user.perfil1, user.perfil2].filter(Boolean);
        return res.json({ ok: true, perfis });
      }
    }
    
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  } catch (error) {
    console.error('Erro no fluxo de login:', error);
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
  if (num >= 73 && num <= 88) return 'deadline_r32';
  if (num >= 89 && num <= 96) return 'deadline_r16';
  if (num >= 97 && num <= 100) return 'deadline_qf';
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
const TEAM_DICTIONARY = {
  "South Africa": "África do Sul", "South Korea": "Coreia do Sul", "Czech Republic": "Tchéquia", "Spain": "Espanha",
  "Germany": "Alemanha", "Netherlands": "Países Baixos", "England": "Inglaterra", "France": "França",
  "Croatia": "Croácia", "Belgium": "Bélgica", "Switzerland": "Suíça", "Cameroon": "Camarões", "Japan": "Japão",
  "Morocco": "Marrocos", "USA": "Estados Unidos", "United States": "Estados Unidos", "Turkey": "Turquia",
  "Ivory Coast": "Costa do Marfim", "Cote d'Ivoire": "Costa do Marfim", "Sweden": "Suécia", "New Zealand": "Nova Zelândia",
  "Egypt": "Egito", "Saudi Arabia": "Arábia Saudita", "Cape Verde": "Cabo Verde", "Senegal": "Senegal",
  "Iraq": "Iraque", "Norway": "Noruega", "Algeria": "Argélia", "Austria": "Áustria", "Jordan": "Jordânia",
  "Colombia": "Colômbia", "DR Congo": "RD Congo", "Uzbekistan": "Uzbequistão", "Mexico": "México",
  "Canada": "Canadá", "Brazil": "Brasil", "Qatar": "Catar"
};

function normalizeTeamName(name) {
  if (!name) return '';
  const translated = TEAM_DICTIONARY[name] || name;
  return translated.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// 1. Controle de Cache do Calendário (6 horas)
let cachedWorldCupEvents = [];
let lastCacheTime = 0;

async function fetchWorldCupEvents() {
  const now = Date.now();
  // 6 horas em milissegundos = 21600000
  if (cachedWorldCupEvents.length > 0 && (now - lastCacheTime < 21600000)) {
    return cachedWorldCupEvents;
  }

  try {
    // Busca a temporada completa da Copa de 2026 (League ID 4429)
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.events) {
      // Ordenação cronológica fundamental para o mapeamento do mata-mata (fallback)
      cachedWorldCupEvents = data.events.sort((a, b) => {
        const dateA = new Date(`${a.dateEvent}T${a.strTime || '00:00:00'}`);
        const dateB = new Date(`${b.dateEvent}T${b.strTime || '00:00:00'}`);
        return dateA - dateB;
      });
      lastCacheTime = now;
      console.log(`✅ [CACHE] Calendário da Copa carregado com ${cachedWorldCupEvents.length} jogos.`);
    }
  } catch (err) {
    console.error('❌ Erro ao buscar calendário da Copa:', err.message);
  }
  
  return cachedWorldCupEvents;
}

// 2. Motor de Sincronização Duplo (Nome -> Cronologia)
async function runSyncResultados() {
  const events = await fetchWorldCupEvents();
  const jogosAtualizados = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const isFinished = ['FT', 'AET', 'PEN'].includes(e.strStatus);
    
    // Ignora jogos não finalizados ou sem placar
    if (!isFinished || e.intHomeScore === null || e.intAwayScore === null) continue;

    const placarExato = `${e.intHomeScore}-${e.intAwayScore}`;
    const apiHome = normalizeTeamName(e.strHomeTeam);
    const apiAway = normalizeTeamName(e.strAwayTeam);

    let jogoBolaoNum = null;

    // Estratégia 1: Match por Nome dos times (Resolve jogos 1 a 72 perfeitamente)
    const jogoMatchNome = DADOS_BOLAO.jogos.find(j => {
      const localMand = normalizeTeamName(j.mandante);
      const localVis = normalizeTeamName(j.visitante);
      const matchMand = localMand.includes(apiHome.slice(0, 5)) || apiHome.includes(localMand.slice(0, 5));
      const matchVis = localVis.includes(apiAway.slice(0, 5)) || apiAway.includes(localVis.slice(0, 5));
      return matchMand && matchVis;
    });

    if (jogoMatchNome) {
      jogoBolaoNum = jogoMatchNome.jogo;
    } else {
      // Estratégia 2: Fallback Sequencial (Resolve jogos 73 a 104)
      // O índice da API ordenada bate com o número do jogo (índice 72 = Jogo 73)
      const expectedJogoNum = i + 1;
      if (expectedJogoNum >= 73 && expectedJogoNum <= 104) {
        jogoBolaoNum = expectedJogoNum;
      }
    }

    // Se encontrou o mapeamento, salva/atualiza o resultado
    if (jogoBolaoNum) {
      const { rows } = await pool.query('SELECT resultado FROM resultados WHERE jogo_num = $1', [jogoBolaoNum]);
      
      if (rows.length === 0 || rows[0].resultado !== placarExato) {
        await pool.query(`
          INSERT INTO resultados (jogo_num, resultado)
          VALUES ($1, $2)
          ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()
        `, [jogoBolaoNum, placarExato]);
        
        io.emit('atualizacao_placar', { jogo: jogoBolaoNum, placar: placarExato });
        jogosAtualizados.push({ jogo: jogoBolaoNum, placar: placarExato, metodo: jogoMatchNome ? 'nome' : 'cronologia' });
      }
    }
  }
  return jogosAtualizados;
}

// 3. Novas Rotas Administrativas

// Sincronização manual
app.post('/api/admin/sync-resultados', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const atualizados = await runSyncResultados();
    res.json({ ok: true, atualizados, mensagem: `${atualizados.length} jogos salvos/atualizados.` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao rodar sincronização manual', detalhe: err.message });
  }
});

// Preview de cruzamento (Ótimo para debuggar o mata-mata)
app.post('/api/admin/preview-matamata', async (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha !== ADMIN_SENHA) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const events = await fetchWorldCupEvents();
    const preview = events.map((e, index) => {
      const num = index + 1;
      const apiHome = normalizeTeamName(e.strHomeTeam);
      const apiAway = normalizeTeamName(e.strAwayTeam);

      let metodo = num >= 73 ? 'Ordem Cronológica (Mata-mata)' : 'Sem Match';
      
      const matchNome = DADOS_BOLAO.jogos.find(j => {
        const localMand = normalizeTeamName(j.mandante);
        const localVis = normalizeTeamName(j.visitante);
        return (localMand.includes(apiHome.slice(0, 5)) || apiHome.includes(localMand.slice(0, 5))) &&
               (localVis.includes(apiAway.slice(0, 5)) || apiAway.includes(localVis.slice(0, 5)));
      });

      if (matchNome) metodo = `Nome (Match exato com Jogo ${matchNome.jogo})`;

      return {
        jogo_bolao: num,
        data_hora: `${e.dateEvent} ${e.strTime || ''}`.trim(),
        mandante_api: e.strHomeTeam,
        visitante_api: e.strAwayTeam,
        status: e.strStatus,
        metodo_aplicado: metodo
      };
    });
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar preview', detalhe: err.message });
  }
});

// 4. CRON atualizado para rodar :00 e :30
cron.schedule('0,30 * * * *', async () => {
  console.log('🔄 [CRON] Iniciando sincronização dupla de placares...');
  try {
    const atualizados = await runSyncResultados();
    if (atualizados.length > 0) {
      console.log(`✅ [CRON] Atualizou ${atualizados.length} jogos com sucesso.`);
    } else {
      console.log(`✅ [CRON] Nenhum novo resultado finalizado encontrado.`);
    }
  } catch (err) {
    console.error('❌ [CRON] Erro na automação dupla:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} com WebSocket ativo`));
