const crypto = require('crypto');
const { competitionRanks, rankLines } = require('../rankUtils');
module.exports = {
    run: function(store, logic) {
        store.gameMode = 'MATHSTAIRS';
        store._logic = logic;
        store.data.mathStairsScores = {};
        store.data.mathStairsSeed = crypto.randomBytes(4).readUInt32LE(0) >>> 0;
        store.data.mathStairsProblems = this.generateProblems(store.data.mathStairsSeed);
        store.data.mathStairsStarted = true;
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.mathStairsScores[id] = { floor: 1, score: 0, state: 'playing', character: 'circle', colorIndex: 0, x: 0, y: 0, facing: 1 };
            }
        });
        store.io.emit('mathStairsStart', {
            timestamp: Date.now(),
            mapSeed: store.data.mathStairsSeed,
            mathProblems: store.data.mathStairsProblems,
            mathMode: store.settings.mathStairsMode === 'NORMAL' ? 'NORMAL' : 'MATH'
        });
        this.updateRanking(store);
    },
    reset: function(store) {
        store.data.mathStairsScores = {};
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.mathStairsScores[id] = { floor: 1, score: 0, state: 'ready', character: 'circle', colorIndex: 0, x: 0, y: 0, facing: 1 };
            }
        });
    },
    handleProgress: function(store, socketId, data) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'MATHSTAIRS') return;
        if (store.data && store.data.mathStairsStarted !== true) return;
        const p = store.players[socketId];
        if (!p || p.isAdmin || p.connected === false || !p.isAlive) return;
        store.data.mathStairsScores = store.data.mathStairsScores || {};
        const prev = store.data.mathStairsScores[socketId] || { floor: 1, score: 0, state: 'ready' };
        const floor = Math.floor(Number(data && data.floor));
        const score = Math.floor(Number(data && data.score));
        if (!Number.isFinite(floor) || !Number.isFinite(score)) return;
        const prevFloor = Math.max(1, Number(prev.floor) || 1);
        const prevScore = Math.max(0, Number(prev.score) || 0);
        const isNormalStep = floor === prevFloor + 1 && score === prevScore + 1;
        const isPenalty = data?.state === 'penalty' && floor === Math.max(1, prevFloor - 15) && score === Math.max(0, floor - 1);
        const isInitial = prev.state === 'ready' && floor === 1 && score === 0;
        if (!isNormalStep && !isPenalty && !isInitial) return;
        const nextFloor = Math.min(10000, floor);
        const nextScore = Math.min(9999, score);
        store.data.mathStairsScores[socketId] = {
            floor: nextFloor,
            score: nextScore,
            state: 'playing',
            character: (data && ['circle','square','triangle'].includes(data.character)) ? data.character : (prev.character || 'circle'),
            colorIndex: Number.isInteger(Number(data && data.colorIndex)) ? Math.max(0, Math.min(5, Number(data.colorIndex))) : (Number.isInteger(prev.colorIndex) ? prev.colorIndex : 0),
            x: Number.isFinite(Number(data && data.x)) ? Number(data.x) : (Number(prev.x) || 0),
            y: Number.isFinite(Number(data && data.y)) ? Number(data.y) : (Number(prev.y) || 0),
            facing: Number(data && data.facing) < 0 ? -1 : 1
        };
        this.updateRanking(store);
    },
    handleProfile: function(store, socketId, data) {
        if ((store.gameState !== 'PLAYING' && store.gameState !== 'WAITING') || !String(store.gameMode).includes('MATHSTAIRS')) return;
        const p = store.players[socketId];
        if (!p || p.isAdmin || p.connected === false) return;
        store.data.mathStairsScores = store.data.mathStairsScores || {};
        const prev = store.data.mathStairsScores[socketId] || { floor: 1, score: 0, state: 'ready' };
        const character = ['circle','square','triangle'].includes(data && data.character) ? data.character : (prev.character || 'circle');
        const colorIndex = Number.isInteger(Number(data && data.colorIndex)) ? Math.max(0, Math.min(5, Number(data.colorIndex))) : (Number.isInteger(prev.colorIndex) ? prev.colorIndex : 0);
        store.data.mathStairsScores[socketId] = { ...prev, character, colorIndex };
        this.updateRanking(store);
    },
    handleGameOver: function(store, socketId, data, logic) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'MATHSTAIRS') return;
        const p = store.players[socketId];
        if (!p || p.isAdmin || p.connected === false || !p.isAlive) return;
        store.data.mathStairsScores = store.data.mathStairsScores || {};
        const prev = store.data.mathStairsScores[socketId] || { floor: 1, score: 0, state: 'ready' };
        const requestedFloor = Math.floor(Number(data && data.floor));
        const requestedScore = Math.floor(Number(data && data.score));
        const floor = requestedFloor === Number(prev.floor) ? requestedFloor : Number(prev.floor) || 1;
        const score = requestedScore === Number(prev.score) ? requestedScore : Number(prev.score) || 0;
        store.data.mathStairsScores[socketId] = {
            ...prev,
            floor,
            score,
            state: 'gameover'
        };
        this.updateRanking(store);

        // 모든 학생의 플레이가 끝나면 교사의 추가 조작 없이 기존 결과 화면을 자동으로 띄운다.
        const students = this.listActiveStudentIds(store);
        const scores = store.data.mathStairsScores;
        const allFinished = students.length > 0 && students.every(id => scores[id] && scores[id].state === 'gameover');
        if (allFinished && store.gameState === 'PLAYING') {
            if (logic && typeof logic.endGame === 'function') this.endGame(store, logic);

        }
    },

    handleDisconnect: function(store, socketId) {
        const scores = store.data.mathStairsScores || {};
        if (!scores[socketId]) return;
        delete scores[socketId];
        this.updateRanking(store);
        const students = this.listActiveStudentIds(store);
        if (students.length > 0 && students.every(id => scores[id] && scores[id].state === 'gameover')) {
            this.endGame(store, store._logic || null);
        }
    },
    listActiveStudentIds: function(store) {
        return Object.keys(store.players).filter(id => !store.players[id].isAdmin && store.players[id].isAlive && store.players[id].connected !== false);
    },
    updateRanking: function(store) {
        const entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin)
            .map(id => {
                const s = (store.data.mathStairsScores || {})[id] || { floor: 1, score: 0, state: 'ready' };
                return { id, name: store.players[id].name, floor: s.floor || 1, score: s.score || 0, state: s.state || 'ready', character: s.character || 'circle', colorIndex: Number.isInteger(s.colorIndex) ? s.colorIndex : 0, x: Number(s.x)||0, y: Number(s.y)||0, facing: Number(s.facing)<0 ? -1 : 1 };
            })
            .sort((a,b) => b.floor - a.floor || b.score - a.score || a.name.localeCompare(b.name));
        const ranked = competitionRanks(entries, e => `${e.floor}:${e.score}`);
        const rows = ranked.map(e => {
            const stateText = e.state === 'gameover' ? '💥 끝' : (e.state === 'ready' ? '⏳ 대기' : '▶ 진행');
            return { rank: e.rank, name: e.name, value: `${e.floor}층`, status: stateText, tone: e.state === 'gameover' ? 'success' : 'progress' };
        });
        store.io.emit('liveRankUpdate', { rows });
        store.io.emit('mathStairsPlayersUpdate', entries.map(e => ({ id:e.id, name:e.name, floor:e.floor, score:e.score, state:e.state, character:e.character || 'circle', colorIndex:Number.isInteger(e.colorIndex)?e.colorIndex:0, x:e.x, y:e.y, facing:e.facing })));
    },
    generateProblems: function(seed) {
        // 게임 시작 때 서버에서 한 번 생성하고 모든 학생에게 같은 문제 세트를 전달한다.
        let t = (Number(seed) >>> 0) || 1;
        const rand = () => {
            t = (t + 0x6D2B79F5) >>> 0;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
        const problems = {};
        for (let floor = 25; floor <= 10000; floor += 25) {
            const plus = rand() < 0.5;
            let a, b;
            if (plus) {
                a = Math.floor(rand() * 11);
                b = Math.floor(rand() * (11 - a));
            } else {
                a = Math.floor(rand() * 11);
                b = Math.floor(rand() * (a + 1));
            }
            problems[floor] = plus
                ? { q: `${a} + ${b} = ?`, answer: a + b }
                : { q: `${a} − ${b} = ?`, answer: a - b };
        }
        return problems;
    },
    endGame: function(store, logic) {
        const entries = Object.keys(store.players)
            .filter(id => !store.players[id].isAdmin)
            .map(id => {
                const s = (store.data.mathStairsScores || {})[id] || { floor: 1, score: 0 };
                return { name: store.players[id].name, floor: s.floor || 1, score: s.score || 0 };
            })
            .sort((a,b) => b.floor - a.floor || b.score - a.score);
        const ranked = competitionRanks(entries, e => `${e.floor}:${e.score}`);
        const winners = ranked.filter(e => e.rank === 1).map(e => e.name);
        const rankMsg = rankLines(ranked, e => `${e.floor}층`);
        logic.endGame('🪜 수학의 계단 결과', winners, rankMsg || '참여한 학생이 없습니다.');
    }
};
