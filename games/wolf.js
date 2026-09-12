const { competitionRanks, rankLines } = require('../rankUtils');
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
    if (count <= 1) return Array.from({ length: count }, (_, i) => i);
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

function randomAdjacentPermutation(count, cols, rows) {
    if (count <= 1) return Array.from({ length: count }, (_, i) => i);

    // 한 번의 섞기에서는 상/하/좌/우/대각선 한 칸 거리의 동물끼리만 교환한다.
    const mapping = Array.from({ length: count }, (_, i) => i);
    const shuffled = Array.from({ length: count }, (_, i) => i);
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const used = new Set();
    const directions = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0],          [1,  0],
        [-1,  1], [0,  1], [1,  1]
    ];

    for (const from of shuffled) {
        if (used.has(from)) continue;
        const col = from % cols;
        const row = Math.floor(from / cols);
        const candidates = [];

        for (const [dx, dy] of directions) {
            const nc = col + dx;
            const nr = row + dy;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const to = nr * cols + nc;
            if (to >= count || used.has(to) || to === from) continue;
            candidates.push(to);
        }

        if (candidates.length && Math.random() < 0.82) {
            const to = candidates[Math.floor(Math.random() * candidates.length)];
            mapping[from] = to;
            mapping[to] = from;
            used.add(from);
            used.add(to);
        }
    }

    return mapping;
}

module.exports = {
    run: function(store, logic) {
        store.gameMode = 'WOLF';
        store.data.wolfScores = {};
        store.data.wolfStatus = {};
        store.data.wolfFound = {};
        store.data.wolfRound = 0;
        store.data.currentWolfTargets = [];
        const sheepCount = clampInt(store.settings.wolfSheepCount, 1, 60, 8);
        const wolfCount = clampInt(store.settings.wolfCount, 1, Math.min(10, sheepCount + 1), 1);
        store.settings.wolfSheepCount = sheepCount;
        store.settings.wolfCount = wolfCount;

        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.wolfScores[id] = 0;
                store.data.wolfStatus[id] = null;
                store.data.wolfFound[id] = [];
            }
        });
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    nextRound: function(store) {
        store.data.wolfRound++;
        Object.keys(store.players).forEach(id => {
            if (!store.players[id].isAdmin) {
                store.data.wolfStatus[id] = null;
                store.data.wolfFound[id] = [];
            }
        });

        const sheepCount = clampInt(store.settings.wolfSheepCount, 1, 60, 8);
        const wolfCount = clampInt(store.settings.wolfCount, 1, Math.min(10, sheepCount + 1), 1);
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
            shuffleSteps.push(randomAdjacentPermutation(total, grid.cols, grid.rows));
        }

        let finalTargets = targets.slice();
        for (const mapping of shuffleSteps) {
            finalTargets = finalTargets.map(pos => mapping[pos]).sort((a,b) => a-b);
        }
        store.data.currentWolfTargets = finalTargets;

        store.io.emit('wolfStartRound', {
            round: store.data.wolfRound,
            targets,
            finalTargets,
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
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'WOLF') return;
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin || store.data.wolfStatus[socketId] !== null) return;

        const targets = Array.isArray(store.data.currentWolfTargets) ? store.data.currentWolfTargets : [];
        const selected = Number.parseInt(index, 10);
        if (!Number.isInteger(selected) || selected < 0 || selected >= (Number(store.settings.wolfSheepCount) + Number(store.settings.wolfCount))) return;

        store.data.wolfFound[socketId] = Array.isArray(store.data.wolfFound[socketId]) ? store.data.wolfFound[socketId] : [];
        if (store.data.wolfFound[socketId].includes(selected)) return;

        const isWolf = targets.includes(selected);
        if (!isWolf) {
            store.data.wolfStatus[socketId] = 'wrong';
            store.io.to(socketId).emit('wolfResult', { correct: false, complete: true, foundCount: store.data.wolfFound[socketId].length, wolfCount: targets.length, targets });
        } else {
            store.data.wolfFound[socketId].push(selected);
            const foundCount = store.data.wolfFound[socketId].length;
            const complete = foundCount >= targets.length;
            if (complete) {
                store.data.wolfScores[socketId]++;
                store.data.wolfStatus[socketId] = 'correct';
            }
            store.io.to(socketId).emit('wolfResult', { correct: true, complete, foundCount, wolfCount: targets.length, targets });
        }

        this.updateAdminStatus(store);
        this.updateRanking(store);

        const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive && pl.connected !== false);
        if (alive.length > 0 && alive.every(pl => store.data.wolfStatus[pl.id] !== null)) {
            store.io.emit('wolfRoundComplete');
        }
    },

    forceRoundEnd: function(store) {
        const alive = Object.values(store.players).filter(pl => !pl.isAdmin && pl.isAlive && pl.connected !== false);
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
            else if (p.connected !== false) yet.push(p.name);
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
        const ranked = competitionRanks(entries.map(([id, score]) => ({ id, score: score || 0 })), e => e.score);
        const rows = ranked.map(entry => {
            const p = store.players[entry.id];
            return { rank: entry.rank, name: p.name, value: `${entry.score}점`, tone: 'progress' };
        });
        store.io.emit('liveRankUpdate', { rows });
    },

    endGame: function(store, logic) {
        const entries = Object.entries(store.data.wolfScores || {})
            .filter(([id]) => store.players[id] && !store.players[id].isAdmin)
            .sort((a,b) => (b[1] || 0) - (a[1] || 0));
        if (entries.length === 0) {
            logic.endGame('늑대를 찾아라 종료', [], '참여한 학생이 없습니다.');
            return;
        }
        const ranked = competitionRanks(entries.map(([id, score]) => ({ name: store.players[id].name, score })), e => e.score);
        const winners = ranked.filter(e => e.rank === 1).map(e => e.name);
        const rankMsg = rankLines(ranked.slice(0, 10), e => `${e.score}점`);
        logic.endGame('🐺 늑대를 찾아라! 명예의 전당', winners, rankMsg);
    }
};
