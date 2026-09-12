const { competitionRanks, rankLines } = require('../rankUtils');

const CONFIGS = {
    '2X2': { size: 4, boxRows: 2, boxCols: 2, clues: { EASY: 10, MEDIUM: 8, HARD: 6 } },
    '3X2': { size: 6, boxRows: 2, boxCols: 3, clues: { EASY: 24, MEDIUM: 19, HARD: 15 } },
    '3X3': { size: 9, boxRows: 3, boxCols: 3, clues: { EASY: 40, MEDIUM: 32, HARD: 25 } }
};

function shuffled(values) {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function groupedOrder(groupCount, groupSize) {
    const groups = shuffled(Array.from({ length: groupCount }, (_, i) => i));
    return groups.flatMap(group => shuffled(Array.from({ length: groupSize }, (_, i) => group * groupSize + i)));
}

function solvedGrid(config) {
    const { size, boxRows, boxCols } = config;
    const rows = groupedOrder(boxCols, boxRows);
    const cols = groupedOrder(boxRows, boxCols);
    const nums = shuffled(Array.from({ length: size }, (_, i) => i + 1));
    const pattern = (r, c) => (r * boxCols + Math.floor(r / boxRows) + c) % size;
    return rows.map(r => cols.map(c => nums[pattern(r, c)]));
}

function countSolutions(board, config, limit = 2) {
    const { size, boxRows, boxCols } = config;
    let count = 0;
    function candidates(row, col) {
        const used = new Set();
        for (let i = 0; i < size; i++) { used.add(board[row][i]); used.add(board[i][col]); }
        const r0 = Math.floor(row / boxRows) * boxRows;
        const c0 = Math.floor(col / boxCols) * boxCols;
        for (let r = r0; r < r0 + boxRows; r++) for (let c = c0; c < c0 + boxCols; c++) used.add(board[r][c]);
        const out = [];
        for (let n = 1; n <= size; n++) if (!used.has(n)) out.push(n);
        return out;
    }
    function solve() {
        if (count >= limit) return;
        let best = null;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            if (board[r][c] !== 0) continue;
            const choices = candidates(r, c);
            if (!choices.length) return;
            if (!best || choices.length < best.choices.length) best = { r, c, choices };
        }
        if (!best) { count++; return; }
        for (const n of best.choices) {
            board[best.r][best.c] = n; solve(); board[best.r][best.c] = 0;
            if (count >= limit) return;
        }
    }
    solve();
    return count;
}

function makePuzzle(config, difficulty) {
    const solution = solvedGrid(config);
    const puzzle = solution.map(row => row.slice());
    const target = config.clues[difficulty];
    let clues = config.size * config.size;
    for (const index of shuffled(Array.from({ length: clues }, (_, i) => i))) {
        if (clues <= target) break;
        const r = Math.floor(index / config.size), c = index % config.size;
        const value = puzzle[r][c];
        puzzle[r][c] = 0;
        if (countSolutions(puzzle.map(row => row.slice()), config, 2) !== 1) puzzle[r][c] = value;
        else clues--;
    }
    return { puzzle, solution, clueCount: clues, effort: estimateEffort(puzzle, config) };
}

function estimateEffort(source, config) {
    const board = source.map(row => row.slice());
    const { size, boxRows, boxCols } = config;
    let nodes = 0, branches = 0;
    function choices(row, col) {
        const used = new Set();
        for (let i = 0; i < size; i++) { used.add(board[row][i]); used.add(board[i][col]); }
        const r0 = Math.floor(row / boxRows) * boxRows, c0 = Math.floor(col / boxCols) * boxCols;
        for (let r = r0; r < r0 + boxRows; r++) for (let c = c0; c < c0 + boxCols; c++) used.add(board[r][c]);
        return Array.from({ length: size }, (_, i) => i + 1).filter(n => !used.has(n));
    }
    function solve() {
        nodes++;
        let best = null;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            if (board[r][c]) continue;
            const options = choices(r, c);
            if (!options.length) return false;
            if (!best || options.length < best.options.length) best = { r, c, options };
        }
        if (!best) return true;
        if (best.options.length > 1) branches++;
        for (const n of best.options) { board[best.r][best.c] = n; if (solve()) return true; board[best.r][best.c] = 0; }
        return false;
    }
    solve();
    const blanks = source.flat().filter(v => !v).length;
    return blanks + branches * size * 4 + Math.round(nodes / Math.max(1, size));
}

function makeRatedPuzzle(config, difficulty) {
    const candidates = Array.from({ length: 3 }, () => makePuzzle(config, difficulty)).sort((a, b) => a.effort - b.effort);
    if (difficulty === 'HARD') return candidates[candidates.length - 1];
    if (difficulty === 'MEDIUM') return candidates[Math.floor(candidates.length / 2)];
    return candidates[0];
}

