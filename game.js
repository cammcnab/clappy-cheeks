// Import CRT effect
import { CRTEffect } from './shaders.js'

// Early mobile detection - moved to top before any other code
function isTouchDevice() {
	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		navigator.msMaxTouchPoints > 0
	)
}

const isMobileDevice = isTouchDevice()
console.log('Mobile device:', isMobileDevice)

// Game objects
let cheeks
let gloves
let images = {
	cheeksImage: null,
	armImage: null,
	bgImage: null,
}
let audio = {
	clapSounds: [],
	cheer: null,
	boo: null,
}

// Constants
const CANVAS_WIDTH = 480
const CANVAS_HEIGHT = 720
const GRAVITY = 0.5
const FLAP_SPEED = -8
const CHEEKS_SIZE = 25
const GLOVE_WIDTH = 50
let gloveGap = 250
const GLOVE_SPEED = 2.5
const KNOCKOUT_DELAY = 1500
const SPEED_INCREASE = 0.1
const MAX_SPEED = 2.0

// Game variables
let gameCanvas
let ctx
let effectCanvas
let crtEffect
let wrapper
let monitorFrame
let gameStarted = false
let gameOver = false
let score = 0
let totalScore = 0
let roundsLeft = 5
let knockoutTime = 0
let lastFrameTime = 0
let gameStartDelay = 800
let gameStartTime = 0
let gameSpeed = 1
let lastSpeedIncreaseScore = 0
let mouseX = 0
let mouseY = 0
let isHandlingClick = false
let crtEffectInitialized = false
let squishStartTime = 0
const SQUISH_DURATION = 100

// Initialize function
async function init() {
	console.log('Initializing game components...')

	// Get canvas elements and monitor frame
	gameCanvas = document.getElementById('gameCanvas')
	monitorFrame = document.querySelector('.monitor-frame')

	if (!gameCanvas) {
		throw new Error('Game canvas not found')
	}

	if (!monitorFrame) {
		throw new Error('Monitor frame not found')
	}

	// Get context with explicit pixel format
	ctx = gameCanvas.getContext('2d', {
		alpha: false,
		desynchronized: true,
		preserveDrawingBuffer: false,
	})

	if (!ctx) {
		throw new Error('Could not get canvas context')
	}

	// Set up canvas container
	const container = gameCanvas.parentElement
	if (container) {
		container.style.position = 'absolute'
		container.style.left = '50%'
		container.style.top = '50%'
		container.style.transform = 'translate(-50%, -50%)'
		container.style.display = 'flex'
		container.style.justifyContent = 'center'
		container.style.alignItems = 'center'
		container.style.overflow = 'hidden'
		container.style.touchAction = 'manipulation'
		container.style.width = '100%'
		container.style.height = '100%'
	}

	// Set canvas styles - simplified positioning
	gameCanvas.style.position = 'absolute'
	gameCanvas.style.width = '100%'
	gameCanvas.style.height = '100%'
	gameCanvas.style.imageRendering = 'pixelated'
	gameCanvas.style.touchAction = 'manipulation'
	gameCanvas.style.webkitTapHighlightColor = 'transparent'
	gameCanvas.style.userSelect = 'none'
	gameCanvas.style.webkitUserSelect = 'none'

	// Initialize CRT effect
	try {
		effectCanvas = document.createElement('canvas')
		effectCanvas.id = 'effectCanvas'
		effectCanvas.style.position = 'absolute'
		effectCanvas.style.width = '100%'
		effectCanvas.style.height = '100%'
		effectCanvas.style.pointerEvents = 'none'
		effectCanvas.style.zIndex = '2'
		effectCanvas.style.transform = 'scale(1.1)'
		effectCanvas.style.borderRadius = `calc(var(--bezel-radius) * 2.5)`
		if (container) {
			container.appendChild(effectCanvas)
		}

		// Set initial canvas dimensions
		handleResize()

		crtEffect = new CRTEffect(effectCanvas)
		console.log('CRT effect initialized')
	} catch (error) {
		console.error('Failed to initialize CRT effect:', error)
	}

	// Add resize handler with debouncing
	let resizeTimeout
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimeout)
		resizeTimeout = setTimeout(handleResize, 100)
	})

	// Rest of initialization
	await loadImages()
	await initAudio()
	initGameObjects()
	initInputHandlers()
	startGame()
}

