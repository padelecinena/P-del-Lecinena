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
let resultEditorOpen = false;

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
  return window.db.collection(COL_USERS).doc(user.username.toLowerCase()).set(user);
}

function saveMatch(match){
  return window.db.collection(COL_MATCHES).doc(match.id).set(match);
}

function updateMatch(id, mutator){
  const match = matchesCache.find(m => m.id === id);
  if(!match) return;
  const copy = JSON.parse(JSON.stringify(match));
  mutator(copy);
  saveMatch(copy).catch(err => toast('Error al guardar: ' + err.message));
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
    joinedAt: Date.now(),
    welcomeSeenAt: Date.now(),
  };

  saveUser(newUser).then(() => {
    setSession(username);
    formRegister.reset();
    regPhotoData = null;
    regPhotoPreview.innerHTML = '<span>+</span>';
    toast(`¡Bienvenido, ${username}!`);
    enterApp();
  }).catch(err => { errorEl.textContent = 'No se pudo crear la cuenta: ' + err.message; });
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
  saveUser(u).then(() => toast('Foto de perfil actualizada')).catch(err => toast('Error al guardar la foto: ' + err.message));
  e.target.value = '';
});

document.getElementById('btn-request-match').addEventListener('click', () => {
  const user = currentUser();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(Math.ceil(now.getMinutes()/5)*5 % 60).padStart(2,'0');
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const match = {
    id: uid(),
    date: `${yyyy}-${mo}-${dd}`,
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
  }).catch(err => toast('No se pudo crear el partido: ' + err.message));
});

function formatISODate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function matchDateForSort(m){
  return `${m.date || '0000-00-00'}T${m.hour || '00:00'}`;
}

