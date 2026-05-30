class AudioSystem {
    constructor() {
        this.ctx = null;
        this.sirenOsc = null;
        this.sirenGain = null;
        this.sirenInterval = null;
    }
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    playTone(freq, type, duration, vol = 0.1, slideFreq = null) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideFreq) {
            osc.frequency.exponentialRampToValueAtTime(slideFreq, this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    playWaka() { this.playTone(450, 'triangle', 0.08, 0.15, 300); }
    playEatGhost() { this.playTone(600, 'square', 0.4, 0.2, 1400); }
    playDeath() {
        if(this.sirenOsc) this.stopSiren();
        let t = 0;
        for(let i = 0; i < 12; i++) {
            setTimeout(() => this.playTone(220 - (i * 15), 'sawtooth', 0.15, 0.25), t);
            t += 120;
        }
    }
    startSiren() {
        if (!this.ctx || this.sirenOsc) return;
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.setValueAtTime(140, this.ctx.currentTime);
        this.sirenGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.ctx.destination);
        this.sirenOsc.start();
        let high = false;
        this.sirenInterval = setInterval(() => {
            if(this.ctx && this.sirenOsc) this.sirenOsc.frequency.setValueAtTime(high ? 140 : 170, this.ctx.currentTime);
            high = !high;
        }, 250);
    }
    stopSiren() {
        if (this.sirenOsc) {
            try { this.sirenOsc.stop(); } catch(e){}
            this.sirenOsc.disconnect();
            this.sirenOsc = null;
            clearInterval(this.sirenInterval);
        }
    }
}
const audio = new AudioSystem();

const DIR = { UP: {x:0, y:-1}, DOWN: {x:0, y:1}, LEFT: {x:-1, y:0}, RIGHT: {x:1, y:0}, NONE: {x:0, y:0} };
const MAP_DATA = [
    "1111111111111111111",
    "1322222221222222231",
    "1211211121211121121",
    "1222222222222222221",
    "1211212111112121121",
    "1222212221222122221",
    "1111211101011121111",
    "0001210000000121000",
    "1111210114110121111",
    "0000200100010020000",
    "1111210111110121111",
    "0001210000000121000",
    "1111210111110121111",
    "1222222221222222221",
    "1211211121211121121",
    "1321222220222221231",
    "1121212111112121211",
    "1222212221222122221",
    "1111111111111111111"
];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CS = 20; 
const ROWS = MAP_DATA.length;
const COLS = MAP_DATA[0].length;
let map = [];

let score = 0;
let highScore = 0; 
let lives = 3;
let gameState = 'INIT'; 
let animationId;
let ghostCombo = 0;

document.getElementById('high-score').innerText = highScore;

function parseMap() {
    map = [];
    for(let r=0; r<ROWS; r++) {
        let row = [];
        for(let c=0; c<COLS; c++) {
            row.push(parseInt(MAP_DATA[r][c]));
        }
        map.push(row);
    }
}

class Entity {
    constructor(x, y, speed) {
        this.x = x * CS + CS/2; 
        this.y = y * CS + CS/2;
        this.speed = speed; 
        this.dir = DIR.NONE;
        this.nextDir = DIR.NONE;
    }
    getGridPos() {
        return { c: Math.floor(this.x / CS), r: Math.floor(this.y / CS) };
    }
    isAtCenter() {
        return (this.x - CS/2) % CS === 0 && (this.y - CS/2) % CS === 0;
    }
    canMove(dir) {
        let grid = this.getGridPos();
        let nc = grid.c + dir.x;
        let nr = grid.r + dir.y;
        
        if (nc < 0 || nc >= COLS) {
            return dir.y === 0; 
        }
        if (nr < 0 || nr >= ROWS) return false;
        
        return map[nr][nc] !== 1;
    }
    move() {
        if (this.isAtCenter()) {
            this.x = Math.round(this.x);
            this.y = Math.round(this.y);
            
            if (this.nextDir !== DIR.NONE && this.canMove(this.nextDir)) {
                this.dir = this.nextDir;
                this.nextDir = DIR.NONE;
            } else if (!this.canMove(this.dir)) {
                this.dir = DIR.NONE;
            }
        }
        
        this.x += this.dir.x * this.speed;
        this.y += this.dir.y * this.speed;

        if (this.x < -CS/2) this.x = COLS * CS - CS/2;
        if (this.x > COLS * CS - CS/2) this.x = -CS/2;
    }
}

