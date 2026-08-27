const HEART_EMOJIS = ['❤️', '💛', '💚', '💙', '💜', '🤍'];

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

        const count = store.settings.memoryCount || 4;
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

            const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive);
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
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.isAdmin || p.memoryFinished) return;

        if (action === 'REPLAY') {
            // [NaN 방지]
            store.data.memoryScores[socketId] = (store.data.memoryScores[socketId] || 0) - 50; 
            store.data.memoryStatus[socketId] = '다시보기(-50)';
            store.io.to(socketId).emit('memoryFeedback', { type: 'penalty', msg: '-50점 (다시보기)' });
        } 
        else if (action === 'CORRECT') {
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

                const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive);
                const finished = alive.filter(pl => pl.memoryFinished);
                if (alive.length > 0 && alive.length === finished.length) {
                    if(store.timerMain) clearInterval(store.timerMain);
                    store.io.emit('memoryRoundComplete');
                }
            }
        } 
        else if (action === 'WRONG') {
            p.memoryIndex = 0; 
            // [NaN 방지]
            store.data.memoryScores[socketId] = (store.data.memoryScores[socketId] || 0) - 50; 
            store.data.memoryStatus[socketId] = '틀림(-50)';
            store.io.to(socketId).emit('memoryFeedback', { type: 'penalty', msg: '-50점 (처음부터!)' });
        }
        
        this.updateRanking(store); this.updateAdminStatus(store);
    },

    forceRoundEnd: function(store, logic) {
        if(store.timerMain) clearInterval(store.timerMain);
        Object.values(store.players).forEach(p => {
            if (!p.isAdmin && p.isAlive && !p.memoryFinished) {
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
            else statusList.yet.push(p.name);
        });
        store.io.to(store.adminId).emit('statusBoardUpdate', statusList);
    },

    updateRanking: function(store) {
        let entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin && store.players[id].isAlive)
            .map(id => ({ name: store.players[id].name, score: store.data.memoryScores[id] || 0, status: store.data.memoryStatus[id] || '', finished: store.players[id].memoryFinished }))
            .sort((a, b) => b.score - a.score);

        let rankText = entries.map((e, i) => {
            let color = e.finished ? "#55efc4" : "#f1c40f";
            return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1); align-items:center;">
                <span style="color:#aaa; font-size:11px; width:30px;">${i+1}위</span>
                <span style="font-weight:bold; flex:1; text-align:left; padding-left:5px;">${e.name} <span style="font-size:10px;color:#aaa;">${e.status}</span></span>
                <span style="color:${color}; font-weight:bold; font-size:13px;">${e.score}점</span></div>`;
        }).join('');
        store.io.emit('liveRankUpdate', rankText || "<div style='color:#ccc; text-align:center;'>대기 중...</div>");
    },

    endGame: function(store, logic) {
        store.clearAllTimers();
        let entries = Object.keys(store.players).filter(id => !store.players[id].isAdmin && store.players[id].isAlive).map(id => ({ name: store.players[id].name, score: store.data.memoryScores[id] })).sort((a, b) => b.score - a.score);
        if (entries.length === 0) { logic.endGame("기억력 게임 종료", [], "참여한 학생이 없습니다."); return; }
        let winners = entries.filter(e => e.score === entries[0].score).map(e => e.name);
        let rankMsg = entries.slice(0, 10).map((e, i) => `${i+1}위: ${e.name} (${e.score}점)`).join('<br>');
        logic.endGame("🧠 기억력 게임 최종 순위!", winners, rankMsg);
    }
};