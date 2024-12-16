// Import CRT effect
import { CRTEffect } from './shaders.js';

// Early mobile detection - moved to top before any other code
function isTouchDevice() {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
    );
}

const isMobileDevice = isTouchDevice();
console.log('Mobile device:', isMobileDevice);

// Game objects
let cheeks;
let gloves;
let images = {
    cheeksImage: null,
    armImage: null,
    bgImage: null
};
let audio = {
    clapSounds: [],
    cheer: null,
    boo: null
};

// Constants
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 720;
const GRAVITY = 0.5;
const FLAP_SPEED = -8;
const CHEEKS_SIZE = 25;
const GLOVE_WIDTH = 50;
let gloveGap = 250;
const GLOVE_SPEED = 3;
const KNOCKOUT_DELAY = 1500;
const SPEED_INCREASE = 0.1;
const MAX_SPEED = 2.0;

// Game variables
let gameCanvas;
let ctx;
let effectCanvas;
let crtEffect;
let wrapper;
let monitorFrame;
let gameStarted = false;
let gameOver = false;
let score = 0;
let credits = 5;
let knockoutTime = 0;
let lastFrameTime = 0;
let gameStartDelay = 800;
let gameStartTime = 0;
let gameSpeed = 1;
let lastSpeedIncreaseScore = 0;
let mouseX = 0;
let mouseY = 0;
let isHandlingClick = false;
let crtEffectInitialized = false;
let squishStartTime = 0;
const SQUISH_DURATION = 100;

// Initialize function
async function init() {
    console.log('Initializing game components...');
    
    // Get canvas elements and monitor frame
    gameCanvas = document.getElementById('gameCanvas');
    monitorFrame = document.querySelector('.monitor-frame');
    
    if (!gameCanvas) {
        throw new Error('Game canvas not found');
    }
    
    if (!monitorFrame) {
        throw new Error('Monitor frame not found');
    }
    
    // Get context with explicit pixel format
    ctx = gameCanvas.getContext('2d', { 
        alpha: false,
        desynchronized: true,
        preserveDrawingBuffer: false
    });
    
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }
    
    // Set up canvas container
    const container = gameCanvas.parentElement;
    if (container) {
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.position = 'absolute';
        container.style.overflow = 'hidden';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';
        container.style.touchAction = 'manipulation';
    }
    
    // Set initial canvas sizes
    gameCanvas.width = CANVAS_WIDTH;
    gameCanvas.height = CANVAS_HEIGHT;
    
    // Set canvas styles
    gameCanvas.style.position = 'absolute';
    gameCanvas.style.imageRendering = 'pixelated';
    gameCanvas.style.touchAction = 'manipulation';
    gameCanvas.style.webkitTapHighlightColor = 'transparent';
    gameCanvas.style.userSelect = 'none';
    gameCanvas.style.webkitUserSelect = 'none';
    gameCanvas.style.opacity = '1';
    gameCanvas.style.visibility = 'visible';
    gameCanvas.style.zIndex = '1';
    
    // Initialize CRT effect
    try {
        effectCanvas = document.createElement('canvas');
        effectCanvas.id = 'effectCanvas';
        effectCanvas.style.position = 'absolute';
        effectCanvas.style.top = '50%';
        effectCanvas.style.left = '50%';
        effectCanvas.style.transform = 'translate(-50%, -50%)';
        effectCanvas.style.pointerEvents = 'none';
        effectCanvas.style.zIndex = '2';
        if (container) {
            container.appendChild(effectCanvas);
        }
        effectCanvas.width = CANVAS_WIDTH;
        effectCanvas.height = CANVAS_HEIGHT;
        
        crtEffect = new CRTEffect(effectCanvas);
        console.log('CRT effect initialized');
    } catch (error) {
        console.error('Failed to initialize CRT effect:', error);
    }
    
    // Add resize handler with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(handleResize, 100);
    });
    handleResize(); // Initial resize
    
    // Rest of initialization
    await loadImages();
    await initAudio();
    initGameObjects();
    initInputHandlers();
    startGame();
}