class PacMan extends Entity {
    constructor() {
        super(9, 15, 2); 
        this.mouthOpen = 0;
        this.mouthDir = 1;
        this.angle = 0;
    }
    update() {
        if (this.nextDir !== DIR.NONE && this.nextDir.x === -this.dir.x && this.nextDir.y === -this.dir.y) {
            this.dir = this.nextDir;
            this.nextDir = DIR.NONE;
        }

        this.move();

        if(this.dir === DIR.RIGHT) this.angle = 0;
        else if(this.dir === DIR.DOWN) this.angle = Math.PI/2;
        else if(this.dir === DIR.LEFT) this.angle = Math.PI;
        else if(this.dir === DIR.UP) this.angle = -Math.PI/2;

        if (this.dir !== DIR.NONE) {
            this.mouthOpen += 0.08 * this.mouthDir;
            if(this.mouthOpen >= 0.45 || this.mouthOpen <= 0) this.mouthDir *= -1;
        }

        let g = this.getGridPos();
        if(g.r >= 0 && g.r < ROWS && g.c >= 0 && g.c < COLS) {
            if(map[g.r][g.c] === 2) {
                map[g.r][g.c] = 0;
                score += 10;
                audio.playWaka();
                checkWin();
            } else if(map[g.r][g.c] === 3) {
                map[g.r][g.c] = 0;
                score += 50;
                audio.playWaka();
                triggerFrightenedMode();
                checkWin();
            }
            updateUI(); 
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.arc(0, 0, CS*0.42, this.mouthOpen * Math.PI, (2 - this.mouthOpen) * Math.PI);
        ctx.lineTo(0,0);
        ctx.fillStyle = '#FFFF00';
        ctx.fill();
        ctx.closePath();
        ctx.restore();
    }
}

class Ghost extends Entity {
    constructor(x, y, color, name) {
        super(x, y, 2); 
        this.baseX = x; this.baseY = y;
        this.color = color;
        this.name = name;
        this.state = 'CHASE'; 
        this.frightenedTimer = 0;
        this.targetSpeed = 2; 
    }
    update() {
        if(this.state === 'FRIGHTENED') {
            this.frightenedTimer--;
            this.targetSpeed = 1; 
            if(this.frightenedTimer <= 0) {
                this.state = 'CHASE';
                this.targetSpeed = 2;
            }
        } else if (this.state === 'EATEN') {
            this.targetSpeed = 5; 
            let g = this.getGridPos();
            if(g.c === 9 && g.r === 8) {
                this.state = 'CHASE';
                this.targetSpeed = 2;
            }
        } else {
            this.targetSpeed = 2; 
        }

        if (this.isAtCenter()) {
            this.x = Math.round(this.x);
            this.y = Math.round(this.y);

            this.speed = this.targetSpeed;

            let target = { c: 9, r: 8 }; 
            let pGrid = pacman.getGridPos();
            let currentGrid = this.getGridPos();

            if (this.state === 'FRIGHTENED') {
                target = null; 
            } else {
                if (currentGrid.r === 9 && currentGrid.c >= 7 && currentGrid.c <= 11) {
                    target = { c: 9, r: 7 };
                } else if (this.state === 'CHASE') {
                    if (this.name === 'Blinky') { 
                        target = { c: pGrid.c, r: pGrid.r };
                    } else if (this.name === 'Pinky') { 
                        target = { c: pGrid.c + pacman.dir.x * 4, r: pGrid.r + pacman.dir.y * 4 };
                    } else if (this.name === 'Inky') { 
                        target = { c: pGrid.c + pacman.dir.x * 2, r: pGrid.r - 2 };
                    } else if (this.name === 'Clyde') { 
                        let dist = Math.hypot(currentGrid.c - pGrid.c, currentGrid.r - pGrid.r);
                        target = dist > 5 ? { c: pGrid.c, r: pGrid.r } : { c: 0, r: 18 };
                    }
                }
            }

            let possibleDirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].filter(d => {
                if(d.x === -this.dir.x && d.y === -this.dir.y && this.dir !== DIR.NONE) return false;
                
                let nc = currentGrid.c + d.x;
                let nr = currentGrid.r + d.y;
                
                if (nc < 0 || nc >= COLS) {
                    return d.y === 0;
                }
                
                if(nr >= 0 && nr < ROWS) {
                    if(map[nr][nc] === 4 && this.state !== 'EATEN' && currentGrid.r === 8) return false;
                    return map[nr][nc] !== 1;
                }
                return false;
            });

            if(possibleDirs.length === 0) possibleDirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].filter(d => this.canMove(d));

