const socket = io();

socket.on('atualizacao_placar', (dados) => {
    console.log(`Jogo ${dados.jogo} finalizado com placar de ${dados.placar}!`);
    syncLiveScoresBackground(true);
});

let BOLAO = null;
let resultados = {}; 
let cachePalpitesFinais = []; 
let appConfig = {};
let customMatchups = {};
let evolutionChartInstance = null; 

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
  let translated = TEAM_DICTIONARY[name] || name;
  return translated.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const JOGOS_FASE_FINAL = [
  ...Array.from({length: 16}, (_, i) => ({ jogo: 73+i, mandante: `TBD R32`, visitante: `TBD R32`, fase: "Dezesseis-avos", chavePrazo: 'deadline_r32' })),
  ...Array.from({length: 8}, (_, i) => ({ jogo: 89+i, mandante: `TBD Oitavas`, visitante: `TBD Oitavas`, fase: "Oitavas de Final", chavePrazo: 'deadline_r16' })),
  ...Array.from({length: 4}, (_, i) => ({ jogo: 97+i, mandante: `TBD Quartas`, visitante: `TBD Quartas`, fase: "Quartas de Final", chavePrazo: 'deadline_qf' })),
  ...Array.from({length: 2}, (_, i) => ({ jogo: 101+i, mandante: `TBD Semi`, visitante: `TBD Semi`, fase: "Semifinais", chavePrazo: 'deadline_sf' })),
  { jogo: 103, mandante: "TBD Terceiro", visitante: "TBD Terceiro", fase: "Disputa 3º Lugar", chavePrazo: 'deadline_final' },
  { jogo: 104, mandante: "TBD Final", visitante: "TBD Final", fase: "Final", chavePrazo: 'deadline_final' }
];

async function init() {
  try {
    const resBolao = await fetch('/api/dados-bolao');
    BOLAO = await resBolao.json();
    
    const resResults = await fetch('/api/resultados');
    resultados = await resResults.json();
    
    const resFinais = await fetch('/api/palpites-finais');
    cachePalpitesFinais = await resFinais.json();

    const resConfig = await fetch('/api/config');
    appConfig = await resConfig.json();
    
    // Busca dados reais do mata-mata da API-Football
    try {
      const resMataMata = await fetch('/api/matamata-info');
      const infoMataMata = await resMataMata.json();
      JOGOS_FASE_FINAL.forEach(j => {
        const apiData = infoMataMata.find(m => m.jogo === j.jogo);
        if (apiData) {
          const nomeValido = (nome) => nome && !nome.toLowerCase().includes('winner');
          if (nomeValido(apiData.mandante)) j.mandante = TEAM_DICTIONARY[apiData.mandante] || apiData.mandante; 
          if (nomeValido(apiData.visitante)) j.visitante = TEAM_DICTIONARY[apiData.visitante] || apiData.visitante;
          if (apiData.data) {
            const dataObj = new Date(apiData.data);
            j.data = dataObj.toLocaleDateString('pt-BR');
            j.hora = dataObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
          }
        }
      });
    } catch(e) {
      console.warn("Ainda não foi possível carregar os confrontos reais.");
    }

    if(appConfig.knockout_matchups) {
      try { customMatchups = JSON.parse(appConfig.knockout_matchups); } catch(e){}
    }

    if(appConfig.deadline_r32) document.getElementById('dl-r32').value = appConfig.deadline_r32;
    if(appConfig.deadline_r16) document.getElementById('dl-r16').value = appConfig.deadline_r16;
    if(appConfig.deadline_qf) document.getElementById('dl-qf').value = appConfig.deadline_qf;
    if(appConfig.deadline_sf) document.getElementById('dl-sf').value = appConfig.deadline_sf;
    if(appConfig.deadline_final) document.getElementById('dl-final').value = appConfig.deadline_final;
    if(appConfig.campeao_oficial) document.getElementById('admin-campeao').value = appConfig.campeao_oficial;

    let mtText = '';
    Object.entries(customMatchups).forEach(([n, match]) => mtText += `${n} ${match.mandante} x ${match.visitante}\n`);
    document.getElementById('admin-matchups').value = mtText.trim();

    document.getElementById('loader-overlay').style.display = 'none';
    popularSelectsCadastro(); 
    popularFiltros();
    checkUserSession(); 
    renderRanking(); 
    renderJogos();
    renderCampeoes();
  } catch (e) { document.getElementById('loader-overlay').innerHTML = '<p>Erro ao conectar com servidor.</p>'; }
}

function getTodosJogos() {
  const baseJogos = BOLAO.jogos.map(j => ({...j})); 
  const knockoutJogos = JOGOS_FASE_FINAL.map(j => {
    const palpitesMap = {};
    cachePalpitesFinais.forEach(pf => {
      if(pf.jogo_num === j.jogo) palpitesMap[pf.participante] = pf.palpite;
    });
    return {
      jogo: j.jogo, fase: j.fase,
      mandante: getKnockoutTeam(j.jogo, 'mandante', j.mandante),
      visitante: getKnockoutTeam(j.jogo, 'visitante', j.visitante),
      palpites: palpitesMap, data: j.data || '', hora: j.hora || ''
    };
  });
  return [...baseJogos, ...knockoutJogos];
}

function popularFiltros() {
  if(!BOLAO) return;
  const todosJogos = getTodosJogos();
  const grupos = [...new Set(todosJogos.map(j => j.fase))].sort();
  let options = '<option value="todos">Todas as Fases / Grupos</option>';
  grupos.forEach(g => options += `<option value="${g}">${g}</option>`);
  document.getElementById('filtro-grupo-meus').innerHTML = options;
  document.getElementById('filtro-grupo-galera').innerHTML = options;
}

function getKnockoutTeam(jogoNum, type, fallback) {
    if(customMatchups[jogoNum] && customMatchups[jogoNum][type]) return customMatchups[jogoNum][type];
    return fallback;
}

function formatDate(isoString) {
    if(!isoString) return 'Não definido';
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

function toggleAuthForm() {
  const login = document.getElementById('user-login-form');
  const reg = document.getElementById('user-register-form');
  login.style.display = login.style.display === 'none' ? 'block' : 'none';
  reg.style.display = reg.style.display === 'none' ? 'block' : 'none';
}

function popularSelectsCadastro() {
  let opts = '<option value="">-- Selecione --</option>';
  BOLAO.participantes.forEach(p => opts += `<option value="${p}">${p}</option>`);
  document.getElementById('reg-perfil1').innerHTML = opts;
  document.getElementById('reg-perfil2').innerHTML = '<option value="">-- Nenhum --</option>' + opts.replace('<option value="">-- Selecione --</option>','');
}

async function doUserRegister() {
  const usuario = document.getElementById('reg-user').value.trim();
  const senha = document.getElementById('reg-pass').value.trim();
  const perfil1 = document.getElementById('reg-perfil1').value;
  const perfil2 = document.getElementById('reg-perfil2').value;
  if (!usuario || !senha || !perfil1) return showToast('⚠️ Preencha os obrigatórios.');
  if (perfil1 === perfil2) return showToast('⚠️ Perfis iguais.');
  try {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ usuario, senha, perfil1, perfil2 }) });
    const data = await res.json();
    if (data.ok) { showToast('✅ Sucesso!'); saveUserSession(data.perfis); }
    else showToast('⚠️ ' + data.error);
  } catch(e) { showToast('⚠️ Erro na conexão'); }
}

