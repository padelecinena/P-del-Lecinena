/* ===========================================================
   PÁDEL LECIÑENA — lógica de la app
   Persistencia: Firebase Firestore (nube, compartida por todos).
   La sesión (quién ha iniciado sesión en ESTE dispositivo) sigue
   guardándose en localStorage, porque eso sí es local por diseño.

   Nota de seguridad: esto NO usa Firebase Authentication, sino
   un usuario/contraseña propios guardados en Firestore. Es
   suficiente para un grupo de confianza (amigos del club), pero
   cualquiera con las reglas de Firestore abiertas podría leer/
   escribir la base de datos directamente. Ver README.md.
=========================================================== */

const COL_USERS = 'usuarios';
const COL_MATCHES = 'partidos';

let usersCache = [];
let matchesCache = [];
let usersReady = false;
let matchesReady = false;
let activeMatchId = null;

/* ---------- arranque / estado de conexión ---------- */
function showCloudStatus(html){
  document.getElementById('cloud-status').classList.remove('hidden');
  document.getElementById('cloud-status-box').innerHTML = html;
}
function hideCloudStatus(){
  document.getElementById('cloud-status').classList.add('hidden');
}

function startCloudSync(){
  if(!window.__FIREBASE_CONFIGURED__){
    showCloudStatus(`
      <p class="cloud-status-title">⚠️ Falta configurar Firebase</p>
      <p>Abre <code>js/firebase-config.js</code> y pega ahí los datos de tu proyecto
      de Firebase (Firebase Console → Configuración del proyecto → Tus apps).
      Los pasos exactos están en el README.md del proyecto.</p>
    `);
    return;
  }

  window.db.collection(COL_USERS).onSnapshot(snap => {
    usersCache = snap.docs.map(d => d.data());
    usersReady = true;
    onCloudData();
  }, err => connectionError(err));

  window.db.collection(COL_MATCHES).onSnapshot(snap => {
    matchesCache = snap.docs.map(d => d.data());
    matchesReady = true;
    onCloudData();
  }, err => connectionError(err));
}

function connectionError(err){
  console.error(err);
  showCloudStatus(`
    <p class="cloud-status-title">⚠️ No se pudo conectar</p>
    <p>${err.message || 'Revisa tu conexión y las reglas de Firestore.'}</p>
  `);
}

let appStarted = false;
function onCloudData(){
  if(!usersReady || !matchesReady) return;
  if(!appStarted){
    appStarted = true;
    hideCloudStatus();
    const session = getSession();
    if(session && findUser(session)) enterApp();
    else { clearSession(); show('view-login'); }
  }
  refreshCurrentView();
}

function refreshCurrentView(){
  if(!appStarted) return;
  if(!document.getElementById('view-home').classList.contains('hidden')){
    renderHomeHeader();
    renderMatchesList();
    renderRecentResults();
    if(!document.getElementById('panel-ranking').classList.contains('hidden')) renderRanking();
    if(!document.getElementById('panel-admin').classList.contains('hidden')) renderAdminPanel();
  }
  if(!document.getElementById('view-match').classList.contains('hidden') && activeMatchId){
    renderMatch();
  }
  if(!document.getElementById('view-history').classList.contains('hidden')){
    const sel = document.getElementById('history-filter');
    renderHistoryList(sel ? sel.value : '__all__');
  }
}

/* ---------- acceso a datos (Firestore) ---------- */
function getUsers(){ return usersCache; }
function getMatches(){ return matchesCache; }

