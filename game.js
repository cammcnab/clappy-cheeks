// Import CRT effect
import { CRTEffect } from './shaders.js';

// Get canvas context and set size
const gameCanvas = document.getElementById('gameCanvas');
const ctx = gameCanvas.getContext('2d');

// Create effect canvas
const effectCanvas = document.createElement('canvas');
effectCanvas.id = 'effectCanvas';
effectCanvas.style.position = 'absolute';
effectCanvas.style.top = '0';
effectCanvas.style.left = '0';
effectCanvas.style.width = '100%';
effectCanvas.style.height = '100%';
gameCanvas.parentElement.appendChild(effectCanvas);

// Set canvas sizes
function setCanvasSizes() {
	const width = 480;
	const height = 720;
	gameCanvas.width = width;
	gameCanvas.height = height;
	effectCanvas.width = width;
	effectCanvas.height = height;
}
setCanvasSizes();

// Initialize CRT effect
const crtEffect = new CRTEffect(effectCanvas);

// Game state
let gameStarted = false;
let gameOver = false;
let score = 0;
let roundNumber = 1;
let knockoutTime = 0;
let lastFrameTime = 0;

// Load images
const cheeksImage = new Image();
const armImage = new Image();
const bgImage = new Image();

// Track loaded images
let loadedImages = 0;
const totalImages = 3;

function handleImageLoad() {
	loadedImages++;
	if (loadedImages === totalImages) {
		startGame();
	}
}

// Set up image loading
cheeksImage.onload = handleImageLoad;
armImage.onload = handleImageLoad;
bgImage.onload = handleImageLoad;

cheeksImage.src = 'images/cheeks.png';
armImage.src = 'images/arm.png';
bgImage.src = 'images/bg.png';

// Add these constants after the game state variables
const GRAVITY = 0.5;
const FLAP_SPEED = -8;
const CHEEKS_SIZE = 25;
const GLOVE_WIDTH = 50;
const GLOVE_GAP = 250;
const GLOVE_SPEED = 3;
const KNOCKOUT_DELAY = 1500;

// Add audio setup
const clapSounds = [];
const gameAudio = {
	cheer: new Audio('audio/cheering.wav'),
	boo: new Audio('audio/booing.wav'),
};

// Set cheer volume much lower and make it loop
gameAudio.cheer.volume = 0.1;
gameAudio.cheer.loop = true;

// Load clap sounds
for (let i = 1; i <= 9; i++) {
	const sound = new Audio(`audio/claps/clap${i}.wav`);
	sound.preload = 'auto';
	clapSounds.push(sound);
}

let currentClapSound = 0;

// Add sound functions
function playFlapSound() {
	clapSounds[currentClapSound].pause();
	clapSounds[currentClapSound].currentTime = 0;

	try {
		clapSounds[currentClapSound]
			.play()
			.catch((e) => console.log('Sound play failed:', e));
	} catch (e) {
		console.log('Sound play error:', e);
	}

	currentClapSound = (currentClapSound + 1) % clapSounds.length;
}

function playCheerSound() {
	if (gameAudio.cheer.currentTime === 0 || !gameAudio.cheer.paused) {
		gameAudio.cheer.currentTime = 0;
	}
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
	x: gameCanvas.width / 3,
	y: gameCanvas.height / 2,
	velocity: 0,
	squishAmount: 0,
	squishDuration: 100, // Duration of squish animation in ms
	squishStartTime: 0,

	draw() {
		ctx.save();
		ctx.translate(this.x, this.y);

		// Calculate squish scale based on time
		let xScale = 1;
		if (this.squishStartTime > 0) {
			const elapsed = Date.now() - this.squishStartTime;
			if (elapsed < this.squishDuration) {
				// Sine wave easing for smooth squish and release
				const progress = elapsed / this.squishDuration;
				xScale = 1 - 0.3 * Math.sin(progress * Math.PI);
			} else {
				this.squishStartTime = 0;
			}
		}

		// Apply squish transformation
		ctx.scale(xScale, 1 + (1 - xScale) * 0.5); // Compensate y-scale to maintain volume

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
		this.squishStartTime = Date.now();
		playFlapSound();
	},

	update() {
		this.velocity += GRAVITY * gameSpeed;
		this.y += this.velocity * gameSpeed;

		if (this.velocity > 4) {
			this.velocity = 4;
		}
	},
};