// Update resize handler
function handleResize() {
	if (!gameCanvas || !monitorFrame) return

	// Get container dimensions instead of monitor frame
	const container = gameCanvas.parentElement
	if (!container) return

	const containerRect = container.getBoundingClientRect()
	const containerWidth = containerRect.width
	const containerHeight = containerRect.height

	// Add padding to dimensions to account for scale
	const scalePadding = 0.1 // 10% padding for 1.1 scale
	const paddedWidth = containerWidth * (1 + scalePadding)
	const paddedHeight = containerHeight * (1 + scalePadding)

	// Update canvas dimensions to match container plus padding
	gameCanvas.width = paddedWidth
	gameCanvas.height = paddedHeight

	// Update effect canvas if it exists
	if (effectCanvas) {
		effectCanvas.width = paddedWidth
		effectCanvas.height = paddedHeight
	}

	// Calculate new base unit for responsive UI sizing
	const baseUnit = Math.min(containerWidth, containerHeight) / 20

	// Update game scale factors for responsive drawing
	window.gameScale = {
		x: paddedWidth / CANVAS_WIDTH,
		y: paddedHeight / CANVAS_HEIGHT,
		min: Math.min(paddedWidth / CANVAS_WIDTH, paddedHeight / CANVAS_HEIGHT),
		max: Math.max(paddedWidth / CANVAS_WIDTH, paddedHeight / CANVAS_HEIGHT),
		unit: baseUnit,
		width: paddedWidth,
		height: paddedHeight,
	}

	// Center the game objects to account for padding
	const offsetX = (paddedWidth - containerWidth) / 2
	const offsetY = (paddedHeight - containerHeight) / 2

	// Update game object positions for new dimensions
	if (cheeks) {
		// Keep cheeks at relative X position but account for padding
		cheeks.x = containerWidth / 3 + offsetX
		if (!gameStarted) {
			cheeks.y = containerHeight / 2 + offsetY
		}
	}

	// Update glove gaps and positions
	gloveGap = baseUnit * 8

	// Set canvas styles to fill container
	gameCanvas.style.position = 'absolute'
	gameCanvas.style.width = '100%'
	gameCanvas.style.height = '100%'
	gameCanvas.style.imageRendering = 'pixelated'
	gameCanvas.style.transform = 'scale(1.1)'
	gameCanvas.style.transformOrigin = 'center center'

	// Set effect canvas styles to match game canvas
	if (effectCanvas) {
		effectCanvas.style.position = 'absolute'
		effectCanvas.style.width = '100%'
		effectCanvas.style.height = '100%'
		effectCanvas.style.pointerEvents = 'none'
		effectCanvas.style.zIndex = '2'
		effectCanvas.style.transform = 'scale(1.1)'
		effectCanvas.style.transformOrigin = 'center center'
	}

	console.log(
		'Canvas resized:',
		containerWidth,
		containerHeight,
		'Base unit:',
		baseUnit
	)
}