function findUser(username){
  return usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function saveUser(user){
  return window.db.collection(COL_USERS).doc(user.username.toLowerCase()).set(user)
    .catch(err => toast('Error al guardar: ' + err.message));
}

function saveMatch(match){
  return window.db.collection(COL_MATCHES).doc(match.id).set(match)
    .catch(err => toast('Error al guardar: ' + err.message));
}

function updateMatch(id, mutator){
  const match = matchesCache.find(m => m.id === id);
  if(!match) return;
  const copy = JSON.parse(JSON.stringify(match));
  mutator(copy);
  saveMatch(copy);
}

// ofuscación simple, NO es hashing criptográfico real
function obfuscate(str){
  return btoa(unescape(encodeURIComponent(str))).split('').reverse().join('');
}

function uid(){ return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function getSession(){ return localStorage.getItem('padel_session'); }
function setSession(username){ localStorage.setItem('padel_session', username); }
function clearSession(){ localStorage.removeItem('padel_session'); }
function currentUser(){ return findUser(getSession()); }

// El usuario "Eduardo" es el máster: puede borrar partidos si algo sale mal.
function isMaster(user){
  return !!user && user.username.toLowerCase() === 'eduardo';
}

/* ---------- compresión de imágenes antes de subirlas ---------- */
function compressImage(file, maxDim = 480, quality = 0.72){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width > height){ height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2400);
}

/* ---------- navegación entre vistas ---------- */
function show(viewId){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
  window.scrollTo(0,0);
  refreshCurrentView();
}

function initials(name){
  return (name || '?').trim().slice(0,2).toUpperCase();
}

function avatarStyle(user){
  if(user && user.photo) return `background-image:url('${user.photo}')`;
  return '';
}

/* ===========================================================
   LOGIN / REGISTRO
=========================================================== */
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active'); tabRegister.classList.remove('active');
  formLogin.classList.remove('hidden'); formRegister.classList.add('hidden');
});
tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active'); tabLogin.classList.remove('active');
  formRegister.classList.remove('hidden'); formLogin.classList.add('hidden');
});

let regPhotoData = null;
document.getElementById('reg-pass').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
});

const regPhotoInput = document.getElementById('reg-photo');
const regPhotoPreview = document.getElementById('reg-photo-preview');
regPhotoPreview.addEventListener('click', () => regPhotoInput.click());
regPhotoInput.addEventListener('change', async () => {
  const file = regPhotoInput.files[0];
  if(!file) return;
  regPhotoData = await compressImage(file);
  regPhotoPreview.innerHTML = `<img src="${regPhotoData}" alt="Foto de perfil">`;
});

formLogin.addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');
  const user = findUser(username);
  if(!user || user.pass !== obfuscate(pass)){
    errorEl.textContent = 'Usuario o contraseña incorrectos.';
    return;
  }
  errorEl.textContent = '';
  setSession(user.username);
  formLogin.reset();
  enterApp();
});

formRegister.addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const errorEl = document.getElementById('register-error');

  if(findUser(username)){
    errorEl.textContent = 'Ese usuario ya existe, elige otro.';
    return;
  }
  if(username.length < 2){
    errorEl.textContent = 'El usuario debe tener al menos 2 caracteres.';
    return;
  }
  if(!/^\d{4,8}$/.test(pass)){
    errorEl.textContent = 'La contraseña debe tener entre 4 y 8 números.';
    return;
  }
  errorEl.textContent = '';

  const newUser = {
    username,
    pass: obfuscate(pass),
    photo: regPhotoData || null,
    matchesPlayed: 0,
    matchesWon: 0,
    setsWon: 0,
    gamesWon: 0,
  };

  saveUser(newUser).then(() => {
    setSession(username);
    formRegister.reset();
    regPhotoData = null;
    regPhotoPreview.innerHTML = '<span>+</span>';
    toast(`¡Bienvenido, ${username}!`);
    enterApp();
  });
});

document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession();
  show('view-login');
});

/* ===========================================================
   HOME
=========================================================== */
const segMatches = document.getElementById('seg-matches');
const segRanking = document.getElementById('seg-ranking');
const segAdmin = document.getElementById('seg-admin');
const panelMatches = document.getElementById('panel-matches');
const panelRanking = document.getElementById('panel-ranking');
const panelAdmin = document.getElementById('panel-admin');