// Add this variable with other game state variables
let gameStartDelay = 800 // Reduced from 1500ms to 800ms for earlier arm spawning
let gameStartTime = 0;

// Add these variables with other game state variables
let gameSpeed = 1;
const SPEED_INCREASE = 0.1 // Speed increase per 3 arms
const MAX_SPEED = 2.0 // Maximum speed multiplier
let lastSpeedIncreaseScore = 0;

// Update the score tracking to handle speed increases
function updateScore() {
	score++;

	// Check if we should increase speed (every 3 arms)
	if (Math.floor(score / 3) > Math.floor(lastSpeedIncreaseScore / 3)) {
		if (gameSpeed < MAX_SPEED) {
			gameSpeed = Math.min(MAX_SPEED, gameSpeed + SPEED_INCREASE);
			console.log('Speed increased to:', gameSpeed);
			// Optional: Add a speed up sound effect here
		}
	}
	lastSpeedIncreaseScore = score;
}

const gloves = {
	pairs: [],

	spawn() {
		// Don't spawn gloves during initial delay
		if (Date.now() - gameStartTime < gameStartDelay) {
			return;
		}

		const minY = GLOVE_GAP + 150;
		const maxY = gameCanvas.height - GLOVE_GAP - 150;
		let y;

		// First pair of gloves always in the middle
		if (this.pairs.length === 0) {
			y = gameCanvas.height / 2;
		}
		// Early game - centered positions
		else if (score < 20) {
			const centerY = gameCanvas.height / 2;
			const variance = 100;
			y = centerY + (Math.random() * variance * 2 - variance);
		}
		// Later game - full range
		else {
			if (Math.random() < 0.2) {
				y = Math.random() < 0.5 ? minY : maxY;
			} else {
				y = Math.random() * (maxY - minY) + minY;
			}
		}

		this.pairs.push({
			x: gameCanvas.width,
			gapY: y,
			passed: false,
		});
	},

	draw() {
		this.pairs.forEach((pair) => {
			const gapHalf = GLOVE_GAP / 2;
			const armHeight = armImage.height;

			// Draw single top arm at gap edge
			ctx.save();
			ctx.translate(pair.x, pair.gapY - gapHalf - armHeight / 2);
			ctx.scale(1, 1);
			ctx.rotate(Math.PI);
			ctx.drawImage(
				armImage,
				-armImage.width / 2,
				-armImage.height / 2,
				armImage.width,
				armImage.height
			);
			ctx.restore();

			// Draw single bottom arm at gap edge
			ctx.save();
			ctx.translate(pair.x, pair.gapY + gapHalf + armHeight / 2);
			ctx.drawImage(
				armImage,
				-armImage.width / 2,
				-armImage.height / 2,
				armImage.width,
				armImage.height
			);
			ctx.restore();
		});
	},

	update() {
		// Don't move gloves during initial delay
		if (Date.now() - gameStartTime < gameStartDelay) {
			return;
		}

		this.pairs.forEach((pair) => {
			pair.x -= GLOVE_SPEED * gameSpeed;
		});

		this.pairs = this.pairs.filter((pair) => pair.x + GLOVE_WIDTH > 0);

		if (
			this.pairs.length === 0 ||
			this.pairs[this.pairs.length - 1].x < gameCanvas.width - 300
		) {
			this.spawn();
		}
	},
};

