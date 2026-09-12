const socket = io(window.location.origin);
const $ = id => document.getElementById(id);

let myId, isAdmin = false, mode = 'LOBBY', players = {};
let isGameRunning = false;
let mathStairsSeed = null;
let mathStairsStarted = false; 

let updownBuffer = ""; let updownLock = true;
let fiftyTarget = 1; let fiftyPenalty = false; 
let fiftyHintTimer = null; 
let fiftyTimerInterval = null; 
let fiftyStartTimeClient = 0;  

let bondBuffer = ""; let isBondFinished = false;

let wolfLock = true; let wolfPositions = []; 
let missingLock = true; let memoryLock = true; let memoryTargetSequence = []; let memoryUserIndex = 0;
let sudokuBoard = []; let sudokuPuzzle = []; let sudokuConfig = null; let sudokuSelected = null; let sudokuFinished = false;

let studentDoneMap = {}; 
let isStudentRankVisible = true; 
const HEART_EMOJIS = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '🩷', '🩵', '🩶'];

const gameTitleMap = {
    'LOBBY': '🏫 대기실', 'UPDOWN_READY': '↕️ 업다운 게임', 'UPDOWN': '↕️ 업다운 게임',
    'FIFTY_READY': '🔢 1 to 50', 'FIFTY': '🔢 1 to 50', 'BOND_READY': '🍒 가르기 모으기', 'BOND': '🍒 가르기 모으기',
    'WOLF_READY': '🐺 늑대를 찾아라', 'WOLF': '🐺 늑대를 찾아라', 'MISSING_READY': '🕵️ 깜빡 퀴즈', 'MISSING': '🕵️ 깜빡 퀴즈',
    'MEMORY_READY': '🧠 기억력 게임', 'MEMORY': '🧠 기억력 게임',
    'MATHSTAIRS_READY': '🪜 수학의 계단', 'MATHSTAIRS': '🪜 수학의 계단',
    'SUDOKU_READY': '🧩 스도쿠', 'SUDOKU': '🧩 스도쿠'
};

window.onload = () => {
    const savedToken = localStorage.getItem('mathGameToken');
    if (savedToken) {
        const el = $('login-screen');
        if(el) el.style.display = 'none';
    }
};

socket.on('connect', () => {
    const savedToken = localStorage.getItem('mathGameToken');
    if (savedToken) {
        socket.emit('joinGame', { token: savedToken });
    }
});

socket.on('requireLogin', () => {
    localStorage.removeItem('mathGameToken');
    safeDisplay('login-screen', 'flex');
});

socket.on('tokenAssigned', (token) => {
    localStorage.setItem('mathGameToken', token);
});

function logout() {
    if(confirm("이름을 변경하고 다시 입장하시겠습니까? (현재 점수는 초기화됩니다)")) {
        socket.emit('explicitLogout'); 
        localStorage.removeItem('mathGameToken');
        setTimeout(() => { location.reload(); }, 100); 
    }
}

function safeDisplay(id, state) { const el = $(id); if (el) el.style.setProperty('display', state, 'important'); }
function safeText(id, text) { const el = $(id); if (el) el.innerText = text; }
function toggleRankUI() {
    const rankBox = $('live-rank'); const btn = $('rank-toggle-btn');
    if (rankBox.classList.contains('collapsed')) { rankBox.classList.remove('collapsed'); btn.innerText = '접기'; } 
    else { rankBox.classList.add('collapsed'); btn.innerText = '펴기'; }
}

function clearStatusBoard() {
    if(isAdmin) {
        safeText('stat-o', ''); safeText('stat-x', ''); safeText('stat-yet', '');
        studentDoneMap = {};
        updateUserListAdmin();
    }
}

function openSettings() { $('settings-modal').style.display = 'block'; }
function applyBondSettings() {
    const mode = $('modal-bond-mode').value; const display = $('modal-bond-display').value;
    const checkboxes = document.querySelectorAll('input[name="modal_bond_range"]:checked');
    let ranges = Array.from(checkboxes).map(cb => cb.value); if(ranges.length === 0) ranges = ['9'];
    socket.emit('setBondSettings', { mode, ranges, display });
    $('settings-modal').style.display = 'none'; alert("설정이 적용되었습니다.");
}
function updateFiftySettings() { socket.emit('setFiftySettings', { mode: $('fifty-mode-select').value, targetId: $('fifty-target-select').value }); }
function toggleFiftyTargetSelect() {
    const isBeat = $('fifty-mode-select').value === 'BEAT';
    $('fifty-target-label').style.display = isBeat ? 'block' : 'none';
    $('fifty-target-select').style.display = isBeat ? 'block' : 'none';
}
function updateWolfSettings() { socket.emit('setWolfSettings', { sheepCount: parseInt($('wolf-sheep-cnt').value), wolfCount: parseInt($('wolf-cnt').value), speed: parseInt($('wolf-speed').value), shuffles: parseInt($('wolf-shuffles').value) }); }
function updateMissingSettings() { socket.emit('setMissingSettings', { category: $('missing-cat').value, speed: parseInt($('missing-spd').value), count: parseInt($('missing-cnt').value), optionCount: parseInt($('missing-opt').value) }); }
function updateMemorySettings() { socket.emit('setMemorySettings', { count: parseInt($('memory-cnt').value) }); }
function updateMathStairsSettings() { socket.emit('setMathStairsSettings', { mode: $('math-stairs-mode-select').value }); }
function updateSudokuSettings() { socket.emit('setSudokuSettings', { type: $('sudoku-type-select').value, difficulty: $('sudoku-difficulty-select').value }); }

function confirmReset() { if (confirm("대기실로 돌아가시겠습니까?")) req('LOBBY'); }

function join() {
    const code = $('code-in').value; const nick = $('nick-in').value.trim();
    if (!socket.connected) { alert("서버 연결 중입니다. 새로고침 후 다시 시도해주세요."); return; }
    if (code === 'gmltn') socket.emit('joinGame', { nickname: '선생님', code: code });
    else { if (!nick) { alert("이름을 입력하세요"); return; } socket.emit('joinGame', { nickname: nick, code: code }); }
}

socket.on('joinError', msg => alert(msg));
socket.on('adminWarning', msg => alert(msg));

