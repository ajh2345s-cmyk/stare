module.exports = {
    run: function(store, logic) {
        store.gameMode = 'MATHSTAIRS';
        store.data.mathStairsScores = {};
        store.data.mathStairsSeed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.mathStairsScores[id] = { floor: 1, score: 0, state: 'ready' };
            }
        });
        store.io.emit('mathStairsStart', { timestamp: Date.now(), mapSeed: store.data.mathStairsSeed });
        this.updateRanking(store);
    },
    reset: function(store) {
        store.data.mathStairsScores = {};
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.mathStairsScores[id] = { floor: 1, score: 0, state: 'ready' };
            }
        });
    },
    handleProgress: function(store, socketId, data) {
        if (store.gameState !== 'PLAYING') return;
        const p = store.players[socketId];
        if (!p || p.isAdmin) return;
        store.data.mathStairsScores = store.data.mathStairsScores || {};
        const prev = store.data.mathStairsScores[socketId] || { floor: 1, score: 0, state: 'ready' };
        const floor = Math.max(1, Number(data && data.floor) || 1);
        const score = Math.max(0, Number(data && data.score) || 0);
        // Client sends progress only; never let an accidental rollback reduce a student's visible rank.
        const isPenalty = data && data.state === 'penalty';
        const nextFloor = isPenalty ? floor : Math.max(prev.floor, floor);
        const nextScore = isPenalty ? score : Math.max(prev.score, score);
        store.data.mathStairsScores[socketId] = {
            floor: nextFloor,
            score: nextScore,
            state: (data && data.state) || 'playing',
            character: (data && ['circle','square','triangle'].includes(data.character)) ? data.character : (prev.character || 'circle'),
            colorIndex: Number.isInteger(Number(data && data.colorIndex)) ? Math.max(0, Math.min(5, Number(data.colorIndex))) : (Number.isInteger(prev.colorIndex) ? prev.colorIndex : 0)
        };
        this.updateRanking(store);
    },
    handleGameOver: function(store, socketId, data, logic) {
        if (store.gameState !== 'PLAYING') return;
        const p = store.players[socketId];
        if (!p || p.isAdmin) return;
        store.data.mathStairsScores = store.data.mathStairsScores || {};
        const prev = store.data.mathStairsScores[socketId] || { floor: 1, score: 0, state: 'ready' };
        const floor = Math.max(1, Number(data && data.floor) || prev.floor || 1);
        const score = Math.max(0, Number(data && data.score) || prev.score || 0);
        store.data.mathStairsScores[socketId] = {
            ...prev,
            floor: Math.max(prev.floor || 1, floor),
            score: Math.max(prev.score || 0, score),
            state: 'gameover'
        };
        this.updateRanking(store);

        // 모든 학생의 플레이가 끝나면 교사의 추가 조작 없이 기존 결과 화면을 자동으로 띄운다.
        const students = Object.keys(store.players).filter(id => !store.players[id].isAdmin);
        const scores = store.data.mathStairsScores;
        const allFinished = students.length > 0 && students.every(id => scores[id] && scores[id].state === 'gameover');
        if (allFinished && store.gameState === 'PLAYING') {
            if (logic && typeof logic.endGame === 'function') this.endGame(store, logic);

        }
    },
    updateRanking: function(store) {
        const entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin)
            .map(id => {
                const s = (store.data.mathStairsScores || {})[id] || { floor: 1, score: 0, state: 'ready' };
                return { id, name: store.players[id].name, floor: s.floor || 1, score: s.score || 0, state: s.state || 'ready', character: s.character || 'circle', colorIndex: Number.isInteger(s.colorIndex) ? s.colorIndex : 0 };
            })
            .sort((a,b) => b.floor - a.floor || b.score - a.score || a.name.localeCompare(b.name));
        const rankText = entries.map((e,i) => {
            const stateText = e.state === 'gameover' ? '💥 끝' : (e.state === 'ready' ? '⏳ 대기' : '▶ 진행');
            return `<div style="display:flex;justify-content:space-between;gap:4px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);align-items:center;">
                <span style="color:#aaa;font-size:11px;width:28px;">${i+1}위</span>
                <span style="font-weight:bold;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:4px;">${e.name}</span>
                <span style="color:#55efc4;font-weight:bold;font-size:12px;">${e.floor}층</span>
                <span style="color:#ffd166;font-size:10px;white-space:nowrap;">${stateText}</span>
            </div>`;
        }).join('');
        store.io.emit('liveRankUpdate', rankText || "<div style='color:#ccc;text-align:center;'>대기 중...</div>");
        store.io.emit('mathStairsPlayersUpdate', entries.map(e => ({ id:e.id, name:e.name, floor:e.floor, score:e.score, state:e.state, character:e.character || 'circle', colorIndex:Number.isInteger(e.colorIndex)?e.colorIndex:0 })));
    },
    endGame: function(store, logic) {
        const entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin)
            .map(id => {
                const s = (store.data.mathStairsScores || {})[id] || { floor: 1, score: 0 };
                return { name: store.players[id].name, floor: s.floor || 1, score: s.score || 0 };
            })
            .sort((a,b) => b.floor - a.floor || b.score - a.score);
        const winners = entries.length ? [entries[0].name] : [];
        const rankMsg = entries.map((e,i) => `${i+1}위: ${e.name} (${e.floor}층)`).join('<br>');
        logic.endGame('🪜 수학의 계단 결과', winners, rankMsg || '참여한 학생이 없습니다.');
    }
};
