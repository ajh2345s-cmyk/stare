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

let studentDoneMap = {}; 
let isStudentRankVisible = true; 
const HEART_EMOJIS = ['❤️', '💛', '💚', '💙', '💜', '🤍'];

const gameTitleMap = {
    'LOBBY': '🏫 대기실', 'UPDOWN_READY': '↕️ 업다운 게임', 'UPDOWN': '↕️ 업다운 게임',
    'FIFTY_READY': '🔢 1 to 50', 'FIFTY': '🔢 1 to 50', 'BOND_READY': '🍒 가르기 모으기', 'BOND': '🍒 가르기 모으기',
    'WOLF_READY': '🐺 늑대를 찾아라', 'WOLF': '🐺 늑대를 찾아라', 'MISSING_READY': '🕵️ 깜빡 퀴즈', 'MISSING': '🕵️ 깜빡 퀴즈',
    'MEMORY_READY': '🧠 기억력 게임', 'MEMORY': '🧠 기억력 게임',
    'MATHSTAIRS_READY': '🪜 수학의 계단', 'MATHSTAIRS': '🪜 수학의 계단'
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
function updateWolfSettings() { socket.emit('setWolfSettings', { count: parseInt($('wolf-cnt').value), speed: parseInt($('wolf-speed').value), shuffles: parseInt($('wolf-shuffles').value) }); }
function updateMissingSettings() { socket.emit('setMissingSettings', { category: $('missing-cat').value, speed: parseInt($('missing-spd').value), count: parseInt($('missing-cnt').value), optionCount: parseInt($('missing-opt').value) }); }
function updateMemorySettings() { socket.emit('setMemorySettings', { count: parseInt($('memory-cnt').value) }); }

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
        mathStairsSeed = d.mathStairsSeed ?? mathStairsSeed;
        mathStairsStarted = !!d.mathStairsStarted;
        mathStairsStarted = !!d.mathStairsStarted;
        window._mathStairsProblems = d.mathStairsProblems || window._mathStairsProblems || null;
        isStudentRankVisible = d.isStudentRankVisible ?? true; 
        
        const lockBtn = $('lock-btn');
        if (lockBtn) { 
            lockBtn.innerText = d.isLocked ? '🔒 입장 제한됨' : '🔓 입장 허용 중'; 
            lockBtn.style.background = d.isLocked ? '#ff7675' : '#636e72'; 
        }

        if (isAdmin) { safeDisplay('admin-panel', 'flex'); updateUserListAdmin(); }
        updateMemoryReadyDisplay(d.settings);
        updateUI();
        notifyMathStairsFrame('role');
        // 수학의 계단은 서버의 mathStairsStart 신호로만 시작한다.
        // initData의 PLAYING 상태를 보고 중복 시작시키지 않는다.
    } catch(e) { console.error(e); }
});

socket.on('settingsUpdated', s => { updateMemoryReadyDisplay(s); });

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
    safeText('game-title-badge', (gameTitleMap[mode] || "수학 놀이 도구") + ` (${stuCount}명)`);
    
    const adminLabel = $('admin-label-users');
    if (adminLabel) adminLabel.innerHTML = `학생 관리 <span style="color:#f1c40f;font-size:10px;">(${stuCount}명)</span> <span class="toggle-btn">[접기]</span>`;

    ['lobby-view', 'updown-game-area', 'fifty-game-area', 'bond-game-area', 'wolf-game-area', 'missing-game-area', 'memory-game-area', 'math-stairs-game-area', 'live-rank', 'status-panel'].forEach(id => safeDisplay(id, 'none'));

    if (mode !== 'LOBBY') {
        if (isAdmin || isStudentRankVisible) safeDisplay('live-rank', 'block');
        else safeDisplay('live-rank', 'none');
    }

    if (isAdmin) {
        const modeBtns = document.querySelectorAll('.mode-select-btn');
        ['admin-start-btn', 'admin-next-btn', 'admin-stop-btn', 'admin-force-end-btn', 'admin-force-round-end-btn', 'setting-row-updown', 'admin-updown-answer-box', 'setting-row-fifty', 'setting-row-bond', 'setting-row-wolf', 'setting-row-missing', 'setting-row-memory', 'logout-btn'].forEach(id => safeDisplay(id, 'none'));
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
            else if (mode.includes('MATHSTAIRS')) { if(!isGameRunning) safeDisplay('admin-start-btn', 'block'); }
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
    }
}

socket.on('updateUserList', p => { players = p || {}; if (mode === 'LOBBY') renderLobbyGrid(); if (isAdmin) updateUserListAdmin(); updateUI(); });

