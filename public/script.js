const socket = io();
let me = null, gameState = null, myId = '';

window.onload = () => {
    generateFloatingCandles();
    generateMagicParticles();
};

function generateFloatingCandles() {
    const container = document.getElementById('candles');
    if(!container) return;
    const positions = [{l:'10%', t:'25%'}, {l:'85%', t:'15%'}, {l:'5%', t:'65%'}, {l:'92%', t:'55%'}, {l:'20%', t:'85%'}, {l:'75%', t:'80%'}];
    positions.forEach(pos => {
        const candle = document.createElement('div');
        candle.className = 'candle';
        candle.style.left = pos.l; candle.style.top = pos.t;
        const flame = document.createElement('div');
        flame.className = 'candle-flame';
        candle.appendChild(flame);
        container.appendChild(candle);
    });
}

function generateMagicParticles() {
    const container = document.getElementById('particles');
    if(!container) return;
    for(let i=0; i<30; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute'; p.style.width = '2px'; p.style.height = '2px'; p.style.background = 'white';
        p.style.borderRadius = '50%'; p.style.left = Math.random() * 100 + '%'; p.style.top = Math.random() * 100 + '%';
        p.style.opacity = '0.3'; container.appendChild(p);
    }
}

socket.on('init', (data) => { 
    myId = data.myId; gameState = data.gameState; updateUI(); 
    document.querySelector('.loading-overlay').classList.add('hidden'); 
});

socket.on('updateGameState', (data) => { 
    gameState = data; updateUI(); 
    if(gameState.config) syncBalanceInputs();
    syncScoreInputs();
});

socket.on('updatePlayers', (ps) => { 
    gameState.players = ps; me = ps[myId]; 
    updateUI(); updateAdminList(); 
});

socket.on('azkabanExile', () => {
    showMinistryNotice('아즈카반으로 유배되셨습니다. 당신의 지팡이는 이제 효력을 잃었습니다.', true);
});

socket.on('notification', (m) => showMinistryNotice(m));
socket.on('error', (m) => showMinistryNotice(m, true));

socket.on('newHint', (d) => { if(me && me.house === d.house) showProphecy(d.text); });

socket.on('openGartic', (link) => {
    showMinistryNotice("리쵸 교수님의 수업으로 이동합니다. 갈틱폰 마법진이 활성화되었습니다.");
    setTimeout(() => window.open(link, '_blank'), 1500);
});

function joinGame() {
    const n = document.getElementById('nickname-input').value.trim();
    if(!n) return showMinistryNotice('성함을 기입해주셔야 입학이 가능합니다.');
    socket.emit('join', n);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
}

function updateUI() {
    if(!gameState) return;
    document.getElementById('stat-day').innerText = `제 ${gameState.day}일`;
    
    let topScore = -1, leaderId = null;
    for(let h in gameState.houses) {
        if(gameState.houses[h].score > topScore) { topScore = gameState.houses[h].score; leaderId = h; }
    }

    for(let h in gameState.houses) {
        const d = gameState.houses[h], totem = document.getElementById(`house-${h}`);
        if(totem) {
            totem.querySelector('.points-val').innerText = d.score;
            totem.classList.toggle('winner', h === leaderId && d.score > 0);
        }
    }

    if(me) {
        document.getElementById('stat-name').innerText = me.nickname + (me.isEliminated ? ' (아즈카반)' : '');
        document.getElementById('stat-house').innerText = getKRHouse(me.house);
        const roleEl = document.getElementById('stat-role');
        if(me.role === 'de') {
            roleEl.innerText = '💀 죽음을 먹는 자'; roleEl.style.color = '#ff4444';
            document.getElementById('de-panel').classList.toggle('hidden', me.isEliminated);
            document.getElementById('de-team-score').innerText = gameState.deTeamScore;
        } else {
            roleEl.innerText = '🛡️ 학 생'; roleEl.style.color = '#2C241D';
            document.getElementById('de-panel').classList.add('hidden');
        }
    }
}

