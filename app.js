import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE DATA ---
const KEYS = {
    k: "QUl6YVN5QV80a1pkLUFTRVhBQXEtR2NrYzJqeTZsaWpQTFF6S20w",
    d: "aGFtbWVyY3Vycy1pby5maXJlYmFzZWFwcC5jb20=",
    u: "aHR0cHM6Ly9oYW1tZXJjdXJzLWlvLWRlZmF1bHQtcnRkYi5ldXJvcGUtd2VzdDEuZmlyZWJhc2VkYXRhYmFzZS5hcHA=",
    p: "aGFtbWVyY3Vycy1pbw==",
    s: "aGFtbWVyY3Vycy1pby5maXJlYmFzZXN0b3JhZ2UuYXBw",
    m: "MTA1MTg5OTk2MDk3Mw==",
    a: "MToxMDUxODk5OTYwOTczOndlYjoxNDIzNTg1YTFhMjFkN2ZmMTMwY2M0"
};

const config = {
    apiKey: atob(KEYS.k), authDomain: atob(KEYS.d), databaseURL: atob(KEYS.u),
    projectId: atob(KEYS.p), storageBucket: atob(KEYS.s), messagingSenderId: atob(KEYS.m), appId: atob(KEYS.a)
};

const app = initializeApp(config);
const db = getDatabase(app);

// --- ENGINE SETTINGS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const HAMMER_PATH = new Path2D("M-35 -20 L35 -20 L38 10 L-38 10 Z M-10 10 L10 10 L10 65 L-10 65 Z");

let myId = Math.random().toString(36).substring(7);
let myNick = "", players = {}, hammers = [], particles = [];
let isHunter = false, ammo = 3, rotation = 0, hStart = 0;
let mouse = { x: 0, y: 0, down: false }, shake = 0;

// --- CORE LOGIC ---
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (myNick) update(ref(db, `rooms/global/players/${myId}`), { x: mouse.x, y: mouse.y });
});

window.addEventListener('mousedown', () => { if(isHunter && ammo > 0) mouse.down = true; });
window.addEventListener('mouseup', () => { if(mouse.down) { throwH(); mouse.down = false; }});

function throwH() {
    ammo--;
    const vx = Math.cos(rotation + Math.PI/2) * 24;
    const vy = Math.sin(rotation + Math.PI/2) * 24;
    hammers.push({ x: mouse.x, y: mouse.y, vx, vy, life: 40, angle: rotation });
}

function handleImpact(x, y) {
    shake = 20;
    for(let i=0; i<15; i++) {
        particles.push({ x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, life:1, c:isHunter?'#ff4757':'#2f3542' });
    }
    Object.keys(players).forEach(id => {
        if (id !== myId && !players[id].isHunter && Math.hypot(players[id].x-x, players[id].y-y) < 70) {
            update(ref(db, `rooms/global/players/${id}`), { status: 'DEFEATED' });
        }
    });
}

export function startGame() {
    myNick = document.getElementById('playerNick').value || "Guest_" + myId;
    document.getElementById('ui-overlay').style.opacity = '0';
    setTimeout(() => document.getElementById('ui-overlay').style.display = 'none', 500);
    document.getElementById('game-hud').style.display = 'block';

    const myRef = ref(db, `rooms/global/players/${myId}`);
    set(myRef, { nick: myNick, x: 0, y: 0, isHunter: false, status: 'ALIVE' });
    onDisconnect(myRef).remove();

    onValue(ref(db, `rooms/global/players`), snap => {
        players = snap.val() || {};
        if (players[myId]?.status === 'DEFEATED') { alert("REMATCH?"); location.reload(); }
        
        const hunterId = Object.keys(players).find(id => players[id].isHunter);
        if (!hunterId && Object.keys(players).length > 0) {
            update(ref(db, `rooms/global/players/${Object.keys(players)[0]}`), { isHunter: true, t: Date.now() });
        }

        const me = players[myId];
        if (me?.isHunter) {
            if (!isHunter) { isHunter = true; ammo = 3; hStart = Date.now(); }
            let timer = Math.max(0, 15 - Math.floor((Date.now() - hStart)/1000));
            document.getElementById('timer-box').innerText = timer;
            if (timer <= 0) update(myRef, { status: 'DEFEATED' });
        } else {
            isHunter = false; document.getElementById('timer-box').innerText = "!";
        }
    });
}

function draw() {
    ctx.fillStyle = "#f0f2f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    if(shake > 0) { ctx.translate(Math.random()*shake-shake/2, Math.random()*shake-shake/2); shake--; }

    // Particles & Players
    for(let id in players) {
        let p = players[id];
        let c = id === myId ? "#2f3542" : (p.isHunter ? "#ff4757" : "#ced4da");
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#2f3542"; ctx.font = "bold 14px Montserrat";
        ctx.fillText(p.nick.toUpperCase(), p.x - 20, p.y - 25);
    }

    if(isHunter && mouse.down) {
        rotation += 0.35;
        ctx.save(); ctx.translate(mouse.x, mouse.y); ctx.rotate(rotation);
        ctx.fillStyle = "#ff4757"; ctx.fill(HAMMER_PATH); ctx.restore();
    }

    hammers.forEach((h, i) => {
        h.x += h.vx; h.y += h.vy; h.life--;
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.angle + (40-h.life)*0.2);
        ctx.fillStyle = "#ff4757"; ctx.fill(HAMMER_PATH); ctx.restore();
        if(h.life <= 0) { handleImpact(h.x, h.y); hammers.splice(i, 1); }
    });

    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.04;
        ctx.fillStyle = p.c; ctx.globalAlpha = p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
        if(p.life <= 0) particles.splice(i, 1);
    });

    ctx.restore();
    requestAnimationFrame(draw);
}
draw();
window.startGame = startGame;
