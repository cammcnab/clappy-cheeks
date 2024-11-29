// Get canvas context and set size
const canvas = document.getElementById('gameCanvas')
const ctx = canvas.getContext('2d')

// Set canvas size
canvas.width = 480
canvas.height = 720

// Game state
let gameStarted = false
let gameOver = false
let score = 0
let credits = 3
let knockoutTime = 0
let lastFrameTime = 0

// Load images
const cheeksImage = new Image()
const armImage = new Image()
const bgImage = new Image()

// Track loaded images
let loadedImages = 0
const totalImages = 3

function handleImageLoad() {
	loadedImages++
	if (loadedImages === totalImages) {
		startGame()
	}
}

// Set up image loading
cheeksImage.onload = handleImageLoad
armImage.onload = handleImageLoad
bgImage.onload = handleImageLoad

cheeksImage.src = 'images/cheeks.png'
armImage.src = 'images/arm.png'
bgImage.src = 'images/bg.png'

// Add these constants after the game state variables
const GRAVITY = 0.7
const FLAP_SPEED = -9.5
const CHEEKS_SIZE = 25
const GLOVE_WIDTH = 50
const GLOVE_GAP = 200
const GLOVE_SPEED = 4
const KNOCKOUT_DELAY = 1500

// Add audio setup
const clapSounds = []
const gameAudio = {
	cheer: new Audio('audio/cheering.wav'),
	boo: new Audio('audio/booing.wav'),
}

// Set cheer volume much lower and make it loop
gameAudio.cheer.volume = 0.1
gameAudio.cheer.loop = true

// Load clap sounds
for (let i = 1; i <= 9; i++) {
	const sound = new Audio(`audio/claps/clap${i}.wav`)
	sound.preload = 'auto'
	clapSounds.push(sound)
}

let currentClapSound = 0

// Add sound functions
function playFlapSound() {
	clapSounds[currentClapSound].pause()
	clapSounds[currentClapSound].currentTime = 0

	try {
		clapSounds[currentClapSound]
			.play()
			.catch((e) => console.log('Sound play failed:', e))
	} catch (e) {
		console.log('Sound play error:', e)
	}

	currentClapSound = (currentClapSound + 1) % clapSounds.length
}

function playCheerSound() {
	if (gameAudio.cheer.currentTime === 0 || !gameAudio.cheer.paused) {
		gameAudio.cheer.currentTime = 0
	}
	gameAudio.cheer.play()
}

function stopCheerSound() {
	gameAudio.cheer.pause()
	gameAudio.cheer.currentTime = 0
}

function playKnockoutSound() {
	stopCheerSound()
	gameAudio.boo.currentTime = 0
	gameAudio.boo.play()
}

// Add game objects
const cheeks = {
	x: canvas.width / 3,
	y: canvas.height / 2,
	velocity: 0,

	draw() {
		ctx.save()
		ctx.translate(this.x, this.y)
		ctx.drawImage(
			cheeksImage,
			-CHEEKS_SIZE,
			-CHEEKS_SIZE,
			CHEEKS_SIZE * 2,
			CHEEKS_SIZE * 2
		)
		ctx.restore()
	},

	flap() {
		this.velocity = FLAP_SPEED
		playFlapSound()
	},

	update() {
		this.velocity += GRAVITY
		this.y += this.velocity

		if (this.velocity > 4) {
			this.velocity = 4
		}
	},
}