function hideAllPanels(){
  panelMatches.classList.add('hidden');
  panelRanking.classList.add('hidden');
  panelAdmin.classList.add('hidden');
  segMatches.classList.remove('active');
  segRanking.classList.remove('active');
  segAdmin.classList.remove('active');
}

segMatches.addEventListener('click', () => {
  hideAllPanels();
  segMatches.classList.add('active'); panelMatches.classList.remove('hidden');
});
segRanking.addEventListener('click', () => {
  hideAllPanels();
  segRanking.classList.add('active'); panelRanking.classList.remove('hidden');
  renderRanking();
});
segAdmin.addEventListener('click', () => {
  hideAllPanels();
  segAdmin.classList.add('active'); panelAdmin.classList.remove('hidden');
  renderAdminPanel();
});

function renderHomeHeader(){
  const user = currentUser();
  if(!user) return;
  document.getElementById('home-username').textContent = user.username;
  document.getElementById('home-master-badge').classList.toggle('hidden', !isMaster(user));
  segAdmin.classList.toggle('hidden', !isMaster(user));
  const av = document.getElementById('home-avatar');
  if(user.photo){
    av.style.backgroundImage = `url('${user.photo}')`;
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = initials(user.username);
  }
}

document.getElementById('home-photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const photo = await compressImage(file);
  const u = { ...currentUser(), photo };
  saveUser(u).then(() => toast('Foto de perfil actualizada'));
  e.target.value = '';
});

document.getElementById('btn-request-match').addEventListener('click', () => {
  const user = currentUser();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(Math.ceil(now.getMinutes()/5)*5 % 60).padStart(2,'0');
  const match = {
    id: uid(),
    hour: `${hh}:${mm}`,
    createdBy: user.username,
    players: [user.username],
    status: 'open',
    result: null,
    createdAt: Date.now(),
  };
  saveMatch(match).then(() => {
    toast('Partido creado. ¡Comparte para que se apunten!');
    openMatch(match.id);
  });
});

