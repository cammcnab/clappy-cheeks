// Get canvas context and set size
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 480;
canvas.height = 720;

// Game state
let gameStarted = false;
let gameOver = false;
let score = 0;
let credits = 3;
let knockoutTime = 0;
let lastFrameTime = 0;

// Load images
const cheeksImage = new Image();
const armImage = new Image();

// Track loaded images
let loadedImages = 0;
const totalImages = 2;

function handleImageLoad() {
    loadedImages++;
    if (loadedImages === totalImages) {
        startGame();
    }
}

// Set up image loading
cheeksImage.onload = handleImageLoad;
armImage.onload = handleImageLoad;

cheeksImage.src = 'images/cheeks.png';
armImage.src = 'images/arm.png';

// Add these constants after the game state variables
const GRAVITY = 0.7;
const FLAP_SPEED = -9.5;
const CHEEKS_SIZE = 25;
const GLOVE_WIDTH = 50;
const GLOVE_GAP = 200;
const GLOVE_SPEED = 4;
const KNOCKOUT_DELAY = 1500;

// Add audio setup
const clapSounds = [];
const gameAudio = {
    cheer: new Audio('audio/cheering.wav'),
    boo: new Audio('audio/booing.wav')
};

// Set cheer volume lower and make it loop
gameAudio.cheer.volume = 0.3;
gameAudio.cheer.loop = true;

// Load clap sounds
for (let i = 1; i <= 9; i++) {
    const sound = new Audio(`audio/claps/clap${i}.wav`);
    clapSounds.push(sound);
}

let currentClapSound = 0;

// Add sound functions
function playFlapSound() {
    clapSounds[currentClapSound].currentTime = 0;
    clapSounds[currentClapSound].play();
    currentClapSound = (currentClapSound + 1) % clapSounds.length;
}

function playCheerSound() {
    gameAudio.cheer.currentTime = 0;
    gameAudio.cheer.play();
}

function stopCheerSound() {
    gameAudio.cheer.pause();
    gameAudio.cheer.currentTime = 0;
}

function playKnockoutSound() {
    stopCheerSound();
    gameAudio.boo.currentTime = 0;
    gameAudio.boo.play();
}

// Add game objects
const cheeks = {
    x: canvas.width / 3,
    y: canvas.height / 2,
    velocity: 0,
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.drawImage(
            cheeksImage,
            -CHEEKS_SIZE,
            -CHEEKS_SIZE,
            CHEEKS_SIZE * 2,
            CHEEKS_SIZE * 2
        );
        ctx.restore();
    },
    
    flap() {
        this.velocity = FLAP_SPEED;
        playFlapSound();
    },
    
    update() {
        this.velocity += GRAVITY;
        this.y += this.velocity;
        
        if (this.velocity > 4) {
            this.velocity = 4;
        }
    }
};

const gloves = {
    pairs: [],
    
    spawn() {
        const minY = GLOVE_GAP + 100;
        const maxY = canvas.height - GLOVE_GAP - 100;
        let y;
        
        if (score > 10) {
            if (Math.random() < 0.3) {
                y = Math.random() < 0.5 ? minY : maxY;
            } else {
                y = Math.random() * (maxY - minY) + minY;
            }
        } else {
            y = Math.random() * (maxY - minY) + minY;
        }
        
        this.pairs.push({
            x: canvas.width,
            gapY: y,
            passed: false
        });
    },
    
    draw() {
        this.pairs.forEach(pair => {
            const gapHalf = GLOVE_GAP / 2;
            const armHeight = armImage.height;
            
            // Draw single top arm at gap edge
            ctx.save();
            ctx.translate(pair.x, pair.gapY - gapHalf - armHeight/2);
            ctx.scale(1, 1);
            ctx.rotate(Math.PI);
            ctx.drawImage(
                armImage,
                -armImage.width/2,
                -armImage.height/2,
                armImage.width,
                armImage.height
            );
            ctx.restore();
            
            // Draw single bottom arm at gap edge
            ctx.save();
            ctx.translate(pair.x, pair.gapY + gapHalf + armHeight/2);
            ctx.drawImage(
                armImage,
                -armImage.width/2,
                -armImage.height/2,
                armImage.width,
                armImage.height
            );
            ctx.restore();
        });
    },
    
    update() {
        this.pairs.forEach(pair => {
            pair.x -= GLOVE_SPEED;
        });
        
        this.pairs = this.pairs.filter(pair => pair.x + GLOVE_WIDTH > 0);
        
        if (this.pairs.length === 0 || 
            this.pairs[this.pairs.length - 1].x < canvas.width - 300) {
            this.spawn();
        }
    }
};

function drawBackground() {
    // Dark background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Crowd area with gradient
    const crowdGradient = ctx.createLinearGradient(0, 0, 0, canvas.height/3);
    crowdGradient.addColorStop(0, '#000022');
    crowdGradient.addColorStop(1, '#000044');
    ctx.fillStyle = crowdGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height/3);
    
    // Static crowd pattern (less random, more structured)
    ctx.fillStyle = 'rgba(255, 156, 0, 0.15)';
    for(let row = 0; row < 8; row++) {
        for(let x = 0; x < canvas.width; x += 12) {
            const y = row * 12;
            // Alternating pattern
            if ((x + row) % 24 === 0) {
                ctx.fillRect(x, y, 8, 8);
            }
        }
    }
    
    // Ring floor (authentic green)
    ctx.fillStyle = '#004400';
    ctx.fillRect(0, canvas.height/3, canvas.width, canvas.height * 2/3);
    
    // Ring mat pattern (more subtle)
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 1;
    const matSize = 60;
    for(let x = 0; x < canvas.width; x += matSize) {
        for(let y = canvas.height/3; y < canvas.height; y += matSize) {
            ctx.strokeRect(x, y, matSize, matSize);
        }
    }
    
    // Ring ropes
    const ropePositions = [canvas.height/3, canvas.height/3 + 50, canvas.height/3 + 100];
    ropePositions.forEach(y => {
        // Rope shadow
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, y + 3);
        ctx.lineTo(canvas.width, y + 3);
        ctx.stroke();
        
        // Main rope
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    });
    
    // Ring posts
    const postWidth = 24;
    const postHeight = 120;
    
    // Left post
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(0, canvas.height/3 - postHeight, postWidth, postHeight);
    ctx.fillStyle = '#AA0000';
    ctx.fillRect(0, canvas.height/3 - postHeight, postWidth/3, postHeight);
    
    // Right post
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(canvas.width - postWidth, canvas.height/3 - postHeight, postWidth, postHeight);
    ctx.fillStyle = '#AA0000';
    ctx.fillRect(canvas.width - postWidth, canvas.height/3 - postHeight, postWidth/3, postHeight);
}

