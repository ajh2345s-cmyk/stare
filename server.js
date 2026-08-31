const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const store = require('./gameStore');
const logic = require('./gameLogic');
const mathStairs = require('./games/math_stairs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    reconnection: true,
    pingInterval: 10000,
    pingTimeout: 20000
});

store.io = io;
store.tokens = store.tokens || {}; 

// [핵심 추가] 3시간 무응답 시 자동 폭파 타이머
let inactivityTimer = null;
const THREE_HOURS = 3 * 60 * 60 * 1000; 

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.log("⏳ [자동 초기화] 3시간 동안 활동이 없어 방을 완전히 초기화합니다.");
        
        // 1. 모든 플레이어 및 비밀 도장 파기
        store.players = {};
        store.tokens = {};
        store.adminId = null;
        
        // 2. 게임 상태 대기실로 리셋
        if (logic && logic.resetGame) logic.resetGame('LOBBY');
        
        // 3. 접속 중인 모든 기기 강제 로그아웃 (비밀 도장 삭제 후 로그인 창으로 튕겨냄)
        io.emit('kicked');
    }, THREE_HOURS);
}

// 서버 시작 시 타이머 최초 가동
resetInactivityTimer();

store.data = store.data || {};
store.settings = { 
    updownMax: 100, bondMode: 'MIX', bondRanges: ['9'], bondDisplay: 'NUM',
    fiftyMode: 'NORMAL', fiftyTargetId: null,
    wolfSpeed: 5, wolfShuffles: 15, wolfCount: 1, wolfSheepCount: 8, 
    missingCategory: 'animal', missingSpeed: 10, missingCount: 5, missingOptionCount: 4,
    memoryCount: 4
};

app.use(express.static(path.join(__dirname, 'public'))); 