async function doUserLogin() {
  const usuario = document.getElementById('login-user').value.trim();
  const senha = document.getElementById('login-pass').value.trim();
  if (!usuario || !senha) return;
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ usuario, senha }) });
    const data = await res.json();
    if (data.ok) saveUserSession(data.perfis); else showToast('⚠️ ' + data.error);
  } catch(e) { showToast('⚠️ Erro na conexão'); }
}

function saveUserSession(perfis) { sessionStorage.setItem('bolao_user_perfis', JSON.stringify(perfis)); checkUserSession(); }

function checkUserSession() {
  const saved = sessionStorage.getItem('bolao_user_perfis');
  if (saved) {
    const perfis = JSON.parse(saved);
    document.getElementById('global-auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    const sel = document.getElementById('active-profile-select');
    if(sel) { 
        sel.innerHTML = ''; 
        perfis.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); }); 
        renderKnockoutGamesForm(); 
        renderBracket(); 
    }
    if (!document.querySelector('.section.visible') || document.querySelector('.section.visible').id === 'tab-ranking') showTab('meus-palpites'); else renderMeusPalpites();
  } else { document.getElementById('global-auth-screen').style.display = 'flex'; document.getElementById('app-content').style.display = 'none'; }
}

function doUserLogout() { sessionStorage.removeItem('bolao_user_perfis'); checkUserSession(); }

function formatScoreHeader(res) {
  if (!res) return '';
  if (res.includes('-')) {
    const [g1, g2] = res.split('-');
    return `<div class="jogo-placar" style="background:transparent; border:none; padding:0;">
              <span style="font-size:22px; color:var(--text); font-family:'Bebas Neue',sans-serif;">${g1}</span>
              <span style="font-size:12px; color:var(--text3); margin:0 6px; font-family:'Inter',sans-serif;">X</span>
              <span style="font-size:22px; color:var(--text); font-family:'Bebas Neue',sans-serif;">${g2}</span>
            </div>`;
  }
  const badgeText = res === 'V' ? 'Mandante' : res === 'E' ? 'Empate' : 'Visitante';
  return `<div class="jogo-placar"><span class="resultado-badge ${res}">${badgeText}</span></div>`;
}

function getWinnerFromScore(res) {
  if (!res) return null;
  if (res.includes('-')) {
    const [g1, g2] = res.split('-').map(Number);
    return g1 > g2 ? 'V' : g1 < g2 ? 'D' : 'E';
  }
  return res;
}

function renderMeusPalpites() {
  const perfis = JSON.parse(sessionStorage.getItem('bolao_user_perfis') || '[]');
  if (perfis.length === 0) return;
  let profileSelector = perfis.length > 1 ? `<select class="res-input" style="width:auto;text-transform:none;" onchange="drawMeusPalpitesList(this.value)"><option value="${perfis[0]}">${perfis[0]}</option><option value="${perfis[1]}">${perfis[1]}</option></select>` : `<span style="font-weight:bold;color:var(--gold)">${perfis[0]}</span>`;
  document.getElementById('meus-palpites-header').innerHTML = `<div class="import-box" style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; margin-bottom:20px;"><div style="display:flex; align-items:center; gap:12px"><span style="color:var(--text2); font-size:13px">Visualizando:</span>${profileSelector}</div></div>`;
  
  const selectedProfile = document.querySelector('#meus-palpites-header select') ? document.querySelector('#meus-palpites-header select').value : perfis[0];
  drawMeusPalpitesList(selectedProfile);
}

function drawMeusPalpitesList(perfil) {
  const container = document.getElementById('meus-palpites-list');
  const fGrupo = document.getElementById('filtro-grupo-meus').value;
  const fStatus = document.getElementById('filtro-status-meus').value;
  let jogosFiltrados = getTodosJogos().sort((a, b) => a.jogo - b.jogo);
  
  if (fGrupo !== 'todos') jogosFiltrados = jogosFiltrados.filter(j => j.fase === fGrupo);
  if (fStatus === 'encerrados') jogosFiltrados = jogosFiltrados.filter(j => resultados[String(j.jogo)]);
  if (fStatus === 'pendentes') jogosFiltrados = jogosFiltrados.filter(j => !resultados[String(j.jogo)]);
  if(jogosFiltrados.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum jogo encontrado com os filtros atuais.</p></div>';
      return;
  }

  let html = `<div class="group-section">`;
  jogosFiltrados.forEach(j => {
    const res = resultados[String(j.jogo)];
    const meuPalpite = j.palpites[perfil];
    const resLetter = getWinnerFromScore(res);

    let palpiteClass = ''; let icon = '⏳';
    if (res) { if (meuPalpite === resLetter) { palpiteClass = 'acerto'; icon = '✅'; } else { palpiteClass = 'erro'; icon = '❌'; } }
    const nomePalpite = meuPalpite === 'V' ? j.mandante : meuPalpite === 'E' ? 'Empate' : j.visitante;
    
    html += `
    <div class="jogo-card ${res?'encerrado':''}" style="cursor:default;">
      <div class="jogo-header">
        <div class="jogo-num"><span>#${j.jogo}</span><span class="jogo-grupo-badge">${j.fase.replace('Grupo ','Gr ')}</span></div>
        <div class="jogo-mandante">${j.mandante}</div>
        ${res ? formatScoreHeader(res) : `<div class="jogo-placar pendente" style="display:flex; flex-direction:column; gap:2px; padding: 4px 0;">
    <span style="font-size:10px; color:var(--text3); font-family:'Inter',sans-serif; font-weight:normal; line-height:1;">${j.data || ''}</span>
    <span style="font-size:14px; line-height:1;">${j.hora || 'A def.'}</span>
</div>`}
        <div class="jogo-visitante">${j.visitante}</div><div class="jogo-meta">${res?'<span class="badge-done">Encerrado</span>':''}</div>
      </div>
      <div style="padding: 10px 14px; border-top: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2);">
        <span style="font-size:12px; color:var(--text2)">Meu Palpite:</span><div class="palpite-item ${palpiteClass}" style="width:auto; gap:10px; padding:6px 12px; font-size:13px; font-weight:bold;">${icon} ${nomePalpite || '—'}</div>
      </div>
    </div>`;
  });
  container.innerHTML = html + '</div>';
}