function updateMemoryReadyDisplay(settings) {
    if (!settings) return;
    let count = settings.memoryCount || 4;
    let emojis = HEART_EMOJIS.slice(0, count);
    safeText('memory-target-display', `외울 순서: ${emojis.join(' ➔ ')}`);
}

socket.on('initData', d => {
    try {
        safeDisplay('login-screen', 'none');
        myId = d.myId; isAdmin = d.isAdmin; mode = d.gameMode || 'LOBBY'; players = d.players || {};
        isGameRunning = ['COUNTDOWN', 'PLAYING', 'RESULT'].includes(d.gameState);
        mathStairsSeed = d.mathStairsSeed ?? mathStairsSeed;
        mathStairsStarted = !!d.mathStairsStarted;
        window._mathStairsProblems = d.mathStairsProblems || window._mathStairsProblems || null;
        window._mathStairsMode = d.settings && d.settings.mathStairsMode === 'NORMAL' ? 'NORMAL' : 'MATH';
        isStudentRankVisible = d.isStudentRankVisible ?? true; 
        
        const lockBtn = $('lock-btn');
        if (lockBtn) { 
            lockBtn.innerText = d.isLocked ? '🔒 입장 제한됨' : '🔓 입장 허용 중'; 
            lockBtn.style.background = d.isLocked ? '#ff7675' : '#636e72'; 
        }

        if (isAdmin) { safeDisplay('admin-panel', 'flex'); updateUserListAdmin(); }
        updateMemoryReadyDisplay(d.settings);
        if ($('sudoku-type-select') && d.settings?.sudokuType) $('sudoku-type-select').value = d.settings.sudokuType;
        if ($('sudoku-difficulty-select') && d.settings?.sudokuDifficulty) $('sudoku-difficulty-select').value = d.settings.sudokuDifficulty;
        if (d.sudokuState) startSudoku(d.sudokuState);
        updateUI();
        notifyMathStairsFrame('role');
        // 수학의 계단은 서버의 mathStairsStart 신호로만 시작한다.
        // initData의 PLAYING 상태를 보고 중복 시작시키지 않는다.
    } catch(e) { console.error(e); }
});

socket.on('settingsUpdated', s => {
    updateMemoryReadyDisplay(s);
    const mathModeSelect = $('math-stairs-mode-select');
    if (mathModeSelect && s && s.mathStairsMode) mathModeSelect.value = s.mathStairsMode;
    const sudokuType = $('sudoku-type-select'); const sudokuDifficulty = $('sudoku-difficulty-select');
    if (sudokuType && s?.sudokuType) sudokuType.value = s.sudokuType;
    if (sudokuDifficulty && s?.sudokuDifficulty) sudokuDifficulty.value = s.sudokuDifficulty;
});

socket.on('rankVisibilityUpdated', isVisible => {
    isStudentRankVisible = isVisible;
    updateUI();
});

function renderLobbyGrid() {
    const grid = $('lobby-grid'); if (!grid) return; grid.innerHTML = ''; 
    Object.values(players).forEach(p => {
        if(p.isBot) return; 
        const card = document.createElement('div'); card.className = 'lobby-card';
        if (p.isAdmin) card.classList.add('admin'); if (p.id === myId) card.classList.add('me');
        card.innerText = (p.isAdmin ? '👑 ' : '') + p.name; grid.appendChild(card);
    });
}

function updateUI() {
    let stuCount = Object.values(players).filter(p => !p.isAdmin).length;
    let onlineCount = Object.values(players).filter(p => !p.isAdmin && p.connected !== false).length;
    safeText('game-title-badge', (gameTitleMap[mode] || "수학 놀이 도구") + ` (${stuCount}명)`);
    
    const adminLabel = $('admin-label-users');
    if (adminLabel) adminLabel.innerHTML = `학생 관리 <span style="color:#f1c40f;font-size:10px;">(접속 ${onlineCount}/${stuCount}명)</span> <span class="toggle-btn">[접기]</span>`;

    ['lobby-view', 'updown-game-area', 'fifty-game-area', 'bond-game-area', 'wolf-game-area', 'missing-game-area', 'memory-game-area', 'math-stairs-game-area', 'sudoku-game-area', 'live-rank', 'status-panel'].forEach(id => safeDisplay(id, 'none'));

    if (mode !== 'LOBBY') {
        if (isAdmin || isStudentRankVisible) safeDisplay('live-rank', 'block');
        else safeDisplay('live-rank', 'none');
    }

    if (isAdmin) {
        const modeBtns = document.querySelectorAll('.mode-select-btn');
        ['admin-start-btn', 'admin-next-btn', 'admin-stop-btn', 'admin-force-end-btn', 'admin-force-round-end-btn', 'setting-row-updown', 'admin-updown-answer-box', 'setting-row-fifty', 'setting-row-bond', 'setting-row-wolf', 'setting-row-missing', 'setting-row-memory', 'setting-row-math-stairs', 'setting-row-sudoku', 'logout-btn'].forEach(id => safeDisplay(id, 'none'));
        if(modeBtns) modeBtns.forEach(b => b.style.display = 'none');

        const visBtn = $('toggle-rank-vis-btn');
        if (visBtn) {
            visBtn.innerText = isStudentRankVisible ? '👁️ 학생 랭킹 보이는 중' : '🙈 학생 랭킹 안 보이는 중';
            visBtn.style.background = isStudentRankVisible ? '#8e44ad' : '#27ae60';
        }

        if (typeof mode === 'string' && (mode.includes('BOND') || mode.includes('WOLF') || mode.includes('MISSING') || mode.includes('MEMORY'))) {
            safeDisplay('status-panel', 'block');
        }

        if (mode === 'LOBBY') { if(modeBtns) modeBtns.forEach(b => b.style.display = 'block'); }
        else if (typeof mode === 'string') {
            safeDisplay('admin-stop-btn', 'block'); safeDisplay('admin-force-end-btn', 'block');
            
            if (isGameRunning && (mode.includes('BOND') || mode.includes('WOLF') || mode.includes('MISSING') || mode.includes('MEMORY'))) {
                safeDisplay('admin-force-round-end-btn', 'block');
            }

            if (mode.includes('UPDOWN')) { safeDisplay('setting-row-updown', 'block'); safeDisplay('admin-updown-answer-box', 'block'); if(!isGameRunning) safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('FIFTY')) { safeDisplay('setting-row-fifty', 'block'); if(!isGameRunning) safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('BOND')) { safeDisplay('setting-row-bond', 'block'); if(isGameRunning) safeDisplay('admin-next-btn', 'block'); else safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('WOLF')) { safeDisplay('setting-row-wolf', 'block'); if(isGameRunning) safeDisplay('admin-next-btn', 'block'); else safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('MISSING')) { safeDisplay('setting-row-missing', 'block'); if(isGameRunning) safeDisplay('admin-next-btn', 'block'); else safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('MEMORY')) { safeDisplay('setting-row-memory', 'block'); if(isGameRunning) safeDisplay('admin-next-btn', 'block'); else safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('MATHSTAIRS')) { safeDisplay('setting-row-math-stairs', 'block'); if(!isGameRunning) safeDisplay('admin-start-btn', 'block'); }
            else if (mode.includes('SUDOKU')) { safeDisplay('setting-row-sudoku', 'block'); if(!isGameRunning) safeDisplay('admin-start-btn', 'block'); }
        }
    }

    if (mode === 'LOBBY') { 
        safeDisplay('lobby-view', 'flex'); 
        renderLobbyGrid(); 
        if (!isAdmin) safeDisplay('logout-btn', 'block'); 
    } 
    else if (typeof mode === 'string') {
        safeDisplay('logout-btn', 'none');
        if (mode.includes('MATHSTAIRS')) notifyMathStairsFrame(); 
        if (mode.includes('UPDOWN')) safeDisplay('updown-game-area', 'flex');
        else if (mode.includes('FIFTY')) { safeDisplay('fifty-game-area', 'flex'); if (mode === 'FIFTY_READY' && $('fifty-grid') && $('fifty-grid').innerHTML === '') $('fifty-grid').innerHTML = Array(16).fill('<div class="fifty-cell placeholder"></div>').join(''); }
        else if (mode.includes('BOND')) safeDisplay('bond-game-area', 'flex');
        else if (mode.includes('WOLF')) safeDisplay('wolf-game-area', 'flex');
        else if (mode.includes('MISSING')) safeDisplay('missing-game-area', 'flex');
        else if (mode.includes('MEMORY')) safeDisplay('memory-game-area', 'flex');
        else if (mode.includes('MATHSTAIRS')) safeDisplay('math-stairs-game-area', 'flex');
        else if (mode.includes('SUDOKU')) safeDisplay('sudoku-game-area', 'flex');
    }
}