// Update resize handler
function handleResize() {
    if (!gameCanvas || !monitorFrame) return;
    
    // Get monitor frame dimensions - use full viewport
    const frameRect = monitorFrame.getBoundingClientRect();
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;
    
    // Update canvas dimensions to match frame
    gameCanvas.width = frameWidth;
    gameCanvas.height = frameHeight;
    
    // Update effect canvas if it exists
    if (effectCanvas) {
        effectCanvas.width = frameWidth;
        effectCanvas.height = frameHeight;
    }
    
    // Calculate new base unit for responsive sizing
    // Use the smaller dimension to ensure everything fits
    const baseUnit = Math.min(frameWidth, frameHeight) / 20;
    
    // Update game scale factors for responsive drawing
    window.gameScale = {
        x: frameWidth / CANVAS_WIDTH,
        y: frameHeight / CANVAS_HEIGHT,
        min: Math.min(frameWidth / CANVAS_WIDTH, frameHeight / CANVAS_HEIGHT),
        max: Math.max(frameWidth / CANVAS_WIDTH, frameHeight / CANVAS_HEIGHT),
        unit: baseUnit,
        width: frameWidth,
        height: frameHeight
    };
    
    // Update game object positions for new aspect ratio
    if (cheeks) {
        // Keep cheeks at relative X position
        cheeks.x = frameWidth / 3;
        if (!gameStarted) {
            cheeks.y = frameHeight / 2;
        }
    }
    
    // Update glove gaps and positions
    gloveGap = baseUnit * 8;
    
    console.log('Canvas resized:', frameWidth, frameHeight, 'Base unit:', baseUnit);
}

// Initialize audio
async function initAudio() {
    // Load clap sounds
    const clapPromises = [];
    for (let i = 1; i <= 9; i++) {
        const sound = new Audio(`audio/claps/clap${i}.wav`);
        sound.preload = 'auto';
        clapPromises.push(new Promise((resolve) => {
            sound.addEventListener('canplaythrough', resolve, { once: true });
            sound.addEventListener('error', resolve, { once: true }); // Handle failed loads gracefully
        }));
        audio.clapSounds.push(sound);
    }
    
    // Load other sounds
    audio.cheer = new Audio('audio/cheering.wav');
    audio.cheer.volume = 0.1;
    audio.cheer.loop = true;
    
    audio.boo = new Audio('audio/booing.wav');
    
    const otherSoundPromises = [
        new Promise((resolve) => {
            audio.cheer.addEventListener('canplaythrough', resolve, { once: true });
            audio.cheer.addEventListener('error', resolve, { once: true });
        }),
        new Promise((resolve) => {
            audio.boo.addEventListener('canplaythrough', resolve, { once: true });
            audio.boo.addEventListener('error', resolve, { once: true });
        })
    ];
    
    // Wait for all sounds to load
    await Promise.all([...clapPromises, ...otherSoundPromises]);
}

// Audio playback functions
let currentClapSound = 0;

function playFlapSound() {
    if (!audio.clapSounds[currentClapSound]) return;
    
    audio.clapSounds[currentClapSound].pause();
    audio.clapSounds[currentClapSound].currentTime = 0;
    
    try {
        audio.clapSounds[currentClapSound].play()
            .catch(e => console.log('Sound play failed:', e));
    } catch (e) {
        console.log('Sound play error:', e);
    }
    
    currentClapSound = (currentClapSound + 1) % audio.clapSounds.length;
}

function playCheerSound() {
    if (!audio.cheer) return;
    
    if (audio.cheer.currentTime === 0 || !audio.cheer.paused) {
        audio.cheer.currentTime = 0;
    }
    audio.cheer.play().catch(e => console.log('Cheer sound failed:', e));
}

function stopCheerSound() {
    if (!audio.cheer) return;
    
    audio.cheer.pause();
    audio.cheer.currentTime = 0;
}

