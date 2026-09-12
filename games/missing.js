const CATEGORY_DB = {
    animal: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐒','🦍','🦧','🐕','🐺','🦝','🐅','🐆','🐴','🦓','🦌','🦬','🐄','🐏','🐐','🐪','🦒','🐘','🦏','🦛','🐁','🐇','🐿️','🦔','🦇','🦥','🦦','🦘','🦃','🐔','🐤','🐦','🐧','🦅','🦆','🦢','🦉','🦩','🦚','🦜','🐊','🐢','🦎','🐍','🐲','🦕','🦖','🐳','🐬','🦭','🐟','🐡','🦈','🐙','🦑','🦐','🦀','🐌','🦋','🐛','🐜','🐝','🐞','🦗','🕷️'],
    food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃'],
    object: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','📷','📸','📹','🎥','📞','☎️','📺','📻','🎙️','🧭','⏱️','⏰','⏳','🔋','🔌','💡','🔦','🕯️','💸','💵','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⛏️','🪚','⚙️','🧱','🧲','🔫','💣','🪓','🔪','🗡️','🛡️','🔮','🧿','🔭','🔬','🩹','🩺','💊','💉','🩸','🧬','🦠','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🧼','🪥','🧽','🪣','🔑','🚪','🪑','🛋️','🛏️','🧸','🖼️','🪞','🛍️','🛒','🎁','🎈','🎀','🪄','🎊','🎉','✉️','📦','🏷️','📫','📜','📄','📊','📅','🗑️','📁','📰','📓','📚','📖','✂️','펜','🔍'],
    vehicle: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚜','🛴','🚲','🛵','🏍️','🚨','🚔','🚍','🚡','🚠','🚃','🚋','🚄','🚅','🚂','🚆','🚇','🚉','✈️','🛫','🛩️','🚀','🛸','🚁','🛶','⛵','🚤','🛳️','🚢','⚓','🚥','🚦','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏝️','🌋','⛰️','🏕️','⛺','🏠','🏡','🏢','🏬','🏥','🏦','🏨','🏪','🏫','⛪'],
    character: ['👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🏃','💃','🕺','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🤸','🤼','🤽','🤹','🧑‍🍳','🧑‍🌾','🧑‍🏫','🧑‍🏭','🧑‍💻','🧑‍🔬','🧑‍🎨','🧑‍🚒','🧑‍🚀','🧑‍⚖️']
};
CATEGORY_DB.all = [...CATEGORY_DB.animal, ...CATEGORY_DB.food, ...CATEGORY_DB.object, ...CATEGORY_DB.vehicle, ...CATEGORY_DB.character];

