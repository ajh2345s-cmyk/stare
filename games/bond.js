module.exports = {
    run: function(store, logic) {
        store.gameMode = 'BOND';
        store.data.bondScores = {}; 
        store.data.bondStatus = {}; 
        
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true;
                store.data.bondScores[id] = 0;
                store.data.bondStatus[id] = null;
            }
        });

        this.makeNewProblem(store);
    },

    nextProblem: function(store) {
        Object.keys(store.players).forEach(id => {
            if(!store.players[id].isAdmin) store.data.bondStatus[id] = null;
        });
        this.makeNewProblem(store);
    },

    makeNewProblem: function(store) {
        const mode = store.settings.bondMode || 'MIX'; 
        let ranges = store.settings.bondRanges || ['9'];
        if (ranges.length === 0) ranges = ['9'];
        const display = store.settings.bondDisplay || 'NUM';

        const selectedRange = ranges[Math.floor(Math.random() * ranges.length)];

        let whole, part1, part2;
        if (selectedRange === '9') {
            whole = Math.floor(Math.random() * 8) + 2;
            part1 = Math.floor(Math.random() * (whole - 1)) + 1;
            part2 = whole - part1;
        } 
        else if (selectedRange === '10') {
            whole = 10;
            part1 = Math.floor(Math.random() * 9) + 1;
            part2 = 10 - part1;
        }
        else if (selectedRange === '19_BASIC') {
            whole = Math.floor(Math.random() * 9) + 11;
            if (Math.random() < 0.5) { part1 = 10; part2 = whole - 10; } 
            else { part1 = whole - 10; part2 = 10; }
        }
        else if (selectedRange === '19_HARD') {
            whole = Math.floor(Math.random() * 8) + 11;
            do { part1 = Math.floor(Math.random() * (whole - 2)) + 2; } while (part1 === 10 || (whole - part1) === 10);
            part2 = whole - part1;
        }
        else {
            whole = Math.floor(Math.random() * 8) + 2;
            part1 = Math.floor(Math.random() * (whole - 1)) + 1;
            part2 = whole - part1;
        }

        let currentType = mode;
        if (currentType === 'MIX') currentType = Math.random() < 0.5 ? 'SPLIT' : 'GATHER';

        let targetPos = '';
        if (currentType === 'GATHER') targetPos = 'top'; 
        else targetPos = Math.random() < 0.5 ? 'left' : 'right'; 

        let showType = display;
        if (showType === 'MIX') showType = Math.random() < 0.5 ? 'NUM' : 'DOT';

        const problem = { whole, part1, part2, targetPos, displayType: showType };
        store.data.currentBondProblem = problem;

        store.io.emit('bondNext', problem);
        this.updateAdminStatus(store);
    },

    handleInput: function(store, logic, socketId, answer) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'BOND') return;
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin) return;
        if (store.data.bondStatus[socketId] !== null) return; 
        const parsedAnswer = Number.parseInt(answer, 10);
        if (!Number.isInteger(parsedAnswer) || parsedAnswer < 0 || parsedAnswer > 100) return;

        const prob = store.data.currentBondProblem;
        let correctAnswer;

        if (prob.targetPos === 'top') correctAnswer = prob.whole;
        else if (prob.targetPos === 'left') correctAnswer = prob.part1;
        else correctAnswer = prob.part2;

        if (parsedAnswer === correctAnswer) {
            store.data.bondScores[socketId]++;
            store.data.bondStatus[socketId] = 'correct';
            store.io.to(socketId).emit('bondCorrect');
        } else {
            store.data.bondStatus[socketId] = 'wrong';
            store.io.to(socketId).emit('bondWrong');
        }

        this.updateRanking(store);
        this.updateAdminStatus(store);
    },

    // [핵심 추가] 트롤 방지용 미응답자 강제 오답 처리
    forceRoundEnd: function(store, logic) {
        Object.values(store.players).forEach(p => {
            if (!p.isAdmin && p.isAlive && p.connected !== false && store.data.bondStatus[p.id] === null) {
                store.data.bondStatus[p.id] = 'wrong';
                store.io.to(p.id).emit('bondWrong');
            }
        });
        store.io.emit('statusBoardUpdate', { message: '✨ 미응답자 강제 처리 완료! [다음 문제]를 눌러주세요.' });
        this.updateAdminStatus(store);
    },

    updateAdminStatus: function(store) {
        if (!store.adminId) return;
        const statusList = { correct: [], wrong: [], yet: [] };
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (p.isAdmin) return;
            const stat = store.data.bondStatus[id];
            if (stat === 'correct') statusList.correct.push(p.name);
            else if (stat === 'wrong') statusList.wrong.push(p.name);
            else if (p.connected !== false) statusList.yet.push(p.name);
        });
        store.io.to(store.adminId).emit('statusBoardUpdate', statusList);
    },

    updateRanking: function(store) {
        let entries = Object.entries(store.data.bondScores)
            .filter(([id, s]) => store.players[id] && !store.players[id].isAdmin)
            .sort((a, b) => b[1] - a[1]);

        const rows = entries.map((entry, i) => {
            const p = store.players[entry[0]];
            return { rank: i + 1, name: p.name, value: `${entry[1]}개`, tone: 'progress' };
        });
        store.io.emit('liveRankUpdate', { rows });
    },

    endGame: function(store, logic) {
        let entries = Object.entries(store.data.bondScores)
            .filter(([id, s]) => store.players[id] && !store.players[id].isAdmin)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) { logic.endGame("가르기 모으기 종료", [], "참여한 학생이 없습니다."); return; }

        let finalRank = [];
        let currentRank = 1;
        for (let i = 0; i < entries.length; i++) {
            const [id, score] = entries[i];
            const name = store.players[id].name;
            if (i > 0 && score === entries[i-1][1]) {
                finalRank[finalRank.length - 1].names.push(name);
            } else {
                if (currentRank > 3) break; 
                finalRank.push({ rank: currentRank, score: score, names: [name] });
                currentRank++;
            }
        }

        let htmlMsg = finalRank.map(r => `<div style="margin:5px 0;"><span style="font-size:20px; color:#f1c40f;">${r.rank}등</span> <span style="font-size:14px;">(${r.score}개)</span><br><span style="font-weight:bold; font-size:18px;">${r.names.join(', ')}</span></div>`).join('<hr style="border:0; border-top:1px dashed #aaa; margin:5px 0;">');
        logic.endGame("🎉 명예의 전당 (Top 3)", [], htmlMsg);
    }
};
