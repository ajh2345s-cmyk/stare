const store = require('./gameStore'); 
let gameUpdown, gameFifty, gameBond, gameWolf, gameMissing, gameMemory, gameMathStairs;
function loadGame(name) {
    try { return require(`./games/${name}`); }
    catch (error) { console.error(`[game-load] ${name} 모듈을 불러오지 못했습니다.`, error); return null; }
}
gameUpdown = loadGame('updown');
gameFifty = loadGame('fifty');
gameBond = loadGame('bond');
gameWolf = loadGame('wolf');
gameMissing = loadGame('missing');
gameMemory = loadGame('memory');
gameMathStairs = loadGame('math_stairs');

const logic = {};

logic.resetGame = function(mode = 'LOBBY') {
    try {
        if (store.timerMain) clearInterval(store.timerMain);
        if (store.timerTask) clearTimeout(store.timerTask);
        store.timerMain = null; store.timerTask = null;

        store.gameState = 'WAITING'; store.gameMode = mode;
        const commonData = {
            isStudentRankVisible: store.data && store.data.isStudentRankVisible !== undefined ? store.data.isStudentRankVisible : true,
            isLocked: !!(store.data && store.data.isLocked)
        };
        store.data = { ...commonData, gameStartPending: false, mathStairsStarted: false };
        
        store.data.updownScores = {}; store.data.fiftyScores = {}; store.data.fiftyFinishTimes = {};
        store.data.bondScores = {}; store.data.wolfScores = {}; store.data.missingScores = {}; store.data.memoryScores = {}; store.data.mathStairsScores = {};

        let newPlayers = {};
        if (store.players) {
            Object.keys(store.players).forEach(id => {
                if (store.players[id] && !store.players[id].isBot) {
                    let p = store.players[id];
                    p.isAlive = !p.isAdmin; p.updownFinished = false; p.updownAttempts = 0;
                    p.fiftyTarget = 1; p.fiftyFinished = false; newPlayers[id] = p;
                }
            });
        }
        store.players = newPlayers;
        if (store.io) store.io.emit('hardReset', { mode: mode, players: store.players, settings: store.settings });
    } catch (error) { console.error(error); }
};

logic.endGame = function(title, winners = [], msg = "", extraData = null) {
    try {
        if (store.timerMain) clearInterval(store.timerMain);
        if (store.timerTask) clearTimeout(store.timerTask);
        store.timerMain = null; store.timerTask = null;
        store.gameState = 'WAITING';
        if (store.data) { store.data.gameStartPending = false; store.data.mathStairsStarted = false; }
        if (winners.length > 0) store.io.emit('finalVictory', { title, winners, customMsg: msg, extra: extraData });
        else store.io.emit('gameTerminated', { title: "게임 종료", message: msg || "기록 없음", extra: extraData });
    } catch (error) { console.error(error); }
};

logic.startGame = function() {
    try {
        if (store.gameState !== 'WAITING') return;
        const studentCount = Object.values(store.players || {}).filter(p => p && !p.isAdmin && !p.isBot && p.connected !== false).length;
        if (studentCount === 0) {
            if (store.io) store.io.emit('adminWarning', '학생이 한 명 이상 입장해야 게임을 시작할 수 있습니다.');
            return;
        }
        store.gameState = 'COUNTDOWN';
        store.data = store.data || {};
        store.data.gameStartPending = true;
        if (store.players) {
            Object.keys(store.players).forEach(id => {
                if (store.players[id] && !store.players[id].isAdmin) {
                    store.players[id].isAlive = true; store.players[id].fiftyTarget = 1; store.players[id].fiftyFinished = false;
                    if(store.data) { store.data.updownScores[id] = 0; store.data.fiftyScores[id] = 1; store.data.bondScores[id] = 0; store.data.wolfScores[id] = 0; store.data.missingScores[id] = 0; store.data.memoryScores[id] = 0; store.data.mathStairsScores[id] = { floor: 1, score: 0, state: 'ready' }; }
                }
            });
        }
        store.io.emit('updateUserList', store.players);
        store.io.emit('startCountdown', { seconds: 3 });
        store.timerTask = setTimeout(() => { logic.startGameLogic(); }, 3500);
    } catch (error) { console.error(error); }
};