function renderMatchesList(){
  const matches = getMatches().filter(m => m.status !== 'done').sort((a,b)=> matchDateForSort(a).localeCompare(matchDateForSort(b)));
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
      <div class="match-time">${m.hour}${m.date ? `<span class="match-time-date">${formatISODate(m.date)}</span>` : ''}</div>
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
  const teamA = r.teamA || [m.players[0], m.players[1]];
  const teamB = r.teamB || [m.players[2], m.players[3]];
  const winnerA = r.setsA > r.setsB;
  const teamAName = teamA.join(' y ');
  const teamBName = teamB.join(' y ');
  const dateLabel = m.date ? formatISODate(m.date) : formatDate(m.createdAt);
  return `
    <div class="match-card result-card" data-match-id="${m.id}">
      <div class="result-card-score">${r.setsA} - ${r.setsB}</div>
      <div class="match-card-body">
        <p class="result-card-date">${dateLabel} · ${m.hour}</p>
        <p class="match-card-title">${winnerA ? '🏆 ' : ''}${teamAName}</p>
        <p class="match-card-title">${!winnerA ? '🏆 ' : ''}${teamBName}</p>
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
  }).catch(err => { errorEl.textContent = 'Error al guardar: ' + err.message; });
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
  loadWeather();
  maybeShowWelcome();
  maybeShowResultReminder();
  runAutoDeleteCheck();
  maybeShowDeleteWarning();
}

/* ===========================================================
   BIENVENIDA A NUEVOS JUGADORES (una vez por usuario, para todos)
=========================================================== */
function findPendingWelcome(){
  const user = currentUser();
  if(!user) return null;
  const cursor = user.welcomeSeenAt || 0;
  const candidates = getUsers()
    .filter(u => u.joinedAt && u.joinedAt > cursor && u.username !== user.username)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return candidates[0] || null;
}

function maybeShowWelcome(){
  const modal = document.getElementById('welcome-modal');
  const newPlayer = findPendingWelcome();
  if(!newPlayer){ modal.classList.add('hidden'); return; }
  document.getElementById('welcome-name').textContent = newPlayer.username;
  modal.classList.remove('hidden');
}

function dismissWelcome(){
  const user = currentUser();
  const newPlayer = findPendingWelcome();
  document.getElementById('welcome-modal').classList.add('hidden');
  if(user && newPlayer){
    saveUser({ ...user, welcomeSeenAt: newPlayer.joinedAt }).catch(() => {});
  }
  setTimeout(maybeShowWelcome, 300);
}

document.getElementById('btn-close-welcome').addEventListener('click', dismissWelcome);
document.getElementById('btn-welcome-ok').addEventListener('click', dismissWelcome);

/* ===========================================================
   AVISO DE RESULTADO PENDIENTE (6h tras la hora del partido)
=========================================================== */
const RESULT_REMINDER_MS = 6 * 60 * 60 * 1000;

function matchDateTimeMs(m){
  if(m.date && m.hour){
    const dt = new Date(`${m.date}T${m.hour}:00`);
    if(!isNaN(dt.getTime())) return dt.getTime();
  }
  return m.createdAt;
}

function findPendingResultMatch(){
  const user = currentUser();
  if(!user) return null;
  const now = Date.now();
  const pending = getMatches()
    .filter(m => m.status === 'full' && m.createdBy === user.username)
    .filter(m => now - matchDateTimeMs(m) >= RESULT_REMINDER_MS)
    .sort((a, b) => matchDateTimeMs(a) - matchDateTimeMs(b));
  return pending[0] || null;
}

function maybeShowResultReminder(){
  const modal = document.getElementById('reminder-modal');
  const match = findPendingResultMatch();
  if(!match){ modal.classList.add('hidden'); return; }
  const dateLabel = match.date ? formatISODate(match.date) : formatDate(match.createdAt);
  document.getElementById('reminder-match-info').textContent = `Partido del ${dateLabel} a las ${match.hour}`;
  document.getElementById('btn-reminder-go').onclick = () => {
    modal.classList.add('hidden');
    openMatch(match.id);
  };
  modal.classList.remove('hidden');
}

document.getElementById('btn-close-reminder').addEventListener('click', () => {
  document.getElementById('reminder-modal').classList.add('hidden');
});

/* ===========================================================
   PARTIDO SIN COMPLETAR (6h tras la hora del partido)
=========================================================== */
const DELETE_WARNING_MS = 6 * 60 * 60 * 1000;

function findPendingDeleteWarning(){
  const user = currentUser();
  if(!user) return null;
  const now = Date.now();
  const pending = getMatches()
    .filter(m => m.status === 'open' && m.createdBy === user.username && !m.autoDeleteAt)
    .filter(m => now - matchDateTimeMs(m) >= DELETE_WARNING_MS)
    .sort((a, b) => matchDateTimeMs(a) - matchDateTimeMs(b));
  return pending[0] || null;
}

function maybeShowDeleteWarning(){
  const modal = document.getElementById('delete-warning-modal');
  const match = findPendingDeleteWarning();
  if(!match){ modal.classList.add('hidden'); return; }
  const dateLabel = match.date ? formatISODate(match.date) : formatDate(match.createdAt);
  document.getElementById('delete-warning-info').textContent = `Partido del ${dateLabel} a las ${match.hour} · ${match.players.length}/4 apuntados`;

  document.getElementById('btn-delete-warning-yes').onclick = () => {
    modal.classList.add('hidden');
    window.db.collection(COL_MATCHES).doc(match.id).delete()
      .then(() => toast('Partido borrado'))
      .catch(err => toast('Error al borrar: ' + err.message));
    setTimeout(maybeShowDeleteWarning, 400);
  };

  document.getElementById('btn-delete-warning-no').onclick = () => {
    modal.classList.add('hidden');
    updateMatch(match.id, m => { m.autoDeleteAt = Date.now() + DELETE_WARNING_MS; });
    toast('Vale, tienes 6h más para completarlo — si sigue igual, se borrará solo.');
    setTimeout(maybeShowDeleteWarning, 400);
  };

  modal.classList.remove('hidden');
}

function runAutoDeleteCheck(){
  const now = Date.now();
  getMatches()
    .filter(m => m.status === 'open' && m.autoDeleteAt && now >= m.autoDeleteAt)
    .forEach(m => {
      window.db.collection(COL_MATCHES).doc(m.id).delete().catch(() => {});
    });
}

/* ===========================================================
   TIEMPO EN LECIÑENA (Open-Meteo, sin clave)
=========================================================== */
const WEATHER_LAT = 41.799;
const WEATHER_LON = -0.611;
let weatherLoaded = false;

function weatherIconFor(code){
  if(code === 0) return '☀️';
  if(code === 1 || code === 2) return '🌤️';
  if(code === 3) return '☁️';
  if(code === 45 || code === 48) return '🌫️';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if([71,73,75,77,85,86].includes(code)) return '❄️';
  if([95,96,99].includes(code)) return '⛈️';
  return '🌡️';
}

function loadWeather(){
  if(weatherLoaded) return;
  weatherLoaded = true;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FMadrid&forecast_days=2`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if(!data.daily) throw new Error('sin datos');
      fillWeatherDay('weather-today', data.daily, 0);
      fillWeatherDay('weather-tomorrow', data.daily, 1);
      document.getElementById('weather-widget').classList.remove('hidden');
    })
    .catch(() => {
      weatherLoaded = false;
    });
}

function fillWeatherDay(elId, daily, i){
  const el = document.getElementById(elId);
  if(!el) return;
  const max = Math.round(daily.temperature_2m_max[i]);
  const min = Math.round(daily.temperature_2m_min[i]);
  el.querySelector('.weather-icon').textContent = weatherIconFor(daily.weather_code[i]);
  el.querySelector('.weather-temp').textContent = `${max}° / ${min}°`;
}

