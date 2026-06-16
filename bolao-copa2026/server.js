const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do PostgreSQL conectando via Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

// Middlewares essenciais para a API funcionar
app.use(express.json()); // Permite ler o body das requisições em JSON
app.use(express.urlencoded({ extended: true }));

// Serve a interface do seu bolão (index.html, favicon, CSS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Rota para buscar os palpites da galera direto do banco
app.get('/api/palpites', async (req, res) => {
  try {
    // Busca todas as linhas da tabela criada pelo Python
    const result = await pool.query('SELECT * FROM palpites');
    res.json(result.rows);
  } catch (err) {
    console.error("Erro na leitura do banco de dados:", err);
    res.status(500).json({ error: "Falha ao buscar os palpites" });
  }
});

// Rota de exemplo para atualizar ou inserir resultados
app.post('/api/atualizar', async (req, res) => {
  const { mandante, visitante, fase, resultado } = req.body;
  
  try {
    // Exemplo de query para atualizar placares (precisará adaptar para os seus campos reais)
    // const query = 'UPDATE palpites SET resultado = $1 WHERE mandante = $2 AND visitante = $3';
    // await pool.query(query, [resultado, mandante, visitante]);
    
    res.status(200).json({ message: "Rota pronta para receber a lógica de atualização" });
  } catch (err) {
    console.error("Erro ao atualizar:", err);
    res.status(500).json({ error: "Falha ao gravar no banco" });
  }
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor do bolão online e ouvindo na porta ${port}`);
});