function playKnockoutSound() {
    if (!audio.boo) return;
    
    stopCheerSound();
    audio.boo.currentTime = 0;
    audio.boo.play().catch(e => console.log('Boo sound failed:', e));
}

// Start game function
function startGame() {
    console.log('Starting new game...');
    gameStarted = false;
    gameOver = false;
    score = 0;
    gameSpeed = 1;
    lastSpeedIncreaseScore = 0;
    
    // Reset game objects
    if (cheeks) {
        cheeks.y = CANVAS_HEIGHT / 2;
        cheeks.velocity = 0;
    }
    
    if (gloves) {
        gloves.pairs = [];
    }
    
    // Reset game time
    gameStartTime = performance.now();
    lastFrameTime = gameStartTime;
    
    console.log('Game state reset');
}

// Load images function
async function loadImages() {
    const imagePromises = [
        loadImage('images/cheeks.png').then(img => images.cheeksImage = img),
        loadImage('images/arm.png').then(img => images.armImage = img),
        loadImage('images/bg.png').then(img => images.bgImage = img)
    ];
    
    await Promise.all(imagePromises);
}

// Helper function to load a single image
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// Initialize game objects
function initGameObjects() {
    cheeks = {
        x: window.gameScale ? window.gameScale.width / 3 : CANVAS_WIDTH / 3,
        y: window.gameScale ? window.gameScale.height / 2 : CANVAS_HEIGHT / 2,
        velocity: 0,
        draw() {
            if (!images.cheeksImage || !window.gameScale) return;
            const scale = window.gameScale;
            
            ctx.save();
            ctx.translate(this.x, this.y);
            
            // Calculate squish scale based on time
            let xScale = 1;
            if (squishStartTime > 0) {
                const elapsed = performance.now() - squishStartTime;
                if (elapsed < SQUISH_DURATION) {
                    const progress = elapsed / SQUISH_DURATION;
                    xScale = 1 - 0.3 * Math.sin(progress * Math.PI);
                } else {
                    squishStartTime = 0;
                }
            }
            
            // Scale based on screen size
            const size = Math.min(scale.width, scale.height) / 15;
            ctx.scale(xScale * (size / CHEEKS_SIZE), (1 + (1 - xScale) * 0.5) * (size / CHEEKS_SIZE));
            
            ctx.drawImage(
                images.cheeksImage,
                -CHEEKS_SIZE,
                -CHEEKS_SIZE,
                CHEEKS_SIZE * 2,
                CHEEKS_SIZE * 2
            );
            ctx.restore();
        },
        update() {
            if (!window.gameScale) return;
            
            this.velocity += GRAVITY * gameSpeed;
            this.y += this.velocity * gameSpeed;
            
            if (this.velocity > 4) {
                this.velocity = 4;
            }
        }
    };
    
    gloves = {
        pairs: [],
        draw() {
            if (!images.armImage || !window.gameScale) return;
            const scale = window.gameScale;
            
            this.pairs.forEach(pair => {
                const gapHalf = gloveGap / 2;
                const armSize = Math.min(scale.width, scale.height) / 8;
                
                // Draw top arm
                ctx.save();
                ctx.translate(pair.x, pair.gapY - gapHalf - armSize / 2);
                ctx.scale(armSize / images.armImage.width, armSize / images.armImage.height);
                ctx.rotate(Math.PI);
                ctx.drawImage(
                    images.armImage,
                    -images.armImage.width / 2,
                    -images.armImage.height / 2,
                    images.armImage.width,
                    images.armImage.height
                );
                ctx.restore();
                
                // Draw bottom arm
                ctx.save();
                ctx.translate(pair.x, pair.gapY + gapHalf + armSize / 2);
                ctx.scale(armSize / images.armImage.width, armSize / images.armImage.height);
                ctx.drawImage(
                    images.armImage,
                    -images.armImage.width / 2,
                    -images.armImage.height / 2,
                    images.armImage.width,
                    images.armImage.height
                );
                ctx.restore();
            });
        },
        update() {
            if (!window.gameScale) return;
            
            // Don't move gloves during initial delay
            if (performance.now() - gameStartTime < gameStartDelay) {
                return;
            }
            
            const speed = GLOVE_SPEED * gameSpeed * (window.gameScale.width / CANVAS_WIDTH);
            
            this.pairs.forEach(pair => {
                pair.x -= speed;
            });
            
            this.pairs = this.pairs.filter(pair => pair.x + GLOVE_WIDTH > 0);
            
            if (this.pairs.length === 0 || this.pairs[this.pairs.length - 1].x < window.gameScale.width - window.gameScale.width/3) {
                this.spawn();
            }
        },
        spawn() {
            if (!window.gameScale) return;
            
            const scale = window.gameScale;
            const minY = gloveGap + scale.height * 0.2;
            const maxY = scale.height - gloveGap - scale.height * 0.2;
            let y;
            
            if (this.pairs.length === 0) {
                y = scale.height / 2;
            } else if (score < 20) {
                const centerY = scale.height / 2;
                const variance = scale.height * 0.15;
                y = centerY + (Math.random() * variance * 2 - variance);
            } else {
                if (Math.random() < 0.2) {
                    y = Math.random() < 0.5 ? minY : maxY;
                } else {
                    y = Math.random() * (maxY - minY) + minY;
                }
            }
            
            this.pairs.push({
                x: scale.width,
                gapY: y,
                passed: false
            });
        }
    };
}