function drawBackground() {
	// Simple gradient background (2 colors only, like NES)
	ctx.fillStyle = '#000044'; // Slightly lighter blue for less contrast
	ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

	// Background grid pattern (NES style)
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.lineWidth = 1;

	// Horizontal lines (straight)
	const lineCount = 12;
	const startY = 0;
	const endY = gameCanvas.height;
	const lineSpacing = (endY - startY) / lineCount;

	for (let i = 0; i <= lineCount; i++) {
		const y = startY + i * lineSpacing;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(gameCanvas.width, y);
		ctx.stroke();
	}

	// Vertical lines (straight)
	const verticalCount = 16;
	const colSpacing = gameCanvas.width / verticalCount;

	for (let i = 0; i <= verticalCount; i++) {
		const x = i * colSpacing;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, gameCanvas.height);
		ctx.stroke();
	}

	// Draw top HUD bar background
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 35, gameCanvas.width, 40);

	// Draw HUD elements
	ctx.font = '16px "Press Start 2P"';

	// Left section: Score
	ctx.fillStyle = '#FFFFFF';
	ctx.textAlign = 'left';
	ctx.fillText(`${score.toString().padStart(6, '0')}`, 30, 60);

	// Right section: Round counter
	ctx.textAlign = 'right';
	ctx.fillText(`ROUND ${roundNumber}/5`, gameCanvas.width - 30, 60);

	// Ring floor (wider and extending off screen)
	ctx.fillStyle = '#00CEC4'; // Turquoise color like BBB
	const ringExtension = 60; // Adjusted for better proportions
	ctx.fillRect(
		-ringExtension,
		140,
		gameCanvas.width + ringExtension * 2,
		gameCanvas.height - 180
	);

	// Ring posts (simple rectangles) - Draw BEFORE ropes so ropes appear in front
	ctx.fillStyle = '#FFFFFF';
	const postWidth = 16;
	const postHeight = 60;

	// Only draw top posts
	ctx.fillRect(0, 110, postWidth, postHeight); // Top left
	ctx.fillRect(gameCanvas.width - postWidth, 110, postWidth, postHeight); // Top right

	// Ring ropes (straight lines)
	ctx.strokeStyle = '#FF69B4'; // Hot pink ropes like BBB
	ctx.lineWidth = 3;

	// Top ropes (3 horizontal lines)
	for (let i = 0; i < 3; i++) {
		const y = 140 + i * 25;
		ctx.beginPath();
		ctx.moveTo(-ringExtension, y);
		ctx.lineTo(gameCanvas.width + ringExtension, y);
		ctx.stroke();
	}

	// Bottom ropes (3 horizontal lines)
	for (let i = 0; i < 3; i++) {
		const y = gameCanvas.height - 90 - i * 25;
		ctx.beginPath();
		ctx.moveTo(-ringExtension, y);
		ctx.lineTo(gameCanvas.width + ringExtension, y);
		ctx.stroke();
	}

	// Side ropes (vertical lines)
	ctx.beginPath();
	ctx.moveTo(postWidth / 2, 140);
	ctx.lineTo(postWidth / 2, gameCanvas.height - 90);
	ctx.stroke();

	ctx.beginPath();
	ctx.moveTo(gameCanvas.width - postWidth / 2, 140);
	ctx.lineTo(gameCanvas.width - postWidth / 2, gameCanvas.height - 90);
	ctx.stroke();
}

function drawTitleScreen() {
	// Draw dark background
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

	// Draw grid pattern
	const gridSize = 4;
	ctx.strokeStyle = 'rgba(0, 80, 255, 0.15)';
	ctx.lineWidth = 1;

	// Draw grid lines
	for (let x = 0; x < gameCanvas.width; x += gridSize) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, gameCanvas.height);
		ctx.stroke();
	}

	for (let y = 0; y < gameCanvas.height; y += gridSize) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(gameCanvas.width, y);
		ctx.stroke();
	}

	// Move title text inward and up slightly to account for distortion
	const titleY = gameCanvas.height * 0.22;
	const safeWidth = gameCanvas.width * 0.8;
	const safePadding = (gameCanvas.width - safeWidth) / 2;

	ctx.textAlign = 'center';
	ctx.font = '64px "Press Start 2P"';
	
	// Create vertical gradient for title
	const titleGradient = ctx.createLinearGradient(0, titleY - 50, 0, titleY + 70);
	titleGradient.addColorStop(0, '#FFA500');
	titleGradient.addColorStop(0.5, '#FFD700');
	titleGradient.addColorStop(1, '#FFA500');

	ctx.fillStyle = titleGradient;
	ctx.fillText('CLAPPY', gameCanvas.width/2, titleY);
	ctx.fillText('CHEEKS!!', gameCanvas.width/2, titleY + 70);

	// Menu text
	ctx.font = '32px "Press Start 2P"';
	
	// Move menu items up slightly and adjust spacing
	const menuY = gameCanvas.height * 0.55;
	const menuItems = ['PRESS', 'SPACE'];
	const gloveSpacing = 180;

	menuItems.forEach((item, index) => {
		const y = menuY + index * 45;
		
		// Draw pointing gloves
		const gloveY = menuY + 25;
		
		if (index === 0) {
			// Left glove - moved inward
			ctx.save();
			ctx.translate(gameCanvas.width/2 - gloveSpacing, gloveY);
			ctx.scale(0.7, 0.7);
			ctx.rotate(Math.PI/2);
			ctx.drawImage(
				armImage,
				-armImage.width/2,
				-armImage.height/2,
				armImage.width,
				armImage.height
			);
			ctx.restore();
			
			// Right glove - moved inward
			ctx.save();
			ctx.translate(gameCanvas.width/2 + gloveSpacing, gloveY);
			ctx.scale(-0.7, 0.7);
			ctx.rotate(Math.PI/2);
			ctx.drawImage(
				armImage,
				-armImage.width/2,
				-armImage.height/2,
				armImage.width,
				armImage.height
			);
			ctx.restore();
		}

		// Text color with flashing effect
		ctx.fillStyle = Math.floor(Date.now() / 250) % 2 ? '#FF0000' : '#FFFFFF';
		ctx.fillText(item, gameCanvas.width/2, y);
	});

	// Apply CRT effect
	crtEffect.render(gameCanvas);
}