// Initialize audio
async function initAudio() {
	// Load clap sounds
	const clapPromises = []
	for (let i = 1; i <= 9; i++) {
		const sound = new Audio(`audio/claps/clap${i}.wav`)
		sound.preload = 'auto'
		clapPromises.push(
			new Promise((resolve) => {
				sound.addEventListener('canplaythrough', resolve, { once: true })
				sound.addEventListener('error', resolve, { once: true }) // Handle failed loads gracefully
			})
		)
		audio.clapSounds.push(sound)
	}

	// Load other sounds
	audio.cheer = new Audio('audio/cheering.wav')
	audio.cheer.volume = 0.1
	audio.cheer.loop = true

	audio.boo = new Audio('audio/booing.wav')

	const otherSoundPromises = [
		new Promise((resolve) => {
			audio.cheer.addEventListener('canplaythrough', resolve, { once: true })
			audio.cheer.addEventListener('error', resolve, { once: true })
		}),
		new Promise((resolve) => {
			audio.boo.addEventListener('canplaythrough', resolve, { once: true })
			audio.boo.addEventListener('error', resolve, { once: true })
		}),
	]

	// Wait for all sounds to load
	await Promise.all([...clapPromises, ...otherSoundPromises])
}

// Audio playback functions
let currentClapSound = 0

function playFlapSound() {
	if (!audio.clapSounds[currentClapSound]) return

	audio.clapSounds[currentClapSound].pause()
	audio.clapSounds[currentClapSound].currentTime = 0

	try {
		audio.clapSounds[currentClapSound]
			.play()
			.catch((e) => console.log('Sound play failed:', e))
	} catch (e) {
		console.log('Sound play error:', e)
	}

	currentClapSound = (currentClapSound + 1) % audio.clapSounds.length
}

function playCheerSound() {
	if (!audio.cheer) return

	if (audio.cheer.currentTime === 0 || !audio.cheer.paused) {
		audio.cheer.currentTime = 0
	}
	audio.cheer.play().catch((e) => console.log('Cheer sound failed:', e))
}

function stopCheerSound() {
	if (!audio.cheer) return

	audio.cheer.pause()
	audio.cheer.currentTime = 0
}

function playKnockoutSound() {
	if (!audio.boo) return

	stopCheerSound()
	audio.boo.currentTime = 0
	audio.boo.play().catch((e) => console.log('Boo sound failed:', e))
}

// Start game function
function startGame() {
	score = 0
	gameSpeed = 1
	lastSpeedIncreaseScore = 0

	if (cheeks) {
		cheeks.x = window.gameScale ? window.gameScale.width / 3 : CANVAS_WIDTH / 3
		cheeks.y = window.gameScale
			? window.gameScale.height / 2
			: CANVAS_HEIGHT / 2
		cheeks.velocity = 0
	}

	if (gloves) {
		gloves.pairs = []
		gloves.spawn()
	}
}

// Load images function
async function loadImages() {
	const imagePromises = [
		loadImage('images/cheeks.png').then((img) => (images.cheeksImage = img)),
		loadImage('images/arm.png').then((img) => (images.armImage = img)),
		loadImage('images/bg.png').then((img) => (images.bgImage = img)),
	]

	await Promise.all(imagePromises)
}

// Helper function to load a single image
function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = src
	})
}