function renderMatchesList(){
  const matches = getMatches().filter(m => m.status !== 'done').sort((a,b)=> b.createdAt - a.createdAt);
  const list = document.getElementById('matches-list');
  const empty = document.getElementById('matches-empty');
  list.innerHTML = '';
  if(matches.length === 0){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  matches.forEach(m => {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.addEventListener('click', () => openMatch(m.id));

    const pillClass = m.status === 'open' ? 'pill-open' : 'pill-full';
    const pillText = m.status === 'open' ? 'Abierto' : 'Completo';

    const avatarsHtml = m.players.map(username => {
      const u = findUser(username);
      const style = avatarStyle(u);
      return `<div class="avatar-sm" style="${style}">${u && u.photo ? '' : initials(username)}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="match-time">${m.hour}</div>
      <div class="match-card-body">
        <p class="match-card-title">Partido de ${m.createdBy}</p>
        <p class="match-card-sub">${m.players.length}/4 apuntados</p>
        <div class="mini-avatars">${avatarsHtml}</div>
      </div>
      <span class="match-pill ${pillClass}">${pillText}</span>
    `;
    list.appendChild(card);
  });
}

function formatDate(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function matchResultCardHtml(m){
  const r = m.result;
  const winnerA = r.setsA > r.setsB;
  const teamA = `${m.players[0]} y ${m.players[1]}`;
  const teamB = `${m.players[2]} y ${m.players[3]}`;
  return `
    <div class="match-card result-card" data-match-id="${m.id}">
      <div class="result-card-score">${r.setsA} - ${r.setsB}</div>
      <div class="match-card-body">
        <p class="result-card-date">${formatDate(m.createdAt)} · ${m.hour}</p>
        <p class="match-card-title">${winnerA ? '🏆 ' : ''}${teamA}</p>
        <p class="match-card-title">${!winnerA ? '🏆 ' : ''}${teamB}</p>
      </div>
    </div>
  `;
}

function renderRecentResults(){
  const done = getMatches().filter(m => m.status === 'done' && m.result).sort((a,b)=> b.createdAt - a.createdAt);
  const container = document.getElementById('recent-results');
  const empty = document.getElementById('recent-results-empty');
  container.innerHTML = '';
  if(done.length === 0){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  done.slice(0,5).forEach(m => container.insertAdjacentHTML('beforeend', matchResultCardHtml(m)));
  container.querySelectorAll('[data-match-id]').forEach(el => {
    el.addEventListener('click', () => openMatch(el.dataset.matchId));
  });
}

document.getElementById('btn-open-history').addEventListener('click', () => {
  const select = document.getElementById('history-filter');
  const users = getUsers().map(u => u.username).sort((a,b)=>a.localeCompare(b));
  select.innerHTML = `<option value="__all__">Todos los jugadores</option>` +
    users.map(u => `<option value="${u}">${u}</option>`).join('');
  select.value = '__all__';
  show('view-history');
});

document.getElementById('history-filter').addEventListener('change', (e) => {
  renderHistoryList(e.target.value);
});

document.getElementById('btn-back-history').addEventListener('click', () => {
  show('view-home');
});

function renderHistoryList(filterUsername){
  const done = getMatches()
    .filter(m => m.status === 'done' && m.result)
    .filter(m => filterUsername === '__all__' || m.players.includes(filterUsername))
    .sort((a,b)=> b.createdAt - a.createdAt);

  const container = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  container.innerHTML = '';
  if(done.length === 0){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  done.forEach(m => container.insertAdjacentHTML('beforeend', matchResultCardHtml(m)));
  container.querySelectorAll('[data-match-id]').forEach(el => {
    el.addEventListener('click', () => openMatch(el.dataset.matchId));
  });
}

function renderRanking(){
  const users = getUsers().slice().sort((a,b) => {
    if(b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
    if(b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
    return b.gamesWon - a.gamesWon;
  });
  const table = document.getElementById('ranking-table');
  const empty = document.getElementById('ranking-empty');
  table.innerHTML = '';

  const withGames = users.filter(u => u.matchesPlayed > 0);
  if(withGames.length === 0){ empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); }

  users.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <span class="rank-pos">${i+1}</span>
      <div class="avatar-sm" style="${avatarStyle(u)}">${u.photo ? '' : initials(u.username)}</div>
      <span class="rank-name">${u.username}</span>
      <div class="rank-stats">
        <span><b>${u.matchesWon}</b>PG</span>
        <span><b>${u.setsWon}</b>Sets</span>
        <span><b>${u.gamesWon}</b>Games</span>
      </div>
    `;
    table.appendChild(row);
  });
}

function renderAdminPanel(){
  if(!isMaster(currentUser())) return;
  const select = document.getElementById('admin-user-select');
  const currentValue = select.value;
  const users = getUsers().map(u => u.username).sort((a,b)=>a.localeCompare(b));
  select.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
  if(users.includes(currentValue)) select.value = currentValue;
}

document.getElementById('btn-admin-reset').addEventListener('click', () => {
  const username = document.getElementById('admin-user-select').value;
  const passInput = document.getElementById('admin-new-pass');
  const errorEl = document.getElementById('admin-error');
  const newPass = passInput.value;

  if(!username){ errorEl.textContent = 'Elige un jugador.'; return; }
  if(!/^\d{4,8}$/.test(newPass)){ errorEl.textContent = 'La contraseña debe tener entre 4 y 8 números.'; return; }

  const u = findUser(username);
  if(!u){ errorEl.textContent = 'No se encuentra ese jugador.'; return; }

  errorEl.textContent = '';
  saveUser({ ...u, pass: obfuscate(newPass) }).then(() => {
    toast(`Contraseña de ${username} restablecida`);
    passInput.value = '';
  });
});

document.getElementById('admin-new-pass').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
});

document.getElementById('btn-admin-delete-user').addEventListener('click', () => {
  const username = document.getElementById('admin-user-select').value;
  const errorEl = document.getElementById('admin-error');
  if(!username){ errorEl.textContent = 'Elige un jugador.'; return; }
  const ok = confirm(`¿Eliminar del todo la cuenta de "${username}"? Podrá volver a registrarse con ese mismo nombre. Esta acción no se puede deshacer.`);
  if(!ok) return;
  window.db.collection(COL_USERS).doc(username.toLowerCase()).delete()
    .then(() => toast(`Cuenta de ${username} eliminada`))
    .catch(err => toast('Error al eliminar: ' + err.message));
});

document.getElementById('btn-wipe-matches').addEventListener('click', () => {
  if(matchesCache.length === 0){ toast('No hay partidos que borrar'); return; }
  const ok = confirm(`¿Borrar TODO el historial de partidos (${matchesCache.length} en total, activos y terminados)? Esta acción no se puede deshacer.`);
  if(!ok) return;
  const batch = window.db.batch();
  matchesCache.forEach(m => batch.delete(window.db.collection(COL_MATCHES).doc(m.id)));
  batch.commit()
    .then(() => toast('Historial de partidos borrado'))
    .catch(err => toast('Error al borrar: ' + err.message));
});

function enterApp(){
  segMatches.click();
  show('view-home');
}

/* ===========================================================
   DETALLE DE PARTIDO
=========================================================== */
document.getElementById('btn-back-match').addEventListener('click', () => {
  activeMatchId = null;
  show('view-home');
});

document.getElementById('btn-delete-match').addEventListener('click', () => {
  if(!isMaster(currentUser())) return;
  const match = getMatch(activeMatchId);
  if(!match) return;
  const ok = confirm(`¿Borrar el partido de las ${match.hour}? Esta acción no se puede deshacer.`);
  if(!ok) return;
  window.db.collection(COL_MATCHES).doc(match.id).delete()
    .then(() => {
      toast('Partido borrado');
      activeMatchId = null;
      show('view-home');
    })
    .catch(err => toast('Error al borrar: ' + err.message));
});

function openMatch(id){
  activeMatchId = id;
  show('view-match');
}

function getMatch(id){ return getMatches().find(m => m.id === id); }

function renderMatch(){
  const match = getMatch(activeMatchId);
  const user = currentUser();
  if(!match) { show('view-home'); return; }

  const isCreator = match.createdBy === user.username;
  const hourInput = document.getElementById('match-hour');
  if(document.activeElement !== hourInput) hourInput.value = match.hour;
  hourInput.disabled = !(isCreator && match.status === 'open');

  hourInput.onchange = () => {
    updateMatch(match.id, m => { m.hour = hourInput.value; });
    toast('Hora actualizada');
  };

  const badge = document.getElementById('match-status-badge');
  badge.textContent = match.status === 'open' ? 'Buscando jugadores' : (match.status === 'full' ? 'Completo' : 'Partido jugado');

  document.getElementById('btn-delete-match').classList.toggle('hidden', !isMaster(user));

  const grid = document.getElementById('court');
  grid.innerHTML = '';

  function slotHtml(i){
    const username = match.players[i];
    if(username){
      const u = findUser(username);
      const canLeave = username === user.username && match.status !== 'done';
      return `
        <div class="slot-card filled">
          <div class="slot-avatar" style="${avatarStyle(u)}">${u && u.photo ? '' : initials(username)}</div>
          <span class="slot-name">${username}</span>
          ${canLeave ? `<button class="btn-leave" data-leave-idx="${i}">Salir</button>` : ''}
        </div>`;
    }
    const canJoin = match.status === 'open' && !match.players.includes(user.username);
    return `
      <div class="slot-card">
        <div class="slot-avatar">?</div>
        <span class="slot-empty-label">Libre</span>
        ${canJoin ? `<button class="btn-join" data-join-idx="${i}">Apuntarme</button>` : ''}
      </div>`;
  }

  grid.innerHTML = `
    <div class="court-team">
      <span class="court-team-label">Equipo 1</span>
      ${slotHtml(0)}
      ${slotHtml(1)}
    </div>
    <div class="court-divider"></div>
    <div class="court-team">
      <span class="court-team-label">Equipo 2</span>
      ${slotHtml(2)}
      ${slotHtml(3)}
    </div>
  `;
  grid.querySelectorAll('[data-join-idx]').forEach(btn => {
    btn.addEventListener('click', () => joinMatch(match.id));
  });
  grid.querySelectorAll('[data-leave-idx]').forEach(btn => {
    btn.addEventListener('click', () => leaveMatch(match.id));
  });

  const resultBox = document.getElementById('result-box');
  const resultSummary = document.getElementById('result-summary');

  if(match.status === 'full'){
    resultBox.classList.remove('hidden');
    resultSummary.classList.add('hidden');
    document.getElementById('result-teams').textContent =
      `Equipo 1: ${match.players[0]} y ${match.players[1]}  ·  Equipo 2: ${match.players[2]} y ${match.players[3]}`;
  } else if(match.status === 'done' && match.result){
    resultBox.classList.add('hidden');
    resultSummary.classList.remove('hidden');
    const r = match.result;
    const winner = r.setsA > r.setsB ? `${match.players[0]} y ${match.players[1]}` : `${match.players[2]} y ${match.players[3]}`;
    resultSummary.innerHTML = `
      <h3>🏆 Ganan ${winner}</h3>
      <p>Sets: ${r.setsA} - ${r.setsB} · Games: ${r.gamesA} - ${r.gamesB}</p>
    `;
  } else {
    resultBox.classList.add('hidden');
    resultSummary.classList.add('hidden');
  }
}

function joinMatch(id){
  const user = currentUser();
  updateMatch(id, m => {
    if(m.players.includes(user.username) || m.players.length >= 4) return;
    m.players.push(user.username);
    if(m.players.length === 4) m.status = 'full';
  });
  toast('¡Te has apuntado!');
}

function leaveMatch(id){
  const user = currentUser();
  updateMatch(id, m => {
    m.players = m.players.filter(p => p !== user.username);
    if(m.status === 'full') m.status = 'open';
  });
  toast('Has salido del partido');
}

document.getElementById('btn-save-result').addEventListener('click', () => {
  const match = getMatch(activeMatchId);
  const setsA = parseInt(document.getElementById('sets-a').value) || 0;
  const setsB = parseInt(document.getElementById('sets-b').value) || 0;
  const gamesA = parseInt(document.getElementById('games-a').value) || 0;
  const gamesB = parseInt(document.getElementById('games-b').value) || 0;

  if(setsA === setsB){
    toast('Los sets no pueden empatar, indica quién ganó el partido.');
    return;
  }

  const result = { setsA, setsB, gamesA, gamesB };
  const winners = setsA > setsB ? [match.players[0], match.players[1]] : [match.players[2], match.players[3]];

  updateMatch(match.id, m => { m.status = 'done'; m.result = result; });

  match.players.forEach((username, i) => {
    const u = findUser(username);
    if(!u) return;
    const onTeamA = i < 2;
    const updated = {
      ...u,
      matchesPlayed: u.matchesPlayed + 1,
      setsWon: u.setsWon + (onTeamA ? setsA : setsB),
      gamesWon: u.gamesWon + (onTeamA ? gamesA : gamesB),
      matchesWon: u.matchesWon + (winners.includes(username) ? 1 : 0),
    };
    saveUser(updated);
  });

  toast('Resultado guardado. ¡Ranking actualizado!');
});

/* ===========================================================
   ARRANQUE
=========================================================== */
startCloudSync();