const gloves = {
	pairs: [],

	spawn() {
		const minY = GLOVE_GAP + 100
		const maxY = canvas.height - GLOVE_GAP - 100
		let y

		if (score > 10) {
			if (Math.random() < 0.3) {
				y = Math.random() < 0.5 ? minY : maxY
			} else {
				y = Math.random() * (maxY - minY) + minY
			}
		} else {
			y = Math.random() * (maxY - minY) + minY
		}

		this.pairs.push({
			x: canvas.width,
			gapY: y,
			passed: false,
		})
	},

	draw() {
		this.pairs.forEach((pair) => {
			const gapHalf = GLOVE_GAP / 2
			const armHeight = armImage.height

			// Draw single top arm at gap edge
			ctx.save()
			ctx.translate(pair.x, pair.gapY - gapHalf - armHeight / 2)
			ctx.scale(1, 1)
			ctx.rotate(Math.PI)
			ctx.drawImage(
				armImage,
				-armImage.width / 2,
				-armImage.height / 2,
				armImage.width,
				armImage.height
			)
			ctx.restore()

			// Draw single bottom arm at gap edge
			ctx.save()
			ctx.translate(pair.x, pair.gapY + gapHalf + armHeight / 2)
			ctx.drawImage(
				armImage,
				-armImage.width / 2,
				-armImage.height / 2,
				armImage.width,
				armImage.height
			)
			ctx.restore()
		})
	},

	update() {
		this.pairs.forEach((pair) => {
			pair.x -= GLOVE_SPEED
		})

		this.pairs = this.pairs.filter((pair) => pair.x + GLOVE_WIDTH > 0)

		if (
			this.pairs.length === 0 ||
			this.pairs[this.pairs.length - 1].x < canvas.width - 300
		) {
			this.spawn()
		}
	},
}

function drawBackground() {
	// Clear to black first
	ctx.fillStyle = '#000000'
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	// Draw background image at low opacity with cover fill
	ctx.globalAlpha = 0.3

	// Calculate dimensions to maintain aspect ratio and cover
	const imgRatio = bgImage.width / bgImage.height
	const canvasRatio = canvas.width / canvas.height

	let drawWidth = canvas.width
	let drawHeight = canvas.height
	let x = 0
	let y = 0

	if (canvasRatio > imgRatio) {
		// Canvas is wider than image ratio
		drawWidth = canvas.width
		drawHeight = drawWidth / imgRatio
		y = (canvas.height - drawHeight) / 2
	} else {
		// Canvas is taller than image ratio
		drawHeight = canvas.height
		drawWidth = drawHeight * imgRatio
		x = (canvas.width - drawWidth) / 2
	}

	ctx.drawImage(bgImage, x, y, drawWidth, drawHeight)
	ctx.globalAlpha = 1.0 // Reset opacity for other drawings
}

// Add this function after the game objects but before startGame
function checkCollision(rect1, rect2) {
	return (
		rect1.left < rect2.right &&
		rect1.right > rect2.left &&
		rect1.top < rect2.bottom &&
		rect1.bottom > rect2.top
	)
}

function startGame() {
	// Start game loop
	requestAnimationFrame(gameLoop)
}