socket.on('updateUserList', p => { players = p || {}; if (mode === 'LOBBY') renderLobbyGrid(); if (isAdmin) updateUserListAdmin(); updateUI(); });

function updateUserListAdmin() {
    const list = $('admin-user-list'); const ts = $('fifty-target-select'); let curr = ts ? ts.value : "";
    if (list) list.replaceChildren();
    if (ts) { ts.replaceChildren(); const base = document.createElement('option'); base.value = ''; base.textContent = '-- 타겟 선택 --'; ts.appendChild(base); }
    Object.values(players).forEach(p => {
        if (p.isAdmin) return;
        let statusIcon = "";
        if (typeof mode === 'string' && (mode.includes('BOND') || mode.includes('WOLF') || mode.includes('MISSING') || mode.includes('MEMORY'))) {
            statusIcon = studentDoneMap[p.name] || "⏳"; 
        }
        if (list) {
            const row = document.createElement('div'); row.className = 'kick-row';
            const label = document.createElement('span');
            label.textContent = `${p.connected === false ? '🔴' : '🟢'} ${p.name}${p.connected === false ? ' (연결 끊김)' : ''}${statusIcon ? ` ${statusIcon}` : ''}`;
            const button = document.createElement('button'); button.className = 'x-btn'; button.textContent = '✕';
            button.addEventListener('click', () => kickUser(p.id)); row.append(label, button); list.appendChild(row);
        }
        if (ts && p.connected !== false) { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; ts.appendChild(option); }
    });
    if (ts && curr) ts.value = curr;
}

function req(m) { socket.emit('changeModeRequest', m); }
function kickUser(id) { if (confirm('내보내시겠습니까?')) socket.emit('kickUser', id); }
function toggleLock() { socket.emit('toggleLock'); }

socket.on('lockStatus', l => { 
    const b = $('lock-btn'); 
    if (b) { 
        b.innerText = l ? '🔒 입장 제한됨' : '🔓 입장 허용 중'; 
        b.style.background = l ? '#ff7675' : '#636e72'; 
    } 
});

socket.on('kicked', () => { 
    localStorage.removeItem('mathGameToken');
    alert('선생님에 의해 퇴장되었습니다.'); 
    location.reload(); 
});

socket.on('hardReset', d => {
    mathStairsStarted = false;
    mode = d.mode || 'LOBBY'; players = d.players || {}; isGameRunning = false; studentDoneMap = {};
    mathStairsSeed = null;
    safeText('updown-history', ''); updownBuffer = ""; safeText('updown-display', '0'); safeText('updown-feedback', 'START');
    bondBuffer = ""; isBondFinished = false; safeText('bond-display', ''); safeText('bond-msg', '');
    if($('fifty-grid')) $('fifty-grid').innerHTML = ''; 
    
    if(fiftyHintTimer) clearTimeout(fiftyHintTimer); 
    if(fiftyTimerInterval) clearInterval(fiftyTimerInterval); 
    safeText('fifty-timer-display', '⏱️ 0.00초');

    safeDisplay('modal-layer', 'none'); 
    safeText('wolf-msg', '선생님이 게임을 시작할 때까지 기다리세요!');
    safeDisplay('missing-quiz-view', 'none'); safeDisplay('missing-stage-view', 'flex'); safeText('missing-msg', '대기중...');
    safeText('memory-msg', '대기중...'); safeDisplay('memory-timer-display', 'none'); safeDisplay('memory-replay-btn', 'none');
    sudokuBoard = []; sudokuPuzzle = []; sudokuConfig = null; sudokuSelected = null; sudokuFinished = false;
    if ($('sudoku-grid')) $('sudoku-grid').replaceChildren();
    if ($('sudoku-keypad')) $('sudoku-keypad').replaceChildren();
    safeText('sudoku-feedback', ''); safeText('sudoku-info', '선생님이 게임을 시작할 때까지 기다리세요!');
    const mathModeSelect = $('math-stairs-mode-select');
    if (mathModeSelect && d && d.settings && d.settings.mathStairsMode) mathModeSelect.value = d.settings.mathStairsMode;
    if ($('sudoku-type-select') && d?.settings?.sudokuType) $('sudoku-type-select').value = d.settings.sudokuType;
    if ($('sudoku-difficulty-select') && d?.settings?.sudokuDifficulty) $('sudoku-difficulty-select').value = d.settings.sudokuDifficulty;
    Array.from(document.querySelectorAll('.mem-box')).forEach(b => b.classList.remove('show-heart', 'active', 'incorrect', 'preview-white'));
    updateMemoryReadyDisplay(d.settings);
    updateUI();
    notifyMathStairsFrame('reset');
});