// Input handling
function handleInput() {
    if (!gameStarted) {
        if (credits > 0) {
            gameStarted = true;
            gameStartTime = performance.now();
            playCheerSound();
        }
    } else if (gameOver && performance.now() - knockoutTime > KNOCKOUT_DELAY) {
        if (credits > 0) {
            startGame();
            gameStarted = true;
            gameOver = false;
            gameStartTime = performance.now();
            playCheerSound();
        }
    } else if (!gameOver) {
        if (cheeks) {
            cheeks.velocity = FLAP_SPEED;
            squishStartTime = performance.now();
            playFlapSound();
        }
    }
}

// Initialize input handlers
function initInputHandlers() {
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            handleInput();
        }
    });
    
    // Mouse/touch controls with better mobile handling
    if (gameCanvas) {
        // Prevent default behaviors
        gameCanvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        gameCanvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
        
        // Handle clicks and touches
        gameCanvas.addEventListener('click', handleInput);
        gameCanvas.addEventListener('touchstart', handleInput);
        
        // Prevent double-tap zoom on mobile
        let lastTap = 0;
        gameCanvas.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault();
            }
            lastTap = currentTime;
        });
    }
}

// Game loop
function gameLoop(timestamp) {
    if (!ctx || !gameCanvas) {
        console.error('Canvas context not available');
        return;
    }

    // Calculate delta time
    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Clear the canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background
    drawBackground();

    if (!gameStarted) {
        drawTitleScreen();
    } else if (gameOver) {
        drawGameOverScreen();
    } else {
        // Update game objects
        if (cheeks) cheeks.update();
        if (gloves) gloves.update();
        
        // Check collisions
        if (checkCollisions()) {
            gameOver = true;
            knockoutTime = performance.now();
            credits--;
        }
        
        // Check bounds
        if (checkBounds()) {
            gameOver = true;
            knockoutTime = performance.now();
            credits--;
        }
        
        // Draw game objects
        if (gloves) gloves.draw();
        if (cheeks) cheeks.draw();
    }

    // Apply CRT effect
    if (crtEffect) {
        try {
            crtEffect.render(gameCanvas);
        } catch (error) {
            console.error('CRT effect error:', error);
        }
    }

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// Drawing functions
function drawBackground() {
    const scale = window.gameScale;
    if (!scale) return;
    
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    const unit = scale.unit;
    
    // Background
    ctx.fillStyle = '#000044';
    ctx.fillRect(0, 0, width, height);
    
    // Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = Math.max(1, unit / 20);
    
    // Horizontal lines
    const lineCount = Math.floor(height / (unit * 2));
    const lineSpacing = height / lineCount;
    
    for (let i = 0; i <= lineCount; i++) {
        const y = i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Vertical lines
    const colCount = Math.floor(width / (unit * 2));
    const colSpacing = width / colCount;
    
    for (let i = 0; i <= colCount; i++) {
        const x = i * colSpacing;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // HUD bar
    const hudHeight = unit * 2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, hudHeight);
    
    // Scale font size based on unit
    const fontSize = Math.max(unit * 0.8, 12);
    ctx.font = `${fontSize}px "Press Start 2P"`;
    
    // HUD elements with responsive positioning
    const padding = unit;
    
    // Left: Rounds
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(`ROUNDS: ${credits}`, padding, hudHeight * 0.7);
    
    // Center: Score
    const scoreWidth = unit * 8;
    ctx.fillStyle = '#98FF98';
    ctx.fillRect(width/2 - scoreWidth/2, padding/2, scoreWidth, hudHeight - padding);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText(`POINTS: ${score}`, width/2, hudHeight * 0.7);
    
    // Right: Round number
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText(`ROUND ${Math.floor(score/10) + 1}`, width - padding, hudHeight * 0.7);
    
    // Ring elements
    const ringTop = hudHeight + unit * 2;
    const ringBottom = height - unit * 2;
    const ringHeight = ringBottom - ringTop;
    
    // Ring floor
    ctx.fillStyle = '#00CEC4';
    ctx.fillRect(-unit, ringTop, width + unit * 2, ringHeight);
    
    // Ring posts
    const postWidth = unit * 0.8;
    const postHeight = unit * 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, ringTop - postHeight/2, postWidth, postHeight);
    ctx.fillRect(width - postWidth, ringTop - postHeight/2, postWidth, postHeight);
    
    // Ring ropes
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = unit / 6;
    
    // Top ropes
    for (let i = 0; i < 3; i++) {
        const y = ringTop + i * unit;
        ctx.beginPath();
        ctx.moveTo(-unit, y);
        ctx.lineTo(width + unit, y);
        ctx.stroke();
    }
    
    // Bottom ropes
    for (let i = 0; i < 3; i++) {
        const y = ringBottom - i * unit;
        ctx.beginPath();
        ctx.moveTo(-unit, y);
        ctx.lineTo(width + unit, y);
        ctx.stroke();
    }
    
    // Side ropes
    ctx.beginPath();
    ctx.moveTo(postWidth/2, ringTop);
    ctx.lineTo(postWidth/2, ringBottom);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(width - postWidth/2, ringTop);
    ctx.lineTo(width - postWidth/2, ringBottom);
    ctx.stroke();
}

function drawTitleScreen() {
    const scale = window.gameScale;
    if (!scale) return;
    
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    const unit = scale.unit;
    
    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Grid pattern
    const gridSize = unit / 4;
    ctx.strokeStyle = 'rgba(0, 80, 255, 0.15)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Title text
    const titleY = height * 0.2;
    ctx.textAlign = 'center';
    ctx.font = `${unit * 3}px "Press Start 2P"`;
    
    // Create gradient
    const titleGradient = ctx.createLinearGradient(0, titleY - unit * 2, 0, titleY + unit * 3);
    titleGradient.addColorStop(0, '#FFA500');
    titleGradient.addColorStop(0.5, '#FFD700');
    titleGradient.addColorStop(1, '#FFA500');
    
    ctx.fillStyle = titleGradient;
    ctx.fillText('CLAPPY', width/2, titleY);
    ctx.fillText('CHEEKS!!', width/2, titleY + unit * 3);
    
    // Menu text
    ctx.font = `${unit * 1.5}px "Press Start 2P"`;
    
    const menuY = height * 0.6;
    const menuItems = credits > 0 ? ['PRESS', 'SPACE'] : ['INSERT', 'COIN'];
    const gloveSpacing = unit * 8;
    
    menuItems.forEach((item, index) => {
        const y = menuY + index * unit * 2;
        
        // Draw pointing gloves
        const gloveY = menuY + unit;
        
        if (index === 0 && images.armImage) {
            // Left glove
            ctx.save();
            ctx.translate(width/2 - gloveSpacing, gloveY);
            ctx.scale(scale.min * 0.7, scale.min * 0.7);
            ctx.rotate(Math.PI/2);
            ctx.drawImage(
                images.armImage,
                -images.armImage.width/2,
                -images.armImage.height/2,
                images.armImage.width,
                images.armImage.height
            );
            ctx.restore();
            
            // Right glove
            ctx.save();
            ctx.translate(width/2 + gloveSpacing, gloveY);
            ctx.scale(-scale.min * 0.7, scale.min * 0.7);
            ctx.rotate(Math.PI/2);
            ctx.drawImage(
                images.armImage,
                -images.armImage.width/2,
                -images.armImage.height/2,
                images.armImage.width,
                images.armImage.height
            );
            ctx.restore();
        }
        
        ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF';
        ctx.fillText(item, width/2, y);
    });
    
    // Rounds counter
    ctx.font = `${unit}px "Press Start 2P"`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`ROUNDS LEFT: ${credits}`, width/2, height * 0.45);
    
    // Copyright
    ctx.font = `${unit * 0.6}px "Press Start 2P"`;
    ctx.fillStyle = '#999999';
    ctx.fillText('NOT © 2024 FWD:FWD:FWD:', width/2, height * 0.85);
}

