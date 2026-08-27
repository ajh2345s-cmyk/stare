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
            const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive);
            const finished = alive.filter(p => p.fiftyFinished);
            if (alive.length > 0 && alive.length === finished.length) this.endGame(store, logic);
        }, 500);
    },

    handleInput: function(store, logic, socketId, num) {
        // [핵심 수정] 선생님이 게임을 강제 종료했으면(PLAYING이 아니면) 더 이상 입력받지 않음!
        if (store.gameState !== 'PLAYING') return;

        const p = store.players[socketId];
        if (!p || !p.isAlive || p.isAdmin || p.fiftyFinished) return;
        if (num === p.fiftyTarget) {
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

        // [수정됨] 10등 제한 없앰 (모든 학생 표시)
        let rankText = entries.map((e, i) => {
            if (e.finished) {
                return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1); align-items:center;">
                    <span style="color:#aaa; font-size:11px; width:30px;">${i+1}위</span>
                    <span style="font-weight:bold; flex:1; text-align:left; padding-left:5px;">${e.name}</span>
                    <span style="color:#55efc4; font-size:12px;">🏁 ${e.time}초</span>
                </div>`;
            } else {
                return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1); align-items:center;">
                    <span style="color:#aaa; font-size:11px; width:30px;">${i+1}위</span>
                    <span style="font-weight:bold; flex:1; text-align:left; padding-left:5px;">${e.name}</span>
                    <span style="color:#f1c40f; font-size:12px;">진행중(${e.score - 1})</span>
                </div>`;
            }
        }).join('');

        store.io.emit('liveRankUpdate', rankText || "<div style='color:#ccc; text-align:center;'>대기 중...</div>");
    },

    endGame: function(store, logic) {
        store.clearAllTimers();
        let entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin && store.players[id].isAlive)
            .map(id => ({ id: id, name: store.players[id].name, time: parseFloat(store.data.fiftyFinishTimes[id] || 999999) }))
            .filter(e => store.players[e.id].fiftyFinished)
            .sort((a, b) => a.time - b.time);

        let winners = entries.length > 0 ? [entries[0].name] : [];
        // [수정됨] 10등 제한 없앰 (완주한 모든 학생 표시)
        let rankMsg = entries.map((e, i) => `${i+1}위: ${e.name} (${e.time}초)`).join('<br>');

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