socket.on('startCountdown', d => {
    isGameRunning = true; studentDoneMap = {}; clearStatusBoard(); updateUI();
    const modal = $('countdown-modal'); if(!modal) return; modal.style.display = 'flex'; let count = d.seconds; modal.innerText = count;
    const interval = setInterval(() => {
        count--; if (count > 0) modal.innerText = count; 
        else { modal.innerText = "시작!"; setTimeout(() => { modal.style.display = 'none'; clearInterval(interval); }, 500); }
    }, 1000);
});

function toggleAdmin(id, btn) {
    const el = $(id); const span = btn.querySelector('.toggle-btn');
    if (el.style.display === 'none') { el.style.display = 'block'; span.innerText = '[접기]'; } 
    else { el.style.display = 'none'; span.innerText = '[펼치기]'; }
}

socket.on('finalVictory', d => showResult(d.title, "명예의 전당: " + d.winners.join(', '), d.customMsg));
socket.on('gameTerminated', d => showResult(d.title, d.message));

function showResult(title, content, sub) {
    isGameRunning = false; updateUI(); 
    
    // [핵심 수정] 선생님이 '즉시 게임 종료'를 누르면 클라이언트의 모든 타이머를 완전히 멈춤
    if(fiftyHintTimer) clearTimeout(fiftyHintTimer);
    if(fiftyTimerInterval) clearInterval(fiftyTimerInterval);

    let html = `<h2>${title}</h2><div style="font-size:16px; margin:10px 0;">${content}</div>`;
    if(sub) html += `<div style="font-size:14px; color:#666; text-align:left;">${sub}</div>`;
    html += `<button class="close-result-btn" onclick="$('modal-layer').style.display='none'">닫기</button>`;
    $('modal-layer').innerHTML = html; $('modal-layer').style.display = 'block';
}

function showQRCode() { 
    const c = $('qr-code-display'); 
    if(c) { 
        c.innerHTML = ''; 
        new QRCode(c, { text: window.location.href, width: 200, height: 200 }); 
        $('qr-modal').style.display = 'block'; 
        c.classList.remove('qr-fullscreen');
    } 
}
function toggleQRFullscreen() {
    const c = $('qr-code-display');
    if(c) c.classList.toggle('qr-fullscreen');
}
function closeQR() {
    $('qr-modal').style.display = 'none';
    const c = $('qr-code-display');
    if(c) c.classList.remove('qr-fullscreen');
}


function notifyMathStairsFrame(action) {
    const frame = $('math-stairs-frame');
    if (!frame || !frame.contentWindow) return;

    if (action === 'role') {
        frame.contentWindow.postMessage({
            source:'math-stairs',
            type:'role',
            isAdmin,
            gameState: mathStairsStarted ? 'PLAYING' : 'WAITING',
            mapSeed: mathStairsSeed,
            mathProblems: window._mathStairsProblems || null,
            mathMode: window._mathStairsMode || 'MATH',
            remotePlayers: window._mathStairsPlayers || [],
            selfId: myId
        }, window.location.origin);
        return;
    }

    frame.contentWindow.postMessage({
        source:'math-stairs',
        type: action,
        mapSeed: mathStairsSeed,
        mathProblems: window._mathStairsProblems || null,
        mathMode: window._mathStairsMode || 'MATH'
    }, window.location.origin);
}

window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const d = event.data || {};
    if (d.source !== 'math-stairs') return;
    if (d.type === 'ready') {
        notifyMathStairsFrame('role');
    } else if (d.type === 'progress') {
        if (!isAdmin && mode.includes('MATHSTAIRS')) socket.emit('mathStairsProgress', { floor:d.floor, score:d.score, state:d.state, x:d.x, y:d.y, facing:d.facing, character:d.character, colorIndex:d.colorIndex });
    } else if (d.type === 'gameOver') {
        if (!isAdmin && mode.includes('MATHSTAIRS')) socket.emit('mathStairsGameOver', { floor:d.floor, score:d.score });
    }
 else if (d.type === 'profile') {
        if (!isAdmin && mode.includes('MATHSTAIRS')) socket.emit('mathStairsProfile', { character:d.character, colorIndex:d.colorIndex });
    }
});

socket.on('mathStairsStart', d => {
    mathStairsSeed = d && d.mapSeed != null ? Number(d.mapSeed) >>> 0 : mathStairsSeed;
    mathStairsStarted = true;
    window._mathStairsProblems = d && d.mathProblems ? d.mathProblems : null;
    window._mathStairsMode = d && d.mathMode === 'NORMAL' ? 'NORMAL' : 'MATH';
    if (mode.includes('MATHSTAIRS') && !isAdmin) notifyMathStairsFrame('start');
});

socket.on('mathStairsPlayersUpdate', list => {
    window._mathStairsPlayers = Array.isArray(list) ? list : [];
    const frame = $('math-stairs-frame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
        source:'math-stairs',
        type:'players',
        players: window._mathStairsPlayers
    }, window.location.origin);
});

socket.on('liveRankUpdate', payload => {
    const c = $('rank-content'); if (!c) return;
    c.replaceChildren();
    const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) { const empty = document.createElement('div'); empty.className = 'rank-empty'; empty.textContent = '대기 중...'; c.appendChild(empty); return; }
    const rankCounts = rows.reduce((map, item) => map.set(item.rank, (map.get(item.rank) || 0) + 1), new Map());
    rows.forEach(item => {
        const row = document.createElement('div'); row.className = 'rank-row';
        const rank = document.createElement('span'); rank.className = 'rank-position'; rank.textContent = `${rankCounts.get(item.rank) > 1 ? '공동 ' : ''}${item.rank}위`;
        const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = String(item.name || '');
        if (item.status) { const status = document.createElement('small'); status.className = 'rank-status'; status.textContent = ` ${item.status}`; name.appendChild(status); }
        const value = document.createElement('span'); value.className = `rank-value ${item.tone === 'success' ? 'success' : 'progress'}`; value.textContent = String(item.value || '');
        row.append(rank, name, value); c.appendChild(row);
    });
});