function drawGameOverScreen() {
    drawBackground();
    
    const scale = window.gameScale;
    if (!scale) return;
    
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    const unit = scale.unit;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${unit * 2}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', width/2, height * 0.4);
    
    ctx.font = `${unit}px "Press Start 2P"`;
    ctx.fillText(`SCORE: ${score}`, width/2, height * 0.5);
    
    if (credits > 0) {
        ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF';
        ctx.fillText('PRESS SPACE', width/2, height * 0.7);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`ROUNDS LEFT: ${credits}`, width/2, height * 0.8);
    }
}

// Collision detection
function checkCollisions() {
    if (!cheeks || !gloves || !window.gameScale) return false;
    const scale = window.gameScale;
    
    const size = Math.min(scale.width, scale.height) / 15;
    const cheeksBox = {
        x: cheeks.x - size,
        y: cheeks.y - size,
        width: size * 2,
        height: size * 2
    };
    
    for (const pair of gloves.pairs) {
        const armSize = Math.min(scale.width, scale.height) / 8;
        const gapHalf = gloveGap / 2;
        
        const topGlove = {
            x: pair.x - armSize/2,
            y: 0,
            width: armSize,
            height: pair.gapY - gapHalf
        };
        
        const bottomGlove = {
            x: pair.x - armSize/2,
            y: pair.gapY + gapHalf,
            width: armSize,
            height: scale.height - (pair.gapY + gapHalf)
        };
        
        if (intersectRect(cheeksBox, topGlove) || intersectRect(cheeksBox, bottomGlove)) {
            playKnockoutSound();
            return true;
        }
        
        if (!pair.passed && cheeks.x > pair.x) {
            pair.passed = true;
            score++;
        }
    }
    
    return false;
}

// Helper function for collision detection
function intersectRect(r1, r2) {
    return !(r2.x > r1.x + r1.width || 
             r2.x + r2.width < r1.x || 
             r2.y > r1.y + r1.height ||
             r2.y + r2.height < r1.y);
}

// Update bounds checking
function checkBounds() {
    if (!cheeks || !window.gameScale) return false;
    return cheeks.y < 0 || cheeks.y > window.gameScale.height;
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing game...');
    try {
        await init();
        console.log('Game initialized, starting game loop...');
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
});