// Initialize game objects
function initGameObjects() {
	const scale = window.gameScale
	if (!scale) return

	const safePadding = Math.max(scale.unit * 3, scale.width * 0.08)
	const safeWidth = scale.width - safePadding * 2
	const safeHeight = scale.height - safePadding * 2

	cheeks = {
		x: safePadding + safeWidth / 3,
		y: scale.height / 2,
		velocity: 0,
		draw() {
			if (!images.cheeksImage || !window.gameScale) return
			const scale = window.gameScale

			ctx.save()
			ctx.translate(this.x, this.y)

			// Calculate squish scale based on time
			let xScale = 1
			if (squishStartTime > 0) {
				const elapsed = performance.now() - squishStartTime
				if (elapsed < SQUISH_DURATION) {
					const progress = elapsed / SQUISH_DURATION
					xScale = 1 - 0.3 * Math.sin(progress * Math.PI)
				} else {
					squishStartTime = 0
				}
			}

			// Scale based on screen size
			const size = Math.min(scale.width, scale.height) / 15
			ctx.scale(
				xScale * (size / CHEEKS_SIZE),
				(1 + (1 - xScale) * 0.5) * (size / CHEEKS_SIZE)
			)

			ctx.drawImage(
				images.cheeksImage,
				-CHEEKS_SIZE,
				-CHEEKS_SIZE,
				CHEEKS_SIZE * 2,
				CHEEKS_SIZE * 2
			)
			ctx.restore()
		},
		update() {
			if (!window.gameScale) return

			this.velocity += GRAVITY * gameSpeed
			this.y += this.velocity * gameSpeed

			if (this.velocity > 4) {
				this.velocity = 4
			}
		},
	}

	gloves = {
		pairs: [],
		draw() {
			if (!images.armImage || !window.gameScale) return
			const scale = window.gameScale

			this.pairs.forEach((pair) => {
				// Adjust arm width and height
				const armWidth = Math.min(scale.width, scale.height) / 10
				const armHeight = scale.height / 2.5 // Slightly longer to reach edges
				const gapHalf = gloveGap / 2

				// Draw top arm - adjusted to touch top edge
				ctx.save()
				ctx.translate(pair.x, pair.gapY - gapHalf)
				ctx.scale(
					armWidth / images.armImage.width,
					armHeight / images.armImage.height
				)
				ctx.rotate(Math.PI)
				ctx.drawImage(
					images.armImage,
					-images.armImage.width / 2,
					-images.armImage.height,
					images.armImage.width,
					images.armImage.height * 1.2 // Extend image slightly
				)
				ctx.restore()

				// Draw bottom arm - keep current positioning
				ctx.save()
				ctx.translate(pair.x, pair.gapY + gapHalf)
				ctx.scale(
					armWidth / images.armImage.width,
					armHeight / images.armImage.height
				)
				ctx.drawImage(
					images.armImage,
					-images.armImage.width / 2,
					0,
					images.armImage.width,
					images.armImage.height * 1.2 // Extend image slightly
				)
				ctx.restore()
			})
		},
		update() {
			if (!window.gameScale) return

			// Don't move gloves during initial delay
			if (performance.now() - gameStartTime < gameStartDelay) {
				return
			}

			const speed =
				GLOVE_SPEED * gameSpeed * (window.gameScale.width / CANVAS_WIDTH)

			this.pairs.forEach((pair) => {
				pair.x -= speed
			})

			this.pairs = this.pairs.filter((pair) => pair.x + GLOVE_WIDTH > 0)

			// Increase spacing between arm pairs
			const minSpacing = window.gameScale.width * 0.6 // Increased spacing
			if (
				this.pairs.length === 0 ||
				this.pairs[this.pairs.length - 1].x <
					window.gameScale.width - minSpacing
			) {
				this.spawn()
			}
		},
		spawn() {
			if (!window.gameScale) return

			const scale = window.gameScale
			const safePadding = Math.max(scale.unit * 3, scale.width * 0.08)
			const safeHeight = scale.height - safePadding * 2

			// Increase minimum gap between arms
			gloveGap = Math.min(scale.height * 0.4, scale.unit * 12) // Larger gap

			// Adjust the spawn range to prevent arms from being too close to edges
			const minY = safePadding + gloveGap * 0.8 // More padding from top
			const maxY = scale.height - safePadding - gloveGap * 0.8 // More padding from bottom
			let y = Math.random() * (maxY - minY) + minY

			this.pairs.push({
				x: scale.width - safePadding,
				gapY: y,
				passed: false,
			})
		},
	}
}

// Input handling
function handleInput() {
	if (!gameStarted) {
		if (roundsLeft > 0) {
			gameStarted = true
			gameStartTime = performance.now()
			playCheerSound()
		}
	} else if (gameOver && performance.now() - knockoutTime > KNOCKOUT_DELAY) {
		if (roundsLeft > 0) {
			totalScore += score
			startGame()
			gameStarted = true
			gameOver = false
			gameStartTime = performance.now()
			playCheerSound()
		}
	} else if (!gameOver) {
		if (cheeks) {
			cheeks.velocity = FLAP_SPEED
			squishStartTime = performance.now()
			playFlapSound()
		}
	}
}