function gameLoop(timestamp) {
	// Calculate delta time
	const deltaTime = timestamp - lastFrameTime
	lastFrameTime = timestamp

	// Clear canvas
	ctx.fillStyle = '#000066'
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	if (!gameStarted) {
		// Draw title screen
		drawBackground()

		// Draw title
		ctx.fillStyle = '#FF9C00'
		ctx.font = '48px "Press Start 2P"'
		ctx.textAlign = 'center'
		ctx.fillText('CLAPPY', canvas.width / 2, canvas.height / 4)
		ctx.fillText('CHEEKS!!', canvas.width / 2, canvas.height / 4 + 48)

		// Draw credits
		ctx.fillStyle = '#FFFFFF'
		ctx.font = '24px "Press Start 2P"'
		ctx.fillText(
			'CREDITS: ' + credits,
			canvas.width / 2,
			canvas.height / 2 + 120
		)

		// Draw prompt if has credits
		if (credits > 0) {
			if (Math.floor(Date.now() / 500) % 2) {
				const promptText = isTouchDevice() ? 'TAP SCREEN' : 'PRESS SPACE'
				ctx.fillText(promptText, canvas.width / 2, canvas.height / 2 + 180)
			}
		}

		// Draw copyright
		drawCopyright()
	} else if (gameOver) {
		// Game over screen
		drawBackground()

		// Draw title at same position as title screen
		ctx.fillStyle = '#FF9C00'
		ctx.font = '48px "Press Start 2P"'
		ctx.textAlign = 'center'
		ctx.fillText('CLAPPY', canvas.width / 2, canvas.height / 4)
		ctx.fillText('CHEEKS!!', canvas.width / 2, canvas.height / 4 + 48)

		// Draw knockout text
		ctx.fillStyle = '#FF0000'
		ctx.font = '36px "Press Start 2P"'
		ctx.fillText('KNOCKOUT!!', canvas.width / 2, canvas.height / 2)

		// Draw score and credits
		ctx.fillStyle = '#FFFFFF'
		ctx.font = '24px "Press Start 2P"'
		ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 80)
		ctx.fillText(
			`CREDITS: ${credits}`,
			canvas.width / 2,
			canvas.height / 2 + 120
		)

		// Draw prompt at same position as title screen
		if (credits > 0 && Date.now() - knockoutTime > KNOCKOUT_DELAY) {
			if (Math.floor(Date.now() / 500) % 2) {
				const promptText = isTouchDevice() ? 'TAP SCREEN' : 'PRESS SPACE'
				ctx.fillText(promptText, canvas.width / 2, canvas.height / 2 + 180)
			}
		}

		// Draw copyright
		drawCopyright()
	} else {
		// Game running
		drawBackground()

		cheeks.update()
		gloves.update()

		// Check collisions
		const cheeksBox = {
			left: cheeks.x - CHEEKS_SIZE,
			right: cheeks.x + CHEEKS_SIZE,
			top: cheeks.y - CHEEKS_SIZE,
			bottom: cheeks.y + CHEEKS_SIZE,
		}

		// Check boundaries
		if (cheeksBox.top < 0 || cheeksBox.bottom > canvas.height) {
			gameOver = true
			knockoutTime = Date.now()
			playKnockoutSound()
			return
		}

		// Check glove collisions
		gloves.pairs.forEach((pair) => {
			const gapHalf = GLOVE_GAP / 2
			const topGloveBox = {
				left: pair.x - GLOVE_WIDTH / 2,
				right: pair.x + GLOVE_WIDTH / 2,
				top: 0,
				bottom: pair.gapY - gapHalf,
			}

			const bottomGloveBox = {
				left: pair.x - GLOVE_WIDTH / 2,
				right: pair.x + GLOVE_WIDTH / 2,
				top: pair.gapY + gapHalf,
				bottom: canvas.height,
			}

			if (
				checkCollision(cheeksBox, topGloveBox) ||
				checkCollision(cheeksBox, bottomGloveBox)
			) {
				gameOver = true
				knockoutTime = Date.now()
				playKnockoutSound()
				return
			}

			// Score points
			if (!pair.passed && pair.x < cheeks.x) {
				score++
				pair.passed = true
			}
		})

		// Draw everything
		gloves.draw() // Draw gloves first
		cheeks.draw() // Draw cheeks on top

		// Draw score HUD last
		ctx.fillStyle = '#000000'
		ctx.fillRect(0, 0, canvas.width, 50)
		ctx.strokeStyle = '#00FF00'
		ctx.lineWidth = 2
		ctx.strokeRect(2, 2, canvas.width - 4, 46)

		ctx.fillStyle = '#FFFFFF'
		ctx.font = '32px "Press Start 2P"'
		ctx.textAlign = 'left'
		ctx.fillText(`Score: ${score}`, 20, 35)
	}

	requestAnimationFrame(gameLoop)
}

// Add keyboard controls
window.addEventListener('keydown', (e) => {
	if (e.code === 'Space') {
		e.preventDefault()
		handleInput()
	}
})

function handleInput() {
	if (!gameStarted) {
		if (credits > 0) {
			gameStarted = true
			score = 0
			gloves.pairs = []
			cheeks.y = canvas.height / 2
			cheeks.velocity = 0
			credits--
			playCheerSound()
		}
	} else if (gameOver && Date.now() - knockoutTime > KNOCKOUT_DELAY) {
		if (credits > 0) {
			gameStarted = true
			gameOver = false
			score = 0
			gloves.pairs = []
			cheeks.y = canvas.height / 2
			cheeks.velocity = 0
			credits--
			playCheerSound()
		}
	} else if (!gameOver) {
		cheeks.flap()
	}
}

// Add touch controls
canvas.addEventListener('click', handleInput)
canvas.addEventListener('touchstart', (e) => {
	e.preventDefault()
	handleInput()
})