function getKRHouse(h) { return { Gryffindor: '그리핀도르', Slytherin: '슬리데린', Ravenclaw: '레번클로', Hufflepuff: '후플푸프' }[h] || '배정 대기 중'; }

function showMinistryNotice(msg, isError = false) {
    const modal = document.getElementById('ministry-modal');
    const msgEl = document.getElementById('notice-msg');
    msgEl.innerText = msg;
    msgEl.style.color = isError ? '#8b0000' : '#2C241D';
    modal.classList.remove('hidden');
}

function closeNotice() { document.getElementById('ministry-modal').classList.add('hidden'); }

function showProphecy(text) {
    const modal = document.getElementById('prophecy-modal');
    const textEl = document.getElementById('prophecy-text');
    modal.classList.remove('hidden');
    textEl.innerHTML = '';
    let i = 0;
    const typing = setInterval(() => { if(i < text.length) textEl.innerHTML += text[i++]; else clearInterval(typing); }, 50);
}

function closeProphecy() { document.getElementById('prophecy-modal').classList.add('hidden'); }

function openGame(t) {
    if(gameState.status !== 'running') return showMinistryNotice('학기가 시작되지 않았습니다.');
    if(me.isEliminated) return showMinistryNotice('아즈카반으로 유배되셨습니다. 더 이상 마법을 행할 수 없습니다.', true);
    if(me.attempts[t] >= 2) return showMinistryNotice('오늘의 마력을 모두 사용했습니다.');
    if(t === 'creature') return socket.emit('startMiniGame', t);
    document.getElementById('game-overlay').classList.remove('hidden');
    document.getElementById('modal-content').innerHTML = '<h3>마법 주문 영창 중...</h3>';
    socket.emit('startMiniGame', t);
}

socket.on('gameChallenge', (d) => {
    const c = document.getElementById('modal-content');
    if(d.type === 'focus') {
        c.innerHTML = `<h3>정신을 집중하십시오 (8자리)</h3><h1 class="metallic-title" style="font-size:4rem;">${d.target}</h1>`;
        setTimeout(() => {
            c.innerHTML = `<h3>기억한 조각을 기입하십시오</h3><input type="text" id="ans-focus" class="magic-input" maxlength="8" autofocus><br><button class="notice-confirm-btn" onclick="submitGame('focus')">주문 제출</button>`;
        }, 5000);
    } else if(d.type === 'timing') {
        c.innerHTML = '<h3>지팡이를 겨누고 신호를 기다리십시오...</h3>';
    } else if(d.type === 'reaction') {
        let count = 0;
        c.innerHTML = `<h3>5초간 마력 방출!</h3><h1 id="count-disp" class="cinzel">0</h1><button id="orb-btn" class="mana-orb">RELEASE MANA</button>`;
        const btn = document.getElementById('orb-btn');
        btn.onclick = () => { count++; document.getElementById('count-disp').innerText = count; };
        setTimeout(() => { socket.emit('verifyMiniGame', { type: 'reaction', count }); document.getElementById('game-overlay').classList.add('hidden'); }, 5000);
    }
});

socket.on('gameSignal', (d) => {
    if(d.action === 'NOW') {
        document.getElementById('modal-content').innerHTML = `<h3>지금입니다!!!</h3><button class="wand-strike-btn" onclick="submitGame('timing')">STRIKE!</button>`;
    }
});

function submitGame(t) {
    const input = document.getElementById('ans-focus');
    const val = input ? input.value : null;
    socket.emit('verifyMiniGame', { type: t, answer: val });
    document.getElementById('game-overlay').classList.add('hidden');
}