/* ===========================================================
   DETALLE DE PARTIDO
=========================================================== */
document.getElementById('btn-back-match').addEventListener('click', () => {
  activeMatchId = null;
  resultEditorOpen = false;
  show('view-home');
});

function canDeleteMatch(user, match){
  return !!user && !!match && (isMaster(user) || match.createdBy === user.username);
}

document.getElementById('btn-delete-match').addEventListener('click', () => {
  const match = getMatch(activeMatchId);
  if(!canDeleteMatch(currentUser(), match)) return;
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
  resultEditorOpen = false;
  fillSetsInputs([]);
  document.getElementById('teams-error').textContent = '';
  document.getElementById('sets-error').textContent = '';
  show('view-match');
}

function getMatch(id){ return getMatches().find(m => m.id === id); }

function buildWhatsAppShareUrl(match){
  let dateLabel = '';
  if(match.date){
    const [y, m, d] = match.date.split('-');
    if(y && m && d) dateLabel = ` para el día ${parseInt(d)}/${parseInt(m)}/${y.slice(2)}`;
  }
  const text = `${match.createdBy} ha creado un partido${dateLabel} a las ${match.hour}. ¡Apúntate aquí! ${window.location.origin}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

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

  const dateInput = document.getElementById('match-date');
  if(document.activeElement !== dateInput) dateInput.value = match.date || '';
  dateInput.disabled = !(isCreator && match.status === 'open');

  dateInput.onchange = () => {
    updateMatch(match.id, m => { m.date = dateInput.value; });
    toast('Día actualizado');
  };

  const badge = document.getElementById('match-status-badge');
  badge.textContent = match.status === 'open' ? 'Buscando jugadores' : (match.status === 'full' ? 'Completo' : 'Partido jugado');

  document.getElementById('btn-delete-match').classList.toggle('hidden', !canDeleteMatch(user, match));

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

  const shareBtn = document.getElementById('btn-share-whatsapp');
  if(match.status !== 'done'){
    shareBtn.classList.remove('hidden');
    shareBtn.href = buildWhatsAppShareUrl(match);
  } else {
    shareBtn.classList.add('hidden');
  }

  const resultBox = document.getElementById('result-box');
  const resultSummary = document.getElementById('result-summary');
  const boxTitle = document.getElementById('result-box-title');
  const saveBtn = document.getElementById('btn-save-result');
  const cancelBtn = document.getElementById('btn-cancel-edit-result');

  if(match.status === 'full'){
    resultEditorOpen = false;
    resultBox.classList.remove('hidden');
    resultSummary.classList.add('hidden');
    boxTitle.textContent = 'Registrar resultado';
    saveBtn.textContent = 'Guardar resultado';
    cancelBtn.classList.add('hidden');
    populateTeamPickers(match, match.players);
  } else if(match.status === 'done' && match.result){
    if(isMaster(user) && resultEditorOpen){
      resultBox.classList.remove('hidden');
      resultSummary.classList.add('hidden');
      boxTitle.textContent = 'Corregir resultado';
      saveBtn.textContent = 'Guardar corrección';
      cancelBtn.classList.remove('hidden');
    } else {
      resultBox.classList.add('hidden');
      resultSummary.classList.remove('hidden');
      const r = match.result;
      const teamA = r.teamA || [match.players[0], match.players[1]];
      const teamB = r.teamB || [match.players[2], match.players[3]];
      const winner = r.setsA > r.setsB ? teamA.join(' y ') : teamB.join(' y ');
      const setsLine = (r.sets || []).map(s => `${s.a}-${s.b}`).join(' · ');
      resultSummary.innerHTML = `
        <h3>🏆 Ganan ${winner}</h3>
        <p>Sets: ${r.setsA} - ${r.setsB} · Games: ${r.gamesA} - ${r.gamesB}</p>
        ${setsLine ? `<p class="result-sets-line">${setsLine}</p>` : ''}
        ${isMaster(user) ? `<div class="result-summary-actions"><button class="btn-edit-result" id="btn-edit-result">✎ Corregir resultado</button></div>` : ''}
      `;
      if(isMaster(user)){
        document.getElementById('btn-edit-result').addEventListener('click', () => {
          resultEditorOpen = true;
          populateTeamPickers(match, [...teamA, ...teamB]);
          fillSetsInputs(r.sets || []);
          document.getElementById('sets-error').textContent = '';
          document.getElementById('teams-error').textContent = '';
          renderMatch();
        });
      }
    }
  } else {
    resultEditorOpen = false;
    resultBox.classList.add('hidden');
    resultSummary.classList.add('hidden');
  }
}

document.getElementById('btn-cancel-edit-result').addEventListener('click', () => {
  resultEditorOpen = false;
  renderMatch();
});

function populateTeamPickers(match, defaults){
  const selects = ['pick-team1-p1', 'pick-team1-p2', 'pick-team2-p1', 'pick-team2-p2'].map(id => document.getElementById(id));
  const optionsHtml = match.players.map(p => `<option value="${p}">${p}</option>`).join('');
  const defs = defaults || match.players;
  selects.forEach((sel, i) => {
    sel.innerHTML = optionsHtml;
    const keepValue = sel.value && match.players.includes(sel.value) ? sel.value : defs[i];
    sel.value = keepValue;
  });
}

function fillSetsInputs(sets){
  for(let i = 1; i <= 5; i++){
    const s = sets[i-1];
    document.getElementById(`set-${i}-a`).value = s ? s.a : '';
    document.getElementById(`set-${i}-b`).value = s ? s.b : '';
  }
}

function computeSetsResult(){
  const sets = [];
  for(let i = 1; i <= 5; i++){
    const aStr = document.getElementById(`set-${i}-a`).value.trim();
    const bStr = document.getElementById(`set-${i}-b`).value.trim();
    if(aStr === '' && bStr === '') continue;
    if(aStr === '' || bStr === ''){
      return { error: `Completa los dos resultados del Set ${i} (o déjalo vacío si no se jugó).` };
    }
    const a = parseInt(aStr), b = parseInt(bStr);
    if(a === b){
      return { error: `El Set ${i} no puede terminar en empate.` };
    }
    sets.push({ a, b });
  }
  if(sets.length === 0){
    return { error: 'Introduce el resultado de al menos un set.' };
  }
  let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
  sets.forEach(s => {
    gamesA += s.a; gamesB += s.b;
    if(s.a > s.b) setsA++; else setsB++;
  });
  if(setsA === setsB){
    return { error: 'El resultado no puede terminar en empate a sets.' };
  }
  return { sets, setsA, setsB, gamesA, gamesB };
}

function applyResultStats(teamA, teamB, setsA, setsB, gamesA, gamesB, sign){
  const winners = setsA > setsB ? teamA : teamB;
  [...teamA, ...teamB].forEach((username, i) => {
    const u = findUser(username);
    if(!u) return;
    const onTeamA = i < 2;
    const updated = {
      ...u,
      matchesPlayed: u.matchesPlayed + sign,
      setsWon: u.setsWon + sign * (onTeamA ? setsA : setsB),
      gamesWon: u.gamesWon + sign * (onTeamA ? gamesA : gamesB),
      matchesWon: u.matchesWon + (winners.includes(username) ? sign : 0),
    };
    saveUser(updated).catch(err => toast('Error al actualizar ' + username + ': ' + err.message));
  });
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
  const teamsErrorEl = document.getElementById('teams-error');
  const setsErrorEl = document.getElementById('sets-error');

  const t1p1 = document.getElementById('pick-team1-p1').value;
  const t1p2 = document.getElementById('pick-team1-p2').value;
  const t2p1 = document.getElementById('pick-team2-p1').value;
  const t2p2 = document.getElementById('pick-team2-p2').value;
  const chosen = [t1p1, t1p2, t2p1, t2p2];

  const validSet = new Set(match.players);
  const chosenSet = new Set(chosen);
  if(chosenSet.size !== 4 || ![...chosenSet].every(p => validSet.has(p))){
    teamsErrorEl.textContent = 'Revisa los equipos: cada jugador debe aparecer una sola vez.';
    return;
  }
  teamsErrorEl.textContent = '';

  const computed = computeSetsResult();
  if(computed.error){
    setsErrorEl.textContent = computed.error;
    return;
  }
  setsErrorEl.textContent = '';

  const teamA = [t1p1, t1p2];
  const teamB = [t2p1, t2p2];
  const { sets, setsA, setsB, gamesA, gamesB } = computed;
  const isEdit = resultEditorOpen && match.status === 'done';

  if(isEdit){
    const old = match.result;
    const oldTeamA = old.teamA || [match.players[0], match.players[1]];
    const oldTeamB = old.teamB || [match.players[2], match.players[3]];
    applyResultStats(oldTeamA, oldTeamB, old.setsA, old.setsB, old.gamesA, old.gamesB, -1);
  }

  const result = { setsA, setsB, gamesA, gamesB, teamA, teamB, sets };
  updateMatch(match.id, m => { m.status = 'done'; m.result = result; });
  applyResultStats(teamA, teamB, setsA, setsB, gamesA, gamesB, 1);

  resultEditorOpen = false;
  toast(isEdit ? 'Resultado corregido. ¡Ranking actualizado!' : 'Resultado guardado. ¡Ranking actualizado!');
  setTimeout(maybeShowResultReminder, 400);
});

/* ===========================================================
   ARRANQUE
=========================================================== */
startCloudSync();