function validBoard(board, puzzle, size) {
    if (!Array.isArray(board) || board.length !== size) return false;
    return board.every((row, r) => Array.isArray(row) && row.length === size && row.every((value, c) => {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 && n <= size && (!puzzle[r][c] || n === puzzle[r][c]);
    }));
}

module.exports = {
    CONFIGS,
    run(store, logic) {
        store.gameMode = 'SUDOKU';
        const type = CONFIGS[store.settings.sudokuType] ? store.settings.sudokuType : '2X2';
        const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(store.settings.sudokuDifficulty) ? store.settings.sudokuDifficulty : 'EASY';
        const config = CONFIGS[type];
        const generated = makeRatedPuzzle(config, difficulty);
        store.data.sudokuPuzzle = generated.puzzle;
        store.data.sudokuSolution = generated.solution;
        store.data.sudokuConfig = { type, difficulty, size: config.size, boxRows: config.boxRows, boxCols: config.boxCols, clueCount: generated.clueCount };
        store.data.sudokuStartTime = Date.now();
        store.data.sudokuScores = {};
        store.data.sudokuBoards = {};
        Object.values(store.players).forEach(p => {
            if (p.isAdmin) return;
            p.isAlive = true; p.sudokuFinished = false;
            store.data.sudokuScores[p.id] = { filled: generated.clueCount, finished: false, time: null, mistakes: 0 };
            store.data.sudokuBoards[p.id] = generated.puzzle.map(row => row.slice());
        });
        store.io.emit('sudokuStart', this.publicState(store));
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },
    publicState(store, socketId = null) {
        const savedBoard = socketId && store.data.sudokuBoards?.[socketId];
        return { puzzle: store.data.sudokuPuzzle, board: savedBoard || null, config: store.data.sudokuConfig, startTime: store.data.sudokuStartTime };
    },
    handleProgress(store, logic, socketId, board, submit = false) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'SUDOKU') return;
        const p = store.players[socketId];
        const config = store.data.sudokuConfig;
        if (!p || p.isAdmin || !p.isAlive || p.connected === false || p.sudokuFinished || !config) return;
        if (!validBoard(board, store.data.sudokuPuzzle, config.size)) return;
        const score = store.data.sudokuScores[socketId] || { filled: 0, finished: false, time: null, mistakes: 0 };
        score.filled = board.flat().filter(Boolean).length;
        store.data.sudokuBoards = store.data.sudokuBoards || {};
        store.data.sudokuBoards[socketId] = board.map(row => row.slice());
        const solved = board.every((row, r) => row.every((value, c) => value === store.data.sudokuSolution[r][c]));
        if (submit && !solved) {
            score.mistakes++;
            store.io.to(socketId).emit('sudokuFeedback', { correct: false, message: '아직 맞지 않는 칸이 있어요. 다시 확인해 보세요!' });
        } else if (submit && solved) {
            p.sudokuFinished = true; score.finished = true;
            score.time = Math.round((Date.now() - store.data.sudokuStartTime) / 10) / 100;
            store.io.to(socketId).emit('sudokuFeedback', { correct: true, message: `완성! ${score.time.toFixed(2)}초` });
        }
        store.data.sudokuScores[socketId] = score;
        this.updateRanking(store);
        const active = Object.values(store.players).filter(x => !x.isAdmin && x.isAlive && x.connected !== false);
        if (active.length && active.every(x => x.sudokuFinished)) this.endGame(store, logic);
    },
    rankedEntries(store) {
        const total = store.data.sudokuConfig?.size ** 2 || 0;
        const entries = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive).map(p => {
            const s = store.data.sudokuScores?.[p.id] || { filled: 0, finished: false, time: null, mistakes: 0 };
            return { id: p.id, name: p.name, ...s, total };
        }).sort((a, b) => Number(b.finished) - Number(a.finished) || (a.finished ? a.time - b.time : b.filled - a.filled) || a.name.localeCompare(b.name));
        return competitionRanks(entries, e => e.finished ? `F:${e.time}` : `P:${e.filled}`);
    },
    updateRanking(store) {
        const rows = this.rankedEntries(store).map(e => ({ rank: e.rank, name: e.name, value: e.finished ? `${e.time.toFixed(2)}초` : `${e.filled}/${e.total}칸`, status: e.finished ? '✅ 완성' : '풀이 중', tone: e.finished ? 'success' : 'progress' }));
        store.io.emit('liveRankUpdate', { rows });
    },
    endGame(store, logic) {
        const entries = this.rankedEntries(store).filter(e => e.finished);
        if (!entries.length) { logic.endGame('스도쿠 종료', [], '완성한 학생이 없습니다.'); return; }
        const winners = entries.filter(e => e.rank === 1).map(e => e.name);
        logic.endGame('🧩 스도쿠 결과', winners, rankLines(entries, e => `${e.time.toFixed(2)}초`));
    },
    _test: { countSolutions, makeRatedPuzzle, estimateEffort }
};