function renderKnockoutGamesForm() {
  const participante = document.getElementById('active-profile-select').value;
  if (!participante) return;
  const container = document.getElementById('knockout-games-list');
  container.innerHTML = '';
  const groups = {};
  JOGOS_FASE_FINAL.forEach(j => { if (!groups[j.fase]) groups[j.fase] = []; groups[j.fase].push(j); });

  Object.entries(groups).forEach(([fase, jogos]) => {
    let limitStr = appConfig[jogos[0].chavePrazo];
    let isLocked = limitStr && new Date() > new Date(limitStr);
    
    let html = `<div class="group-section">
      <div class="group-title">
         <span>${fase}</span>
         <span style="font-size:11px;color:var(--text2);font-family:'Inter',sans-serif;font-weight:normal;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px">
            Prazo: ${formatDate(limitStr)}
         </span>
      </div>`;
      
    jogos.forEach(j => {
      const saved = cachePalpitesFinais.find(i => i.participante === participante && i.jogo_num === j.jogo);
      const activePalpite = saved ? saved.palpite : null;
      const realMand = getKnockoutTeam(j.jogo, 'mandante', j.mandante);
      const realVis = getKnockoutTeam(j.jogo, 'visitante', j.visitante);

      let buttonsHtml = '';
      if (isLocked) {
        const pText = activePalpite ? (activePalpite === 'V' ? realMand : activePalpite === 'E' ? 'Empate' : realVis) : 'Não enviado';
        buttonsHtml = `<div style="font-size:12px;color:var(--gold);font-weight:bold;text-align:center;width:100%">${pText}</div>`;
      } else {
        buttonsHtml = `
          <button class="btn-palpite-op ${activePalpite === 'V' ? 'active-V' : ''}" onclick="submitKnockoutGuess('${j.jogo}', 'V')">V</button>
          <button class="btn-palpite-op ${activePalpite === 'E' ? 'active-E' : ''}" onclick="submitKnockoutGuess('${j.jogo}', 'E')">E</button>
          <button class="btn-palpite-op ${activePalpite === 'D' ? 'active-D' : ''}" onclick="submitKnockoutGuess('${j.jogo}', 'D')">D</button>
        `;
      }

      html += `
        <div class="jogo-card" style="cursor:default;">
          <div class="jogo-header" style="grid-template-columns: 28px 1fr auto 1fr auto">
            <div class="jogo-num">#${j.jogo}</div>
            <div class="jogo-mandante" style="color:var(--text)">${realMand}</div>
            <div style="display:flex;gap:4px;align-items:center;justify-content:center;min-width:100px">
              ${buttonsHtml}
            </div>
            <div class="jogo-visitante" style="color:var(--text)">${realVis}</div>
            <div style="font-size:11px;color:var(--text3);text-align:right">MM</div>
          </div>
          ${isLocked ? '<div style="background:rgba(0,0,0,0.2);font-size:11px;color:var(--text3);text-align:center;padding:4px">🔒 Trancado</div>' : ''}
        </div>`;
    });
    container.innerHTML += html + '</div>';
  });
}

function renderBracket() {
  const container = document.getElementById('bracket-view');
  if(!container) return;

  const getColHtml = (matchStart, count) => {
    let col = `<div class="bracket-col">`;
    for(let i=0; i<count; i++) {
        let n = matchStart + i;
        let mand = getKnockoutTeam(n, 'mandante', `TBD #${n}`);
        let vis = getKnockoutTeam(n, 'visitante', `TBD #${n}`);
        col += `
          <div class="bracket-match">
             <div class="bracket-match-num">${n}</div>
             <div class="bracket-team">${mand}</div>
             <div class="bracket-team">${vis}</div>
          </div>
        `;
    }
    col += `</div>`;
    return col;
  };

  container.innerHTML = getColHtml(73, 16) + getColHtml(89, 8) + getColHtml(97, 4) + getColHtml(101, 2) + getColHtml(104, 1);
}