socket.on('statusBoardUpdate', list => {
    if (!isAdmin) return;
    safeText('stat-o', list.correct.join(', ')); 
    safeText('stat-x', list.wrong.join(', ')); 
    safeText('stat-yet', list.yet.join(', '));
    
    studentDoneMap = {};
    const extractName = (str) => str.split('(')[0].trim();
    list.correct.forEach(n => studentDoneMap[extractName(n)] = "✅");
    list.wrong.forEach(n => studentDoneMap[extractName(n)] = "✅");
    list.yet.forEach(n => studentDoneMap[extractName(n)] = "⏳");
    updateUserListAdmin();

    if (list.message) {
        if (mode.includes('BOND')) safeText('bond-msg', list.message);
        if (mode.includes('WOLF')) safeText('wolf-msg', list.message);
        if (mode.includes('MISSING')) safeText('missing-msg', list.message);
        if (mode.includes('MEMORY')) safeText('memory-msg', list.message);
    }
});

socket.on('wolfRoundComplete', () => { if(isAdmin) safeText('wolf-msg', '✨ 전원 선택 완료! [다음 라운드]를 눌러주세요.'); });
socket.on('missingRoundComplete', (d) => { 
    if(isAdmin) safeText('missing-quiz-msg', `✨ 전원 선택 완료! 정답: ${d.target} [다음 라운드]를 눌러주세요.`); 
    else safeText('missing-quiz-msg', `✨ 라운드 종료! 정답은 [ ${d.target} ] 입니다!`);
    const opts = document.querySelectorAll('.option-btn');
    opts.forEach(btn => {
        const emojiDiv = btn.querySelector('.option-emoji');
        if (emojiDiv && emojiDiv.innerText === d.target) {
            btn.style.backgroundColor = "#d4edda"; btn.style.borderColor = "#28a745"; btn.style.transform = "scale(1.1)"; btn.style.zIndex = "10";
        } else btn.style.opacity = "0.4";
    });
});
socket.on('memoryRoundComplete', () => { if(isAdmin) safeText('memory-msg', '✨ 라운드 종료! [다음 라운드]를 눌러주세요.'); });

// --- [업다운 게임] ---
socket.on('updownStart', d => { safeText('updown-display', '?'); safeText('updown-feedback', 'START'); if($('updown-history')) $('updown-history').innerHTML = ''; updownBuffer = ""; updownLock = false; });
socket.on('updownResult', d => { const fb = $('updown-feedback'); const hist = $('updown-history'); let arr="", cls=""; if(d.result==='UP'){arr="🔺 업";cls="ud-up";}else if(d.result==='DOWN'){arr="🔻 다운";cls="ud-down";}else{arr="🎉 정답";cls="ud-correct";updownLock=true;} if(fb)fb.innerHTML=`<span class="${cls}">${arr}</span>`; if(hist){hist.innerHTML=`<div class="ud-hist-item"><span>${d.guess}</span><span class="${cls}">${arr}</span></div>`+hist.innerHTML;} updownBuffer=""; safeText('updown-display','0'); });
socket.on('updownAnswer', ans => safeText('admin-updown-answer-text', ans));
function toggleAdminAnswer() { const el = $('admin-updown-answer-text'); el.style.display = (el.style.display === 'none') ? 'block' : 'none'; }
function udIn(num) { if (updownLock || isAdmin || updownBuffer.length >= 5) return; updownBuffer += num; safeText('updown-display', parseInt(updownBuffer)); }
function udDel() { if (updownLock || isAdmin) return; updownBuffer = updownBuffer.slice(0, -1); safeText('updown-display', updownBuffer || "0"); }
function udSubmit() { if (updownLock || isAdmin || !updownBuffer) return; socket.emit('updownSubmit', updownBuffer); }


// --- [1to50 & 힌트 기능 & 타이머 기능] ---
function startFiftyHintTimer() {
    if (fiftyHintTimer) clearTimeout(fiftyHintTimer);
    
    fiftyHintTimer = setTimeout(() => {
        const cells = document.querySelectorAll('.fifty-cell');
        cells.forEach(c => {
            if (parseInt(c.innerText) === fiftyTarget && !c.classList.contains('empty')) {
                c.classList.add('hint-blink');
            }
        });
    }, 3000); 
}

socket.on('fiftyStart', d => {
    if(fiftyHintTimer) clearTimeout(fiftyHintTimer);
    
    fiftyStartTimeClient = Date.now();
    if(fiftyTimerInterval) clearInterval(fiftyTimerInterval);
    safeText('fifty-timer-display', '⏱️ 0.00초');
    fiftyTimerInterval = setInterval(() => {
        let elapsed = ((Date.now() - fiftyStartTimeClient) / 1000).toFixed(2);
        safeText('fifty-timer-display', `⏱️ ${elapsed}초`);
    }, 50);

    fiftyTarget = 1; safeText('fifty-target', '1'); const grid = $('fifty-grid'); if(!grid) return; grid.innerHTML = ''; const col = `hsl(${Math.floor(Math.random()*360)}, 60%, 50%)`;
    d.seed.forEach(num => {
        const c = document.createElement('div'); c.className = 'fifty-cell'; c.innerText = num; c.style.background = col;
        const handleFifty = (e) => { 
            e.preventDefault(); 
            
            // [핵심 수정] isGameRunning이 false면(즉시 종료 버튼이 눌렸다면) 클릭 100% 무시
            if(!isGameRunning || isAdmin || fiftyPenalty) return; 
            
            const currentNum = parseInt(c.innerText); if(isNaN(currentNum)) return;
            
            if(currentNum === fiftyTarget) { 
                if(fiftyHintTimer) clearTimeout(fiftyHintTimer);
                document.querySelectorAll('.fifty-cell').forEach(cell => cell.classList.remove('hint-blink'));
                
                socket.emit('fiftyClick', currentNum); const nextNum = currentNum + 16; fiftyTarget++; safeText('fifty-target', fiftyTarget <= 50 ? fiftyTarget : "완주!");
                if(nextNum <= 50) c.innerText = nextNum; else { c.innerText = ""; c.className = 'fifty-cell empty'; }
                
                if (fiftyTarget <= 50) startFiftyHintTimer();

            } else { 
                if(!fiftyPenalty) { fiftyPenalty = true; grid.classList.add('blind'); setTimeout(() => { grid.classList.remove('blind'); fiftyPenalty = false; }, 500); } 
            }
        };
        c.onmousedown = handleFifty; c.ontouchstart = handleFifty; grid.appendChild(c);
    });
    
    startFiftyHintTimer();
});
socket.on('fiftyFinish', t => {
    safeText('fifty-target', `기록: ${t}초`);
    if(fiftyHintTimer) clearTimeout(fiftyHintTimer);
    if(fiftyTimerInterval) clearInterval(fiftyTimerInterval); 
    safeText('fifty-timer-display', `⏱️ ${t}초 (완료)`); 
});