// Add collision detection function
function checkCollision(rect1, rect2) {
	return (
		rect1.left < rect2.right &&
		rect1.right > rect2.left &&
		rect1.top < rect2.bottom &&
		rect1.bottom > rect2.top
	);
}

// Update drawGameOverScreen to account for distortion
function drawGameOverScreen() {
	// Move all text inward from edges and adjust vertical positions
	const safeWidth = gameCanvas.width * 0.8;
	const safePadding = (gameCanvas.width - safeWidth) / 2;

	if (roundNumber >= 5) {
		// Final game over screen
		ctx.fillStyle = '#FF9C00';
		ctx.font = '48px "Press Start 2P"';
		ctx.textAlign = 'center';
		ctx.fillText('GAME', gameCanvas.width/2, gameCanvas.height * 0.3);
		ctx.fillText('OVER', gameCanvas.width/2, gameCanvas.height * 0.3 + 60);

		ctx.fillStyle = '#FFFFFF';
		ctx.font = '24px "Press Start 2P"';
		ctx.fillText(`FINAL SCORE: ${score}`, gameCanvas.width/2, gameCanvas.height * 0.6);
		
		if (Math.floor(Date.now() / 500) % 2) {
			ctx.fillText('PRESS SPACE TO RESTART', gameCanvas.width/2, gameCanvas.height * 0.75);
		}
	} else {
		// Round over screen
		ctx.fillStyle = '#FF0000';
		ctx.font = '36px "Press Start 2P"';
		ctx.textAlign = 'center';
		ctx.fillText('KNOCKOUT!!', gameCanvas.width/2, gameCanvas.height * 0.45);

		ctx.fillStyle = '#FFFFFF';
		ctx.font = '24px "Press Start 2P"';
		ctx.fillText(`SCORE: ${score}`, gameCanvas.width/2, gameCanvas.height * 0.6);
		
		if (Date.now() - knockoutTime > KNOCKOUT_DELAY) {
			if (Math.floor(Date.now() / 500) % 2) {
				ctx.fillText('PRESS SPACE TO CONTINUE', gameCanvas.width/2, gameCanvas.height * 0.75);
			}
		}
	}
}

// Add startGame function
function startGame() {
	// Initialize game state
	gameStarted = false;
	gameOver = false;
	score = 0;
	roundNumber = 1;
	gameSpeed = 1;
	lastSpeedIncreaseScore = 0;
	gloves.pairs = [];
	cheeks.y = gameCanvas.height / 2;
	cheeks.velocity = 0;
	
	// Start game loop
	lastFrameTime = performance.now();
	requestAnimationFrame(gameLoop);
}

