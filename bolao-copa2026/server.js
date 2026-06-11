const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com PostgreSQL (variável de ambiente do Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Cria tabelas se não existirem
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados (
      jogo_num INTEGER PRIMARY KEY,
      resultado CHAR(1) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Nova tabela para registrar os palpites individuais das fases seguintes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS palpites_fase_final (
      participante TEXT NOT NULL,
      jogo_num INTEGER NOT NULL,
      palpite CHAR(1) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (participante, jogo_num)
    )
  `);
  console.log('✅ Banco pronto');
}
init();

// GET todos os resultados oficiais
app.get('/api/resultados', async (req, res) => {
  const { rows } = await pool.query('SELECT jogo_num, resultado FROM resultados');
  const obj = {};
  rows.forEach(r => obj[r.jogo_num] = r.resultado);
  res.json(obj);
});

// POST salvar resultado oficial (admin)
app.post('/api/resultados/:num', async (req, res) => {
  const num = parseInt(req.params.num);
  const { resultado } = req.body;
  if (!['V','E','D'].includes(resultado)) return res.status(400).json({ error: 'Inválido' });
  await pool.query(`
    INSERT INTO resultados (jogo_num, resultado)
    VALUES ($1, $2)
    ON CONFLICT (jogo_num) DO UPDATE SET resultado=$2, updated_at=NOW()
  `, [num, resultado]);
  res.json({ ok: true });
});

// DELETE limpar resultado oficial
app.delete('/api/resultados/:num', async (req, res) => {
  await pool.query('DELETE FROM resultados WHERE jogo_num=$1', [parseInt(req.params.num)]);
  res.json({ ok: true });
});

// DELETE todos os resultados oficiais
app.delete('/api/resultados', async (req, res) => {
  await pool.query('DELETE FROM resultados');
  res.json({ ok: true });
});

// ROTA NOVA: GET todos os palpites dinâmicos das fases seguintes
app.get('/api/palpites-finais', async (req, res) => {
  const { rows } = await pool.query('SELECT participante, jogo_num, palpite FROM palpites_fase_final');
  res.json(rows);
});

// ROTA NOVA: POST salvar ou atualizar palpite de um participante específico
app.post('/api/palpites-finais', async (req, res) => {
  const { participante, jogo_num, palpite } = req.body;
  if (!participante || !jogo_num || !['V','E','D'].includes(palpite)) {
    return res.status(400).json({ error: 'Dados incompletos ou inválidos' });
  }
  await pool.query(`
    INSERT INTO palpites_fase_final (participante, jogo_num, palpite)
    VALUES ($1, $2, $3)
    ON CONFLICT (participante, jogo_num) DO UPDATE SET palpite=$3, updated_at=NOW()
  `, [participante, parseInt(jogo_num), palpite]);
  res.json({ ok: true });
});

// POST verificar senha do admin
app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
  if (senha === ADMIN_SENHA) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Não autorizado' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