// --- [가르기 모으기] ---
socket.on('bondNext', prob => {
    bondBuffer = ""; isBondFinished = false; safeText('bond-display', ''); safeText('bond-msg', '');
    clearStatusBoard();
    const t = { top: $('bond-top'), left: $('bond-left'), right: $('bond-right') };
    Object.values(t).forEach(e => { if(e) {e.innerHTML = ''; e.classList.remove('question');} });
    const ren = (v, e) => { if(!e) return; if(prob.displayType==='DOT'){let html='<div class="dots-container">';for(let i=0;i<v;i++)html+='<div class="dot"></div>';html+='</div>';e.innerHTML=html;}else e.innerText=v; };
    if(prob.targetPos==='top') { t.top.innerText='?'; t.top.classList.add('question'); ren(prob.part1, t.left); ren(prob.part2, t.right); }
    else if(prob.targetPos==='left') { ren(prob.whole, t.top); t.left.innerText='?'; t.left.classList.add('question'); ren(prob.part2, t.right); }
    else { ren(prob.whole, t.top); ren(prob.part1, t.left); t.right.innerText='?'; t.right.classList.add('question'); }
});
function bondIn(num) { if(isBondFinished || bondBuffer.length>=2) return; bondBuffer+=num; safeText('bond-display', bondBuffer); }
function bondDel() { if(isBondFinished) return; bondBuffer = bondBuffer.slice(0, -1); safeText('bond-display', bondBuffer); }
function bondSubmit() { if(isBondFinished||!bondBuffer) return; socket.emit('bondSubmit', bondBuffer); bondBuffer=""; safeText('bond-display', ""); }
socket.on('bondCorrect', () => { safeText('bond-msg', '⭕ 정답!'); isBondFinished = true; });
socket.on('bondWrong', () => { safeText('bond-msg', '❌ 오답! 다음 문제를 기다리세요.'); isBondFinished = true; });

// --- [늑대를 찾아라] ---
let wolfAnimals = [];
let wolfGrid = { cols: 3, rows: 1 };
const getWolfPositions = (count, cols, rows) => {
    const stg = $('wolf-stage'); if(!stg) return [];
    const w = stg.offsetWidth; const h = stg.offsetHeight;
    const cellW = w / cols; const cellH = h / rows;
    const minCell = Math.max(32, Math.min(cellW, cellH));
    const size = Math.max(28, Math.min(82, minCell * 0.62));
    const arr = [];
    for(let i=0; i<count; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        arr.push({ x: col * cellW + (cellW-size)/2, y: row * cellH + (cellH-size)/2, size });
    }
    return arr;
};

socket.on('wolfStartRound', d => {
    clearStatusBoard(); wolfLock = true;
    const count = d.animalCount || 3;
    wolfGrid = { cols: d.gridCols || Math.ceil(Math.sqrt(count)), rows: d.gridRows || Math.ceil(count / (d.gridCols || Math.ceil(Math.sqrt(count)))) };
    const stg = $('wolf-stage'); if(stg) stg.innerHTML = '';
    wolfAnimals = [];
    wolfPositions = getWolfPositions(count, wolfGrid.cols, wolfGrid.rows);
    const targets = new Set(Array.isArray(d.targets) ? d.targets : [d.target]);

    for(let i=0; i<count; i++) {
        const el = document.createElement('div'); el.className = 'animal'; el.id = 'animal'+i;
        el.innerText = targets.has(i) ? '🐺' : '🐑'; el.onclick = () => wolfClick(i);
        el.style.left = wolfPositions[i].x + 'px'; el.style.top = wolfPositions[i].y + 'px';
        el.style.width = wolfPositions[i].size + 'px'; el.style.height = wolfPositions[i].size + 'px';
        el.style.fontSize = Math.max(24, wolfPositions[i].size * 0.74) + 'px';
        if(stg) stg.appendChild(el);
        wolfAnimals.push({ el, type: targets.has(i) ? 'wolf' : 'sheep', pos: i, originalIdx: i });
    }

    safeText('wolf-msg', `[ROUND ${d.round}] 늑대 ${d.wolfCount}마리를 기억하세요!`);

    setTimeout(() => {
        wolfAnimals.forEach(a => { if(a.el) a.el.innerText = '🐑'; });
        safeText('wolf-msg', '늑대가 양으로 변했습니다! 곧 섞입니다.');

        setTimeout(() => {
            safeText('wolf-msg', '모두 동시에 이동합니다...');
            const speedMs = Math.max(180, 1050 - ((d.speed || 5) * 75));
            let shuffleCount = 0;

            function doShuffle() {
                if (shuffleCount >= (d.shuffles || 15)) {
                    safeText('wolf-msg', '늑대는 어디 있을까요? 클릭하세요!');
                    wolfLock = false; return;
                }
                const mapping = Array.isArray(d.shuffleSteps?.[shuffleCount]) ? d.shuffleSteps[shuffleCount] : null;
                if (!mapping) { wolfLock = false; return; }

                // 모든 동물이 같은 순간에 하나씩 목표 칸으로 이동한다.
                const nextPosByAnimal = wolfAnimals.map(a => mapping[a.pos] ?? a.pos);
                wolfAnimals.forEach((a, idx) => {
                    if(!a.el) return;
                    const end = wolfPositions[nextPosByAnimal[idx]];
                    a.el.style.transition = `left ${speedMs*0.88}ms cubic-bezier(.2,.8,.2,1), top ${speedMs*0.88}ms cubic-bezier(.2,.8,.2,1), transform ${speedMs*0.44}ms ease-in-out`;
                    a.el.style.transform = 'scale(1.08)';
                    a.el.style.left = end.x + 'px'; a.el.style.top = end.y + 'px';
                });
                setTimeout(() => {
                    wolfAnimals.forEach((a, idx) => { a.pos = nextPosByAnimal[idx]; if(a.el) a.el.style.transform='scale(1)'; });
                    shuffleCount++; doShuffle();
                }, speedMs*0.9);
            }
            doShuffle();
        }, 850);
    }, 1200);
});

