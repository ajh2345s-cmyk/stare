function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function gridForCount(count) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return { cols, rows };
}

function randomDerangement(count) {
    if (count <= 1) return [0];
    const arr = Array.from({ length: count }, (_, i) => i);
    for (let attempt = 0; attempt < 50; attempt++) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (arr.every((v, i) => v !== i)) return arr.slice();
    }
    // deterministic fallback: cyclic shift
    return arr.map((_, i) => (i + 1) % count);
}

module.exports = {
    run: function(store, logic) {
        store.gameMode = 'WOLF';
        store.data.wolfScores = {};
        store.data.wolfStatus = {};
        store.data.wolfRound = 0;
        store.data.currentWolfTargets = [];
        const sheepCount = clampInt(store.settings.wolfSheepCount, 3, 60, 8);
        const wolfCount = clampInt(store.settings.wolfCount, 1, Math.min(10, sheepCount - 1), 1);
        store.settings.wolfSheepCount = sheepCount;
        store.settings.wolfCount = wolfCount;

        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.wolfScores[id] = 0;
                store.data.wolfStatus[id] = null;
            }
        });
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    nextRound: function(store) {
        store.data.wolfRound++;
        Object.keys(store.players).forEach(id => {
            if (!store.players[id].isAdmin) store.data.wolfStatus[id] = null;
        });

        const sheepCount = clampInt(store.settings.wolfSheepCount, 3, 60, 8);
        const wolfCount = clampInt(store.settings.wolfCount, 1, Math.min(10, sheepCount - 1), 1);
        const total = sheepCount + wolfCount;
        const targets = [];
        while (targets.length < wolfCount) {
            const idx = Math.floor(Math.random() * total);
            if (!targets.includes(idx)) targets.push(idx);
        }
        targets.sort((a,b) => a-b);
        store.data.currentWolfTargets = targets;

        const speed = clampInt(store.settings.wolfSpeed, 1, 10, 5);
        const shuffles = clampInt(store.settings.wolfShuffles, 1, 50, 15);
        const grid = gridForCount(total);
        const shuffleSteps = [];

        for (let k = 0; k < shuffles; k++) {
            shuffleSteps.push(randomDerangement(total));
        }

        store.io.emit('wolfStartRound', {
            round: store.data.wolfRound,
            targets,
            speed,
            shuffles,
            animalCount: total,
            sheepCount,
            wolfCount,
            gridCols: grid.cols,
            gridRows: grid.rows,
            shuffleSteps
        });
        this.updateAdminStatus(store);
        this.updateRanking(store);
    },

    handleInput: function(store, logic, socketId, index) {
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.isAdmin || store.data.wolfStatus[socketId] !== null) return;

        const targets = Array.isArray(store.data.currentWolfTargets) ? store.data.currentWolfTargets : [];
        const selected = Number.parseInt(index, 10);
        const correct = targets.includes(selected);

        if (correct) {
            store.data.wolfScores[socketId]++;
            store.data.wolfStatus[socketId] = 'correct';
        } else {
            store.data.wolfStatus[socketId] = 'wrong';
        }

        store.io.to(socketId).emit('wolfResult', { correct, targets });
        this.updateAdminStatus(store);
        this.updateRanking(store);

        const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive);
        if (alive.length > 0 && alive.every(pl => store.data.wolfStatus[pl.id] !== null)) {
            store.io.emit('wolfRoundComplete');
        }
    },

    forceRoundEnd: function(store) {
        const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive);
        alive.forEach(p => {
            if (store.data.wolfStatus[p.id] === null) store.data.wolfStatus[p.id] = 'wrong';
        });
        this.updateAdminStatus(store);
        this.updateRanking(store);
    },

    updateAdminStatus: function(store) {
        const correct = [], wrong = [], yet = [];
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p || p.isAdmin) return;
            const stat = store.data.wolfStatus?.[id];
            if (stat === 'correct') correct.push(`${p.name} (${store.data.wolfScores[id] || 0}점)`);
            else if (stat === 'wrong') wrong.push(`${p.name} (${store.data.wolfScores[id] || 0}점)`);
            else yet.push(p.name);
        });
        store.io.emit('statusBoardUpdate', {
            correct, wrong, yet,
            message: `🐺 ${store.data.wolfRound}라운드 · 늑대 ${store.settings.wolfCount}마리 · 양 ${store.settings.wolfSheepCount}마리`
        });
    },

    updateRanking: function(store) {
        const entries = Object.entries(store.data.wolfScores || {})
            .filter(([id]) => store.players[id] && !store.players[id].isAdmin)
            .sort((a,b) => (b[1] || 0) - (a[1] || 0));
        const rankText = entries.map((entry, i) => {
            const p = store.players[entry[0]];
            return `<div style="display:flex;justify-content:space-between;gap:4px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);align-items:center;">
                <span style="color:#aaa;font-size:11px;width:28px;">${i+1}위</span>
                <span style="font-weight:bold;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:4px;">${p.name}</span>
                <span style="color:#f1c40f;font-weight:bold;font-size:13px;">${entry[1] || 0}점</span></div>`;
        }).join('');
        store.io.emit('liveRankUpdate', rankText || "<div style='color:#ccc;text-align:center;'>대기 중...</div>");
    },

    endGame: function(store, logic) {
        const entries = Object.entries(store.data.wolfScores || {})
            .filter(([id]) => store.players[id] && !store.players[id].isAdmin)
            .sort((a,b) => (b[1] || 0) - (a[1] || 0));
        if (entries.length === 0) {
            logic.endGame('늑대를 찾아라 종료', [], '참여한 학생이 없습니다.');
            return;
        }
        const winners = entries.filter(e => e[1] === entries[0][1]).map(e => store.players[e[0]].name);
        const rankMsg = entries.slice(0, 10).map((e, i) => `${i+1}위: ${store.players[e[0]].name} (${e[1]}점)`).join('<br>');
        logic.endGame('🐺 늑대를 찾아라! 명예의 전당', winners, rankMsg);
    }
};
