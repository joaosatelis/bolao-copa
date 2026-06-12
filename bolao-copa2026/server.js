const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resultados (
      jogo_num INTEGER PRIMARY KEY,
      resultado CHAR(1) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS palpites_fase_final (
      participante TEXT NOT NULL,
      jogo_num INTEGER NOT NULL,
      palpite CHAR(1) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (participante, jogo_num)
    )
  `);

  // Nova tabela para login e vínculo de contas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      usuario TEXT PRIMARY KEY,
      senha TEXT NOT NULL,
      perfil1 TEXT NOT NULL,
      perfil2 TEXT
    )
  `);
  console.log('✅ Banco de dados pronto');
}
init();

// ═══════════════════════════════════════════════════════════
// BASE DE DADOS FIXA (FASE DE GRUPOS)
// Fica no backend para deixar o site mais rápido
// ═══════════════════════════════════════════════════════════
const DADOS_BOLAO = {
  participantes: [
    "Ivan 1 OSS", "Ivan 2 OSS", "Andre OSS", "Lelis OSS", "Rods 1 OSS", "Rods 2 OSS",
    "Keller Poços", "Jorge OSS", "Claudia OSS", "China", "Joseney OSS", "Barrinhos OSS",
    "Marina Trinkaus", "Fabinho Irmão", "Fisher OSS", "Rafael Féra", "Raul FMC",
    "Juninho", "Lilian OSS", "Wainer OSS", "Satelis OSS", "Ana Claudia", "David OSS",
    "Carla (Lilian)"
  ],
  jogos: [
    { jogo: 1, mandante: "México", visitante: "África do Sul", fase: "Grupo A", hora: "16h", local: "Cidade do México", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"E","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"E"} },
    { jogo: 2, mandante: "Coreia do Sul", visitante: "Tchéquia", fase: "Grupo A", hora: "23h", local: "Guadalajara", palpites: {"Ivan 1 OSS":"E","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"E","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"D","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"E","Juninho":"E","Lilian OSS":"E","Wainer OSS":"D","Satelis OSS":"V","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 25, mandante: "Tchéquia", visitante: "África do Sul", fase: "Grupo A", hora: "13h", local: "Atlanta", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"D","Lelis OSS":"V","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"E","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"D"} },
    { jogo: 28, mandante: "México", visitante: "Coreia do Sul", fase: "Grupo A", hora: "22h", local: "Guadalajara", palpites: {"Ivan 1 OSS":"E","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"E","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 53, mandante: "Tchéquia", visitante: "México", fase: "Grupo A", hora: "22h", local: "Cidade do México", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"E","China":"E","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"E","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"V"} },
    { jogo: 54, mandante: "África do Sul", visitante: "Coreia do Sul", fase: "Grupo A", hora: "22h", local: "Monterrey", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"E","Jorge OSS":"D","Claudia OSS":"E","China":"V","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"E","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"E","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 3, mandante: "Canadá", visitante: "Bósnia-Herzegovina", fase: "Grupo B", hora: "16h", local: "Toronto", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"D","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"E","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"D","Juninho":"V","Lilian OSS":"V","Wainer OSS":"E","Satelis OSS":"D","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 8, mandante: "Catar", visitante: "Suíça", fase: "Grupo B", hora: "16h", local: "São Francisco", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 26, mandante: "Suíça", visitante: "Bósnia-Herzegovina", fase: "Grupo B", hora: "16h", local: "Los Angeles", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"E","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"E"} },
    { jogo: 27, mandante: "Canadá", visitante: "Catar", fase: "Grupo B", hora: "19h", local: "Vancouver", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"V","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 51, mandante: "Suíça", visitante: "Canadá", fase: "Grupo B", hora: "16h", local: "Vancouver", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"V","China":"E","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"E","Fisher OSS":"D","Rafael Féra":"V","Raul FMC":"V","Juninho":"E","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"E","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 52, mandante: "Bósnia-Herzegovina", visitante: "Catar", fase: "Grupo B", hora: "16h", local: "Seattle", palpites: {"Ivan 1 OSS":"E","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"E","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"D","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 5, mandante: "Haiti", visitante: "Escócia", fase: "Grupo C", hora: "22h", local: "Boston", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"E","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 7, mandante: "Brasil", visitante: "Marrocos", fase: "Grupo C", hora: "19h", local: "Nova York", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 29, mandante: "Brasil", visitante: "Haiti", fase: "Grupo C", hora: "22h", local: "Filadélfia", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 30, mandante: "Escócia", visitante: "Marrocos", fase: "Grupo C", hora: "19h", local: "Boston", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"E","China":"E","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"E","Juninho":"E","Lilian OSS":"E","Wainer OSS":"E","Satelis OSS":"D","Ana Claudia":"E","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 49, mandante: "Escócia", visitante: "Brasil", fase: "Grupo C", hora: "19h", local: "Miami", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 50, mandante: "Marrocos", visitante: "Haiti", fase: "Grupo C", hora: "19h", local: "Atlanta", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 4, mandante: "Estados Unidos", visitante: "Paraguai", fase: "Grupo D", hora: "22h", local: "Los Angeles", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"E","Rods 1 OSS":"V","Rods 2 OSS":"D","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"D","Raul FMC":"D","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"D","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 6, mandante: "Austrália", visitante: "Turquia", fase: "Grupo D", hora: "1h", local: "Vancouver", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"E","China":"E","Joseney OSS":"D","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"E","Lilian OSS":"D","Wainer OSS":"E","Satelis OSS":"E","Ana Claudia":"E","David OSS":"D","Carla (Lilian)":"V"} },
    { jogo: 31, mandante: "Turquia", visitante: "Paraguai", fase: "Grupo D", hora: "1h", local: "São Francisco", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"D","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"E","China":"V","Joseney OSS":"E","Barrinhos OSS":"V","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"E","Rafael Féra":"V","Raul FMC":"V","Juninho":"E","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 32, mandante: "Estados Unidos", visitante: "Austrália", fase: "Grupo D", hora: "16h", local: "Seattle", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"D","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 59, mandante: "Turquia", visitante: "Estados Unidos", fase: "Grupo D", hora: "23h", local: "Los Angeles", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"E","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"D","China":"E","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"D","Lilian OSS":"V","Wainer OSS":"D","Satelis OSS":"V","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"E"} },
    { jogo: 60, mandante: "Paraguai", visitante: "Austrália", fase: "Grupo D", hora: "23h", local: "São Francisco", palpites: {"Ivan 1 OSS":"E","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"D","Rods 2 OSS":"V","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"E","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 9, mandante: "Costa do Marfim", visitante: "Equador", fase: "Grupo E", hora: "20h", local: "Filadélfia", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"E","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"E","Fisher OSS":"E","Rafael Féra":"V","Raul FMC":"E","Juninho":"E","Lilian OSS":"E","Wainer OSS":"E","Satelis OSS":"D","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 10, mandante: "Alemanha", visitante: "Curaçao", fase: "Grupo E", hora: "14h", local: "Houston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 33, mandante: "Alemanha", visitante: "Costa do Marfim", fase: "Grupo E", hora: "17h", local: "Toronto", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 34, mandante: "Equador", visitante: "Curaçao", fase: "Grupo E", hora: "21h", local: "Kansas City", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 55, mandante: "Curaçao", visitante: "Costa do Marfim", fase: "Grupo E", hora: "17h", local: "Filadélfia", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 56, mandante: "Equador", visitante: "Alemanha", fase: "Grupo E", hora: "17h", local: "Nova York", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"E","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"E","Ana Claudia":"D","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 11, mandante: "Países Baixos", visitante: "Japão", fase: "Grupo F", hora: "17h", local: "Dallas", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"D","Claudia OSS":"D","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"D"} },
    { jogo: 12, mandante: "Suécia", visitante: "Tunísia", fase: "Grupo F", hora: "23h", local: "Monterrey", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"E","China":"E","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 35, mandante: "Países Baixos", visitante: "Suécia", fase: "Grupo F", hora: "14h", local: "Houston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"E","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"E","Marina Trinkaus":"V","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 36, mandante: "Tunísia", visitante: "Japão", fase: "Grupo F", hora: "1h", local: "Monterrey", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"E","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 57, mandante: "Japão", visitante: "Suécia", fase: "Grupo F", hora: "20h", local: "Dallas", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"V","China":"E","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"E","Lilian OSS":"V","Wainer OSS":"E","Satelis OSS":"V","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 58, mandante: "Tunísia", visitante: "Países Baixos", fase: "Grupo F", hora: "20h", local: "Kansas City", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"V","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"V","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"V"} },
    { jogo: 15, mandante: "Irã", visitante: "Nova Zelândia", fase: "Grupo G", hora: "22h", local: "Los Angeles", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"D","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"D","Jorge OSS":"V","Claudia OSS":"E","China":"D","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"D","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"D"} },
    { jogo: 16, mandante: "Bélgica", visitante: "Egito", fase: "Grupo G", hora: "16h", local: "Seattle", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"D","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 39, mandante: "Bélgica", visitante: "Irã", fase: "Grupo G", hora: "16h", local: "Los Angeles", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 40, mandante: "Nova Zelândia", visitante: "Egito", fase: "Grupo G", hora: "22h", local: "Vancouver", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"E","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 63, mandante: "Egito", visitante: "Irã", fase: "Grupo G", hora: "0h", local: "Seattle", palpites: {"Ivan 1 OSS":"E","Ivan 2 OSS":"V","Andre OSS":"E","Lelis OSS":"V","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"V","China":"E","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"V","Juninho":"E","Lilian OSS":"V","Wainer OSS":"E","Satelis OSS":"V","Ana Claudia":"E","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 64, mandante: "Nova Zelândia", visitante: "Bélgica", fase: "Grupo G", hora: "0h", local: "Vancouver", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"V","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 13, mandante: "Arábia Saudita", visitante: "Uruguai", fase: "Grupo H", hora: "19h", local: "Miami", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 14, mandante: "Espanha", visitante: "Cabo Verde", fase: "Grupo H", hora: "13h", local: "Atlanta", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 37, mandante: "Uruguai", visitante: "Cabo Verde", fase: "Grupo H", hora: "19h", local: "Miami", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 38, mandante: "Espanha", visitante: "Arábia Saudita", fase: "Grupo H", hora: "13h", local: "Atlanta", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"D","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 65, mandante: "Cabo Verde", visitante: "Arábia Saudita", fase: "Grupo H", hora: "21h", local: "Houston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"E","Raul FMC":"E","Juninho":"E","Lilian OSS":"E","Wainer OSS":"E","Satelis OSS":"D","Ana Claudia":"E","David OSS":"D","Carla (Lilian)":"E"} },
    { jogo: 66, mandante: "Uruguai", visitante: "Espanha", fase: "Grupo H", hora: "21h", local: "Guadalajara", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"E","Keller Poços":"E","Jorge OSS":"D","Claudia OSS":"D","China":"E","Joseney OSS":"E","Barrinhos OSS":"D","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"E","Rafael Féra":"D","Raul FMC":"V","Juninho":"E","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"E"} },
    { jogo: 17, mandante: "França", visitante: "Senegal", fase: "Grupo I", hora: "16h", local: "Nova York", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"E","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 18, mandante: "Iraque", visitante: "Noruega", fase: "Grupo I", hora: "19h", local: "Boston", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 41, mandante: "Noruega", visitante: "Senegal", fase: "Grupo I", hora: "21h", local: "Nova York", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"E","Rods 2 OSS":"D","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"E","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"V","Juninho":"E","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 42, mandante: "França", visitante: "Iraque", fase: "Grupo I", hora: "18h", local: "Filadélfia", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"E","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 61, mandante: "Noruega", visitante: "França", fase: "Grupo I", hora: "16h", local: "Boston", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"V","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"V","Carla (Lilian)":"D"} },
    { jogo: 62, mandante: "Senegal", visitante: "Iraque", fase: "Grupo I", hora: "16h", local: "Toronto", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"E","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"V","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 19, mandante: "Argentina", visitante: "Argélia", fase: "Grupo J", hora: "22h", local: "Kansas City", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 20, mandante: "Áustria", visitante: "Jordânia", fase: "Grupo J", hora: "1h", local: "São Francisco", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"E","Jorge OSS":"V","Claudia OSS":"E","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 43, mandante: "Argentina", visitante: "Áustria", fase: "Grupo J", hora: "14h", local: "Dallas", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 44, mandante: "Jordânia", visitante: "Argélia", fase: "Grupo J", hora: "0h", local: "São Francisco", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"E","Rods 1 OSS":"D","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"E","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"E","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"E","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"E","Ana Claudia":"E","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 69, mandante: "Argélia", visitante: "Áustria", fase: "Grupo J", hora: "23h", local: "Kansas City", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"D","Keller Poços":"E","Jorge OSS":"D","Claudia OSS":"E","China":"V","Joseney OSS":"D","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"E","Raul FMC":"E","Juninho":"D","Lilian OSS":"E","Wainer OSS":"D","Satelis OSS":"E","Ana Claudia":"D","David OSS":"E","Carla (Lilian)":"E"} },
    { jogo: 70, mandante: "Jordânia", visitante: "Argentina", fase: "Grupo J", hora: "23h", local: "Dallas", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 23, mandante: "Portugal", visitante: "RD Congo", fase: "Grupo K", hora: "14h", local: "Houston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 24, mandante: "Uzbequistão", visitante: "Colômbia", fase: "Grupo K", hora: "23h", local: "Cidade do México", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 47, mandante: "Portugal", visitante: "Uzbequistão", fase: "Grupo K", hora: "14h", local: "Houston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 48, mandante: "Colômbia", visitante: "RD Congo", fase: "Grupo K", hora: "23h", local: "Guadalajara", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 71, mandante: "Colômbia", visitante: "Portugal", fase: "Grupo K", hora: "20h30", local: "Miami", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"E","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"D","China":"D","Joseney OSS":"E","Barrinhos OSS":"E","Marina Trinkaus":"D","Fabinho Irmão":"E","Fisher OSS":"D","Rafael Féra":"E","Raul FMC":"V","Juninho":"E","Lilian OSS":"D","Wainer OSS":"E","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"V"} },
    { jogo: 72, mandante: "RD Congo", visitante: "Uzbequistão", fase: "Grupo K", hora: "20h30", local: "Atlanta", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"E","Lelis OSS":"D","Rods 1 OSS":"E","Rods 2 OSS":"E","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"D","Marina Trinkaus":"E","Fabinho Irmão":"D","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"D","Juninho":"E","Lilian OSS":"E","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"E","David OSS":"E","Carla (Lilian)":"V"} },
    { jogo: 21, mandante: "Gana", visitante: "Panamá", fase: "Grupo L", hora: "20h", local: "Toronto", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"E","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"E","Jorge OSS":"E","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"V","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 22, mandante: "Inglaterra", visitante: "Croácia", fase: "Grupo L", hora: "17h", local: "Dallas", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"V","China":"V","Joseney OSS":"V","Barrinhos OSS":"E","Marina Trinkaus":"E","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"D","Juninho":"V","Lilian OSS":"V","Wainer OSS":"E","Satelis OSS":"V","Ana Claudia":"V","David OSS":"E","Carla (Lilian)":"D"} },
    { jogo: 45, mandante: "Inglaterra", visitante: "Gana", fase: "Grupo L", hora: "17h", local: "Boston", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"V","Rods 1 OSS":"V","Rods 2 OSS":"V","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"E","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"V","Raul FMC":"E","Juninho":"V","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"V","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} },
    { jogo: 46, mandante: "Panamá", visitante: "Croácia", fase: "Grupo L", hora: "20h", local: "Toronto", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"E","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"D","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"E"} },
    { jogo: 67, mandante: "Panamá", visitante: "Inglaterra", fase: "Grupo L", hora: "18h", local: "Nova York", palpites: {"Ivan 1 OSS":"D","Ivan 2 OSS":"D","Andre OSS":"D","Lelis OSS":"D","Rods 1 OSS":"D","Rods 2 OSS":"D","Keller Poços":"D","Jorge OSS":"D","Claudia OSS":"D","China":"D","Joseney OSS":"D","Barrinhos OSS":"D","Marina Trinkaus":"D","Fabinho Irmão":"D","Fisher OSS":"D","Rafael Féra":"D","Raul FMC":"D","Juninho":"D","Lilian OSS":"D","Wainer OSS":"D","Satelis OSS":"E","Ana Claudia":"D","David OSS":"D","Carla (Lilian)":"D"} },
    { jogo: 68, mandante: "Croácia", visitante: "Gana", fase: "Grupo L", hora: "18h", local: "Filadélfia", palpites: {"Ivan 1 OSS":"V","Ivan 2 OSS":"V","Andre OSS":"V","Lelis OSS":"E","Rods 1 OSS":"V","Rods 2 OSS":"E","Keller Poços":"V","Jorge OSS":"V","Claudia OSS":"E","China":"D","Joseney OSS":"V","Barrinhos OSS":"V","Marina Trinkaus":"V","Fabinho Irmão":"V","Fisher OSS":"V","Rafael Féra":"E","Raul FMC":"V","Juninho":"E","Lilian OSS":"V","Wainer OSS":"V","Satelis OSS":"E","Ana Claudia":"V","David OSS":"V","Carla (Lilian)":"V"} }
  ]
};

// Rota para o frontend buscar o pacote de dados fixos
app.get('/api/dados-bolao', (req, res) => {
  res.json(DADOS_BOLAO);
});

// ═══════════════════════════════════════════════════════════
// ROTAS DE AUTENTICAÇÃO (SISTEMA DE CONTAS)
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const { usuario, senha, perfil1, perfil2 } = req.body;
  if (!usuario || !senha || !perfil1) {
    return res.status(400).json({ error: 'Usuário, senha e perfil 1 são obrigatórios.' });
  }

  // Verifica se um dos perfis já foi vinculado por outra pessoa
  const check = await pool.query(
    'SELECT usuario FROM usuarios WHERE perfil1=$1 OR perfil1=$2 OR perfil2=$1 OR perfil2=$2',
    [perfil1, perfil2 || '']
  );
  if (check.rows.length > 0) {
    return res.status(400).json({ error: 'Um dos perfis escolhidos já foi vinculado a outra conta.' });
  }

  try {
    await pool.query(
      'INSERT INTO usuarios (usuario, senha, perfil1, perfil2) VALUES ($1, $2, $3, $4)',
      [usuario, senha, perfil1, perfil2 || null]
    );
    res.json({ ok: true, perfis: [perfil1, perfil2].filter(Boolean) });
  } catch (err) {
    res.status(400).json({ error: 'Nome de usuário já existe.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario=$1 AND senha=$2', [usuario, senha]);
  
  if (rows.length > 0) {
    const perfis = [rows[0].perfil1, rows[0].perfil2].filter(Boolean);
    res.json({ ok: true, perfis });
  } else {
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
});

// ═══════════════════════════════════════════════════════════
// ROTAS DO BOLÃO
// ═══════════════════════════════════════════════════════════

// Resultados oficiais
app.get('/api/resultados', async (req, res) => {
  const { rows } = await pool.query('SELECT jogo_num, resultado FROM resultados');
  const obj = {};
  rows.forEach(r => obj[r.jogo_num] = r.resultado);
  res.json(obj);
});

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

app.delete('/api/resultados/:num', async (req, res) => {
  await pool.query('DELETE FROM resultados WHERE jogo_num=$1', [parseInt(req.params.num)]);
  res.json({ ok: true });
});

app.delete('/api/resultados', async (req, res) => {
  await pool.query('DELETE FROM resultados');
  res.json({ ok: true });
});

// Palpites Fases Finais
app.get('/api/palpites-finais', async (req, res) => {
  const { rows } = await pool.query('SELECT participante, jogo_num, palpite FROM palpites_fase_final');
  res.json(rows);
});

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