function wolfClick(idx) {
    if(wolfLock || isAdmin) return;
    const animal = wolfAnimals[idx];
    if(!animal || !Number.isInteger(animal.pos)) return;
    wolfLock = true;
    // 섞인 뒤에는 처음 생성된 인덱스가 아니라 현재 화면상의 위치를 서버에 보내야 한다.
    socket.emit('wolfSubmit', animal.pos);
}
socket.on('wolfResult', d => {
    const complete = !!d.complete;
    if(complete) {
        wolfAnimals.forEach(a => { if(a.el) { a.el.innerText = (a.type === 'wolf') ? '🐺' : '🐑'; } });
        if(d.correct && d.foundCount >= d.wolfCount) safeText('wolf-msg', `⭕ 정답입니다! 늑대 ${d.wolfCount}마리를 모두 찾았어요!`);
        else if(d.correct) safeText('wolf-msg', '❌ 앗! 양을 골랐어요!');
        else safeText('wolf-msg', '❌ 앗! 양이네요! 늑대는 여기 있었습니다!');
        wolfLock = true;
    } else if(d.correct) {
        safeText('wolf-msg', `⭕ 늑대 발견! ${d.foundCount}/${d.wolfCount}마리`);
        wolfLock = false;
    } else {
        safeText('wolf-msg', '❌ 앗! 양이네요! 늑대는 여기 있었습니다!');
        wolfLock = true;
    }
});

// --- [깜빡 퀴즈] ---
socket.on('missingStartRound', d => {
    missingLock = true;
    clearStatusBoard();
    safeDisplay('missing-quiz-view', 'none'); safeDisplay('missing-stage-view', 'flex');
    safeText('missing-msg', `[ROUND ${d.round}] 화면을 잘 보세요!`);
    const dsp = $('missing-emoji-display'); if(dsp) dsp.innerText = '';
    
    let idx = 0;
    const timer = setInterval(() => {
        if(idx >= d.shownEmojis.length) {
            clearInterval(timer); if(dsp) dsp.innerText = "";
            setTimeout(() => {
                safeDisplay('missing-stage-view', 'none'); safeDisplay('missing-quiz-view', 'flex');
                safeText('missing-quiz-msg', '아까 나오지 않은 것은 몇 번일까요?');
                if($('missing-options')) {
                    $('missing-options').innerHTML = '';
                    d.options.forEach((opt, i) => {
                        const btn = document.createElement('div'); btn.className = 'option-btn';
                        btn.innerHTML = `<div class="option-number">${i+1}</div><div class="option-emoji">${opt}</div>`;
                        btn.onclick = () => { if(!missingLock && !isAdmin) { missingLock=true; socket.emit('missingSubmit', opt); } };
                        $('missing-options').appendChild(btn);
                    });
                }
                missingLock = false;
            }, 500);
            return;
        }
        if(dsp) {
            dsp.innerText = d.shownEmojis[idx];
            dsp.classList.remove('pop-effect'); void dsp.offsetWidth; dsp.classList.add('pop-effect');
        }
        idx++;
    }, d.speed);
});
socket.on('missingResult', d => { if(d.correct) safeText('missing-quiz-msg', '⭕ 정답입니다! 훌륭해요!'); else safeText('missing-quiz-msg', '❌ 앗! 오답입니다!'); });

// --- [기억력 게임] ---
socket.on('memoryStartRound', d => {
    memoryLock = true;
    clearStatusBoard();
    memoryTargetSequence = d.positions; memoryUserIndex = 0;

    safeDisplay('memory-timer-display', 'block');
    safeText('memory-timer-display', '⏳ 남은 시간: 30초');
    safeText('memory-msg', '3초간 하트 위치를 외우세요!');
    
    if(!isAdmin) safeDisplay('memory-replay-btn', 'none');

    const boxes = Array.from(document.querySelectorAll('.mem-box'));
    boxes.forEach(b => { b.classList.remove('show-heart', 'active', 'incorrect', 'preview-white'); if(b.querySelector('.mem-heart')) b.querySelector('.mem-heart').innerText=''; });
    
    d.positions.forEach((pos, i) => { if(boxes[pos] && boxes[pos].querySelector('.mem-heart')) boxes[pos].querySelector('.mem-heart').innerText = d.emojis[i]; });
    boxes.forEach(b => { b.classList.add('preview-white'); if(b.querySelector('.mem-heart') && b.querySelector('.mem-heart').innerText !== '') b.classList.add('show-heart'); });

    setTimeout(() => {
        boxes.forEach(b => b.classList.remove('show-heart', 'preview-white'));
        safeText('memory-msg', '순서대로 박스를 클릭하세요!');
        if(!isAdmin) safeDisplay('memory-replay-btn', 'block');
        memoryLock = false;
    }, 3000);
});

socket.on('memoryTimeUpdate', time => { safeText('memory-timer-display', `⏳ 남은 시간: ${time}초`); });
socket.on('memoryFeedback', d => { safeText('memory-msg', d.msg); if(d.type === 'finish') { memoryLock = true; safeDisplay('memory-replay-btn', 'none'); } });

if($('memory-replay-btn')) {
    $('memory-replay-btn').onclick = () => {
        if(memoryLock || isAdmin) return;
        memoryLock = true; $('memory-replay-btn').disabled = true;
        socket.emit('memorySubmit', 'REPLAY');

        const boxes = Array.from(document.querySelectorAll('.mem-box'));
        boxes.forEach(b => { b.classList.add('preview-white'); if(b.querySelector('.mem-heart') && b.querySelector('.mem-heart').innerText !== '') b.classList.add('show-heart'); });
        
        setTimeout(() => {
            boxes.forEach(b => b.classList.remove('show-heart', 'preview-white'));
            memoryLock = false; $('memory-replay-btn').disabled = false;
            safeText('memory-msg', '이어서 클릭하세요!');
        }, 3000);
    };
}