module.exports = {
    run: function(store, logic) {
        store.gameMode = 'MISSING';
        store.data.missingScores = {}; store.data.missingStatus = {}; store.data.missingRound = 0;
        
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (!p.isAdmin) {
                p.isAlive = true; store.data.missingScores[id] = 0; store.data.missingStatus[id] = null;
            }
        });
        store.io.emit('updateUserList', store.players);
        this.updateRanking(store);
    },

    nextRound: function(store) {
        store.data.missingRound++;
        Object.keys(store.players).forEach(id => { if(!store.players[id].isAdmin) store.data.missingStatus[id] = null; });

        const category = CATEGORY_DB[store.settings.missingCategory] ? store.settings.missingCategory : 'animal';
        const speed = Math.max(1, Math.min(30, Number.parseInt(store.settings.missingSpeed, 10) || 10));
        const sourcePool = CATEGORY_DB[category];
        const flashCount = Math.max(2, Math.min(sourcePool.length - 1, Number.parseInt(store.settings.missingCount, 10) || 5));
        const optionCount = Math.max(2, Math.min(12, flashCount + 1, Number.parseInt(store.settings.missingOptionCount, 10) || 4));

        let pool = [...sourcePool].sort(() => Math.random() - 0.5);
        let shownEmojis = pool.slice(0, flashCount);
        let correctAnswer = pool[flashCount];
        store.data.currentMissingTarget = correctAnswer;

        let wrongOptions = [...shownEmojis].sort(() => Math.random() - 0.5).slice(0, optionCount - 1);
        let options = [...wrongOptions, correctAnswer].sort(() => Math.random() - 0.5);

        store.io.emit('missingStartRound', { round: store.data.missingRound, shownEmojis, options, speed: speed * 100 });
        this.updateAdminStatus(store);
        this.updateRanking(store);
    },

    handleInput: function(store, logic, socketId, choice) {
        if (store.gameState !== 'PLAYING' || store.gameMode !== 'MISSING') return;
        const p = store.players[socketId];
        if (!p || !p.isAlive || p.connected === false || p.isAdmin || store.data.missingStatus[socketId] !== null) return; 
        if (typeof choice !== 'string' || !choice || choice.length > 16) return;

        if (choice === store.data.currentMissingTarget) {
            // [NaN 방지]
            store.data.missingScores[socketId] = (store.data.missingScores[socketId] || 0) + 1; 
            store.data.missingStatus[socketId] = 'correct';
            store.io.to(socketId).emit('missingResult', { correct: true });
        } else {
            store.data.missingStatus[socketId] = 'wrong';
            store.io.to(socketId).emit('missingResult', { correct: false });
        }

        this.updateRanking(store); this.updateAdminStatus(store);

        const alive = Object.values(store.players).filter(p => !p.isAdmin && p.isAlive && p.connected !== false);
        const answered = alive.filter(p => store.data.missingStatus[p.id] !== null);
        
        if (alive.length > 0 && alive.length === answered.length) {
            // [핵심 추가] 전원 선택 시 정답을 담아서 이벤트 전송
            store.io.emit('missingRoundComplete', { target: store.data.currentMissingTarget });
        }
    },

    forceRoundEnd: function(store, logic) {
        Object.values(store.players).forEach(p => {
            if (!p.isAdmin && p.isAlive && p.connected !== false && store.data.missingStatus[p.id] === null) {
                store.data.missingStatus[p.id] = 'wrong';
                store.io.to(p.id).emit('missingResult', { correct: false });
            }
        });
        // [핵심 추가] 강제 종료 시에도 정답 공개
        store.io.emit('missingRoundComplete', { target: store.data.currentMissingTarget });
        this.updateRanking(store); this.updateAdminStatus(store);
    },

    updateAdminStatus: function(store) {
        if (!store.adminId) return;
        const statusList = { correct: [], wrong: [], yet: [] };
        Object.keys(store.players).forEach(id => {
            const p = store.players[id];
            if (p.isAdmin) return;
            const stat = store.data.missingStatus[id];
            if (stat === 'correct') statusList.correct.push(p.name);
            else if (stat === 'wrong') statusList.wrong.push(p.name);
            else if (p.connected !== false) statusList.yet.push(p.name);
        });
        store.io.to(store.adminId).emit('statusBoardUpdate', statusList);
    },

    updateRanking: function(store) {
        let entries = Object.entries(store.data.missingScores).filter(([id]) => store.players[id] && !store.players[id].isAdmin).sort((a, b) => b[1] - a[1]);
        const rows = entries.map((entry, i) => {
            const p = store.players[entry[0]];
            return { rank: i + 1, name: p.name, value: `${entry[1]}점`, tone: 'progress' };
        });
        store.io.emit('liveRankUpdate', { rows });
    },

    endGame: function(store, logic) {
        let entries = Object.entries(store.data.missingScores).filter(([id]) => store.players[id] && !store.players[id].isAdmin).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) { logic.endGame("깜빡 퀴즈 종료", [], "참여한 학생이 없습니다."); return; }
        let winners = entries.filter(e => e[1] === entries[0][1]).map(e => store.players[e[0]].name);
        let rankMsg = entries.slice(0, 10).map((e, i) => `${i+1}위: ${store.players[e[0]].name} (${e[1]}점)`).join('<br>');
        logic.endGame("🕵️ 깜빡 퀴즈 명예의 전당", winners, rankMsg);
    }
};
