const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const bcrypt = require('bcrypt');
const DADOS_BOLAO = require('./dados_bolao.json'); // Importação do JSON isolado

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Inicialização do Banco
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

// ═══════════════════════════════════════════════════════════
// ROTAS BASE
// ═══════════════════════════════════════════════════════════
app.get('/api/dados-bolao', (req, res) => {
  res.json(DADOS_BOLAO);
});

// ═══════════════════════════════════════════════════════════
// ROTAS DE CONFIGURAÇÕES GLOBAIS E ADMIN
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// ROTAS DE AUTENTICAÇÃO (SISTEMA DE CONTAS)
// ═══════════════════════════════════════════════════════════
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

// Rota de login atualizada com a migração silenciosa para o bcrypt
app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario=$1', [usuario]);
    
    if (rows.length > 0) {
      const user = rows[0];
      let isMatch = false;

      // 1. Tenta validar assumindo que a senha já é um hash (usuários novos)
      try {
        isMatch = await bcrypt.compare(senha, user.senha);
      } catch (bcryptError) {
        // Ignora erro interno do bcrypt se a senha no banco for texto puro
      }

      // 2. Se não deu match via hash, verifica o texto puro (usuários antigos)
      if (!isMatch && senha === user.senha) {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(senha, saltRounds);
        
        // Atualiza a senha no banco para o formato criptografado
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

// ═══════════════════════════════════════════════════════════
// ROTAS DO BOLÃO
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// AUTOMAÇÃO DE RESULTADOS (CRON JOB)
// ═══════════════════════════════════════════════════════════
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

cron.schedule('0 * * * *', async () => {
  console.log('🔄 [CRON] Buscando resultados automáticos de ontem e hoje...');
  try {
    const d = new Date();
    const dates = [];
    
    dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    
    const dYest = new Date(d);
    dYest.setDate(dYest.getDate() - 1);
    dates.push(dYest.getFullYear() + '-' + String(dYest.getMonth() + 1).padStart(2, '0') + '-' + String(dYest.getDate()).padStart(2, '0'));

    let allEvents = [];
    for (const dateStr of dates) {
       const url = `https://www.thesportsdb.com/api/v1/json/1/eventsday.php?d=${dateStr}&s=Soccer`;
       const res = await fetch(url);
       const data = await res.json();
       if (data.events) allEvents = allEvents.concat(data.events);
    }

    for (const e of allEvents) {
      const isFinished = e.strStatus === 'FT' || e.strStatus === 'AET';
      if (isFinished && e.intHomeScore !== null && e.intAwayScore !== null) {
        const placarExato = `${e.intHomeScore}-${e.intAwayScore}`;
        const apiHome = normalizeTeamName(e.strHomeTeam);
        const apiAway = normalizeTeamName(e.strAwayTeam);

        const jogoMatch = DADOS_BOLAO.jogos.find(j => {
            const localMand = normalizeTeamName(j.mandante);
            const localVis = normalizeTeamName(j.visitante);
            const matchMand = localMand.includes(apiHome.slice(0,5)) || apiHome.includes(localMand.slice(0,5));
            const matchVis = localVis.includes(apiAway.slice(0,5)) || apiAway.includes(localVis.slice(0,5));
            return matchMand && matchVis;
        });

        if (jogoMatch) {
          const { rows } = await pool.query('SELECT resultado FROM resultados WHERE jogo_num = $1', [jogoMatch.jogo]);
          if (rows.length === 0 || rows[0].resultado !== placarExato) {
             await pool.query(`
                INSERT INTO resultados (jogo_num, resultado)
                VALUES ($1, $2)
                ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()
             `, [jogoMatch.jogo, placarExato]);
             console.log(`✅ [CRON] Jogo #${jogoMatch.jogo} salvo no banco: ${placarExato}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ [CRON] Erro na automação de placares:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));