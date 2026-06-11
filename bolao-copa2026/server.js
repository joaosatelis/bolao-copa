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

// Cria tabela se não existir
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados (
      jogo_num INTEGER PRIMARY KEY,
      resultado CHAR(1) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✅ Banco pronto');
}
init();

// GET todos os resultados
app.get('/api/resultados', async (req, res) => {
  const { rows } = await pool.query('SELECT jogo_num, resultado FROM resultados');
  const obj = {};
  rows.forEach(r => obj[r.jogo_num] = r.resultado);
  res.json(obj);
});

// POST salvar resultado
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

// DELETE limpar resultado
app.delete('/api/resultados/:num', async (req, res) => {
  await pool.query('DELETE FROM resultados WHERE jogo_num=$1', [parseInt(req.params.num)]);
  res.json({ ok: true });
});

// DELETE todos
app.delete('/api/resultados', async (req, res) => {
  await pool.query('DELETE FROM resultados');
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));