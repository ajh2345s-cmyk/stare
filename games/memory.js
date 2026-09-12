const { competitionRanks, rankLines } = require('../rankUtils');
const HEART_EMOJIS = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '🩷', '🩵', '🩶'];

module.exports = {
    run: function(store, logic) {
        store.gameMode = 'MEMORY';
        store.data.memoryScores = {}; store.data.memoryStatus = {}; store.data.memoryRound = 0;
        
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true; p.memoryIndex = 0; p.memoryFinished = false;
                store.data.memoryScores[id] = 0; store.data.memoryStatus[id] = null;
            }
        });
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    nextRound: function(store, logic) {
        store.data.memoryRound++;
        if (store.data.memoryRound > 5) { this.endGame(store, logic || require('../gameLogic')); return; }

        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if(!p.isAdmin) { p.memoryIndex = 0; p.memoryFinished = false; store.data.memoryStatus[id] = '진행중'; }
        });

        const count = Math.max(4, Math.min(12, Number.parseInt(store.settings.memoryCount, 10) || 4));
        let positions = [];
        while (positions.length < count) {
            let pos = Math.floor(Math.random() * 12);
            if (!positions.includes(pos)) positions.push(pos);
        }
        
        let emojis = HEART_EMOJIS.slice(0, count);
        store.data.memoryTargetSequence = positions;
        store.data.memoryStartTime = Date.now();
        
        store.io.emit('memoryStartRound', { round: store.data.memoryRound, positions: positions, emojis: emojis });
        this.updateAdminStatus(store); this.updateRanking(store);

        if (store.timerMain) clearInterval(store.timerMain);
        store.timerMain = setInterval(() => {
            if (store.gameState !== 'PLAYING') { clearInterval(store.timerMain); return; }
            
            let elapsed = Date.now() - store.data.memoryStartTime;
            let remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
            store.io.emit('memoryTimeUpdate', remaining);

            const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive && p.connected !== false);
            const finished = alive.filter(p => p.memoryFinished);
            
            if (remaining <= 0 || (alive.length > 0 && alive.length === finished.length)) {
                clearInterval(store.timerMain);
                alive.forEach(p => {
                    if (!p.memoryFinished) { store.data.memoryStatus[p.id] = '시간초과'; p.memoryFinished = true; }
                });
                store.io.emit('memoryRoundComplete');
                this.updateRanking(store); this.updateAdminStatus(store);
            }
        }, 1000);
    },

    handleInput: function(store, logic, socketId, action) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'MEMORY') return;
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin || p.memoryFinished) return;

        if (action === 'REPLAY') {
            const now = Date.now();
            if (p.memoryLastReplayAt && now - p.memoryLastReplayAt < 2500) return;
            p.memoryLastReplayAt = now;
            // [NaN 방지]
            store.data.memoryScores[socketId] = (store.data.memoryScores[socketId] || 0) - 50; 
            store.data.memoryStatus[socketId] = '다시보기(-50)';
            store.io.to(socketId).emit('memoryFeedback', { type: 'penalty', msg: '-50점 (다시보기)' });
        } 
        else if (action && action.type === 'SELECT') {
            const selectedIndex = Number.parseInt(action.index, 10);
            const expectedIndex = store.data.memoryTargetSequence[p.memoryIndex];
            if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 11) return;
            if (selectedIndex !== expectedIndex) {
                p.memoryIndex = 0;
                store.data.memoryScores[socketId] = (store.data.memoryScores[socketId] || 0) - 50;
                store.data.memoryStatus[socketId] = '틀림(-50)';
                store.io.to(socketId).emit('memoryFeedback', { type: 'wrong', msg: '-50점 (처음부터!)' });
                this.updateRanking(store); this.updateAdminStatus(store);
                return;
            }
            p.memoryIndex++;
            store.data.memoryStatus[socketId] = '진행중..';
            
            if (p.memoryIndex >= store.data.memoryTargetSequence.length) {
                p.memoryFinished = true;
                store.data.memoryStatus[socketId] = '완료 🏁';
                
                let elapsed = Date.now() - store.data.memoryStartTime;
                let remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
                let earned = 600 + Math.floor(400 * (remaining / 30));
                
                // [NaN 방지]
                store.data.memoryScores[socketId] = (store.data.memoryScores[socketId] || 0) + earned;
                
                store.io.to(socketId).emit('memoryFeedback', { type: 'finish', msg: `통과! +${earned}점 획득!` });

                const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive && pl.connected !== false);
                const finished = alive.filter(pl => pl.memoryFinished);
                if (alive.length > 0 && alive.length === finished.length) {
                    if(store.timerMain) clearInterval(store.timerMain);
                    store.io.emit('memoryRoundComplete');
                }
            }
        }
        
        this.updateRanking(store); this.updateAdminStatus(store);
    },

    forceRoundEnd: function(store, logic) {
        if(store.timerMain) clearInterval(store.timerMain);
        Object.values(store.players).forEach(p => {
            if (!p.isAdmin && p.isAlive && p.connected !== false && !p.memoryFinished) {
                store.data.memoryStatus[p.id] = '종료됨';
                p.memoryFinished = true;
            }
        });
        store.io.emit('memoryRoundComplete');
        this.updateRanking(store); this.updateAdminStatus(store);
    },

    updateAdminStatus: function(store) {
        if (!store.adminId) return;
        const statusList = { correct: [], wrong: [], yet: [] };
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (p.isAdmin) return;
            const stat = store.data.memoryStatus[id];
            if (stat === '완료 🏁') statusList.correct.push(p.name);
            else if (stat === '시간초과' || stat === '종료됨') statusList.wrong.push(p.name);
            else if (p.connected !== false) statusList.yet.push(p.name);
        });
        store.io.to(store.adminId).emit('statusBoardUpdate', statusList);
    },

    updateRanking: function(store) {
        let entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin && store.players[id].isAlive)
            .map(id => ({ name: store.players[id].name, score: store.data.memoryScores[id] || 0, status: store.data.memoryStatus[id] || '', finished: store.players[id].memoryFinished }))
            .sort((a, b) => b.score - a.score);

        const ranked = competitionRanks(entries, e => e.score);
        const rows = ranked.map(e => ({ rank: e.rank, name: e.name, value: `${e.score}점`, status: e.status, tone: e.finished ? 'success' : 'progress' }));
        store.io.emit('liveRankUpdate', { rows });
    },

    endGame: function(store, logic) {
        store.clearAllTimers();
        let entries = Object.keys(store.players).filter(id => !store.players[id].isAdmin && store.players[id].isAlive).map(id => ({ name: store.players[id].name, score: store.data.memoryScores[id] })).sort((a, b) => b.score - a.score);
        if (entries.length === 0) { logic.endGame("기억력 게임 종료", [], "참여한 학생이 없습니다."); return; }
        const ranked = competitionRanks(entries, e => e.score);
        let winners = ranked.filter(e => e.rank === 1).map(e => e.name);
        let rankMsg = rankLines(ranked.slice(0, 10), e => `${e.score}점`);
        logic.endGame("🧠 기억력 게임 최종 순위!", winners, rankMsg);
    }
};