function buyHint() { if(confirm('예언의 서를 열기 위해서는 기숙사 정기가 소모됩니다. 계속하시겠습니까?')) socket.emit('buyHint'); }
function openReport() { const n = prompt('고발할 마법사의 성함을 적으십시오 (우리 기숙사 한정)'); if(n) socket.emit('report', n); }
function deSteal() { const h = prompt('정기를 강탈할 기숙사명을 입력하십시오'); if(h) socket.emit('deSteal', h); }
function toggleAdmin() { document.getElementById('admin-panel').classList.toggle('hidden'); }

function adminAction(type, targetId, extra = {}) {
    const password = document.getElementById('admin-pass').value;
    if(type === 'setGartic') {
        const link = prompt('갈틱폰 초대 링크를 입력하십시오.');
        if(link) socket.emit('adminAction', { password, type: 'setGartic', link });
        return;
    }
    socket.emit('adminAction', { password, type, targetId, ...extra });
}

function applyBalance() {
    const config = {
        hintPrice: parseInt(document.getElementById('cfg-hint-price').value),
        gameBasePoints: parseInt(document.getElementById('cfg-game-points').value),
        stealCost: parseInt(document.getElementById('cfg-steal-cost').value),
        stealAmount: parseInt(document.getElementById('cfg-steal-amount').value)
    };
    adminAction('updateConfig', null, { config });
}

function applyHouseScores() {
    const scores = {
        Gryffindor: document.getElementById('score-input-Gryffindor').value,
        Slytherin: document.getElementById('score-input-Slytherin').value,
        Ravenclaw: document.getElementById('score-input-Ravenclaw').value,
        Hufflepuff: document.getElementById('score-input-Hufflepuff').value
    };
    adminAction('updateHouseScores', null, { scores });
}

function syncBalanceInputs() {
    if(document.activeElement.tagName === 'INPUT') return;
    document.getElementById('cfg-hint-price').value = gameState.config.hintPrice;
    document.getElementById('cfg-game-points').value = gameState.config.gameBasePoints;
    document.getElementById('cfg-steal-cost').value = gameState.config.stealCost;
    document.getElementById('cfg-steal-amount').value = gameState.config.stealAmount;
}

function syncScoreInputs() {
    if(document.activeElement.closest('.score-management-group')) return;
    for(let h in gameState.houses) {
        const el = document.getElementById(`score-input-${h}`);
        if(el) el.value = gameState.houses[h].score;
    }
}

function updateAdminList() {
    const list = document.getElementById('admin-player-list');
    list.innerHTML = '';
    for(let id in gameState.players) {
        const p = gameState.players[id];
        const card = document.createElement('div');
        card.className = 'player-admin-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${p.nickname}${p.isEliminated?' (아즈카반)':''}</strong>
                <div>
                    <select onchange="adminAction('setHouse', '${id}', {house: this.value})"><option value="Gryffindor" ${p.house==='Gryffindor'?'selected':''}>Gry</option><option value="Slytherin" ${p.house==='Slytherin'?'selected':''}>Sly</option><option value="Ravenclaw" ${p.house==='Ravenclaw'?'selected':''}>Rav</option><option value="Hufflepuff" ${p.house==='Hufflepuff'?'selected':''}>Huf</option></select>
                    <select onchange="adminAction('setRole', '${id}', {role: this.value})"><option value="student" ${p.role==='student'?'selected':''}>학생</option><option value="de" ${p.role==='de'?'selected':''}>죽먹자</option></select>
                </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:5px;"><input type="text" id="hint-${id}" placeholder="힌트" style="flex:1;"><button onclick="const h=document.getElementById('hint-${id}').value; if(h){ adminAction('addHint', '${id}', {hint:h}); document.getElementById('hint-${id}').value=''; }">+</button></div>
            <div style="font-size:0.7rem; color:#666;">${p.hints.map((h, i) => `<span>• ${h} <button onclick="adminAction('removeHint', '${id}', {index:${i}})">x</button></span>`).join(' ')}</div>
        `;
        list.appendChild(card);
    }
}