// Add this function after the game objects but before startGame
function checkCollision(rect1, rect2) {
    return rect1.left < rect2.right &&
           rect1.right > rect2.left &&
           rect1.top < rect2.bottom &&
           rect1.bottom > rect2.top;
}

function startGame() {
    // Start game loop
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    // Calculate delta time
    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Clear canvas
    ctx.fillStyle = '#000066';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameStarted) {
        // Draw title screen
        drawBackground();
        
        ctx.fillStyle = '#000000';
        ctx.font = `48px "Press Start 2P"`;
        ctx.textAlign = 'center';
        ctx.fillText('CLAPPY', canvas.width/2 + 4, canvas.height/3 + 4);
        ctx.fillText('CHEEKS', canvas.width/2 + 4, canvas.height/3 + 52);
        
        ctx.fillStyle = '#FF9C00';
        ctx.fillText('CLAPPY', canvas.width/2, canvas.height/3);
        ctx.fillText('CHEEKS', canvas.width/2, canvas.height/3 + 48);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px "Press Start 2P"';
        ctx.fillText('CREDITS: ' + credits, canvas.width/2, canvas.height * 2/3);
        
        if (credits > 0) {
            if (Math.floor(Date.now() / 500) % 2) {
                ctx.fillText('PRESS SPACE', canvas.width/2, canvas.height * 2/3 + 40);
            }
        }
    } else if (gameOver) {
        // Game over screen
        drawBackground();
        if (Date.now() - knockoutTime > 1500) {
            ctx.fillStyle = '#FF0000';
            ctx.font = '36px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('T.K.O.!!', canvas.width/2, canvas.height/3);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '24px "Press Start 2P"';
            ctx.fillText(`SCORE: ${score}`, canvas.width/2, canvas.height/2);
            ctx.fillText(`CREDITS: ${credits}`, canvas.width/2, canvas.height/2 + 40);
            
            if (credits > 0) {
                if (Math.floor(Date.now() / 500) % 2) {
                    ctx.fillText('PRESS SPACE', canvas.width/2, canvas.height * 2/3);
                }
            }
        }
    } else {
        // Game running
        drawBackground();
        
        cheeks.update();
        gloves.update();
        
        // Check collisions
        const cheeksBox = {
            left: cheeks.x - CHEEKS_SIZE,
            right: cheeks.x + CHEEKS_SIZE,
            top: cheeks.y - CHEEKS_SIZE,
            bottom: cheeks.y + CHEEKS_SIZE
        };

        // Check boundaries
        if (cheeksBox.top < 0 || cheeksBox.bottom > canvas.height) {
            gameOver = true;
            knockoutTime = Date.now();
            playKnockoutSound();
            return;
        }

        // Check glove collisions
        gloves.pairs.forEach(pair => {
            const gapHalf = GLOVE_GAP / 2;
            const topGloveBox = {
                left: pair.x - GLOVE_WIDTH/2,
                right: pair.x + GLOVE_WIDTH/2,
                top: 0,
                bottom: pair.gapY - gapHalf
            };
            
            const bottomGloveBox = {
                left: pair.x - GLOVE_WIDTH/2,
                right: pair.x + GLOVE_WIDTH/2,
                top: pair.gapY + gapHalf,
                bottom: canvas.height
            };

            if (checkCollision(cheeksBox, topGloveBox) || 
                checkCollision(cheeksBox, bottomGloveBox)) {
                gameOver = true;
                knockoutTime = Date.now();
                playKnockoutSound();
                return;
            }

            // Score points
            if (!pair.passed && pair.x < cheeks.x) {
                score++;
                pair.passed = true;
            }
        });
        
        // Draw everything
        gloves.draw();  // Draw gloves first
        cheeks.draw();  // Draw cheeks on top
        
        // Draw score HUD last
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, 50);
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, canvas.width-4, 46);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '32px "Press Start 2P"';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${score}`, 20, 35);
    }

    requestAnimationFrame(gameLoop);
}

// Add keyboard controls
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
    }
});

function handleInput() {
    if (!gameStarted) {
        if (credits > 0) {
            gameStarted = true;
            score = 0;
            gloves.pairs = [];
            cheeks.y = canvas.height / 2;
            cheeks.velocity = 0;
            credits--;
            playCheerSound();
        }
    } else if (gameOver && Date.now() - knockoutTime > KNOCKOUT_DELAY) {
        if (credits > 0) {
            gameStarted = true;
            gameOver = false;
            score = 0;
            gloves.pairs = [];
            cheeks.y = canvas.height / 2;
            cheeks.velocity = 0;
            credits--;
            playCheerSound();
        }
    } else if (!gameOver) {
        cheeks.flap();
    }
}

// Add touch controls
canvas.addEventListener('click', handleInput);
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInput();
});