// Update drawCopyright to use same hit detection
function drawCopyright() {
	ctx.fillStyle = '#666666'
	ctx.font = '12px "Press Start 2P"'
	ctx.textAlign = 'left'

	const text = 'NOT © 2024 '
	const linkText = 'Fwd:Fwd:Fwd:'
	const fullText = text + linkText

	// Calculate positions
	const textWidth = ctx.measureText(fullText).width
	const startX = canvas.width / 2 - textWidth / 2
	const y = canvas.height - 20

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
canvas.addEventListener('mousemove', (e) => {
	const rect = canvas.getBoundingClientRect()
	const scaleX = canvas.width / rect.width
	const scaleY = canvas.height / rect.height

	mouseX = (e.clientX - rect.left) * scaleX
	mouseY = (e.clientY - rect.top) * scaleY

	// Check if mouse is over the link area
	const text = 'Fwd:Fwd:Fwd:'
	ctx.font = '16px "Press Start 2P"'
	const textWidth = ctx.measureText(text).width
	const linkX = canvas.width / 2 + 20
	const linkY = canvas.height - 20

	if (
		mouseX >= linkX - textWidth / 2 &&
		mouseX <= linkX + textWidth / 2 &&
		mouseY >= linkY - 16 &&
		mouseY <= linkY + 4
	) {
		canvas.style.cursor = 'pointer'
	} else {
		canvas.style.cursor = 'default'
	}
})

function isOverLink(x, y) {
	const text = 'Fwd:Fwd:Fwd:'
	ctx.font = '12px "Press Start 2P"'
	const textWidth = ctx.measureText(text).width
	const linkX =
		canvas.width / 2 -
		ctx.measureText('NOT © 2024 Fwd:Fwd:Fwd:').width / 2 +
		ctx.measureText('NOT © 2024 ').width
	const linkY = canvas.height - 20

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
canvas.addEventListener(
	'click',
	(e) => {
		if (isHandlingClick) return // Prevent multiple handlers
		isHandlingClick = true

		const rect = canvas.getBoundingClientRect()
		const scaleX = canvas.width / rect.width
		const scaleY = canvas.height / rect.height
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
canvas.addEventListener('click', handleInput)

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
canvas.removeEventListener('click', handleInput)

// Mousemove handler
canvas.addEventListener('mousemove', (e) => {
	const rect = canvas.getBoundingClientRect()
	const scaleX = canvas.width / rect.width
	const scaleY = canvas.height / rect.height
	mouseX = (e.clientX - rect.left) * scaleX
	mouseY = (e.clientY - rect.top) * scaleY

	canvas.style.cursor = isOverLink(mouseX, mouseY) ? 'pointer' : 'default'
})

// Create a wrapper div around the canvas
const wrapper = document.createElement('div')
wrapper.className = 'crt-wrapper'
canvas.parentNode.insertBefore(wrapper, canvas)
wrapper.appendChild(canvas)

// Add at the top with other variables
let crtEffectInitialized = false

function initCRTEffect() {
	if (crtEffectInitialized) return // Prevent multiple initializations

	// Base flicker - very subtle
	gsap.to('#gameCanvas', {
		filter: 'brightness(0.98) contrast(1.02) saturate(1.02)',
		duration: 0.016,
		repeat: -1,
		yoyo: true,
		ease: 'none',
		onRepeat: function () {
			if (Math.random() < 0.003) {
				// Very rare bigger flickers (0.3% chance)
				this.vars.filter = 'brightness(0.95) contrast(1.05) saturate(1.02)'
				this.duration = 0.1
			} else {
				this.vars.filter = 'brightness(0.98) contrast(1.02) saturate(1.02)'
				this.duration = 0.016
			}
		},
	})

	crtEffectInitialized = true
}

// Initialize vignette
gsap.to('.vignette', {
	opacity: 0.8,
	duration: 1,
})

// Optional: Add chromatic aberration on game start/end
function addChromaticAberration() {
	gsap.to('#gameCanvas', {
		filter: 'brightness(1.2) contrast(1.2) saturate(1.2) hue-rotate(2deg)',
		duration: 0.2,
		yoyo: true,
		repeat: 1,
	})
}