            if(possibleDirs.length > 0) {
                if(this.state === 'FRIGHTENED') {
                     this.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
                } else {
                    possibleDirs.sort((a, b) => {
                        let distA = Math.pow((currentGrid.c + a.x) - target.c, 2) + Math.pow((currentGrid.r + a.y) - target.r, 2);
                        let distB = Math.pow((currentGrid.c + b.x) - target.c, 2) + Math.pow((currentGrid.r + b.y) - target.r, 2);
                        return distA - distB;
                    });
                    this.dir = possibleDirs[0];
                }
            }
        }

        this.x += this.dir.x * this.speed;
        this.y += this.dir.y * this.speed;

        if (this.x < -CS/2) this.x = COLS * CS - CS/2;
        if (this.x > COLS * CS - CS/2) this.x = -CS/2;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        let drawColor = this.color;
        if(this.state === 'FRIGHTENED') {
            drawColor = (this.frightenedTimer < 120 && Math.floor(Date.now()/150)%2===0) ? '#FFFFFF' : '#0000FF';
        }

        if(this.state !== 'EATEN') {
            ctx.beginPath();
            ctx.arc(0, -CS*0.05, CS*0.42, Math.PI, 0);
            ctx.lineTo(CS*0.42, CS*0.42);
            ctx.lineTo(CS*0.25, CS*0.25); ctx.lineTo(0, CS*0.42);
            ctx.lineTo(-CS*0.25, CS*0.25); ctx.lineTo(-CS*0.42, CS*0.42);
            ctx.fillStyle = drawColor;
            ctx.fill();
            ctx.closePath();
        }

        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(-CS*0.16, -CS*0.12, CS*0.13, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(CS*0.16, -CS*0.12, CS*0.13, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = 'blue';
        let px = this.dir.x * 2.5; let py = this.dir.y * 2.5;
        ctx.beginPath(); ctx.arc(-CS*0.16 + px, -CS*0.12 + py, CS*0.06, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(CS*0.16 + px, -CS*0.12 + py, CS*0.06, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    }
}

let pacman;
let ghosts = [];

function initGame() {
    parseMap();
    pacman = new PacMan();
    ghosts = [
        new Ghost(9, 7, '#FF0000', 'Blinky'), 
        new Ghost(9, 9, '#FFB8FF', 'Pinky'),  
        new Ghost(8, 9, '#00FFFF', 'Inky'),   
        new Ghost(10, 9, '#FFB852', 'Clyde')  
    ];
    score = 0;
    lives = 3;
    updateUI();
    render();
}

function resetPositions() {
    pacman = new PacMan();
    ghosts.forEach((g) => {
        g.x = g.baseX * CS + CS/2;
        g.y = g.baseY * CS + CS/2;
        g.dir = DIR.NONE;
        g.nextDir = DIR.NONE;
        g.state = 'CHASE';
        g.speed = 2; 
        g.targetSpeed = 2;
    });
}

function triggerFrightenedMode() {
    ghostCombo = 0;
    ghosts.forEach(g => {
        if(g.state !== 'EATEN') {
            g.state = 'FRIGHTENED';
            g.frightenedTimer = 450; 
            g.dir = {x: -g.dir.x, y: -g.dir.y}; 
        }
    });
}

function checkCollisions() {
    ghosts.forEach(g => {
        let dist = Math.hypot(pacman.x - g.x, pacman.y - g.y);
        if(dist < CS * 0.72) { 
            if(g.state === 'FRIGHTENED') {
                g.state = 'EATEN';
                audio.playEatGhost();
                ghostCombo++;
                score += 100 * Math.pow(2, ghostCombo);
                updateUI(); 
            } else if (g.state === 'CHASE') {
                handleDeath();
            }
        }
    });
}

function handleDeath() {
    gameState = 'DEATH';
    audio.playDeath();
    lives--;
    updateUI();
    
    setTimeout(() => {
        if(lives > 0) {
            resetPositions();
            gameState = 'PLAYING';
            audio.startSiren();
            loop();
        } else {
            gameState = 'GAMEOVER';
            audio.stopSiren();
            document.getElementById('overlay').classList.remove('hidden');
            document.getElementById('overlay-title').innerText = "GAME OVER";
            document.getElementById('overlay-title').style.color = "red";
            document.getElementById('start-btn').innerText = "RESTART";
            
            const creditText = document.getElementById('credit-text');
            if (creditText) {
                creditText.style.display = 'none';
            }
            
            highScore = 0;
            updateUI(); 
        }
    }, 1600);
}

function checkWin() {
    let dotsLeft = false;
    for(let r=0; r<ROWS; r++){
        for(let c=0; c<COLS; c++){
            if(map[r][c] === 2 || map[r][c] === 3) dotsLeft = true;
        }
    }
    if(!dotsLeft) {
        gameState = 'WIN';
        audio.stopSiren();
        setTimeout(() => {
            parseMap();
            resetPositions();
            gameState = 'PLAYING';
            audio.startSiren();
            loop();
        }, 2000);
    }
}

function updateUI() {
    if (score > highScore) {
        highScore = score;
    }
    document.getElementById('score').innerText = score;
    document.getElementById('high-score').innerText = highScore;
    document.getElementById('lives').innerText = '❤️'.repeat(lives);
}

function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            let x = c * CS;
            let y = r * CS;
            if(map[r][c] === 1) { 
                ctx.fillStyle = '#0000AA';
                ctx.strokeStyle = '#0022FF'; 
                ctx.lineWidth = 2;
                ctx.fillRect(x+2, y+2, CS-4, CS-4);
                ctx.strokeRect(x+1, y+1, CS-2, CS-2);
            } else if (map[r][c] === 2) { 
                ctx.fillStyle = '#FFB8AE';
                ctx.beginPath(); ctx.arc(x+CS/2, y+CS/2, CS*0.13, 0, Math.PI*2); ctx.fill();
            } else if (map[r][c] === 3) { 
                if (Math.floor(Date.now()/200)%2===0) { 
                    ctx.fillStyle = '#FFB8AE';
                    ctx.beginPath(); ctx.arc(x+CS/2, y+CS/2, CS*0.32, 0, Math.PI*2); ctx.fill();
                }
            } else if (map[r][c] === 4) { 
                ctx.fillStyle = '#FFB8FF';
                ctx.fillRect(x, y+CS*0.4, CS, CS*0.2);
            }
        }
    }
}

