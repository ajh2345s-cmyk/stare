module.exports = {
    run(store, logic, round=1){
        store.gameMode='COLOR_MATCH';
        store.data.colorRound=round;
        store.data.colorLock=false;
        if(round===1) Object.values(store.players).forEach(p=>{if(!p.isAdmin){p.isAlive=true;p.colorScore=0;p.tileIdx=-1;}});
        const alive=Object.values(store.players).filter(p=>!p.isAdmin&&p.isAlive);
        alive.forEach(p=>{p.tileIdx=-1;});
        let difficulty=round<=4?1:(round<=8?2:3), tiles=[];
        if(difficulty===1){tiles=[{h:0,s:0,l:0},{h:0,s:0,l:100},...Array.from({length:18},(_,i)=>({h:i*20,s:85,l:55}))];}
        else if(difficulty===2){const h1=Math.floor(Math.random()*360),h2=(h1+20)%360;for(let i=0;i<20;i++)tiles.push({h:i%2?h2:h1,s:75,l:30+i*2});}
        else {const h=Math.floor(Math.random()*360),l=30+Math.random()*40;for(let i=0;i<20;i++)tiles.push({h,s:80,l:l+i*1.5});}
        const target=tiles[Math.floor(Math.random()*20)]; tiles.sort((a,b)=>(a.h-b.h)||(a.l-b.l));
        store.io.emit('colorRoundStart',{round:`ROUND ${round}`,tiles,target,time:8});
        this.updateRank(store);
        store.timerTask=setTimeout(()=>this.finishRound(store,logic,tiles,target,round),8000);
    },
    finishRound(store,logic,tiles,target,round){
        if(store.gameState!=='PLAYING') return;
        const failedIds=[],failedTiles=[];
        tiles.forEach((t,i)=>{if(Math.abs(t.h-target.h)>1||Math.abs(t.l-target.l)>1)failedTiles.push(i);});
        const survivors=[];
        Object.values(store.players).forEach(p=>{
            if(p.isAdmin||!p.isAlive) return;
            const t=tiles[p.tileIdx];
            const success=!!t && Math.abs(t.h-target.h)<1 && Math.abs(t.l-target.l)<1;
            if(success){p.colorScore=(p.colorScore||0)+1;survivors.push(p.name);} else {failedIds.push(p.id);p.isAlive=false;store.io.emit('killPlayer',p.id);}
        });
        store.data.colorLock=false;
        this.updateRank(store); store.io.emit('updateUserList',store.players); store.io.emit('colorRoundEnd',{failedIds,failedTiles});
        if(survivors.length===0){logic.endGame('🎨 전원 탈락',[],'모두 색을 맞히지 못했습니다.');return;}
        if(round>=10){logic.endGame('🎨 색 맞추기 종료',survivors,'최종 생존자');return;}
        store.gameState='RESULT';
        store.timerTask=null;
        store.io.emit('roundResult',{round,survivors,nextRound:true});
    },
    nextRound(store,logic){
        if(store.gameState!=='RESULT' && store.data.colorRound>0) return;
        const next=(store.data.colorRound||0)+1;
        store.gameState='PLAYING'; this.run(store,logic,next);
    },
    forceRoundEnd(store,logic){
        // Use a short timeout with the current board; client/admin can then continue.
        this.forceEnd(store,logic);
    },
    forceEnd(store,logic){
        if(store.gameState!=='PLAYING' && store.gameState!=='RESULT') return;
        store.clearAllTimers();
        const survivors=Object.values(store.players).filter(p=>!p.isAdmin&&p.isAlive).map(p=>p.name);
        logic.endGame('🎨 색 맞추기 종료',survivors,'선생님에 의해 종료되었습니다.');
    },
    select(store,socketId,index){
        if(store.gameMode!=='COLOR_MATCH'||store.gameState!=='PLAYING'||store.data.colorLock)return;
        const p=store.players[socketId]; if(!p||p.isAdmin||!p.isAlive)return;
        const n=Number(index); if(Number.isInteger(n)&&n>=0&&n<20)p.tileIdx=n;
    },
    updateRank(store){const s=Object.values(store.players).filter(p=>!p.isAdmin).sort((a,b)=>(b.colorScore||0)-(a.colorScore||0));store.io.emit('liveRankUpdate',s.slice(0,10).map((p,i)=>`${i+1}위: ${p.name} (${p.colorScore||0}점) ${p.isAlive?'':'(탈락)'}`).join('<br>')||'대기 중...');}
};