async function submitKnockoutGuess(jogoNum, palpiteVal) {
  const participante = document.getElementById('active-profile-select').value;
  jogoNum = parseInt(jogoNum);
  const idx = cachePalpitesFinais.findIndex(i => i.participante === participante && i.jogo_num === jogoNum);
  if (idx !== -1) cachePalpitesFinais[idx].palpite = palpiteVal;
  else cachePalpitesFinais.push({ participante, jogo_num: jogoNum, palpite: palpiteVal });
  try {
    const res = await fetch('/api/palpites-finais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participante, jogo_num: jogoNum, palpite: palpiteVal }) });
    if (res.ok) { showToast(`Palpite salvo!`); renderKnockoutGamesForm(); }
    else { const data = await res.json(); showToast('⚠️ ' + data.error); }
  } catch(e) { showToast('⚠️ Erro ao salvar'); }
}

function calcRanking() {
  const pts = {}; const acertos = {}; const total = {}; const bonusCamp = {};
  BOLAO.participantes.forEach(p => { pts[p]=0; acertos[p]=0; total[p]=0; bonusCamp[p]=0; });
  
  const todosJogos = getTodosJogos();
  todosJogos.forEach(j => {
    const res = resultados[String(j.jogo)];
    const resLetter = getWinnerFromScore(res);
    Object.entries(j.palpites).forEach(([p, pal]) => {
      total[p] = (total[p]||0) + 1;
      if (res && pal === resLetter) { pts[p]+=3; acertos[p]+=1; }
    });
  });

  const campeaoOficial = appConfig.campeao_oficial ? appConfig.campeao_oficial.trim().toLowerCase() : null;
  if (campeaoOficial) {
     BOLAO.participantes.forEach(p => {
        const palpiteCamp = BOLAO.palpites_campeao[p];
        if (palpiteCamp && palpiteCamp.trim().toLowerCase() === campeaoOficial) {
            pts[p] += 5; bonusCamp[p] = 5;
        }
     });
  }

  let ranking = BOLAO.participantes.map(p => ({
     nome: p, pts: pts[p], acertos: acertos[p], total: total[p], bonus: bonusCamp[p]
  })).sort((a,b) => b.pts - a.pts || b.acertos - a.acertos || a.nome.localeCompare(b.nome));
  
  const prizes = [600, 360, 240];
  let prizeIndex = 0; let currentPos = 1; let groups = []; let currentGroup = [];
  
  for (let i = 0; i < ranking.length; i++) {
    let r = ranking[i];
    if (currentGroup.length === 0) {
       currentGroup.push(r);
    } else {
       let last = currentGroup[0];
       if (r.pts === last.pts && r.acertos === last.acertos) currentGroup.push(r);
       else { groups.push(currentGroup); currentGroup = [r]; }
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  
  for (let group of groups) {
      let groupSize = group.length; let groupPrizeSum = 0;
      for (let i = 0; i < groupSize; i++) {
         if (prizeIndex < prizes.length) { groupPrizeSum += prizes[prizeIndex]; prizeIndex++; }
      }
      let prizePerPerson = groupSize > 0 && groupPrizeSum > 0 ? (groupPrizeSum / groupSize) : 0;
      for (let r of group) { r.posicao = currentPos; r.premio = prizePerPerson; }
      currentPos += groupSize;
  }
  
  return ranking;
}

function renderEvolutionChart(top5Names) {
    const ctx = document.getElementById('rankingChart');
    if (!ctx) return;
    
    const historyData = {};
    top5Names.forEach(n => historyData[n] = [0]); 

    const todosJogos = getTodosJogos();
    const finishedGames = todosJogos.filter(j => resultados[String(j.jogo)]).sort((a,b) => a.jogo - b.jogo);
    const currentPts = {};
    top5Names.forEach(n => currentPts[n] = 0);

    const labels = ['Início'];
    
    finishedGames.forEach((j, index) => {
        const resLetter = getWinnerFromScore(resultados[String(j.jogo)]);
        top5Names.forEach(n => {
            if (j.palpites[n] === resLetter) { currentPts[n] += 3; }
        });
        
        if ((index + 1) % 4 === 0 || index === finishedGames.length - 1) {
            labels.push(`J${j.jogo}`);
            top5Names.forEach(n => historyData[n].push(currentPts[n]));
        }
    });

    const colors = ['#f5c842', '#b0b8c4', '#cd7f32', '#4caf7d', '#5a7060'];
    const datasets = top5Names.map((name, i) => ({
        label: name.split(' ')[0],
        data: historyData[name],
        borderColor: colors[i],
        backgroundColor: colors[i],
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3
    }));

    if (evolutionChartInstance) evolutionChartInstance.destroy();

    evolutionChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { color: '#8fa894', font: { size: 11, family: 'Inter' } } } },
            scales: {
                x: { ticks: { color: '#5a7060', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#5a7060', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
        }
    });
}

function renderRanking() {
  const ranking = calcRanking();
  const maxPts = Math.max(...ranking.map(r => r.pts), 1);
  const encerrados = Object.keys(resultados).length;
  document.getElementById('stat-jogos').textContent = getTodosJogos().length;
  document.getElementById('stat-encerrados').textContent = encerrados;
  document.getElementById('stat-lider').textContent = ranking[0].pts > 0 ? ranking[0].nome.split(' ')[0] : '—';
  document.getElementById('stat-lider-pts').textContent = ranking[0].pts;
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString('pt-BR');
  
  const container = document.getElementById('ranking-list');
  container.innerHTML = '';
  
  ranking.forEach((r, i) => {
    const pos = r.posicao; 
    const pct = Math.round((r.pts / maxPts) * 100) || 0; 
    const pctA = r.total > 0 && encerrados > 0 ? Math.round((r.acertos / encerrados) * 100) : 0;
    const isZ4 = i >= ranking.length - 4;

    let tags = '';
    if (encerrados > 0) {
        if (r.premio > 0) {
            let color = pos === 1 ? '#4caf7d' : pos === 2 ? '#f5c842' : '#b0b8c4';
            let bg = pos === 1 ? 'rgba(76,175,125,0.15)' : pos === 2 ? 'rgba(245,200,66,0.15)' : 'rgba(176,184,196,0.15)';
            if (pos > 3) { color = '#b0b8c4'; bg = 'rgba(176,184,196,0.15)'; } 
            tags += `<span style="color:${color}; font-weight:600; font-size:12px; margin-left:6px; background:${bg}; padding:2px 6px; border-radius:4px; white-space:nowrap">💰 R$ ${r.premio.toFixed(2).replace('.',',')}</span>`;
        }
        if (isZ4) tags += `<span class="badge-z4">⬇ Rebaixado</span>`;
    }

    const bonusStr = r.bonus > 0 ? `<span style="color:var(--gold); font-size:10px; margin-left:4px;" title="Acertou o Campeão">(+5 pts)</span>` : '';
    let medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
    let cardClass = pos <= 3 ? `pos-${pos}` : '';
    if (isZ4) cardClass = 'pos-z4';

    container.innerHTML += `
      <div class="rank-card ${cardClass}">
        <div class="rank-pos">${medal}</div>
        <div class="rank-info">
           <div class="rank-name" style="display:flex; align-items:center; flex-wrap:wrap;">${r.nome} ${tags}</div>
           <div class="rank-sub">${r.acertos} acertos · ${pctA}% aprov. ${bonusStr}</div>
        </div>
        <div class="rank-bar-wrap"><div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${pct}%"></div></div></div>
        <div class="rank-pts">${r.pts}<span>pontos</span></div>
      </div>`;
  });

  if (encerrados > 0) {
      const top5Names = ranking.slice(0, 5).map(r => r.nome);
      renderEvolutionChart(top5Names);
  }
}

function renderCampeoes() {
  const container = document.getElementById('campeao-list');
  container.innerHTML = '';
  const campeaoOficial = appConfig.campeao_oficial ? appConfig.campeao_oficial.trim().toLowerCase() : null;
  if (campeaoOficial) {
     document.getElementById('campeao-oficial-badge').style.display = 'block';
     document.getElementById('campeao-oficial-nome').textContent = appConfig.campeao_oficial;
  } else { document.getElementById('campeao-oficial-badge').style.display = 'none'; }

  BOLAO.participantes.forEach(p => {
    const palpite = BOLAO.palpites_campeao[p] || 'Não definido';
    let border = 'var(--border)'; let bg = 'var(--bg3)'; let badge = '';
    if (campeaoOficial && palpite.toLowerCase() === campeaoOficial) {
      border = 'var(--win)'; bg = 'var(--win-bg)'; badge = '<span style="color:var(--win);font-weight:bold;font-size:11px;margin-left:auto">+5 pts</span>';
    } else if (campeaoOficial) { border = 'var(--loss)'; bg = 'var(--loss-bg)'; }
    container.innerHTML += `<div style="border:1px solid ${border}; background:${bg}; padding:10px 14px; border-radius:var(--r-sm); display:flex; flex-direction:column; gap:4px"><span style="font-weight:600; font-size:13px; color:var(--text)">${p}</span><div style="display:flex; align-items:center;"><span style="color:var(--text2); font-size:12px">${palpite}</span>${badge}</div></div>`;
  });
}

function renderJogos() {
  const container = document.getElementById('jogos-list');
  const fGrupo = document.getElementById('filtro-grupo-galera').value;
  const fStatus = document.getElementById('filtro-status-galera').value;
  let jogosFiltrados = getTodosJogos().sort((a, b) => a.jogo - b.jogo);
  
  if (fGrupo !== 'todos') jogosFiltrados = jogosFiltrados.filter(j => j.fase === fGrupo);
  if (fStatus === 'encerrados') jogosFiltrados = jogosFiltrados.filter(j => resultados[String(j.jogo)]);
  if (fStatus === 'pendentes') jogosFiltrados = jogosFiltrados.filter(j => !resultados[String(j.jogo)]);
  if(jogosFiltrados.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum jogo encontrado com os filtros atuais.</p></div>';
      return;
  }

  let html = `<div class="group-section">`;
  jogosFiltrados.forEach(j => {
    const res = resultados[String(j.jogo)];
    const resLetter = getWinnerFromScore(res);
    const cons = {V:0, E:0, D:0};
    const pals = j.palpites || {};
    Object.values(pals).forEach(p => { if(cons[p] !== undefined) cons[p]++; });
    const tot = Object.values(pals).length || 1; 
    
    let palsHtml = '';
    Object.entries(pals).forEach(([p, pal]) => { 
        palsHtml += `<div class="palpite-item ${resLetter?(pal===resLetter?'acerto':'erro'):''}"><span class="palpite-name">${p}</span><span class="palpite-val ${pal}">${pal}</span></div>`; 
    });
    if(!Object.keys(pals).length) palsHtml = `<span style="font-size:12px; color:var(--text3)">Nenhum palpite registrado.</span>`;
    
    html += `
    <div class="jogo-card ${res?'encerrado':''}" id="jogo-card-${j.jogo}">
      <div class="jogo-header" onclick="toggleJogo(${j.jogo})">
        <div class="jogo-num"><span>#${j.jogo}</span><span class="jogo-grupo-badge">${j.fase.replace('Grupo ','Gr ')}</span></div><div class="jogo-mandante">${j.mandante}</div>
        ${res ? formatScoreHeader(res) : `<div class="jogo-placar pendente" style="display:flex; flex-direction:column; gap:2px; padding: 4px 0;">
    <span style="font-size:10px; color:var(--text3); font-family:'Inter',sans-serif; font-weight:normal; line-height:1;">${j.data || ''}</span>
    <span style="font-size:14px; line-height:1;">${j.hora || 'A def.'}</span>
</div>`}
        <div class="jogo-visitante">${j.visitante}</div><div class="jogo-meta">${res?'<span class="badge-done">✓</span>':''}</div>
      </div>
      <div class="jogo-detail" id="detail-${j.jogo}">
        <div class="consensus-bar">
          <span>Consenso:</span>
          <span class="cons-item"><span class="cons-dot cons-v"></span> V (${Math.round(cons.V/tot*100)}%)</span>
          <span class="cons-item"><span class="cons-dot cons-e"></span> E (${Math.round(cons.E/tot*100)}%)</span>
          <span class="cons-item"><span class="cons-dot cons-d"></span> D (${Math.round(cons.D/tot*100)}%)</span>
        </div>
        <div class="palpites-grid">${palsHtml}</div>
      </div>
    </div>`;
  });
  container.innerHTML = html + '</div>';
}

function toggleJogo(num) { document.getElementById(`detail-${num}`).classList.toggle('open'); }

async function syncLiveScoresBackground(silent = true) {
  try {
    const resResults = await fetch('/api/resultados');
    const remoteResultados = await resResults.json();
    let updated = false;
    for (const j in remoteResultados) {
       if (resultados[j] !== remoteResultados[j]) {
           resultados[j] = remoteResultados[j];
           updated = true;
       }
    }
    if (updated) {
      renderRanking();
      if (document.getElementById('tab-jogos').classList.contains('visible')) renderJogos();
      if (document.getElementById('tab-meus-palpites').classList.contains('visible')) renderMeusPalpites();
      if (document.getElementById('tab-por-pessoa').classList.contains('visible')) renderPorPessoa();
    }
  } catch(e) {}
}

async function fetchLiveScores() {
  const container = document.getElementById('live-games-container');
  container.innerHTML = '<div class="empty-state"><p>Buscando partidas...</p></div>';
  try {
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const url = `https://www.thesportsdb.com/api/v1/json/1/eventsday.php?d=${today}&s=Soccer`;
    const res = await fetch(url); const data = await res.json();
    const events = data.events || [];
    if (events.length === 0) return container.innerHTML = `<div class="empty-state"><p>Nenhuma partida encontrada hoje</p></div>`;
    
    let html = '<div class="live-games">';
    events.forEach(e => {
      const live = e.strStatus.match(/^\d+$/) || e.strStatus === 'HT';
      const isFinished = e.strStatus === 'FT' || e.strStatus === 'AET';
      html += `<div class="live-game-card"><div class="lgc-teams"><div class="lgc-team">${e.strHomeTeam}</div><div class="lgc-score">${e.intHomeScore??'–'}:${e.intAwayScore??'–'}</div><div class="lgc-team right">${e.strAwayTeam}</div></div><div class="lgc-status ${live?'live':''}">${live?`⏱ ${e.strStatus}'`:isFinished?'✓ Encerrado':e.strTime}</div></div>`;
    });
    container.innerHTML = html + '</div>';
  } catch (e) { container.innerHTML = '<div class="empty-state"><p>⚠️ Erro ao buscar dados ao vivo</p></div>'; }
}

let adminAuthorized = sessionStorage.getItem('bolao_admin') === '1';
function isAdmin() { return adminAuthorized; }

async function checkAdminPass() {
  const pass = document.getElementById('admin-pass-input').value;
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({senha:pass}) });
    if(r.ok) { 
        adminAuthorized = true; sessionStorage.setItem('bolao_admin', '1'); sessionStorage.setItem('bolao_admin_senha', pass); 
        document.getElementById('admin-login').style.display = 'none'; document.getElementById('admin-panel').style.display = 'block'; 
        carregarUsuariosAdmin(); renderTabelaAdmin(); renderAdminKnockoutGuesses();
    } else showToast('❌ Senha incorreta');
  } catch(e) {}
}