// Initialize input handlers
function initInputHandlers() {
	// Keyboard controls
	window.addEventListener('keydown', (e) => {
		if (e.code === 'Space') {
			e.preventDefault()
			handleInput()
		}
	})

	// Mouse/touch controls with better mobile handling
	if (gameCanvas) {
		// Prevent default behaviors
		gameCanvas.addEventListener('touchmove', (e) => e.preventDefault(), {
			passive: false,
		})
		gameCanvas.addEventListener('touchstart', (e) => e.preventDefault(), {
			passive: false,
		})

		// Handle clicks and touches
		gameCanvas.addEventListener('click', handleInput)
		gameCanvas.addEventListener('touchstart', handleInput)

		// Prevent double-tap zoom on mobile
		let lastTap = 0
		gameCanvas.addEventListener('touchend', (e) => {
			const currentTime = new Date().getTime()
			const tapLength = currentTime - lastTap
			if (tapLength < 500 && tapLength > 0) {
				e.preventDefault()
			}
			lastTap = currentTime
		})
	}
}

// Game loop
function gameLoop(timestamp) {
	if (!ctx || !gameCanvas) {
		console.error('Canvas context not available')
		return
	}

	// Calculate delta time
	const deltaTime = timestamp - lastFrameTime
	lastFrameTime = timestamp

	// Clear the canvas using actual dimensions
	ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height)

	// Draw background
	drawBackground()

	if (!gameStarted) {
		drawTitleScreen()
	} else if (gameOver) {
		drawGameOverScreen()
	} else {
		// Update game objects
		if (cheeks) cheeks.update()
		if (gloves) gloves.update()

		// Check collisions
		if (checkCollisions()) {
			gameOver = true
			knockoutTime = performance.now()
			roundsLeft--
		}

		// Check bounds
		if (checkBounds()) {
			gameOver = true
			knockoutTime = performance.now()
			roundsLeft--
		}

		// Draw game objects
		if (gloves) gloves.draw()
		if (cheeks) cheeks.draw()
	}

	// Apply CRT effect
	if (crtEffect) {
		try {
			crtEffect.render(gameCanvas)
		} catch (error) {
			console.error('CRT effect error:', error)
		}
	}

	// Request next frame
	requestAnimationFrame(gameLoop)
}