// Update gameLoop to include collision detection
function gameLoop(timestamp) {
	const deltaTime = timestamp - lastFrameTime;
	lastFrameTime = timestamp;

	// Clear the game canvas
	ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

	if (!gameStarted) {
		drawTitleScreen();
	} else if (gameOver) {
		drawBackground();
		drawGameOverScreen();
		crtEffect.render(gameCanvas);
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
			bottom: cheeks.y + CHEEKS_SIZE,
		};

		// Check boundaries
		if (cheeksBox.top < 0 || cheeksBox.bottom > gameCanvas.height) {
			gameOver = true;
			knockoutTime = Date.now();
			playKnockoutSound();
			return;
		}

		// Check glove collisions
		gloves.pairs.forEach((pair) => {
			const gapHalf = GLOVE_GAP / 2;
			const topGloveBox = {
				left: pair.x - GLOVE_WIDTH / 2,
				right: pair.x + GLOVE_WIDTH / 2,
				top: 0,
				bottom: pair.gapY - gapHalf,
			};

			const bottomGloveBox = {
				left: pair.x - GLOVE_WIDTH / 2,
				right: pair.x + GLOVE_WIDTH / 2,
				top: pair.gapY + gapHalf,
				bottom: gameCanvas.height,
			};

			if (
				checkCollision(cheeksBox, topGloveBox) ||
				checkCollision(cheeksBox, bottomGloveBox)
			) {
				gameOver = true;
				knockoutTime = Date.now();
				playKnockoutSound();
				return;
			}

			// Score points
			if (!pair.passed && pair.x < cheeks.x) {
				updateScore();
				pair.passed = true;
			}
		});

		// Draw game elements
		gloves.draw();
		cheeks.draw();
		
		// Apply CRT effect
		crtEffect.render(gameCanvas);
	}

	requestAnimationFrame(gameLoop);
}

// Remove the duplicate gameLoop definition and keep this updated version

// Remove any existing CSS effects
function removeCSSEffects() {
	const style = document.createElement('style');
	style.textContent = `
		#gameCanvas {
			image-rendering: pixelated;
			filter: none !important;
		}
		.crt-wrapper {
			position: relative;
			width: 100%;
			height: 100%;
		}
	`;
	document.head.appendChild(style);
}

// Initialize
removeCSSEffects();
startGame();

// Add keyboard controls
window.addEventListener('keydown', (e) => {
	if (e.code === 'Space') {
		e.preventDefault();
		handleInput();
	}
});

function handleInput() {
	if (!gameStarted) {
		gameStarted = true;
		score = 0;
		roundNumber = 1;
		gameSpeed = 1;
		lastSpeedIncreaseScore = 0;
		gloves.pairs = [];
		cheeks.y = gameCanvas.height / 2;
		cheeks.velocity = 0;
		gameStartTime = Date.now();
		playCheerSound();
	} else if (gameOver && Date.now() - knockoutTime > KNOCKOUT_DELAY) {
		if (roundNumber < 5) {
			gameStarted = true;
			gameOver = false;
			roundNumber++;
			gameSpeed = 1;
			lastSpeedIncreaseScore = score; // Keep the score but reset speed
			gloves.pairs = [];
			cheeks.y = gameCanvas.height / 2;
			cheeks.velocity = 0;
			gameStartTime = Date.now();
			playCheerSound();
		} else {
			// Game complete after 5 rounds
			gameStarted = false;
			roundNumber = 1;
			score = 0;
		}
	} else if (!gameOver) {
		cheeks.flap();
	}
}

// Add touch controls
gameCanvas.addEventListener('click', handleInput);
gameCanvas.addEventListener('touchstart', (e) => {
	e.preventDefault();
	handleInput();
});

// Update drawCopyright to use same hit detection
function drawCopyright() {
	ctx.fillStyle = '#666666';
	ctx.font = '10px "Press Start 2P"';
	ctx.textAlign = 'left';

	const text = 'NOT © 2024 '
	const linkText = 'FWD:FWD:FWD:'
	const fullText = text + linkText

	// Calculate positions
	const textWidth = ctx.measureText(fullText).width
	const startX = gameCanvas.width / 2 - textWidth / 2
	const y = gameCanvas.height - 20

	// Draw first part in gray
	ctx.fillText(text, startX, y)

	// Draw second part in gold
	const linkX = startX + ctx.measureText(text).width
	ctx.fillStyle = '#FF9C00'

	// Use same hit detection for hover state
	if (isOverLink(mouseX, mouseY)) {
		ctx.fillRect(linkX, y + 2, ctx.measureText(linkText).width, 1)
	}

	ctx.fillText(linkText, linkX, y)
}
// Add mouse position tracking
let mouseX = 0
let mouseY = 0

