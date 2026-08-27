module.exports = {
    run: function(store, logic) {
        store.gameMode = 'WOLF';
        store.data.wolfScores = {}; store.data.wolfStatus = {}; store.data.wolfRound = 0;
        
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true; store.data.wolfScores[id] = 0; store.data.wolfStatus[id] = null;
            }
        });
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    nextRound: function(store) {
        store.data.wolfRound++;
        Object.keys(store.players).forEach(id => { if(!store.players[id].isAdmin) store.data.wolfStatus[id] = null; });

        const count = store.settings.wolfCount || 3;
        const targetIndex = Math.floor(Math.random() * count);
        store.data.currentWolfTarget = targetIndex;
        
        const speed = store.settings.wolfSpeed || 5;
        const shuffles = store.settings.wolfShuffles || 15;

        // [핵심 수정] 모든 학생이 100% 동일하게 움직이도록 서버에서 명확한 교환(Swap) 지시도 생성
        let shuffleSteps = [];
        for(let i=0; i<shuffles; i++) {
            let p1 = Math.floor(Math.random() * count);
            let p2 = Math.floor(Math.random() * count);
            while(p1 === p2) p2 = Math.floor(Math.random() * count);
            
            shuffleSteps.push({
                p1: p1,
                p2: p2,
                isPara: Math.random() > 0.5 // 포물선으로 뛸지 직선으로 갈지 결정
            });
        }

        store.io.emit('wolfStartRound', { round: store.data.wolfRound, target: targetIndex, speed, shuffles, animalCount: count, shuffleSteps });
        this.updateAdminStatus(store);
        this.updateRanking(store);
    },

    handleInput: function(store, logic, socketId, index) {
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.isAdmin || store.data.wolfStatus[socketId] !== null) return; 

        if (index === store.data.currentWolfTarget) {
            store.data.wolfScores[socketId]++; store.data.wolfStatus[socketId] = 'correct';
            store.io.to(socketId).emit('wolfResult', { correct: true, target: store.data.currentWolfTarget });
        } else {
            store.data.wolfStatus[socketId] = 'wrong';
            store.io.to(socketId).emit('wolfResult', { correct: false, target: store.data.currentWolfTarget });
        }

        this.updateRanking(store); this.updateAdminStatus(store);

        const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive);
        const answered = alive.filter(p => store.data.wolfStatus[p.id] !== null);
        if (alive.length > 0 && alive.length === answered.length) store.io.emit('wolfRoundComplete');
    },

    forceRoundEnd: function(store, logic) {
        Object.values(store.players).forEach(p => {
            if (!p.isAdmin && p.isAlive && store.data.wolfStatus[p.id] === null) {
                store.data.wolfStatus[p.id] = 'wrong';
                store.io.to(p.id).emit('wolfResult', { correct: false, target: store.data.currentWolfTarget });
            }
        });
        store.io.emit('wolfRoundComplete');
        this.updateRanking(store); this.updateAdminStatus(store);
    },

    updateAdminStatus: function(store) {
        if (!store.adminId) return;
        const statusList = { correct: [], wrong: [], yet: [] };
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (p.isAdmin) return;
            const stat = store.data.wolfStatus[id];
            if (stat === 'correct') statusList.correct.push(p.name);
            else if (stat === 'wrong') statusList.wrong.push(p.name);
            else statusList.yet.push(p.name);
        });
        store.io.to(store.adminId).emit('statusBoardUpdate', statusList);
    },

    updateRanking: function(store) {
        let entries = Object.entries(store.data.wolfScores).filter(([id]) => store.players[id] && !store.players[id].isAdmin).sort((a, b) => b[1] - a[1]);
        let rankText = entries.map((entry, i) => {
            const p = store.players[entry[0]];
            return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1); align-items:center;">
                <span style="color:#aaa; font-size:11px; width:30px;">${i+1}위</span>
                <span style="font-weight:bold; flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:5px;">${p.name}</span>
                <span style="color:#f1c40f; font-weight:bold; font-size:13px;">${entry[1]}점</span></div>`;
        }).join('');
        store.io.emit('liveRankUpdate', rankText || "<div style='color:#ccc; text-align:center;'>대기 중...</div>");
    },

    endGame: function(store, logic) {
        let entries = Object.entries(store.data.wolfScores).filter(([id]) => store.players[id] && !store.players[id].isAdmin).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) { logic.endGame("늑대를 찾아라 종료", [], "참여한 학생이 없습니다."); return; }
        let winners = entries.filter(e => e[1] === entries[0][1]).map(e => store.players[e[0]].name);
        let rankMsg = entries.slice(0, 10).map((e, i) => `${i+1}위: ${store.players[e[0]].name} (${e[1]}점)`).join('<br>');
        logic.endGame("🐺 늑대를 찾아라! 명예의 전당", winners, rankMsg);
    }
};