function updateUserListAdmin() {
    const list = $('admin-user-list'); const ts = $('fifty-target-select'); let curr = ts ? ts.value : "";
    if (list) list.innerHTML = ''; if (ts) ts.innerHTML = '<option value="">-- 타겟 선택 --</option>';
    Object.values(players).forEach(p => {
        if (p.isAdmin) return;
        let statusIcon = "";
        if (typeof mode === 'string' && (mode.includes('BOND') || mode.includes('WOLF') || mode.includes('MISSING') || mode.includes('MEMORY'))) {
            statusIcon = studentDoneMap[p.name] || "⏳"; 
        }
        if (list) list.innerHTML += `<div class="kick-row"><span>${p.name} ${statusIcon}</span><button class="x-btn" onclick="kickUser('${p.id}')">✕</button></div>`;
        if (ts) ts.innerHTML += `<option value="${p.id}">${p.name}</option>`;
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
            remotePlayers: window._mathStairsPlayers || [],
            selfId: myId
        }, window.location.origin);
        return;
    }

    frame.contentWindow.postMessage({
        source:'math-stairs',
        type: action,
        mapSeed: mathStairsSeed,
        mathProblems: window._mathStairsProblems || null
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
    mathStairsStarted = true;
    window._mathStairsProblems = d && d.mathProblems ? d.mathProblems : null;
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

socket.on('liveRankUpdate', r => { const c = $('rank-content'); if(c) c.innerHTML = r; });

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
const getWolfPositions = (count) => {
    const stg = $('wolf-stage'); if(!stg) return [];
    const w = stg.offsetWidth; const h = stg.offsetHeight;
    let cols = 3; if (count === 4) cols = 2; 
    let rows = Math.ceil(count / cols);
    let aW = window.innerWidth <= 600 ? 50 : 80;
    if (window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches) aW = 40;

    let arr = [];
    for(let i=0; i<count; i++) {
        let col = i % cols; let row = Math.floor(i / cols);
        let cellW = w / cols; let cellH = h / rows;
        arr.push({ x: (col * cellW) + (cellW / 2) - (aW / 2), y: (row * cellH) + (cellH / 2) - (aW / 2) });
    }
    return arr;
};

socket.on('wolfStartRound', d => {
    clearStatusBoard();
    wolfLock = true;
    
    const count = d.animalCount || 3;
    const stg = $('wolf-stage'); if(stg) stg.innerHTML = '';
    wolfAnimals = [];
    wolfPositions = getWolfPositions(count);

    for(let i=0; i<count; i++) {
        const el = document.createElement('div'); el.className = 'animal'; el.id = 'animal' + i;
        el.innerText = (i === d.target) ? '🐺' : '🐑'; el.onclick = () => wolfClick(i);
        el.style.left = wolfPositions[i].x + 'px'; el.style.top = wolfPositions[i].y + 'px';
        if(stg) stg.appendChild(el);
        wolfAnimals.push({ el: el, type: (i===d.target)?'wolf':'sheep', pos: i, originalIdx: i }); 
    }

    safeText('wolf-msg', `[ROUND ${d.round}] 늑대의 위치를 확인하세요!`);

    setTimeout(() => {
        const wolf = wolfAnimals.find(a => a.type === 'wolf');
        if(wolf && wolf.el) wolf.el.innerText = '🐑';
        safeText('wolf-msg', '늑대가 양으로 변신했습니다! (1초 후 섞입니다)');
        
        setTimeout(() => {
            safeText('wolf-msg', '잘 섞이는 중...');
            let shuffleCount = 0; let speedMs = 1000 - (d.speed * 90);

            function doShuffle() {
                if (shuffleCount >= d.shuffles) {
                    safeText('wolf-msg', '늑대는 어디 있을까요? 클릭하세요!');
                    wolfLock = false; return;
                }
                
                // [핵심 수정] 클라이언트 맘대로 섞지 않고, 서버가 준 정확한 지시도(d.shuffleSteps)를 그대로 따라감!
                const step = d.shuffleSteps[shuffleCount];
                
                let a1 = wolfAnimals.find(a => a.pos === step.p1);
                let a2 = wolfAnimals.find(a => a.pos === step.p2);
                
                if (a1 && a2) {
                    a1.pos = step.p2;
                    a2.pos = step.p1;
                }

                wolfAnimals.forEach(a => {
                    if(!a.el) return;
                    const endPos = wolfPositions[a.pos];
                    a.el.style.zIndex = Math.floor(Math.random() * 100); 
                    
                    if(step.isPara) {
                        a.el.style.transition = 'none';
                        const startX = parseFloat(a.el.style.left || 0); const startY = parseFloat(a.el.style.top || 0);
                        const midX = (startX + endPos.x)/2; const midY = (startY + endPos.y)/2 - 60; 
                        a.el.animate([ { left: startX+'px', top: startY+'px', transform: 'scale(1)' }, { left: midX+'px', top: midY+'px', transform: 'scale(1.2)' }, { left: endPos.x+'px', top: endPos.y+'px', transform: 'scale(1)' } ], { duration: speedMs*0.9, easing: 'ease-in-out' });
                    } else {
                        a.el.style.transition = `left ${speedMs*0.9}ms ease-in-out, top ${speedMs*0.9}ms ease-in-out`;
                    }
                    a.el.style.left = endPos.x + 'px'; a.el.style.top = endPos.y + 'px';
                });
                shuffleCount++; setTimeout(doShuffle, speedMs);
            }
            doShuffle();
        }, 1000); 
    }, 1500); 
});

function wolfClick(idx) {
    if(wolfLock || isAdmin) return;
    wolfLock = true;
    socket.emit('wolfSubmit', idx); 
}
socket.on('wolfResult', d => {
    wolfAnimals.forEach(a => { if(a.el) { a.el.innerText = (a.type === 'wolf') ? '🐺' : '🐑'; } });
    if(d.correct) safeText('wolf-msg', '⭕ 정답입니다! 늑대를 찾았어요!');
    else safeText('wolf-msg', '❌ 앗! 양이네요! 늑대는 여기 있었습니다!');
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
        socket.emit('memorySubmit', 'CORRECT'); 
        if(memoryUserIndex === memoryTargetSequence.length) { memoryLock = true; }
    } else {
        memoryLock = true; box.classList.add('incorrect'); socket.emit('memorySubmit', 'WRONG');
        setTimeout(() => { 
            box.classList.remove('incorrect'); memoryUserIndex = 0;
            const boxes = Array.from(document.querySelectorAll('.mem-box'));
            boxes.forEach(b => b.classList.remove('active', 'show-heart'));
            memoryLock = false;
        }, 1000);
    }
}