module.exports = {
    io: null,
    players: {},
    gameMode: 'LOBBY',
    gameState: 'WAITING',
    adminId: null,
    serverTick: null,
    timerMain: null,
    timerTask: null,
    bombTick: null,

    data: {
        isLocked: false,
        updownTarget: 50,
        updownScores: {},
        fiftyStartTime: 0,
        fiftyScores: {},
        fiftyFinishTimes: {},
        fiftySeed: [],
        bondScores: {},
        bondStatus: {},
        
        // --- 새로 추가된 게임 데이터 ---
        wolfScores: {},
        wolfStatus: {},
        wolfRound: 0,
        currentWolfTarget: 1,

        missingScores: {},
        missingStatus: {},
        missingRound: 0,

        memoryScores: {},
        memoryStatus: {},
        memoryRound: 0,
        colorRound: 0,
        colorLock: false
    },

    settings: {
        updownMax: 100,
        bondMode: 'MIX',
        bondRanges: ['9'],
        bondDisplay: 'NUM',
        fiftyMode: 'NORMAL',
        fiftyTargetId: null,
        
        // --- 새로 추가된 게임 설정 ---
        wolfSpeed: 5,
        wolfShuffles: 15,
        wolfSheepCount: 8,
        wolfCount: 1,
        missingCategory: 'animal',
        missingSpeed: 10,
        missingCount: 5,
        missingOptionCount: 4,
        mathStairsMode: 'MATH',
        bombTime: 30
    },

    clearAllTimers() {
        if (this.timerMain) clearInterval(this.timerMain);
        if (this.timerTask) clearTimeout(this.timerTask);
        this.timerMain = null;
        this.timerTask = null;
        if (this.bombTick) clearInterval(this.bombTick);
        this.bombTick = null;
    }
};