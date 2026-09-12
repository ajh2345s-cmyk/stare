const { competitionRanks, rankLines } = require('../rankUtils');
module.exports = {
    run: function(store, logic) {
        store.gameMode = 'FIFTY';
        store.data.fiftyScores = {}; 
        store.data.fiftyFinishTimes = {}; 
        store.data.fiftyStartTime = Date.now();
        
        let seed = [];
        for(let i=1; i<=16; i++) seed.push(i);
        for (let i = seed.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seed[i], seed[j]] = [seed[j], seed[i]];
        }
        store.data.fiftySeed = seed;

        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true; p.fiftyTarget = 1; p.fiftyFinished = false;
                store.data.fiftyScores[id] = 1; 
            }
        });

        store.io.emit('fiftyStart', { seed: seed, startTime: store.data.fiftyStartTime });
        store.io.emit('updateUserList', store.players);

        store.timerMain = setInterval(() => {
            if (store.gameState !== 'PLAYING') { clearInterval(store.timerMain); return; }
            this.updateRanking(store);
            const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive && p.connected !== false);
            const finished = alive.filter(p => p.fiftyFinished);
            if (alive.length > 0 && alive.length === finished.length) this.endGame(store, logic);
        }, 1000);
    },

    handleInput: function(store, logic, socketId, num) {
        // [핵심 수정] 선생님이 게임을 강제 종료했으면(PLAYING이 아니면) 더 이상 입력받지 않음!
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'FIFTY') return;

        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin || p.fiftyFinished) return;
        const clicked = Number.parseInt(num, 10);
        if (!Number.isInteger(clicked) || clicked < 1 || clicked > 50) return;
        if (clicked === p.fiftyTarget) {
            p.fiftyTarget++; 
            store.data.fiftyScores[socketId] = p.fiftyTarget;
            if (p.fiftyTarget > 50) {
                p.fiftyFinished = true;
                const timeTaken = ((Date.now() - store.data.fiftyStartTime) / 1000).toFixed(2);
                store.data.fiftyFinishTimes[socketId] = timeTaken;
                store.io.to(socketId).emit('fiftyFinish', timeTaken); 
            }
            this.updateRanking(store);
        }
    },

    updateRanking: function(store) {
        let entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin && store.players[id].isAlive)
            .map(id => {
                const p = store.players[id];
                return { id: id, name: p.name, finished: p.fiftyFinished, score: p.fiftyTarget, time: store.data.fiftyFinishTimes[id] || 999999 };
            });

        entries.sort((a, b) => {
            if (a.finished && b.finished) return parseFloat(a.time) - parseFloat(b.time);
            if (a.finished) return -1;
            if (b.finished) return 1;
            return b.score - a.score; 
        });

        const ranked = competitionRanks(entries, e => e.finished ? `F:${e.time}` : `P:${e.score}`);
        const rows = ranked.map(e => ({
            rank: e.rank, name: e.name,
            value: e.finished ? `${e.time}초` : `${e.score - 1}`,
            status: e.finished ? '🏁 완주' : '진행중', tone: e.finished ? 'success' : 'progress'
        }));
        store.io.emit('liveRankUpdate', { rows });
    },

    endGame: function(store, logic) {
        store.clearAllTimers();
        let entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin && store.players[id].isAlive)
            .map(id => ({ id: id, name: store.players[id].name, time: parseFloat(store.data.fiftyFinishTimes[id] || 999999) }))
            .filter(e => store.players[e.id].fiftyFinished)
            .sort((a, b) => a.time - b.time);

        const ranked = competitionRanks(entries, e => e.time);
        let winners = ranked.filter(e => e.rank === 1).map(e => e.name);
        // [수정됨] 10등 제한 없앰 (완주한 모든 학생 표시)
        let rankMsg = rankLines(ranked, e => `${e.time}초`);

        const mode = store.settings.fiftyMode || 'NORMAL';
        let extraHtml = "";

        if (mode === 'AVERAGE' && entries.length > 0) {
            const total = entries.reduce((sum, e) => sum + e.time, 0);
            const avg = (total / entries.length).toFixed(2);
            extraHtml = `<div style="background:#2d3436; color:#55efc4; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 4px 6px rgba(0,0,0,0.3);">
                <div style="font-size:14px; color:#aaa; margin-bottom:5px;">📊 이번 판 완주자 평균</div>
                <div style="font-size:28px; font-weight:900;">${avg} 초</div>
                <div style="font-size:12px; color:#aaa; margin-top:5px;">(완주자 ${entries.length}명 기준)</div>
            </div>`;
        } 
        else if (mode === 'BEAT') {
            const targetId = store.settings.fiftyTargetId;
            const targetPlayer = store.players[targetId];
            if (targetPlayer) {
                const targetEntry = entries.find(e => e.id === targetId);
                if (targetEntry) {
                    const beaters = entries.filter(e => e.time < targetEntry.time);
                    extraHtml = `<div style="background:#2d3436; border:2px solid #ff7675; padding:15px; border-radius:8px; margin-bottom:15px;">
                        <div style="font-size:16px; color:#fff; margin-bottom:5px;">🎯 <b>${targetPlayer.name}</b>의 기록: <span style="color:#ff7675;">${targetEntry.time}초</span></div>
                        <div style="font-size:20px; font-weight:bold; color:#ffeaa7;">🎉 이긴 사람: ${beaters.length}명!</div>
                    </div>`;
                } else {
                    extraHtml = `<div style="background:#2d3436; padding:10px; border-radius:8px; margin-bottom:15px; color:#ffeaa7;">🎯 <b>${targetPlayer.name}</b> 학생이 완주하지 못했습니다.</div>`;
                }
            }
        }

        const finalMsg = extraHtml + `<div style="text-align:left; padding:0 10px;">${rankMsg}</div>`;
        logic.endGame("1 to 50 결과", winners, finalMsg || "완주자 없음");
    }
};