// Drawing functions
function drawBackground(skipRing = false) {
	const scale = window.gameScale
	if (!scale) return

	const width = gameCanvas.width
	const height = gameCanvas.height
	const unit = scale.unit

	// Background
	ctx.fillStyle = '#000044'
	ctx.fillRect(0, 0, width, height)

	// Grid pattern
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
	ctx.lineWidth = Math.max(1, unit / 20)

	// Draw grid across full canvas with reduced scale
	const gridSpacing = unit * 1.2 // Reduced spacing for denser grid
	const verticalLines = Math.ceil(width / gridSpacing)
	const horizontalLines = Math.ceil(height / gridSpacing)

	// Draw horizontal lines
	for (let i = 0; i <= horizontalLines; i++) {
		const y = i * gridSpacing
		ctx.beginPath()
		ctx.moveTo(0, y)
		ctx.lineTo(width, y)
		ctx.stroke()
	}

	// Draw vertical lines
	for (let i = 0; i <= verticalLines; i++) {
		const x = i * gridSpacing
		ctx.beginPath()
		ctx.moveTo(x, 0)
		ctx.lineTo(x, height)
		ctx.stroke()
	}

	// Only show scoreboard during actual gameplay
	if (gameStarted && !gameOver) {
		// HUD bar - moved closer to top with full width
		const hudHeight = Math.max(height * 0.08, unit * 2.5)
		const hudY = unit * 0.8 // Reduced top padding

		// Black background for entire HUD
		ctx.fillStyle = '#000000'
		ctx.fillRect(0, 0, width, hudHeight + hudY)

		// Scale font size based on HUD height
		const fontSize = Math.min(hudHeight * 0.4, width * 0.03)
		ctx.font = `${fontSize}px "Press Start 2P"`
		ctx.textAlign = 'center'

		// Measure text widths for tight background
		const pointsText = `POINTS: ${score}`
		const roundsText = `ROUND ${Math.floor(score / 10) + 1}/${roundsLeft}`
		const textMetrics = ctx.measureText(pointsText)
		const roundsMetrics = ctx.measureText(roundsText)
		const padding = fontSize * 0.4 // Reduced padding based on font size

		// Calculate positions to prevent overlap
		const totalWidth = textMetrics.width + roundsMetrics.width + padding * 4
		const startX = (width - totalWidth) / 2

		// Points with green background - tighter fit
		const pointsWidth = textMetrics.width + padding * 2
		ctx.fillStyle = '#98FF98'
		ctx.fillRect(startX, hudY + hudHeight * 0.15, pointsWidth, hudHeight * 0.7) // Adjusted height and position

		// Draw points and rounds text side by side
		ctx.fillStyle = '#000000'
		ctx.textAlign = 'left'
		ctx.fillText(pointsText, startX + padding, hudY + hudHeight * 0.65)
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText(roundsText, startX + pointsWidth + padding, hudY + hudHeight * 0.65)
	}

	if (!skipRing) {
		// Ring elements - adjusted for safe area but arms extend full height
		const ringTop = unit * 4 // Adjusted to account for new HUD position
		const ringBottom = height
		const ringHeight = ringBottom - ringTop

		// Ring floor
		ctx.fillStyle = '#00CEC4'
		ctx.fillRect(unit * 0.5, ringTop, width - unit, ringHeight)

		// Ring posts
		const postWidth = unit * 0.8
		const postHeight = unit * 3
		ctx.fillStyle = '#FFFFFF'
		ctx.fillRect(unit, ringTop - postHeight / 2, postWidth, postHeight)
		ctx.fillRect(
			width - unit - postWidth,
			ringTop - postHeight / 2,
			postWidth,
			postHeight
		)

		// Ring ropes
		ctx.strokeStyle = '#FF69B4'
		ctx.lineWidth = Math.max(unit / 6, 2)

		// Top ropes
		for (let i = 0; i < 3; i++) {
			const y = ringTop + i * unit
			ctx.beginPath()
			ctx.moveTo(unit * 0.5, y)
			ctx.lineTo(width - unit * 0.5, y)
			ctx.stroke()
		}

		// Bottom ropes
		for (let i = 0; i < 3; i++) {
			const y = ringBottom - i * unit
			ctx.beginPath()
			ctx.moveTo(unit * 0.5, y)
			ctx.lineTo(width - unit * 0.5, y)
			ctx.stroke()
		}

		// Side ropes
		ctx.beginPath()
		ctx.moveTo(unit + postWidth / 2, ringTop)
		ctx.lineTo(unit + postWidth / 2, ringBottom)
		ctx.stroke()

		ctx.beginPath()
		ctx.moveTo(width - unit - postWidth / 2, ringTop)
		ctx.lineTo(width - unit - postWidth / 2, ringBottom)
		ctx.stroke()
	}
}

