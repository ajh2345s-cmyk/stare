module.exports = {
    run(store, logic) {
        store.gameMode = 'BOMB';
        store.timeLeft = Math.max(10, Math.min(120, Number(store.settings.bombTime) || 30));
        const alive = Object.values(store.players).filter(p => !p.isAdmin && !p.isBot);
        alive.forEach(p => { p.isAlive=true; p.x=10+Math.random()*80; p.y=10+Math.random()*80; p.hasBomb=false; p.bombReceivedTime=0; });
        const order=[...alive].sort(()=>Math.random()-0.5);
        const bombCount=Math.max(1,Math.floor(order.length*0.2));
        order.slice(0,bombCount).forEach(p=>{p.hasBomb=true;p.bombReceivedTime=Date.now();});
        store.io.emit('bombStart',{time:store.timeLeft});
        store.io.emit('updateUserList', store.players);
        store.timerMain=setInterval(()=>{
            if(store.gameState!=='PLAYING'){clearInterval(store.timerMain);store.timerMain=null;return;}
            store.timeLeft--;
            store.io.emit('timerUpdate', store.timeLeft);
            if(store.timeLeft<=0) this.finish(store,logic,'timer');
        },1000);
        // Low-spec optimization: one 10fps server tick handles both pass detection and world snapshots.
        store.bombTick=setInterval(()=>{
            if(store.gameState!=='PLAYING'){clearInterval(store.bombTick);store.bombTick=null;return;}
            this.checkPass(store);
            const payload=Object.values(store.players).filter(p=>!p.isAdmin).map(p=>({id:p.id,name:p.name,isAlive:!!p.isAlive,x:Number(p.x)||0,y:Number(p.y)||0,hasBomb:!!p.hasBomb}));
            store.io.emit('bombWorldUpdate',payload);
        },100);
        this.updateRank(store);
    },
    checkPass(store){
        const now=Date.now();
        const ids=Object.keys(store.players);
        ids.filter(id=>store.players[id]?.isAlive && store.players[id]?.hasBomb).forEach(id=>{
            const me=store.players[id];
            if(now-(me.bombReceivedTime||0)<500) return;
            for(const otherId of ids){
                if(id===otherId) continue;
                const other=store.players[otherId];
                if(!other || other.isAdmin || !other.isAlive || other.hasBomb) continue;
                const dx=(Number(me.x)||0)-(Number(other.x)||0);
                const dy=((Number(me.y)||0)-(Number(other.y)||0))*1.4;
                if(dx*dx+dy*dy < 20){ me.hasBomb=false; other.hasBomb=true; other.bombReceivedTime=now; break; }
            }
        });
    },
    finish(store,logic,reason){
        if(store.gameState!=='PLAYING') return;
        store.clearAllTimers();
        const dead=[];
        if(reason==='timer') Object.values(store.players).forEach(p=>{if(!p.isAdmin&&p.isAlive&&p.hasBomb){p.isAlive=false;dead.push(p.name);p.hasBomb=false;store.io.emit('killPlayer',p.id);}});
        const survivors=Object.values(store.players).filter(p=>!p.isAdmin&&p.isAlive).map(p=>p.name);
        store.io.emit('updateUserList',store.players);
        if(survivors.length<=1) logic.endGame(survivors.length?'💣 최후의 1인':'💥 전원 폭사',survivors,dead.length?`폭발: ${dead.join(', ')}`:'');
        else logic.endGame('💣 폭탄 돌리기 종료',survivors,dead.length?`폭발: ${dead.join(', ')}`:'생존 성공');
    },
    forceEnd(store,logic){
        if(store.gameState!=='RESULT' && store.gameState!=='PLAYING') return;
        store.clearAllTimers();
        Object.values(store.players).forEach(p=>{if(!p.isAdmin&&p.hasBomb)p.hasBomb=false;});
        const survivors=Object.values(store.players).filter(p=>!p.isAdmin&&p.isAlive).map(p=>p.name);
        logic.endGame('💣 폭탄 돌리기 종료',survivors,'선생님에 의해 종료되었습니다.');
    },
    updateRank(store){
        const entries=Object.values(store.players).filter(p=>!p.isAdmin).sort((a,b)=>(b.isAlive?1:0)-(a.isAlive?1:0));
        store.io.emit('liveRankUpdate',entries.slice(0,10).map((p,i)=>`${i+1}위: ${p.name} ${p.isAlive?'🟢':'💥'}`).join('<br>')||'대기 중...');
    }
};