logic.startGameLogic = function() {
    try {
        if (store.gameState !== 'COUNTDOWN') return;
        store.data.gameStartPending = false;
        store.gameState = 'PLAYING';
        const mode = store.gameMode || '';
        
        if (mode.includes('UPDOWN') && gameUpdown) gameUpdown.run(store, logic); 
        else if (mode.includes('FIFTY') && gameFifty) gameFifty.run(store, logic);
        else if (mode.includes('BOND') && gameBond) gameBond.run(store, logic);
        else if (mode.includes('WOLF') && gameWolf) { gameWolf.run(store, logic); gameWolf.nextRound(store); }
        else if (mode.includes('MISSING') && gameMissing) { gameMissing.run(store, logic); gameMissing.nextRound(store); }
        else if (mode.includes('MEMORY') && gameMemory) { gameMemory.run(store, logic); gameMemory.nextRound(store, logic); }
        else if (mode.includes('MATHSTAIRS') && gameMathStairs) { gameMathStairs.run(store, logic); } 
    } catch (error) { console.error(error); }
};

logic.forceEndGame = function() {
    try {
        if (store.timerMain) clearInterval(store.timerMain);
        if (store.timerTask) clearTimeout(store.timerTask);
        store.timerMain = null; store.timerTask = null;
        store.gameState = 'RESULT'; 
        const mode = store.gameMode || '';

        if (mode.includes('UPDOWN') && gameUpdown) {
            gameUpdown.checkFinish(store, logic);
            if(store.gameState !== 'WAITING') {
                 let sorted = Object.entries(store.data.updownScores || {}).filter(([id, attempts]) => store.players[id] && (store.players[id].updownFinished || Number(attempts) > 0)).sort((a, b) => a[1] - b[1]);
                 let winners = sorted.length > 0 ? sorted.filter(r => r[1] === sorted[0][1]).map(r => store.players[r[0]].name) : [];
                 let rankMsg = sorted.slice(0, 10).map((e, i) => `${i+1}위: ${store.players[e[0]].name} (${e[1]}회)`).join('<br>');
                 logic.endGame("업다운 게임 종료", winners, rankMsg);
            }
        }
        else if (mode.includes('FIFTY') && gameFifty) gameFifty.endGame(store, logic);
        else if (mode.includes('BOND') && gameBond) gameBond.endGame(store, logic);
        else if (mode.includes('WOLF') && gameWolf) gameWolf.endGame(store, logic);
        else if (mode.includes('MISSING') && gameMissing) gameMissing.endGame(store, logic);
        else if (mode.includes('MEMORY') && gameMemory) gameMemory.endGame(store, logic);
        else if (mode.includes('MATHSTAIRS') && gameMathStairs) gameMathStairs.endGame(store, logic);
        else logic.endGame("강제 종료", [], "선생님에 의해 종료되었습니다.");
    } catch (error) { console.error(error); }
};

logic.forceRoundEnd = function(socketId) {
    try {
        if (!store.players[socketId] || !store.players[socketId].isAdmin) return;
        if (store.gameState !== 'PLAYING') return;
        const mode = store.gameMode || '';
        
        // [수정됨] 가르기 모으기도 강제 라운드 종료(미응답자 오답처리) 가능
        if (mode.includes('BOND') && gameBond && gameBond.forceRoundEnd) gameBond.forceRoundEnd(store, logic);
        else if (mode.includes('WOLF') && gameWolf && gameWolf.forceRoundEnd) gameWolf.forceRoundEnd(store, logic);
        else if (mode.includes('MISSING') && gameMissing && gameMissing.forceRoundEnd) gameMissing.forceRoundEnd(store, logic);
        else if (mode.includes('MEMORY') && gameMemory && gameMemory.forceRoundEnd) gameMemory.forceRoundEnd(store, logic);
    } catch (error) { console.error(error); }
};

logic.handleUpdownInput = (id, num) => { if(gameUpdown) gameUpdown.handleInput(store, logic, id, num); };
module.exports = logic;