function adminLogout() { 
  adminAuthorized = false; sessionStorage.removeItem('bolao_admin'); sessionStorage.removeItem('bolao_admin_senha');
  document.getElementById('admin-login').style.display='block'; document.getElementById('admin-panel').style.display='none';
}

async function carregarUsuariosAdmin() {
  const pass = document.getElementById('admin-pass-input').value || sessionStorage.getItem('bolao_admin_senha');
  try {
    const res = await fetch('/api/admin/usuarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ senha: pass }) });
    const data = await res.json();
    if (data.error) return showToast('⚠️ Erro ao carregar usuários');
    
    let html = '<table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Usuário</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Perfis</th><th style="text-align:right;padding:6px;border-bottom:1px solid var(--border)">Ações</th></tr>';
    data.forEach(u => {
      const perfis = [u.perfil1, u.perfil2].filter(Boolean).join(', ');
      html += `<tr><td style="padding:6px;border-bottom:1px solid var(--border);color:var(--text)">${u.usuario}</td><td style="padding:6px;border-bottom:1px solid var(--border);color:var(--text2)">${perfis}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:right"><button onclick="mudarSenhaUsuario('${u.usuario}')" style="background:transparent;border:1px solid var(--border);color:var(--gold);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;margin-right:4px">Senha</button><button onclick="excluirUsuario('${u.usuario}')" style="background:transparent;border:1px solid var(--border);color:var(--loss);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px">Excluir</button></td></tr>`;
    });
    document.getElementById('admin-usuarios-list').innerHTML = html + '</table>';
  } catch(e) { showToast('⚠️ Erro na conexão'); }
}

async function mudarSenhaUsuario(user) {
  const novaSenha = prompt(`Digite a nova senha para o usuário: ${user}`);
  if (!novaSenha) return;
  const pass = document.getElementById('admin-pass-input').value || sessionStorage.getItem('bolao_admin_senha');
  try {
    const res = await fetch('/api/admin/usuarios/senha', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ senhaAdmin: pass, usuarioTarget: user, novaSenha }) });
    if (res.ok) showToast('✅ Senha alterada com sucesso'); else showToast('⚠️ Erro ao alterar senha');
  } catch(e) { showToast('⚠️ Erro na conexão'); }
}