function drawTitleScreen() {
	const scale = window.gameScale
	if (!scale) return

	const width = gameCanvas.width
	const height = gameCanvas.height
	const unit = scale.unit

	// Calculate safe area with padding
	const safePadding = Math.max(unit * 3, width * 0.08)
	const safeWidth = width - safePadding * 2
	const safeHeight = height - safePadding * 2

	// Background
	ctx.fillStyle = '#000044'
	ctx.fillRect(0, 0, width, height)

	// Grid pattern (reuse from background, but skip ring)
	drawBackground(true)

	// Center all text
	ctx.textAlign = 'center'

	// Calculate text sizes first to determine total height
	const titleSize = Math.min(unit * 2.5, safeWidth / 10)
	const instructionSize = Math.min(unit * 0.8, safeWidth / 30)
	const menuSize = Math.min(unit * 1.2, safeWidth / 20)

	// Calculate total stack height
	const stackHeight = (
		titleSize * 2 + // CLAPPY + CHEEKS!!
		instructionSize * 3 + // Two lines of instructions + spacing
		menuSize * 3.5 // PRESS SPACE + extra padding (increased from 2.5)
	)

	// Center the stack vertically in safe area
	let currentY = safePadding + (safeHeight - stackHeight) / 2

	// Title group
	ctx.font = `${titleSize}px "Press Start 2P"`

	// Create gradient
	const titleGradient = ctx.createLinearGradient(
		0,
		currentY - titleSize,
		0,
		currentY + titleSize * 2.5
	)
	titleGradient.addColorStop(0, '#FFA500')
	titleGradient.addColorStop(0.5, '#FFD700')
	titleGradient.addColorStop(1, '#FFA500')

	ctx.fillStyle = titleGradient
	ctx.fillText('CLAPPY', width / 2, currentY)
	ctx.fillText('CHEEKS!!', width / 2, currentY + titleSize)
	currentY += titleSize * 2.5

	// Instructions group
	ctx.font = `${instructionSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText('5 ROUNDS PER MATCH', width / 2, currentY)
	ctx.fillText('DODGE PUNCHES FOR POINTS', width / 2, currentY + instructionSize * 1.5)
	currentY += instructionSize * 5 // Increased from 4 to add more space before PRESS SPACE

	// Menu text (PRESS SPACE on one line)
	ctx.font = `${menuSize}px "Press Start 2P"`
	if (roundsLeft > 0) {
		ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
		ctx.fillText('PRESS SPACE', width / 2, currentY)
	} else {
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText('GAME OVER', width / 2, currentY)
	}

	// Score at bottom of stack if present
	if (totalScore > 0) {
		const scoreSize = Math.min(unit * 0.8, safeWidth / 30)
		ctx.font = `${scoreSize}px "Press Start 2P"`
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText(`TOTAL SCORE: ${totalScore}`, width / 2, height - safePadding * 3)
	}

	// Copyright at bottom of safe area
	const copyrightSize = Math.min(unit * 0.5, safeWidth / 40)
	ctx.font = `${copyrightSize}px "Press Start 2P"`
	ctx.fillStyle = '#8888FF' // Lighter, less saturated blue
	ctx.fillText('NOT © 2024 FWD:FWD:FWD:', width / 2, height - safePadding)
}

function drawGameOverScreen() {
	drawBackground()

	const scale = window.gameScale
	if (!scale) return

	const width = gameCanvas.width
	const height = gameCanvas.height
	const unit = scale.unit
	const safePadding = Math.max(unit * 3, width * 0.08)
	const safeWidth = width - safePadding * 2
	const safeHeight = height - safePadding * 2

	// Center all text
	ctx.textAlign = 'center'

	// Calculate text sizes
	const headerSize = Math.min(unit * 1.8, width / 15)
	const textSize = Math.min(unit * 0.8, width / 30)

	// Calculate total stack height
	const stackHeight = roundsLeft === 0
		? (
			headerSize + // MATCH OVER
			textSize * 3 // Two lines of scores
		)
		: (
			headerSize + // KNOCKOUT!!
			textSize * 5 // Two lines of scores + PRESS SPACE + ROUNDS LEFT
		)

	// Center the stack vertically in safe area
	let currentY = safePadding + (safeHeight - stackHeight) / 2

	// Header group
	ctx.font = `${headerSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFFFFF'

	if (roundsLeft === 0) {
		// Match over screen
		ctx.fillText('MATCH OVER', width / 2, currentY)
		currentY += headerSize * 2

		// Score group
		ctx.font = `${textSize}px "Press Start 2P"`
		ctx.fillText(`FINAL SCORE: ${totalScore + score}`, width / 2, currentY)
		ctx.fillText(`ROUNDS COMPLETE: 5`, width / 2, currentY + textSize * 1.5)
	} else {
		// Knockout screen
		ctx.fillStyle = '#000044'
		ctx.fillText('KNOCKOUT!!', width / 2, currentY)
		currentY += headerSize * 2

		// Score group - using darkened ring color
		ctx.fillStyle = '#004A47' // Darker version of #00CEC4
		ctx.font = `${textSize}px "Press Start 2P"`
		ctx.fillText(`ROUND SCORE: ${score}`, width / 2, currentY)
		ctx.fillText(`TOTAL SCORE: ${totalScore + score}`, width / 2, currentY + textSize * 1.5)
		currentY += textSize * 4

		// Action group (PRESS SPACE on one line)
		ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
		ctx.fillText('PRESS SPACE', width / 2, currentY)
		currentY += textSize * 1.5
		ctx.fillStyle = '#004A47' // Darker ring color for rounds left
		ctx.fillText(`ROUNDS LEFT: ${roundsLeft - 1}`, width / 2, currentY)
	}

	// Copyright at bottom of safe area
	const copyrightSize = Math.min(unit * 0.5, width / 40)
	ctx.font = `${copyrightSize}px "Press Start 2P"`
	ctx.fillStyle = '#004A47' // Darker ring color to match other text
	ctx.fillText('NOT © 2024 FWD:FWD:FWD:', width / 2, height - safePadding)
}

// Collision detection
function checkCollisions() {
	if (!cheeks || !gloves || !window.gameScale) return false
	const scale = window.gameScale

	const size = Math.min(scale.width, scale.height) / 15
	const cheeksBox = {
		x: cheeks.x - size,
		y: cheeks.y - size,
		width: size * 2,
		height: size * 2,
	}

	for (const pair of gloves.pairs) {
		const armSize = Math.min(scale.width, scale.height) / 8
		const gapHalf = gloveGap / 2

		// Updated collision boxes to extend full height
		const topGlove = {
			x: pair.x - armSize / 2,
			y: 0,
			width: armSize,
			height: pair.gapY - gapHalf,
		}

		const bottomGlove = {
			x: pair.x - armSize / 2,
			y: pair.gapY + gapHalf,
			width: armSize,
			height: scale.height,
		}

		if (
			intersectRect(cheeksBox, topGlove) ||
			intersectRect(cheeksBox, bottomGlove)
		) {
			playKnockoutSound()
			return true
		}

		if (!pair.passed && cheeks.x > pair.x) {
			pair.passed = true
			score++

			// Increase game speed every 3 points up to max speed
			if (score % 3 === 0 && gameSpeed < MAX_SPEED) {
				gameSpeed = Math.min(MAX_SPEED, gameSpeed + SPEED_INCREASE)
				console.log('Speed increased to:', gameSpeed)
			}
		}
	}

	return false
}

// Helper function for collision detection
function intersectRect(r1, r2) {
	return !(
		r2.x > r1.x + r1.width ||
		r2.x + r2.width < r1.x ||
		r2.y > r1.y + r1.height ||
		r2.y + r2.height < r1.y
	)
}

// Update bounds checking
function checkBounds() {
	if (!cheeks || !window.gameScale) return false
	return cheeks.y < 0 || cheeks.y > window.gameScale.height
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
	console.log('DOM loaded, initializing game...')
	try {
		await init()
		console.log('Game initialized, starting game loop...')
		requestAnimationFrame(gameLoop)
	} catch (error) {
		console.error('Failed to initialize game:', error)
	}
})