// Update mouse position tracking
gameCanvas.addEventListener('mousemove', (e) => {
	const rect = gameCanvas.getBoundingClientRect()
	const scaleX = gameCanvas.width / rect.width
	const scaleY = gameCanvas.height / rect.height

	mouseX = (e.clientX - rect.left) * scaleX
	mouseY = (e.clientY - rect.top) * scaleY

	// Check if mouse is over the link area
	const text = 'FWD:FWD:FWD:'
	ctx.font = '10px "Press Start 2P"'
	const textWidth = ctx.measureText(text).width
	const linkX = gameCanvas.width / 2 + 20
	const linkY = gameCanvas.height - 20

	if (
		mouseX >= linkX - textWidth / 2 &&
		mouseX <= linkX + textWidth / 2 &&
		mouseY >= linkY - 16 &&
		mouseY <= linkY + 4
	) {
		gameCanvas.style.cursor = 'pointer'
	} else {
		gameCanvas.style.cursor = 'default'
	}
})

function isOverLink(x, y) {
	const text = 'FWD:FWD:FWD:'
	ctx.font = '10px "Press Start 2P"'
	const textWidth = ctx.measureText(text).width
	const linkX =
		gameCanvas.width / 2 -
		ctx.measureText('NOT © 2024 FWD:FWD:FWD:').width / 2 +
		ctx.measureText('NOT © 2024 ').width
	const linkY = gameCanvas.height - 20

	const padding = 20
	return (
		x >= linkX - padding &&
		x <= linkX + textWidth + padding &&
		y >= linkY - padding * 2 && // Double padding on top
		y <= linkY + padding // Same padding on bottom
	)
}

// Add at the top with other variables
let isHandlingClick = false

// Single click handler for both URL and game input
gameCanvas.addEventListener(
	'click',
	(e) => {
		if (isHandlingClick) return // Prevent multiple handlers
		isHandlingClick = true

		const rect = gameCanvas.getBoundingClientRect()
		const scaleX = gameCanvas.width / rect.width
		const scaleY = gameCanvas.height / rect.height
		const clickX = (e.clientX - rect.left) * scaleX
		const clickY = (e.clientY - rect.top) * scaleY

		if (isOverLink(clickX, clickY)) {
			e.preventDefault()
			e.stopPropagation()
			window.open('https://fwdfwdfwd.email', '_blank')
			isHandlingClick = false // Reset immediately for URL clicks
			return
		} else {
			handleInput()
		}

		// Reset after a short delay for game inputs
		setTimeout(() => {
			isHandlingClick = false
		}, 100)
	},
	{ capture: true }
)

// Separate handler for game actions
gameCanvas.addEventListener('click', handleInput)

// Add after canvas initialization
function resizeGame() {
	const monitorFrame = document.querySelector('.monitor-frame')
	const viewportWidth = window.innerWidth
	const viewportHeight = window.innerHeight

	// Account for body padding (20px on each side) and some margin for safety
	const safeWidth = viewportWidth - 60 // 20px padding + 10px safety on each side
	const safeHeight = viewportHeight - 60 // 20px padding + 10px safety on each side

	// Game aspect ratio is 480:720 = 0.667
	// If viewport width is the limiting factor, base on width instead
	if (safeWidth < safeHeight * 0.667) {
		monitorFrame.style.width = '85vw' // Reduced from 90vw to ensure margins
		monitorFrame.style.height = '127.5vw' // 85 * (720/480)
	} else {
		monitorFrame.style.height = '85vh' // Reduced from 90vh to ensure margins
		monitorFrame.style.width = '56.67vh' // 85 * (480/720)
	}
}

// Call resize on load and window resize
window.addEventListener('load', resizeGame)
window.addEventListener('resize', () => {
	clearTimeout(window.resizeTimeout)
	window.resizeTimeout = setTimeout(resizeGame, 100)
})

// Add this function near the top of your file
function isTouchDevice() {
	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		navigator.msMaxTouchPoints > 0
	)
}

// Remove any existing click handlers
gameCanvas.removeEventListener('click', handleInput)

// Mousemove handler
gameCanvas.addEventListener('mousemove', (e) => {
	const rect = gameCanvas.getBoundingClientRect()
	const scaleX = gameCanvas.width / rect.width
	const scaleY = gameCanvas.height / rect.height
	mouseX = (e.clientX - rect.left) * scaleX
	mouseY = (e.clientY - rect.top) * scaleY

	gameCanvas.style.cursor = isOverLink(mouseX, mouseY) ? 'pointer' : 'default'
})

// Create a wrapper div around the canvas
const wrapper = document.createElement('div')
wrapper.className = 'crt-wrapper'
gameCanvas.parentNode.insertBefore(wrapper, gameCanvas)
wrapper.appendChild(gameCanvas)