async function excluirUsuario(user) {
  if (!confirm(`Tem certeza que deseja excluir a conta de ${user}? Isso não apaga os palpites, apenas o acesso.`)) return;
  const pass = document.getElementById('admin-pass-input').value || sessionStorage.getItem('bolao_admin_senha');
  try {
    const res = await fetch('/api/admin/usuarios/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ senhaAdmin: pass, usuarioTarget: user }) });
    if (res.ok) { showToast('🗑️ Conta excluída'); carregarUsuariosAdmin(); } else showToast('⚠️ Erro ao excluir');
  } catch(e) { showToast('⚠️ Erro na conexão'); }
}

async function salvarDeadlines() {
  const chaves = ['dl-r32', 'dl-r16', 'dl-qf', 'dl-sf', 'dl-final'];
  const pms = chaves.map(ch => fetch('/api/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({chave: ch.replace('dl-','deadline_'), valor: document.getElementById(ch).value}) }));
  await Promise.all(pms);
  chaves.forEach(ch => appConfig[ch.replace('dl-','deadline_')] = document.getElementById(ch).value);
  showToast('✅ Prazos atualizados!');
  if(document.getElementById('tab-proximas-fases').classList.contains('visible')) renderKnockoutGamesForm();
}

async function salvarMatchups() {
  const text = document.getElementById('admin-matchups').value; const parsed = {};
  text.split('\n').forEach(line => {
    const match = line.match(/^(\d+)\s+(.+?)\s*[x\-]\s*(.+)$/i);
    if(match) parsed[match[1]] = { mandante: match[2].trim(), visitante: match[3].trim() };
  });
  await fetch('/api/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({chave: 'knockout_matchups', valor: JSON.stringify(parsed)}) });
  customMatchups = parsed; appConfig.knockout_matchups = JSON.stringify(parsed);
  showToast('✅ Seleções atualizadas!');
  if(document.getElementById('tab-proximas-fases').classList.contains('visible')) { renderKnockoutGamesForm(); renderBracket(); }
}

async function autoFetchMatchupsAdmin() {
    showToast('Buscando jogos recentes...');
    try {
        const d = new Date();
        let allEvents = [];
        for (let i = -1; i <= 2; i++) {
            let dt = new Date(d);
            dt.setDate(dt.getDate() + i);
            let dateStr = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
            let res = await fetch(`https://www.thesportsdb.com/api/v1/json/1/eventsday.php?d=${dateStr}&s=Soccer`);
            let data = await res.json();
            if (data.events) allEvents = allEvents.concat(data.events);
        }

        let validTeams = Object.values(TEAM_DICTIONARY).map(t => normalizeTeamName(t));
        let baseTeams = BOLAO.jogos.flatMap(j => [normalizeTeamName(j.mandante), normalizeTeamName(j.visitante)]);
        
        let knockoutFound = [];
        allEvents.forEach(e => {
            let h = normalizeTeamName(e.strHomeTeam);
            let a = normalizeTeamName(e.strAwayTeam);
            
            if (baseTeams.includes(h) || baseTeams.includes(a) || validTeams.includes(h)) {
                let isGroup = BOLAO.jogos.find(j => 
                    (normalizeTeamName(j.mandante).includes(h) || h.includes(normalizeTeamName(j.mandante))) &&
                    (normalizeTeamName(j.visitante).includes(a) || a.includes(normalizeTeamName(j.visitante)))
                );
                if (!isGroup) knockoutFound.push(`${e.strHomeTeam} x ${e.strAwayTeam}`);
            }
        });
        
        if(knockoutFound.length > 0) {
            let unique = [...new Set(knockoutFound)];
            let txt = document.getElementById('admin-matchups').value;
            unique.forEach(mt => { if (!txt.includes(mt)) txt += `\n?? ${mt}`; });
            document.getElementById('admin-matchups').value = txt.trim();
            showToast('✅ Adicionados! Troque "??" pelo Nº correto do jogo (ex: 73).');
        } else { showToast('Nenhum novo confronto de mata-mata encontrado.'); }
    } catch(e) { showToast('⚠️ Erro ao conectar na TheSportsDB'); }
}

async function salvarCampeao() {
  const val = document.getElementById('admin-campeao').value.trim();
  try {
    await fetch('/api/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({chave: 'campeao_oficial', valor: val}) });
    appConfig.campeao_oficial = val; showToast('✅ Campeão salvo! Rank atualizado.'); renderRanking();
    if(document.getElementById('tab-campeao').classList.contains('visible')) renderCampeoes();
  } catch (e) { showToast('⚠️ Erro ao salvar'); }
}

async function bulkImport() {
  const lines = document.getElementById('bulk-input').value.trim().split('\n');
  let count = 0;
  for (const line of lines) {
    const [numStr, placar] = line.trim().split(/\s+/);
    const num = parseInt(numStr);
    if (!num || !placar) continue;
    let finalVal = null;
    if (['V','E','D'].includes(placar.toUpperCase())) finalVal = placar.toUpperCase();
    else if (/^\d+-\d+$/.test(placar)) finalVal = placar; 
    
    if (finalVal) { 
      resultados[String(num)] = finalVal; 
      await fetch(`/api/resultados/${num}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({resultado:finalVal}) }); 
      count++; 
    }
  }
  if (count > 0) {
    renderRanking(); 
    if(document.getElementById('tab-jogos').classList.contains('visible')) renderJogos();
    if(document.getElementById('tab-meus-palpites').classList.contains('visible')) renderMeusPalpites();
    if(document.getElementById('tab-por-pessoa').classList.contains('visible')) renderPorPessoa();
    showToast(`✅ ${count} resultado(s) importado(s)!`); document.getElementById('bulk-input').value = '';
  } else { showToast('⚠️ Nenhum formato válido'); }
}

async function resetAll() {
  if (!confirm('Limpar TODOS os resultados do banco de dados?')) return;
  resultados = {}; await fetch('/api/resultados', { method: 'DELETE' });
  renderRanking(); 
  if(document.getElementById('tab-jogos').classList.contains('visible')) renderJogos();
  if(document.getElementById('tab-meus-palpites').classList.contains('visible')) renderMeusPalpites();
  if(document.getElementById('tab-por-pessoa').classList.contains('visible')) renderPorPessoa();
  showToast('🗑️ Banco limpo');
}

function exportReportCSV() {
  const type = document.getElementById('export-type').value;
  const specificGame = parseInt(document.getElementById('export-game-num').value);
  let csv = '\uFEFFJogo;Fase;Mandante;Visitante;Participante;Palpite\n'; let lines = 0;
  
  if (type === 'grupos' || type === 'jogo') {
     BOLAO.jogos.forEach(j => {
        if (type === 'jogo' && j.jogo !== specificGame) return;
        Object.entries(j.palpites).forEach(([pName, pal]) => { csv += `${j.jogo};${j.fase};${j.mandante};${j.visitante};${pName};${pal}\n`; lines++; });
     });
  }
  if (type === 'matamata' || type === 'jogo') {
     JOGOS_FASE_FINAL.forEach(j => {
        if (type === 'jogo' && j.jogo !== specificGame) return;
        const pts = cachePalpitesFinais.filter(p => p.jogo_num === j.jogo);
        pts.forEach(p => { csv += `${j.jogo};${j.fase};${getKnockoutTeam(j.jogo,'mandante',j.mandante)};${getKnockoutTeam(j.jogo,'visitante',j.visitante)};${p.participante};${p.palpite}\n`; lines++; });
     });
  }
  if (lines === 0) return showToast('⚠️ Sem dados para exportar.');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `palpites_bolao.csv`; a.click(); showToast('📥 Planilha gerada!');
}

function renderAdminKnockoutGuesses() {
  const viewType = document.getElementById('admin-mm-view-type').value;
  const personSelect = document.getElementById('admin-mm-person');
  const container = document.getElementById('admin-mm-content');

  if(viewType === 'pessoa') {
    personSelect.style.display = 'inline-block';
    if(personSelect.options.length === 0) {
      BOLAO.participantes.forEach(p => { personSelect.innerHTML += `<option value="${p}">${p}</option>`; });
    }
  } else { personSelect.style.display = 'none'; }

  let html = '';
  if (viewType === 'geral') {
    html = '<table style="width:100%; border-collapse:collapse; font-size:11px; white-space:nowrap;">';
    html += '<tr><th style="padding:6px 6px 6px 0; border-bottom:1px solid var(--border); text-align:left; vertical-align:bottom;">Jogo</th>';
    
    BOLAO.participantes.forEach(p => {
      const shortName = p.split(' ')[0];
      html += `<th style="padding:2px; border-bottom:1px solid var(--border); text-align:center; vertical-align:bottom;">
                 <div style="writing-mode: vertical-rl; transform: rotate(180deg); display: inline-block; font-size:10px; font-weight:500; color:var(--text2); margin-bottom:6px;">
                   ${shortName}
                 </div>
               </th>`;
    });
    html += '</tr>';

    JOGOS_FASE_FINAL.forEach(j => {
      const m = getKnockoutTeam(j.jogo, 'mandante', j.mandante);
      const v = getKnockoutTeam(j.jogo, 'visitante', j.visitante);
      
      html += `<tr>
        <td style="padding:4px 6px 4px 0; border-bottom:1px solid var(--border); color:var(--text2); font-size:10px; max-width:160px; overflow:hidden; text-overflow:ellipsis;">
          #${j.jogo} ${m} x ${v}
        </td>`;
      
      BOLAO.participantes.forEach(p => {
        const saved = cachePalpitesFinais.find(i => i.participante === p && i.jogo_num === j.jogo);
        const pal = saved ? saved.palpite : '-';
        const color = pal === 'V' ? 'var(--win)' : pal === 'E' ? 'var(--draw)' : pal === 'D' ? 'var(--loss)' : 'var(--text3)';
        html += `<td style="padding:4px 2px; border-bottom:1px solid var(--border); text-align:center; color:${color}; font-weight:bold; font-size:12px;">${pal}</td>`;
      });
      html += '</tr>';
    });
    html += '</table>';
  } else {
    const person = personSelect.value || BOLAO.participantes[0];
    html = '<table style="width:100%; border-collapse:collapse; font-size:11px;">';
    html += '<tr><th style="padding:6px; border-bottom:1px solid var(--border); text-align:left;">Jogo</th><th style="padding:6px; border-bottom:1px solid var(--border); text-align:center;">Palpite</th></tr>';
    JOGOS_FASE_FINAL.forEach(j => {
      const m = getKnockoutTeam(j.jogo, 'mandante', j.mandante);
      const v = getKnockoutTeam(j.jogo, 'visitante', j.visitante);
      const saved = cachePalpitesFinais.find(i => i.participante === person && i.jogo_num === j.jogo);
      const pal = saved ? saved.palpite : null;
      
      let label = 'Não enviado';
      let color = 'var(--text3)';
      if(pal) {
         label = pal === 'V' ? m : pal === 'E' ? 'Empate' : pal === 'D' ? v : pal;
         color = pal === 'V' ? 'var(--win)' : pal === 'E' ? 'var(--draw)' : pal === 'D' ? 'var(--loss)' : 'var(--text)';
      }
      
      html += `<tr>
        <td style="padding:6px; border-bottom:1px solid var(--border); color:var(--text)">#${j.jogo} - ${j.fase}<br><span style="color:var(--text2)">${m} x ${v}</span></td>
        <td style="padding:6px; border-bottom:1px solid var(--border); text-align:center; font-weight:bold; color:${color}">${label}</td>
      </tr>`;
    });
    html += '</table>';
  }
  container.innerHTML = html;
}

function renderTabelaAdmin() {
  const ranking = calcRanking(); const encerrados = Object.keys(resultados).length;
  let html = '<table style="border-collapse:collapse;font-size:11px;min-width:600px;width:100%"><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Pos</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Participante</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border)">Pts</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border)">Acertos</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border)">Prêmio Estimado</th></tr>';
  ranking.forEach(r => {
    let pText = (r.premio > 0 && encerrados > 0) ? `R$ ${r.premio.toFixed(2).replace('.',',')}` : '—';
    html += `<tr><td style="padding:8px;border-bottom:1px solid var(--border)">${r.posicao}º</td><td style="padding:8px;border-bottom:1px solid var(--border)">${r.nome}</td><td style="text-align:right;border-bottom:1px solid var(--border);color:var(--gold);font-weight:bold">${r.pts}</td><td style="text-align:right;border-bottom:1px solid var(--border)">${r.acertos}</td><td style="text-align:right;border-bottom:1px solid var(--border);color:var(--win);font-weight:bold">${pText}</td></tr>`;
  });
  document.getElementById('tabela-completa').innerHTML = html + '</table>';
}

function renderPorPessoa() {
  const container = document.getElementById('por-pessoa-content');
  const participantes = BOLAO.participantes || [];
  if (!participantes.length) { container.innerHTML = '<p style="color:var(--text2);padding:20px">Nenhum participante encontrado.</p>'; return; }

  const current = container.dataset.pessoa || participantes[0];
  container.dataset.pessoa = current;

  const jogosOrdenados = getTodosJogos().sort((a, b) => a.jogo - b.jogo);
  const encerrados = jogosOrdenados.filter(j => resultados[String(j.jogo)]);
  const acertos = encerrados.filter(j => { return j.palpites[current] && j.palpites[current] === getWinnerFromScore(resultados[String(j.jogo)]); });
  const pct = encerrados.length > 0 ? Math.round((acertos.length / encerrados.length) * 100) : 0;
  const campeaoPalpite = BOLAO.palpites_campeao ? (BOLAO.palpites_campeao[current] || '—') : '—';

  const options = participantes.map(p => `<option value="${p}" ${p === current ? 'selected' : ''}>${p}</option>`).join('');

  let jogosHTML = '';
  jogosOrdenados.forEach(j => {
    const res = resultados[String(j.jogo)];
    const pal = j.palpites[current];
    const resLetter = getWinnerFromScore(res);
    let cls = '', icon = '';
    if (res && pal) { cls = pal === resLetter ? 'acerto' : 'erro'; icon = pal === resLetter ? '✅' : '❌'; }
    else if (!pal) { icon = '—'; } else { icon = '⏳'; }
    const nomePal = pal === 'V' ? j.mandante : pal === 'E' ? 'Empate' : pal === 'D' ? j.visitante : '—';

    jogosHTML += `
    <div class="jogo-card ${res ? 'encerrado' : ''}" style="cursor:default;">
      <div class="jogo-header">
        <div class="jogo-num"><span>#${j.jogo}</span><span class="jogo-grupo-badge">${j.fase.replace('Grupo ','Gr ')}</span></div>
        <div class="jogo-mandante">${j.mandante}</div>
        ${res ? formatScoreHeader(res) : `<div class="jogo-placar pendente">${j.hora || '—'}</div>`}
        <div class="jogo-visitante">${j.visitante}</div><div class="jogo-meta">${res ? '<span class="badge-done">✓</span>' : ''}</div>
      </div>
      <div style="padding:8px 14px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.15);">
        <span style="font-size:12px; color:var(--text2);">Palpite:</span>
        <div class="palpite-item ${cls}" style="width:auto; gap:8px; padding:5px 12px; font-size:13px; font-weight:600;">${icon} ${nomePal}</div>
      </div>
    </div>`;
  });

  container.innerHTML = `<div class="import-box" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:14px 20px; margin-bottom:16px;"><div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;"><span style="color:var(--text2); font-size:13px;">Participante:</span><select class="res-input" style="width:auto; text-transform:none; font-size:14px; font-weight:600; color:var(--text);" onchange="document.getElementById('por-pessoa-content').dataset.pessoa=this.value; renderPorPessoa();">${options}</select></div><div style="display:flex; gap:12px; flex-wrap:wrap;"><div style="text-align:center; padding:6px 14px; background:var(--bg3); border-radius:var(--r-sm);"><div style="font-size:18px; font-weight:700; color:var(--gold); line-height:1;">${acertos.length}<span style="font-size:12px; color:var(--text3); font-weight:400;">/${encerrados.length}</span></div><div style="font-size:11px; color:var(--text3); margin-top:2px;">Acertos</div></div><div style="text-align:center; padding:6px 14px; background:var(--bg3); border-radius:var(--r-sm);"><div style="font-size:18px; font-weight:700; color:var(--gold); line-height:1;">${pct}%</div><div style="font-size:11px; color:var(--text3); margin-top:2px;">Aproveit.</div></div><div style="text-align:center; padding:6px 14px; background:var(--bg3); border-radius:var(--r-sm);"><div style="font-size:14px; font-weight:600; color:var(--text); line-height:1.3;">${campeaoPalpite}</div><div style="font-size:11px; color:var(--text3); margin-top:2px;">🏆 Campeão</div></div></div></div><div class="group-section">${jogosHTML}</div>`;
}

function showTab(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('visible');
  if (event && event.target) event.target.classList.add('active');
  
  if (name === 'por-pessoa') renderPorPessoa();
  if (name === 'meus-palpites') renderMeusPalpites();
  if (name === 'jogos') renderJogos();
  if (name === 'campeao') renderCampeoes();
  
  if (name === 'ao-vivo') {
    if (isAdmin()) { document.getElementById('ao-vivo-login').style.display = 'none'; document.getElementById('ao-vivo-content').style.display = 'block'; fetchLiveScores(); }
    else { document.getElementById('ao-vivo-login').style.display = 'block'; document.getElementById('ao-vivo-content').style.display = 'none'; }
  }
  
  if (name === 'admin') { 
    if (adminAuthorized) { document.getElementById('admin-login').style.display = 'none'; document.getElementById('admin-panel').style.display = 'block'; carregarUsuariosAdmin(); renderTabelaAdmin(); renderAdminKnockoutGuesses(); }
    else { document.getElementById('admin-login').style.display = 'block'; document.getElementById('admin-panel').style.display = 'none'; } 
  }
}

let toastTimer;
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000); }

init();