function render() {
    drawMap();
    pacman.draw();
    ghosts.forEach(g => g.draw());
}

function loop() {
    if(gameState !== 'PLAYING') return;
    
    pacman.update();
    ghosts.forEach(g => g.update());
    checkCollisions();
    render();
    
    animationId = requestAnimationFrame(loop);
}

function setDirection(dirName) {
    if(gameState !== 'PLAYING') return;
    pacman.nextDir = DIR[dirName];
}

window.addEventListener('keydown', (e) => {
    audio.init(); 
    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': setDirection('UP'); break;
        case 'ArrowDown': case 's': case 'S': setDirection('DOWN'); break;
        case 'ArrowLeft': case 'a': case 'A': setDirection('LEFT'); break;
        case 'ArrowRight': case 'd': case 'D': setDirection('RIGHT'); break;
    }
});

const touchButtons = [
    { id: 'btn-up', dir: 'UP' },
    { id: 'btn-down', dir: 'DOWN' },
    { id: 'btn-left', dir: 'LEFT' },
    { id: 'btn-right', dir: 'RIGHT' }
];

touchButtons.forEach(btnInfo => {
    const el = document.getElementById(btnInfo.id);
    if(el) {
        const trigger = (e) => {
            e.preventDefault();
            audio.init();
            setDirection(btnInfo.dir);
        };
        el.addEventListener('touchstart', trigger, {passive: false});
        el.addEventListener('mousedown', trigger);
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    audio.init();
    audio.playTone(440, 'square', 0.4, 0.15); 
    document.getElementById('overlay').classList.add('hidden');
    
    if(gameState === 'INIT' || gameState === 'GAMEOVER') {
        initGame();
    }
    
    gameState = 'PLAYING';
    audio.startSiren();
    loop();
});

parseMap();
render();
             
