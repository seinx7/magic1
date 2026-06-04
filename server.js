const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_PASSWORD = 'alohomora';

let gameState = {
    status: 'waiting',
    day: 1,
    maxDay: 10,
    houses: {
        Gryffindor: { score: 0, deRevealed: false },
        Slytherin: { score: 0, deRevealed: false },
        Ravenclaw: { score: 0, deRevealed: false },
        Hufflepuff: { score: 0, deRevealed: false }
    },
    deTeamScore: 0,
    deMultiplier: 1.3,
    deCaughtCount: 0,
    players: {},
    garticLink: '',
    config: {
        hintPrice: 50,
        gameBasePoints: 100,
        stealCost: 0,
        stealAmount: 50
    }
};

const activeSessions = {};

function mapHouseName(name) {
    const map = {
        '그리핀도르': 'Gryffindor', '슬리데린': 'Slytherin',
        '레번클로': 'Ravenclaw', '후플푸프': 'Hufflepuff'
    };
    return map[name.trim()] || name.trim();
}

app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.emit('init', { gameState, myId: socket.id });

    socket.on('join', (nickname) => {
        if (gameState.status !== 'waiting') return socket.emit('error', '이미 연회가 시작되었습니다.');
        gameState.players[socket.id] = { 
            id: socket.id,
            nickname: nickname.trim(), 
            house: null, 
            role: 'student', 
            isEliminated: false,
            attempts: { timing: 0, reaction: 0, focus: 0, creature: 0 },
            hints: []
        };
        io.emit('updatePlayers', gameState.players);
    });

    socket.on('startMiniGame', (type) => {
        const player = gameState.players[socket.id];
        if (!player || gameState.status !== 'running' || player.isEliminated) return;
        if (player.attempts[type] >= 2) return socket.emit('error', '오늘의 마력을 모두 소모하셨습니다.');

        if (type === 'creature') {
            if (!gameState.garticLink) return socket.emit('error', '리쵸 교수님이 아직 금지된 숲의 문을 열지 않으셨습니다.');
            player.attempts[type]++;
            socket.emit('openGartic', gameState.garticLink);
            io.emit('updatePlayers', gameState.players);
            return;
        }

        activeSessions[socket.id] = { type, startTime: Date.now() };
        player.attempts[type]++;
        
        if (type === 'focus') {
            let num = '';
            for(let i=0; i<8; i++) num += Math.floor(Math.random()*10);
            activeSessions[socket.id].target = num;
            socket.emit('gameChallenge', { type, target: num });
        } else if (type === 'timing') {
            const delay = 1500 + Math.random() * 2500;
            socket.emit('gameChallenge', { type, action: 'WAIT' });
            setTimeout(() => {
                if (activeSessions[socket.id] && activeSessions[socket.id].type === 'timing') {
                    activeSessions[socket.id].signalTime = Date.now();
                    socket.emit('gameSignal', { action: 'NOW' });
                }
            }, delay);
        } else {
            socket.emit('gameChallenge', { type });
        }
        io.emit('updatePlayers', gameState.players);
    });

    socket.on('verifyMiniGame', (data) => {
        const session = activeSessions[socket.id];
        const player = gameState.players[socket.id];
        if (!session || !player || player.isEliminated) return;

        let points = 0;
        const base = gameState.config.gameBasePoints;

        if (session.type === 'timing' && session.signalTime) {
            const diff = Date.now() - session.signalTime;
            points = diff < 450 ? base : diff < 900 ? Math.floor(base*0.5) : Math.floor(base*0.2);
        } else if (session.type === 'focus') {
            const target = session.target;
            const answer = (data.answer || '').toString();
            let matches = 0;
            for(let i=0; i<target.length; i++) if(target[i] === answer[i]) matches++;
            const errors = target.length - matches;
            if (errors === 0) points = 100;
            else if (errors <= 2) points = 80;
            else if (errors <= 4) points = 60;
            else if (errors <= 6) points = 40;
            else points = 20;
        } else if (session.type === 'reaction') {
            points = Math.min(Math.floor(base*1.5), Math.floor(data.count * (base/25)));
        }

        delete activeSessions[socket.id];
        if (player.role === 'de') {
            const total = Math.floor(points * gameState.deMultiplier);
            const housePoints = Math.floor(total * 0.7);
            if(player.house) gameState.houses[player.house].score += housePoints;
            gameState.deTeamScore += (total - housePoints);
        } else if (player.house) {
            gameState.houses[player.house].score += points;
        }

        io.emit('updateGameState', gameState);
        socket.emit('notification', `마법 수행 결과: ${points}점을 획득하셨습니다.`);
    });

    socket.on('buyHint', () => {
        const player = gameState.players[socket.id];
        const price = gameState.config.hintPrice;
        if (!player || !player.house || player.isEliminated) return;
        if (gameState.houses[player.house].score < price) return socket.emit('error', '기숙사의 정기가 부족합니다.');
        
        const allHints = [];
        for(let id in gameState.players) {
            gameState.players[id].hints.forEach(text => allHints.push(text));
        }
        if (allHints.length === 0) return socket.emit('error', '아직 흐릿한 안개만이 가득합니다.');

        gameState.houses[player.house].score -= price;
        const hint = allHints[Math.floor(Math.random() * allHints.length)];
        io.emit('newHint', { text: hint, house: player.house });
        io.emit('updateGameState', gameState);
    });

    socket.on('report', (targetNick) => {
        const player = gameState.players[socket.id];
        if (!player || !player.house || player.isEliminated) return;

        const targetEntry = Object.entries(gameState.players).find(([id, p]) => p.nickname.toLowerCase() === targetNick.trim().toLowerCase());
        if (!targetEntry) return socket.emit('error', '그 이름을 가진 마법사는 이 성안에 없습니다.');

        const [targetId, target] = targetEntry;
        if (target.role === 'de' && target.house === player.house) {
            target.isEliminated = true;
            gameState.houses[player.house].deRevealed = true;
            gameState.deCaughtCount++;
            gameState.deMultiplier += 0.1;
            io.emit('notification', `${target.nickname}의 정체가 밝혀졌습니다! 아즈카반으로 호송됩니다.`);
            io.to(targetId).emit('azkabanExile');
        } else {
            gameState.houses[player.house].score = Math.max(0, gameState.houses[player.house].score - 100);
            socket.emit('error', '신고가 빗나갔습니다! 기숙사 정기가 100점 차감됩니다.');
        }
        io.emit('updateGameState', gameState);
        io.emit('updatePlayers', gameState.players);
    });

    socket.on('adminAction', (data) => {
        if (data.password !== ADMIN_PASSWORD) return socket.emit('error', '비밀 주문이 틀렸습니다.');
        
        if (data.type === 'updateConfig') {
            gameState.config = { ...gameState.config, ...data.config };
        } else if (data.type === 'setRole') {
            if(gameState.players[data.targetId]) gameState.players[data.targetId].role = data.role;
        } else if (data.type === 'setHouse') {
            if(gameState.players[data.targetId]) gameState.players[data.targetId].house = data.house;
        } else if (data.type === 'addHint') {
            if(gameState.players[data.targetId]) gameState.players[data.targetId].hints.push(data.hint);
        } else if (data.type === 'removeHint') {
            if(gameState.players[data.targetId]) gameState.players[data.targetId].hints.splice(data.index, 1);
        } else if (data.type === 'updateHouseScores') {
            for(let h in data.scores) {
                if(gameState.houses[h]) gameState.houses[h].score = parseInt(data.scores[h]) || 0;
            }
        } else if (data.type === 'startGame') {
            gameState.status = 'running';
        } else if (data.type === 'nextDay') {
            gameState.day++;
            for(let id in gameState.players) gameState.players[id].attempts = { timing: 0, reaction: 0, focus: 0, creature: 0 };
            if (gameState.day > gameState.maxDay) gameState.status = 'ended';
        } else if (data.type === 'setGartic') {
            gameState.garticLink = data.link;
        } else if (data.type === 'reset') {
            gameState.status = 'waiting';
            gameState.players = {};
            gameState.day = 1;
            for(let h in gameState.houses) {
                gameState.houses[h].score = 0;
                gameState.houses[h].deRevealed = false;
            }
        }
        
        io.emit('updateGameState', gameState);
        io.emit('updatePlayers', gameState.players);
    });

    socket.on('deSteal', (rawHouseName) => {
        const player = gameState.players[socket.id];
        const targetHouse = mapHouseName(rawHouseName);
        if (player && player.role === 'de' && !player.isEliminated && gameState.houses[targetHouse]) {
            if (targetHouse === player.house) return socket.emit('error', '본인 기숙사는 강탈할 수 없습니다.');
            if (gameState.deTeamScore < gameState.config.stealCost) return socket.emit('error', '어둠의 마력이 부족합니다.');
            
            gameState.deTeamScore -= gameState.config.stealCost;
            const actualSteal = Math.min(gameState.houses[targetHouse].score, gameState.config.stealAmount);
            gameState.houses[targetHouse].score -= actualSteal;
            gameState.houses[player.house].score += actualSteal;
            io.emit('updateGameState', gameState);
            socket.emit('notification', `${targetHouse}의 정기를 강탈했습니다.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Hogwarts Online on ${PORT}`));