function memoryClick(idx) {
    if(memoryLock || isAdmin) return;
    const box = document.querySelector(`.mem-box[data-index="${idx}"]`);
    if(!box || box.classList.contains('active')) return;

    if(idx === memoryTargetSequence[memoryUserIndex]) {
        box.classList.add('active', 'show-heart');
        memoryUserIndex++;
        socket.emit('memorySubmit', { type: 'SELECT', index: idx }); 
        if(memoryUserIndex === memoryTargetSequence.length) { memoryLock = true; }
    } else {
        memoryLock = true; box.classList.add('incorrect'); socket.emit('memorySubmit', { type: 'SELECT', index: idx });
        setTimeout(() => { 
            box.classList.remove('incorrect'); memoryUserIndex = 0;
            const boxes = Array.from(document.querySelectorAll('.mem-box'));
            boxes.forEach(b => b.classList.remove('active', 'show-heart'));
            memoryLock = false;
        }, 1000);
    }
}

const sudokuDifficultyNames = { EASY: '초급', MEDIUM: '중급', HARD: '고급' };

function startSudoku(data) {
    if (!data || !Array.isArray(data.puzzle) || !data.config) return;
    sudokuPuzzle = data.puzzle.map(row => row.slice());
    sudokuBoard = Array.isArray(data.board) && data.board.length === data.config.size ? data.board.map(row => row.slice()) : data.puzzle.map(row => row.slice());
    sudokuConfig = data.config;
    sudokuSelected = null; sudokuFinished = false;
    const grid = $('sudoku-grid'); const keypad = $('sudoku-keypad');
    if (!grid || !keypad) return;
    grid.replaceChildren(); keypad.replaceChildren();
    grid.style.setProperty('--sudoku-size', sudokuConfig.size);
    grid.style.setProperty('--sudoku-box-cols', sudokuConfig.boxCols);
    keypad.style.setProperty('--sudoku-size', sudokuConfig.size);
    grid.className = `sudoku-size-${sudokuConfig.size}`;
    for (let r = 0; r < sudokuConfig.size; r++) for (let c = 0; c < sudokuConfig.size; c++) {
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'sudoku-cell'; cell.dataset.row = r; cell.dataset.col = c;
        if (sudokuPuzzle[r][c]) { cell.classList.add('fixed'); cell.textContent = sudokuPuzzle[r][c]; }
        else { cell.addEventListener('click', () => sudokuSelect(r, c)); }
        if ((c + 1) % sudokuConfig.boxCols === 0 && c + 1 < sudokuConfig.size) cell.classList.add('box-right');
        if ((r + 1) % sudokuConfig.boxRows === 0 && r + 1 < sudokuConfig.size) cell.classList.add('box-bottom');
        grid.appendChild(cell);
    }
    for (let n = 1; n <= sudokuConfig.size; n++) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'sudoku-number-btn'; button.textContent = n;
        button.addEventListener('click', () => sudokuSetValue(n)); keypad.appendChild(button);
    }
    const typeName = `${sudokuConfig.boxCols}×${sudokuConfig.boxRows} 블록 · ${sudokuConfig.size}×${sudokuConfig.size}`;
    safeText('sudoku-info', `${typeName} · ${sudokuDifficultyNames[sudokuConfig.difficulty] || '초급'}`);
    safeText('sudoku-feedback', isAdmin ? '학생들과 같은 문제를 보고 있습니다.' : '빈칸을 선택하고 숫자를 눌러보세요.');
    safeDisplay('sudoku-keypad', isAdmin ? 'none' : 'grid');
    safeDisplay('sudoku-erase-btn', isAdmin ? 'none' : 'inline-block');
    safeDisplay('sudoku-submit-btn', isAdmin ? 'none' : 'inline-block');
    renderSudoku();
}

function sudokuSelect(row, col) {
    if (isAdmin || sudokuFinished || sudokuPuzzle[row]?.[col]) return;
    sudokuSelected = { row, col }; renderSudoku();
}

function sudokuSetValue(value) {
    if (isAdmin || sudokuFinished || !sudokuSelected || !sudokuConfig) return;
    const { row, col } = sudokuSelected;
    if (sudokuPuzzle[row][col]) return;
    sudokuBoard[row][col] = Number(value) || 0;
    renderSudoku();
    socket.emit('sudokuProgress', sudokuBoard);
}

function sudokuConflicts(row, col, value) {
    if (!value || !sudokuConfig) return false;
    for (let i = 0; i < sudokuConfig.size; i++) {
        if (i !== col && sudokuBoard[row][i] === value) return true;
        if (i !== row && sudokuBoard[i][col] === value) return true;
    }
    const r0 = Math.floor(row / sudokuConfig.boxRows) * sudokuConfig.boxRows;
    const c0 = Math.floor(col / sudokuConfig.boxCols) * sudokuConfig.boxCols;
    for (let r = r0; r < r0 + sudokuConfig.boxRows; r++) for (let c = c0; c < c0 + sudokuConfig.boxCols; c++) {
        if ((r !== row || c !== col) && sudokuBoard[r][c] === value) return true;
    }
    return false;
}

function renderSudoku() {
    if (!sudokuConfig) return;
    document.querySelectorAll('#sudoku-grid .sudoku-cell').forEach(cell => {
        const r = Number(cell.dataset.row), c = Number(cell.dataset.col), value = sudokuBoard[r][c];
        cell.textContent = value || '';
        cell.classList.toggle('selected', !!sudokuSelected && sudokuSelected.row === r && sudokuSelected.col === c);
        cell.classList.toggle('conflict', !sudokuPuzzle[r][c] && sudokuConflicts(r, c, value));
    });
}

function sudokuSubmit() {
    if (isAdmin || sudokuFinished || !sudokuConfig) return;
    if (sudokuBoard.some(row => row.some(value => !value))) { safeText('sudoku-feedback', '아직 빈칸이 남아 있어요.'); return; }
    socket.emit('sudokuSubmit', sudokuBoard);
}

socket.on('sudokuStart', data => startSudoku(data));
socket.on('sudokuFeedback', data => {
    safeText('sudoku-feedback', data?.message || '');
    if (data?.correct) { sudokuFinished = true; sudokuSelected = null; renderSudoku(); }
});
