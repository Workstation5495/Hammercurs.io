import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- 1. НАСТРОЙКИ (CONFIG) ---
const KEYS = {
    k: "QUl6YVN5QV80a1pkLUFTRVhBQXEtR2NrYzJqeTZsaWpQTFF6S20w",
    d: "aGFtbWVyY3Vycy1pby5maXJlYmFzZWFwcC5jb20=",
    u: "aHR0cHM6Ly9oYW1tZXJjdXJzLWlvLWRlZmF1bHQtcnRkYi5ldXJvcGUtd2VzdDEuZmlyZWJhc2VkYXRhYmFzZS5hcHA=",
    p: "aGFtbWVyY3Vycy1pbw==",
    s: "aGFtbWVyY3Vycy1pby5maXJlYmFzZXN0b3JhZ2UuYXBw",
    m: "MTA1MTg5OTk2MDk3Mw==",
    a: "MToxMDUxODk5OTYwOTczOndlYjoxNDIzNTg1YTFhMjFkN2ZmMTMwY2M0"
};

const app = initializeApp({
    apiKey: atob(KEYS.k), authDomain: atob(KEYS.d), databaseURL: atob(KEYS.u),
    projectId: atob(KEYS.p), storageBucket: atob(KEYS.s), messagingSenderId: atob(KEYS.m), appId: atob(KEYS.a)
});
const db = getDatabase(app);

// --- 2. ПЕРЕМЕННЫЕ ИГРЫ ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Авто-ресайз (чтобы не было белых полос)
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Состояние
let myId = Math.random().toString(36).substring(2, 9);
let myNick = "Player";
let players = {};
let hammers = [];
let particles = [];
let isHunter = false;
let ammo = 3;
let rotation = 0;
let mouse = { x: canvas.width/2, y: canvas.height/2, down: false };
let cameraShake = 0;
let hunterStartTime = 0;

// SVG Молот (Векторный рисунок)
const HAMMER_PATH = new Path2D("M-20 -10 L20 -10 L25 5 L-25 5 Z M-5 5 L5 5 L5 50 L-5 50 Z");

// --- 3. ЛОГИКА СТАРТА ---
document.getElementById('start-btn').addEventListener('click', () => {
    const inputNick = document.getElementById('nickname').value.trim();
    if(inputNick) myNick = inputNick;
    
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    
    initMultiplayer();
    gameLoop();
});

// --- 4. МУЛЬТИПЛЕЕР (FIREBASE) ---
function initMultiplayer() {
    const myRef = ref(db, `rooms/global/players/${myId}`);
    
    // Создаем игрока
    set(myRef, {
        nick: myNick,
        x: mouse.x,
        y: mouse.y,
        isHunter: false,
        status: 'ALIVE'
    });
    
    // Если выйдем - удаляем
    onDisconnect(myRef).remove();

    // Слушаем изменения
    onValue(ref(db, `rooms/global/players`), (snapshot) => {
        const data = snapshot.val() || {};
        players = data;
        
        // Проверка смерти
        if(players[myId] && players[myId].status === 'DEAD') {
            alert("ВАС УНИЧТОЖИЛИ! -300 ОЧКОВ");
            location.reload();
        }

        // Логика Хантера
        handleHunterLogic(players);
    });
}

function handleHunterLogic(allPlayers) {
    const me = allPlayers[myId];
    if(!me) return;

    // Если я Хантер
    if(me.isHunter) {
        if(!isHunter) { // Только стал
            isHunter = true; 
            ammo = 3; 
            hunterStartTime = Date.now();
            updateAmmoUI();
        }
        
        let timeLeft = 15 - Math.floor((Date.now() - hunterStartTime) / 1000);
        document.getElementById('timer-display').innerText = timeLeft;
        
        if(timeLeft <= 0) {
            update(ref(db, `rooms/global/players/${myId}`), { status: 'DEAD' }); // Взрыв
        }
    } else {
        isHunter = false;
        document.getElementById('timer-display').innerText = "--";
        document.getElementById('ammo-container').innerHTML = "";
        
        // Если хантера вообще нет, назначаем первого попавшегося
        const hasHunter = Object.values(allPlayers).some(p => p.isHunter);
        if(!hasHunter && Object.keys(allPlayers).length > 0) {
            const firstId = Object.keys(allPlayers)[0];
            update(ref(db, `rooms/global/players/${firstId}`), { isHunter: true });
        }
    }
}

