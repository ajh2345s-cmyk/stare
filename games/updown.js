// games/updown.js
const { competitionRanks, rankLines } = require('../rankUtils');
module.exports = {
    run: function(store, logic) {
        store.gameMode = 'UPDOWN';
        store.data.updownScores = {}; 
        
        // 업다운 게임은 기본적으로 자동 모드로 설정
        store.isAutoMode = true;
        store.io.emit('autoModeStatus', true);

        const max = parseInt(store.settings.updownMax) || 100;
        store.data.updownTarget = Math.floor(Math.random() * max) + 1; 
        
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                p.x = 50; p.y = 50;
                p.updownFinished = false; 
                p.updownAttempts = 0;     
                store.data.updownScores[id] = 0;
            }
        });

        store.io.emit('updownStart', { max: max });
        
        // [중요] 관리자에게만 정답 전송
        if(store.adminId) {
            store.io.to(store.adminId).emit('updownAnswer', store.data.updownTarget);
        }

        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    handleInput: function(store, logic, socketId, number) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'UPDOWN') return;
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin || p.updownFinished) return;

        const target = store.data.updownTarget;
        const guess = Number.parseInt(number, 10);
        if (!Number.isInteger(guess) || guess < 1 || guess > Number(store.settings.updownMax)) return;
        
        p.updownAttempts++;
        store.data.updownScores[socketId] = p.updownAttempts;

        let result = '';
        if (guess < target) result = 'UP';
        else if (guess > target) result = 'DOWN';
        else result = 'CORRECT';

        if (result === 'CORRECT') {
            p.updownFinished = true;
            // 정답자 알림은 채팅창이 너무 도배될 수 있으므로 선택사항. 여기선 뺌.
        }

        store.io.to(socketId).emit('updownResult', { 
            guess: guess, 
            result: result 
        });

        this.updateRanking(store);
        this.checkFinish(store, logic);
    },

    checkFinish: function(store, logic) {
        const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive && p.connected !== false);
        const finished = alive.filter(p => p.updownFinished);

        // 살아있는 전원이 정답을 맞추면 종료
        if (alive.length > 0 && alive.length === finished.length) {
            this.updateRanking(store);
            
            // 시도 횟수 적은 순 1등 찾기
            let sorted = Object.entries(store.data.updownScores)
                .filter(([id]) => store.players[id] && store.players[id].updownFinished)
                .sort((a, b) => a[1] - b[1]);
            const ranked = competitionRanks(sorted.map(([id, attempts]) => ({ id, name: store.players[id].name, attempts })), e => e.attempts);

            let winners = [];
            if (sorted.length > 0) {
                winners = ranked.filter(r => r.rank === 1).map(r => r.name);
            }
            
            // [수정됨] 10등 제한 없앰 (모든 학생 표시)
            let rankMsg = rankLines(ranked, e => `${e.attempts}회`);

            logic.endGame("업다운 게임 종료", winners, rankMsg);
        }
    },

    updateRanking: function(store) {
        let entries = Object.entries(store.data.updownScores).filter(([id, s]) => store.players[id]);
        
        entries.sort((a, b) => {
            const pA = store.players[a[0]];
            const pB = store.players[b[0]];
            if (pA.updownFinished && pB.updownFinished) return a[1] - b[1];
            if (pA.updownFinished) return -1;
            if (pB.updownFinished) return 1;
            return a[1] - b[1];
        });

        const ranked = competitionRanks(entries.map(([id, attempts]) => ({ id, attempts, player: store.players[id] })), e => `${e.player.updownFinished ? 'F' : 'P'}:${e.attempts}`);
        const rows = ranked.map(entry => {
            const p = entry.player;
            const status = p.updownFinished ? "✅" : "도전중";
            return { rank: entry.rank, name: p.name, value: `${entry.attempts}회`, status, tone: p.updownFinished ? 'success' : 'progress' };
        });
        store.io.emit('liveRankUpdate', { rows });
    }
};