io.on('connection', (socket) => {
    // 누군가 접속하면 타이머 연장
    resetInactivityTimer();

    // 클라이언트가 어떤 행동이든 서버로 보내면 타이머 연장
    socket.use((packet, next) => {
        resetInactivityTimer();
        next();
    });

    socket.on('joinGame', (data) => {
        try {
            store.players = store.players || {}; store.data = store.data || {}; 
            if (store.data.isStudentRankVisible === undefined) store.data.isStudentRankVisible = true;
            
            const safeGameMode = store.gameMode || 'LOBBY';

            // [1] 도장을 들고 온 경우
            if (data && data.token) {
                const oldId = store.tokens[data.token];
                
                if (oldId && store.players[oldId]) {
                    store.players[socket.id] = store.players[oldId];
                    store.players[socket.id].id = socket.id;
                    store.players[socket.id].connected = true;
                    store.players[socket.id].disconnectedAt = null;
                    delete store.players[oldId]; 

                    if (store.players[socket.id].isAdmin) {
                        store.adminId = socket.id;
                    }

                    const dicts = ['updownScores', 'fiftyScores', 'fiftyFinishTimes', 'bondScores', 'bondStatus', 'wolfScores', 'wolfStatus', 'missingScores', 'missingStatus', 'memoryScores', 'memoryStatus', 'mathStairsScores'];
                    dicts.forEach(dict => {
                        if (store.data[dict] && store.data[dict][oldId] !== undefined) {
                            store.data[dict][socket.id] = store.data[dict][oldId];
                            delete store.data[dict][oldId];
                        }
                    });

                    store.tokens[data.token] = socket.id;

                    socket.emit('initData', { 
                        myId: socket.id, isAdmin: store.players[socket.id].isAdmin, 
                        gameMode: safeGameMode, gameState: store.gameState, players: store.players, settings: store.settings, 
                        isStudentRankVisible: store.data.isStudentRankVisible,
                        mathStairsSeed: store.data.mathStairsSeed || null,
                        mathStairsProblems: store.data.mathStairsProblems || null,
                        mathStairsStarted: !!store.data.mathStairsStarted,
                        isLocked: !!store.data.isLocked
                    });
                    io.emit('updateUserList', store.players);
                    return;
                } else {
                    socket.emit('requireLogin');
                    return;
                }
            }

            // [2] 처음 코드를 치고 들어온 경우
            const { nickname, code } = data || {};
            const isExist = Object.values(store.players).some(p => p.name === nickname);
            if (isExist && code !== 'gmltn') { socket.emit('joinError', '이미 존재하는 이름입니다.'); return; }

            if (code === 'gmltn') {
                // 새로운 선생님 접속 시 기존 선생님 밀어내기 (분신술 방지)
                Object.keys(store.players).forEach(id => {
                    if (store.players[id].isAdmin) {
                        delete store.players[id];
                        for (let t in store.tokens) {
                            if (store.tokens[t] === id) delete store.tokens[t];
                        }
                    }
                });

                store.adminId = socket.id;
                store.players[socket.id] = { id: socket.id, name: nickname || '선생님', isAdmin: true, isBot: false, isAlive: true, connected: true, disconnectedAt: null };

                const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                store.tokens[newToken] = socket.id;
                socket.emit('tokenAssigned', newToken);

            } else {
                if (store.data.isLocked) { socket.emit('joinError', '입장 제한'); return; }
                store.players[socket.id] = { id: socket.id, name: nickname, isAdmin: false, isAlive: true, connected: true, disconnectedAt: null };

                const p = store.players[socket.id];
                p.updownFinished = false; p.updownAttempts = 0;
                p.fiftyTarget = 1; p.fiftyFinished = false;
                p.memoryIndex = 0; p.memoryFinished = false;

                if(store.data) {
                    store.data.updownScores = store.data.updownScores || {};
                    store.data.updownScores[socket.id] = 0;
                    store.data.fiftyScores = store.data.fiftyScores || {};
                    store.data.fiftyScores[socket.id] = 1;
                    store.data.bondScores = store.data.bondScores || {};
                    store.data.bondScores[socket.id] = 0;
                    store.data.bondStatus = store.data.bondStatus || {};
                    store.data.bondStatus[socket.id] = null;
                    store.data.wolfScores = store.data.wolfScores || {};
                    store.data.wolfScores[socket.id] = 0;
                    store.data.wolfStatus = store.data.wolfStatus || {};
                    store.data.wolfStatus[socket.id] = null;
                    store.data.missingScores = store.data.missingScores || {};
                    store.data.missingScores[socket.id] = 0;
                    store.data.missingStatus = store.data.missingStatus || {};
                    store.data.missingStatus[socket.id] = null;
                    store.data.memoryScores = store.data.memoryScores || {};
                    store.data.memoryScores[socket.id] = 0;
                    store.data.memoryStatus = store.data.memoryStatus || {};
                    store.data.memoryStatus[socket.id] = null;
                    store.data.mathStairsScores = store.data.mathStairsScores || {};
                    store.data.mathStairsScores[socket.id] = { floor: 1, score: 0, state: 'ready' };
                }

                const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                store.tokens[newToken] = socket.id;
                socket.emit('tokenAssigned', newToken);
            }
            
            socket.emit('initData', { 
                myId: socket.id, isAdmin: store.players[socket.id].isAdmin, 
                gameMode: safeGameMode, gameState: store.gameState, players: store.players, settings: store.settings, 
                isStudentRankVisible: store.data.isStudentRankVisible,
                mathStairsSeed: store.data.mathStairsSeed || null,
                mathStairsProblems: store.data.mathStairsProblems || null,
                mathStairsStarted: !!store.data.mathStairsStarted,
                isLocked: !!store.data.isLocked 
            });
            io.emit('updateUserList', store.players);
        } catch (e) { console.error(e); }
    });

    socket.on('changeModeRequest', (mode) => { 
        try { 
            if (store.players[socket.id]?.isAdmin) {
                const wasLocked = store.data.isLocked; 
                logic.resetGame(mode); 
                store.data.isLocked = wasLocked; 
                io.emit('lockStatus', store.data.isLocked);
            } 
        } catch (e) {} 
    });

    socket.on('explicitLogout', () => {
        try {
            const targetId = socket.id;
            if (store.players[targetId] && !store.players[targetId].isAdmin) {
                delete store.players[targetId];
                for (let token in store.tokens) {
                    if (store.tokens[token] === targetId) { delete store.tokens[token]; break; }
                }
                io.emit('updateUserList', store.players);
            }
        } catch(e) { console.error('[socket]', e); }
    });

    socket.on('startGameSignal', () => {
        try {
            if (!store.players[socket.id]?.isAdmin) return;
            if ((store.gameMode || '').includes('WOLF') && Number.parseInt(store.settings.wolfCount, 10) === 0) {
                socket.emit('adminWarning', '늑대가 0마리라 게임을 시작할 수 없습니다. 늑대 마리수를 1마리 이상으로 설정하세요.');
                return;
            }
            logic.startGame();
        } catch(e) { console.error('[socket]', e); }
    });
    socket.on('adminForceEnd', () => { try { if (store.players[socket.id]?.isAdmin) logic.forceEndGame(); } catch(e) { console.error('[socket]', e); } });
    socket.on('adminForceRoundEnd', () => { logic.forceRoundEnd(socket.id); });

    socket.on('toggleLock', () => { 
        try { 
            if (store.players[socket.id]?.isAdmin) { 
                store.data.isLocked = !store.data.isLocked; 
                io.emit('lockStatus', store.data.isLocked); 
            } 
        } catch(e) { console.error('[socket]', e); } 
    });
    
    socket.on('kickUser', (targetId) => { 
        try { 
            if (store.players[socket.id]?.isAdmin && store.players[targetId]) { 
                io.to(targetId).emit('kicked'); 
                delete store.players[targetId]; 
                
                for (let token in store.tokens) {
                    if (store.tokens[token] === targetId) { delete store.tokens[token]; break; }
                }
                io.emit('updateUserList', store.players); 
            } 
        } catch(e) { console.error('[socket]', e); } 
    });

    socket.on('toggleRankVisibility', () => {
        try {
            if (store.players[socket.id]?.isAdmin) {
                store.data.isStudentRankVisible = !store.data.isStudentRankVisible;
                io.emit('rankVisibilityUpdated', store.data.isStudentRankVisible);
            }
        } catch(e) { console.error('[socket]', e); }
    });

    const broadcastSettings = () => io.emit('settingsUpdated', store.settings);
    socket.on('setUpdownMax', (max) => { if (store.players[socket.id]?.isAdmin) { store.settings.updownMax = max; broadcastSettings(); } });
    socket.on('setBondSettings', (data) => { if (store.players[socket.id]?.isAdmin) { store.settings.bondMode = data.mode; store.settings.bondRanges = data.ranges; store.settings.bondDisplay = data.display; broadcastSettings(); } });
    socket.on('setFiftySettings', (data) => { if (store.players[socket.id]?.isAdmin) { store.settings.fiftyMode = data.mode; store.settings.fiftyTargetId = data.targetId; broadcastSettings(); } });
    socket.on('setWolfSettings', (data) => {
        if (!store.players[socket.id]?.isAdmin) return;
        const rawSheep = Number.parseInt(data?.sheepCount, 10);
        const rawWolf = Number.parseInt(data?.wolfCount, 10);
        const sheepCount = Number.isFinite(rawSheep) ? Math.max(1, Math.min(60, rawSheep)) : 8;
        const wolfCount = Number.isFinite(rawWolf) ? Math.max(0, Math.min(10, rawWolf)) : 1;
        const speed = Math.max(1, Math.min(10, Number.parseInt(data?.speed, 10) || 5));
        const shuffles = Math.max(1, Math.min(50, Number.parseInt(data?.shuffles, 10) || 15));
        store.settings.wolfSheepCount = sheepCount;
        store.settings.wolfCount = wolfCount;
        store.settings.wolfSpeed = speed;
        store.settings.wolfShuffles = shuffles;
        broadcastSettings();
    });
    socket.on('setMissingSettings', (data) => { if (store.players[socket.id]?.isAdmin) { store.settings.missingCategory = data.category; store.settings.missingSpeed = data.speed; store.settings.missingCount = data.count; store.settings.missingOptionCount = data.optionCount; broadcastSettings(); } });
    socket.on('setMemorySettings', (data) => { if (store.players[socket.id]?.isAdmin) { store.settings.memoryCount = data.count; broadcastSettings(); } });

    socket.on('adminNextRound', () => { 
        try { 
            if (store.players[socket.id]?.isAdmin) { 
                const mode = store.gameMode; 
                const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive);
                let allDone = true;

                if (mode.includes('BOND')) allDone = alive.every(p => store.data.bondStatus && store.data.bondStatus[p.id] !== null);
                else if (mode.includes('WOLF')) allDone = alive.every(p => store.data.wolfStatus && store.data.wolfStatus[p.id] !== null);
                else if (mode.includes('MISSING')) allDone = alive.every(p => store.data.missingStatus && store.data.missingStatus[p.id] !== null);
                else if (mode.includes('MEMORY')) allDone = alive.every(p => store.data.memoryStatus && store.data.memoryStatus[p.id] === '완료 🏁' || store.data.memoryStatus[p.id] === '시간초과' || store.data.memoryStatus[p.id] === '종료됨');

                if (!allDone && alive.length > 0) {
                    socket.emit('adminWarning', '아직 선택하지 않은 학생이 있습니다! 학생 관리 패널(⏳)을 확인하거나 강제 종료하세요.');
                    return;
                }

                if (mode.includes('BOND')) require('./games/bond').nextProblem(store); 
                else if (mode.includes('WOLF')) require('./games/wolf').nextRound(store);
                else if (mode.includes('MISSING')) require('./games/missing').nextRound(store);
                else if (mode.includes('MEMORY')) require('./games/memory').nextRound(store, logic);
            } 
        } catch(e) { console.error('[socket]', e); } 
    });

    socket.on('updownSubmit', (val) => { try { logic.handleUpdownInput(socket.id, val); } catch(e) { console.error('[socket]', e); } });
    socket.on('fiftyClick', (num) => { try { require('./games/fifty').handleInput(store, logic, socket.id, num); } catch(e) { console.error('[socket]', e); } });
    socket.on('bondSubmit', (ans) => { try { require('./games/bond').handleInput(store, logic, socket.id, ans); } catch(e) { console.error('[socket]', e); } });
    socket.on('wolfSubmit', (idx) => { try { require('./games/wolf').handleInput(store, logic, socket.id, idx); } catch(e) { console.error('[socket]', e); } });
    socket.on('missingSubmit', (choice) => { try { require('./games/missing').handleInput(store, logic, socket.id, choice); } catch(e) { console.error('[socket]', e); } });
    socket.on('memorySubmit', (action) => { try { require('./games/memory').handleInput(store, logic, socket.id, action); } catch(e) { console.error('[socket]', e); } });


    socket.on('mathStairsProgress', (data) => { try { mathStairs.handleProgress(store, socket.id, data); } catch(e) { console.error('[socket]', e); } });
    socket.on('mathStairsGameOver', (data) => { try { mathStairs.handleGameOver(store, socket.id, data, logic); } catch(e) { console.error('[socket]', e); } });
    socket.on('mathStairsProfile', (data) => { try { mathStairs.handleProfile(store, socket.id, data); } catch(e) { console.error('[socket]', e); } });

    socket.on('disconnect', () => {
        try {
            const leaving = store.players[socket.id];
            if (!leaving) return;
            // 학교 태블릿의 일시적인 네트워크 끊김을 대비해 학생/토큰/점수를 즉시 삭제하지 않는다.
            // 같은 토큰으로 재접속하면 기존 플레이어와 게임 상태를 그대로 복구한다.
            leaving.connected = false;
            leaving.disconnectedAt = Date.now();
            leaving.id = socket.id;
            if (leaving.isAdmin) store.adminId = null;
            io.emit('updateUserList', store.players);
        } catch (e) { console.error('[disconnect]', e); }
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`✅ 수학 놀이 도구 서버 실행 중: ${PORT}`); });