// --- 5. УПРАВЛЕНИЕ ---
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // Отправляем координаты (ограничим частоту для оптимизации)
    if(players[myId]) {
        update(ref(db, `rooms/global/players/${myId}`), { x: Math.round(mouse.x), y: Math.round(mouse.y) });
    }
});

window.addEventListener('mousedown', () => { if(isHunter && ammo > 0) mouse.down = true; });
window.addEventListener('mouseup', () => { 
    if(mouse.down && isHunter) { 
        shootHammer(); 
        mouse.down = false; 
    } 
});

function shootHammer() {
    ammo--;
    updateAmmoUI();
    
    // Математика полета
    const speed = 25;
    const vx = Math.cos(rotation + Math.PI/2) * speed;
    const vy = Math.sin(rotation + Math.PI/2) * speed;
    
    hammers.push({
        x: mouse.x, y: mouse.y,
        vx: vx, vy: vy,
        angle: rotation,
        life: 50 // Живет 50 кадров
    });
}

function updateAmmoUI() {
    const container = document.getElementById('ammo-container');
    container.innerHTML = '';
    for(let i=0; i<3; i++) {
        const div = document.createElement('div');
        div.className = i < ammo ? 'ammo-bullet' : 'ammo-bullet empty';
        container.appendChild(div);
    }
}

// --- 6. ИГРОВОЙ ЦИКЛ (РЕНДЕР) ---
function gameLoop() {
    // 1. Очистка экрана
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Тряска камеры
    ctx.save();
    if(cameraShake > 0) {
        const dx = (Math.random()-0.5) * cameraShake;
        const dy = (Math.random()-0.5) * cameraShake;
        ctx.translate(dx, dy);
        cameraShake *= 0.9; // Затухание
    }

    // 3. Отрисовка игроков
    for(let id in players) {
        const p = players[id];
        const color = p.isHunter ? "#e94560" : "#0f3460"; // Красный или Синий
        
        // Круг игрока
        ctx.fillStyle = color;
        ctx.beginPath(); 
        ctx.arc(p.x, p.y, 15, 0, Math.PI*2); 
        ctx.fill();
        
        // Никнейм
        ctx.fillStyle = "white";
        ctx.font = "12px Roboto Mono";
        ctx.textAlign = "center";
        ctx.fillText(p.nick, p.x, p.y - 25);
    }

    // 4. Отрисовка молота в руках
    if(isHunter) {
        rotation += 0.3; // Вращение
        ctx.save();
        ctx.translate(mouse.x, mouse.y);
        ctx.rotate(rotation);
        
        ctx.fillStyle = "#ffcc00"; // Золотой молот
        ctx.shadowBlur = 15; ctx.shadowColor = "#ffcc00";
        if(mouse.down) ctx.scale(1.2, 1.2); // Увеличение при клике
        ctx.fill(HAMMER_PATH);
        ctx.restore();
    }

    // 5. Летящие молоты
    hammers.forEach((h, index) => {
        h.x += h.vx;
        h.y += h.vy;
        h.life--;

        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.angle + (50 - h.life) * 0.5); // Вращение в полете
        ctx.fillStyle = "#ffcc00";
        ctx.fill(HAMMER_PATH);
        ctx.restore();

        // Проверка столкновения
        if(h.life <= 0) {
            cameraShake = 20; // Трясем экран
            hammers.splice(index, 1);
            
            // Если я Хантер, проверяю, попал ли я
            if(isHunter) {
                checkKill(h.x, h.y);
            }
        }
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

function checkKill(impactX, impactY) {
    Object.keys(players).forEach(targetId => {
        if(targetId !== myId && !players[targetId].isHunter) {
            const p = players[targetId];
            const dist = Math.hypot(p.x - impactX, p.y - impactY);
            if(dist < 60) {
                update(ref(db, `rooms/global/players/${targetId}`), { status: 'DEAD' });
            }
        }
    });
}
