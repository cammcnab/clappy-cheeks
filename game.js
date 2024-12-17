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
	crowdImage: null,
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
const CLAP_SPEED = -8
const CHEEKS_SIZE = 25
const GLOVE_WIDTH = 50
let GLOVE_OPENING = 250
const GLOVE_SET_GAP = 0.65 // Percentage of screen width between arm sets
const GLOVE_SPEED = 4.0
const KNOCKOUT_DELAY = 1500
const SPEED_INCREASE = 0.08
const MAX_SPEED = 1.6

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
let roundsLeft = 3
let currentRound = 1
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
let firstAction = false
let hasEverActed = false
const SQUISH_DURATION = 100

// Initialize function
async function init() {
	console.log('Initializing game components...')

	try {
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

			// Initialize CRT effect only if WebGL is available
			if (effectCanvas.getContext('webgl')) {
				crtEffect = new CRTEffect(effectCanvas)
				console.log('CRT effect initialized')
			} else {
				console.log('WebGL not available, skipping CRT effect')
			}
		} catch (error) {
			console.error('Failed to initialize CRT effect:', error)
			// Continue without CRT effect
			crtEffect = null
		}

		// Add resize handler with debouncing
		let resizeTimeout
		window.addEventListener('resize', () => {
			clearTimeout(resizeTimeout)
			resizeTimeout = setTimeout(handleResize, 100)
		})

		// Rest of initialization
		console.log('Loading game assets...')
		await loadImages()
		console.log('Images loaded')
		await initAudio()
		console.log('Audio initialized')
		initGameObjects()
		console.log('Game objects initialized')
		initInputHandlers()
		console.log('Input handlers initialized')
		startGame()
		console.log('Game started')

		// Set initial timestamp
		lastFrameTime = performance.now()
		
		return true
	} catch (error) {
		console.error('Initialization error:', error)
		return false
	}
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
	GLOVE_OPENING = baseUnit * 8

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
	firstAction = false
	// Reset share button state when new game starts
	window.shareData = null;

	if (cheeks) {
		cheeks.x = window.gameScale ? window.gameScale.width / 3 : CANVAS_WIDTH / 3
		cheeks.y = window.gameScale ? window.gameScale.height / 2 : CANVAS_HEIGHT / 2
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
		loadImage('images/crowd.png').then((img) => (images.crowdImage = img)),
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
				// Calculate arm dimensions based on screen width while maintaining aspect ratio
				const armWidth = Math.min(scale.width, scale.height) / 8
				const armHeight =
					(armWidth / images.armImage.width) * images.armImage.height
				const gapHalf = GLOVE_OPENING / 2

				// Draw top arm
				ctx.save()
				ctx.translate(pair.x, pair.gapY - gapHalf)
				ctx.rotate(Math.PI) // 180 degrees to point down
				ctx.scale(
					armWidth / images.armImage.width,
					armWidth / images.armImage.width
				)
				ctx.drawImage(
					images.armImage,
					-images.armImage.width / 2,
					0,
					images.armImage.width,
					images.armImage.height
				)
				ctx.restore()

				// Draw bottom arm
				ctx.save()
				ctx.translate(pair.x, pair.gapY + gapHalf)
				ctx.scale(
					armWidth / images.armImage.width,
					armWidth / images.armImage.width
				)
				ctx.drawImage(
					images.armImage,
					-images.armImage.width / 2,
					0,
					images.armImage.width,
					images.armImage.height
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
			const minSpacing = window.gameScale.width * GLOVE_SET_GAP
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
			GLOVE_OPENING = Math.min(scale.height * 0.35, scale.unit * 10)

			// Adjust the spawn range to prevent arms from being too close to edges
			const minY = safePadding + GLOVE_OPENING * 0.8 // More padding from top
			const maxY = scale.height - safePadding - GLOVE_OPENING * 0.8 // More padding from bottom
			let y = Math.random() * (maxY - minY) + minY

			// Spawn gloves slightly beyond the right edge to prevent pop-in
			this.pairs.push({
				x: scale.width + safePadding,
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
			currentRound++
			startGame()
			gameStarted = true
			gameOver = false
			firstAction = false
			gameStartTime = performance.now()
			playCheerSound()
		}
	} else if (!gameOver) {
		if (cheeks) {
			firstAction = true
			hasEverActed = true
			cheeks.velocity = CLAP_SPEED
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

	try {
		// Calculate delta time and cap it to prevent huge jumps
		const deltaTime = Math.min(timestamp - lastFrameTime, 32) // Cap at ~30 FPS worth of time
		const timeScale = deltaTime / 16.667 // Scale relative to 60 FPS
		lastFrameTime = timestamp

		// Clear the canvas using actual dimensions
		ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height)

		// Draw background first (always skip ring)
		drawBackground(true)

		// Draw ring next (for all game states)
		drawRing()

		// Draw game state specific elements
		if (!gameStarted) {
			drawTitleScreen()
		} else if (gameOver) {
			drawGameOverScreen()
			// Enable share button when game is over
			if (window.onGameEnd) {
				const detail = {
					score: totalScore + score,
					isGameOver: true,
					roundsLeft: roundsLeft
				};
				window.dispatchEvent(new CustomEvent('gameEnd', { detail }));
			}
		} else {
			// Update game objects with time scaling
			if (cheeks) {
				cheeks.velocity += GRAVITY * gameSpeed * timeScale
				cheeks.y += cheeks.velocity * gameSpeed * timeScale
				if (cheeks.velocity > 4) {
					cheeks.velocity = 4
				}
			}

			if (gloves) {
				// Don't move gloves during initial delay
				if (performance.now() - gameStartTime >= gameStartDelay) {
					const speed = GLOVE_SPEED * gameSpeed * timeScale * (window.gameScale.width / CANVAS_WIDTH)
					
					gloves.pairs.forEach((pair) => {
						pair.x -= speed
					})

					gloves.pairs = gloves.pairs.filter((pair) => pair.x + GLOVE_WIDTH > 0)

					// Increase spacing between arm pairs
					const minSpacing = window.gameScale.width * GLOVE_SET_GAP
					if (
						gloves.pairs.length === 0 ||
						gloves.pairs[gloves.pairs.length - 1].x <
							window.gameScale.width - minSpacing
					) {
						gloves.spawn()
					}
				}
			}

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

			// Draw HUD on top of everything
			drawHUD()
		}

		// Apply CRT effect only if available
		if (crtEffect && crtEffect.gl) {
			try {
				crtEffect.render(gameCanvas)
			} catch (error) {
				console.error('CRT effect error:', error)
				// Disable CRT effect if it fails
				crtEffect = null
			}
		}

		// Request next frame
		requestAnimationFrame(gameLoop)
	} catch (error) {
		console.error('Game loop error:', error)
		// Try to recover by requesting next frame
		requestAnimationFrame(gameLoop)
	}
}

// Separate ring drawing function
function drawRing() {
	const scale = window.gameScale
	if (!scale) return

	const width = gameCanvas.width
	const height = gameCanvas.height
	const unit = scale.unit

	// Ring elements - brought in more from edges
	const ringTop = unit * 6 // Keep same vertical position
	const ringBottom = height
	const ringHeight = ringBottom - ringTop

	// Ring floor - angled to match perspective
	ctx.fillStyle = '#00CEC4'
	ctx.beginPath()
	ctx.moveTo(unit * 2, ringTop)
	ctx.lineTo(width - unit * 2, ringTop)
	ctx.lineTo(width * 1.1, ringBottom) // Match right rope angle
	ctx.lineTo(-width * 0.1, ringBottom) // Match left rope angle
	ctx.fill()

	// Ring posts - brought in more
	const postWidth = unit * 0.8
	const postHeight = unit * 3
	ctx.fillStyle = '#FFFFFF'
	ctx.fillRect(unit * 2.5, ringTop - postHeight / 2, postWidth, postHeight)
	ctx.fillRect(
		width - unit * 2.5 - postWidth,
		ringTop - postHeight / 2,
		postWidth,
		postHeight
	)

	// Ring ropes - drawn in order for proper overlapping
	ctx.strokeStyle = '#FF69B4'
	ctx.lineWidth = Math.max(unit / 6, 2)

	// Draw all ropes in sequence to create continuous appearance
	for (let i = 0; i < 3; i++) {
		const topY = ringTop - postHeight * 0.6 + (i + 1) * (postHeight / 3)
		const bottomY = ringBottom - i * unit

		// Left side rope first
		ctx.beginPath()
		ctx.moveTo(unit * 2.5 + postWidth / 2, topY)
		ctx.lineTo(-width * 0.1, bottomY)
		ctx.stroke()

		// Right side rope
		ctx.beginPath()
		ctx.moveTo(width - unit * 2.5 - postWidth / 2, topY)
		ctx.lineTo(width * 1.1, bottomY)
		ctx.stroke()

		// Top rope connecting the posts
		ctx.beginPath()
		ctx.moveTo(unit * 2.5 + postWidth / 2, topY)
		ctx.lineTo(width - unit * 2.5 - postWidth / 2, topY)
		ctx.stroke()

		// Bottom rope connecting the extended points
		ctx.beginPath()
		ctx.moveTo(-width * 0.1, bottomY)
		ctx.lineTo(width * 1.1, bottomY)
		ctx.stroke()
	}
}

// Separate HUD drawing function
function drawHUD() {
	const scale = window.gameScale
	if (!scale) return

	const width = gameCanvas.width
	const height = gameCanvas.height
	const unit = scale.unit

	// Save current transform and apply new one for HUD
	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform for HUD to ensure it's always on top

	// Show flashing PRESS SPACE during any round until first action, but only if never acted before
	if (!firstAction && !hasEverActed && gameStarted && !gameOver) {
		const promptSize = Math.min(unit * 1.2, width * 0.04)
		ctx.font = `${promptSize}px "Press Start 2P"`
		ctx.textAlign = 'center'
		ctx.fillStyle =
			Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
		ctx.fillText('PRESS SPACE', width / 2, height / 2)
	}

	// HUD bar - moved closer to top with full width
	const hudHeight = Math.max(height * 0.08, unit * 2.5)
	const hudY = unit * 0.8 // Reduced top padding

	// Remove black background for HUD
	// ctx.fillStyle = '#000000'
	// ctx.fillRect(0, 0, width, hudHeight + hudY)

	// Scale font size based on HUD height
	const fontSize = Math.min(hudHeight * 0.4, width * 0.03)
	ctx.font = `${fontSize}px "Press Start 2P"`
	ctx.textAlign = 'center'

	// Measure text widths for tight background
	const pointsText = `POINTS: ${score}`
	const roundsText = `ROUND: ${currentRound}/3`
	const textMetrics = ctx.measureText(pointsText)
	const roundsMetrics = ctx.measureText(roundsText)
	const padding = fontSize * 0.4

	// Calculate positions to prevent overlap
	const totalWidth = textMetrics.width + roundsMetrics.width + padding * 4
	const startX = (width - totalWidth) / 2

	// Points with white background - using same container logic as final score
	const textHeight = fontSize // Base height of the font
	const verticalPadding = fontSize * 0.6 // Consistent padding vertically
	const horizontalPadding = fontSize * 0.8 // Slightly more padding horizontally
	const pointsBoxWidth = textMetrics.width + horizontalPadding * 2
	const roundsBoxWidth = roundsMetrics.width + horizontalPadding * 2
	const boxHeight = textHeight + verticalPadding * 2
	const boxY = hudY + (hudHeight - boxHeight) / 2

	// White background box for points
	ctx.fillStyle = '#98FF98'
	ctx.fillRect(startX, boxY, pointsBoxWidth, boxHeight)

	// Black background box for rounds
	ctx.fillStyle = '#000000'
	ctx.fillRect(
		startX + pointsBoxWidth + padding,
		boxY,
		roundsBoxWidth,
		boxHeight
	)

	// Draw points and rounds text side by side
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'

	// Points text
	ctx.font = `${fontSize}px "Press Start 2P"` // Ensure font is set before each text
	ctx.fillStyle = '#000000'
	ctx.fillText(pointsText, startX + horizontalPadding, boxY + boxHeight / 2)

	// Rounds text
	ctx.font = `${fontSize}px "Press Start 2P"` // Ensure font is set before each text
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText(
		roundsText,
		startX + pointsBoxWidth + padding + horizontalPadding,
		boxY + boxHeight / 2
	)
	ctx.textBaseline = 'alphabetic'

	ctx.restore()
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

	// Draw crowd pattern during gameplay
	if (gameStarted && images.crowdImage) {
		ctx.globalAlpha = 0.6
		const crowdHeight = unit * 8 // Height of crowd section
		const pattern = ctx.createPattern(images.crowdImage, 'repeat')
		if (pattern) {
			ctx.fillStyle = pattern
			ctx.fillRect(0, 0, width, crowdHeight)
		}
		ctx.globalAlpha = 1.0
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
	const titleSize = Math.min(unit * 2.5, safeWidth / 10, safeHeight / 8)
	const instructionSize = Math.min(unit * 0.8, safeWidth / 30, safeHeight / 20)
	const menuSize = Math.min(unit * 1.2, safeWidth / 20, safeHeight / 15)

	// Use unit-based spacing
	const titleSpacing = unit * 1.5
	const instructionSpacing = unit * 3
	const menuSpacing = unit * 2

	// Calculate total stack height with unit-based spacing
	const stackHeight =
		titleSize * 2 + // CLAPPY + CHEEKS!!
		titleSpacing +
		instructionSize * 2 + // Two lines of instructions
		instructionSpacing +
		menuSize + // PRESS SPACE
		menuSpacing

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
	currentY += titleSize * 2 + titleSpacing

	// Instructions group
	ctx.font = `${instructionSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText('3 ROUNDS PER MATCH', width / 2, currentY)
	currentY += instructionSize  // Set to exactly 1.0
	ctx.fillText(
		'DODGE PUNCHES FOR POINTS',
		width / 2,
		currentY + instructionSize * 1.2
	)
	currentY += instructionSize * 2 + instructionSpacing

	// Menu text (PRESS SPACE)
	ctx.font = `${menuSize}px "Press Start 2P"`
	if (roundsLeft > 0) {
		// Draw decorative gloves pointing at PRESS SPACE
		if (images.armImage) {
			const gloveSize = menuSize * 2.5
			const textMetrics = ctx.measureText('PRESS SPACE')
			const gloveSpacing = textMetrics.width * 2.4
			const centerX = width / 2
			const gloveY = currentY - menuSize * 0.8

			// Calculate dimensions for proper centering
			const gloveWidth = gloveSize
			const gloveHeight =
				(gloveSize / images.armImage.width) * images.armImage.height

			// Calculate glove movement based on flashing text timing
			const moveAmount =
				Math.floor(performance.now() / 250) % 2 ? unit * 0.4 : 0

			// Left glove
			ctx.save()
			ctx.translate(centerX - gloveSpacing / 2 - moveAmount, gloveY)
			ctx.rotate(Math.PI / 2)
			ctx.scale(-1, 1)
			ctx.drawImage(
				images.armImage,
				-gloveWidth / 2,
				-gloveHeight / 2,
				gloveWidth,
				gloveHeight
			)
			ctx.restore()

			// Right glove
			ctx.save()
			ctx.translate(centerX + gloveSpacing / 2 + moveAmount, gloveY)
			ctx.rotate(-Math.PI / 2)
			ctx.drawImage(
				images.armImage,
				-gloveWidth / 2,
				-gloveHeight / 2,
				gloveWidth,
				gloveHeight
			)
			ctx.restore()
		}

		ctx.fillStyle =
			Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
		ctx.fillText('PRESS SPACE', width / 2, currentY)
	} else {
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText('GAME OVER', width / 2, currentY)
	}
	currentY += menuSize + menuSpacing

	// Score at bottom of stack if present
	if (totalScore > 0) {
		const scoreSize = Math.min(unit * 0.8, safeWidth / 30, safeHeight / 20)
		ctx.font = `${scoreSize}px "Press Start 2P"`
		const totalScoreText = `TOTAL SCORE: ${totalScore}`
		const scoreMetrics = ctx.measureText(totalScoreText)
		const scorePadding = unit * 0.8 // Consistent unit-based padding

		// White background
		ctx.fillStyle = '#FFFFFF'
		ctx.fillRect(
			width / 2 - scoreMetrics.width / 2 - scorePadding,
			height - safePadding * 2.5,
			scoreMetrics.width + scorePadding * 2,
			scoreSize * 1.4
		)

		// Score text
		ctx.fillStyle = '#000000'
		ctx.fillText(totalScoreText, width / 2, height - safePadding * 2)
	}

	// Add cheat mode text if active (in same position as copyright)
	if (window.cheatMode) {
		const copyrightSize = Math.min(unit * 0.5, width / 40)
		ctx.font = `${copyrightSize}px "Press Start 2P"`
		ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff3333' : '#cc0000'
		ctx.fillText('CHEAT MODE ACTIVATED', width / 2, height - safePadding)
	} else {
		const copyrightSize = Math.min(unit * 0.5, width / 40)
		ctx.font = `${copyrightSize}px "Press Start 2P"`
		ctx.fillStyle = '#8888FF'
		ctx.fillText('NOT © 2024 FWD:FWD:FWD:', width / 2, height - safePadding)
	}
}

function drawGameOverScreen() {
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
	const copyrightSize = Math.min(unit * 0.5, width / 40)

	// Calculate total stack height
	const stackHeight =
		roundsLeft === 0
			? headerSize + // MATCH OVER
			  textSize * 3 // Two lines of scores
			: headerSize + // KNOCKOUT!!
			  textSize * 5 // Two lines of scores + PRESS SPACE + ROUNDS LEFT

	// Center the stack vertically in safe area but shift up slightly
	let currentY = safePadding + (safeHeight - stackHeight) / 2 - unit * 2 // Shifted up by 2 units

	// Header group
	ctx.font = `${headerSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFFFFF'

	if (roundsLeft === 0) {
		// Match over screen
		ctx.fillStyle = '#000044'
		ctx.fillText('KNOCKOUT!!', width / 2, currentY + unit * 3)
		currentY += headerSize * 1.5 + unit * 4

		// Score group with white background
		ctx.font = `${textSize}px "Press Start 2P"`
		const finalScoreText = `FINAL SCORE: ${totalScore + score}`
		const scoreMetrics = ctx.measureText(finalScoreText)

		// Calculate text dimensions including ascent and descent
		const textHeight = textSize // Base height of the font
		const verticalPadding = textSize * 0.6 // Consistent padding vertically
		const horizontalPadding = textSize * 0.8 // Slightly more padding horizontally
		const boxWidth = scoreMetrics.width + horizontalPadding * 2
		const boxHeight = textHeight + verticalPadding * 2

		// White background box - centered both horizontally and vertically
		ctx.fillStyle = '#FFFFFF'
		ctx.fillRect(
			width / 2 - boxWidth / 2,
			currentY - boxHeight / 2,
			boxWidth,
			boxHeight
		)

		// Score text in blue - centered in the box
		ctx.fillStyle = '#000044'
		ctx.textBaseline = 'middle' // Set baseline to middle for vertical centering
		ctx.fillText(finalScoreText, width / 2, currentY)
		ctx.textBaseline = 'alphabetic' // Reset baseline to default

		// Add copyright or cheat mode text at bottom
		ctx.font = `${copyrightSize}px "Press Start 2P"`
		if (window.cheatMode) {
			ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff3333' : '#cc0000'
			ctx.fillText('CHEAT MODE ACTIVATED', width / 2, height - safePadding)
		} else {
			ctx.fillStyle = '#004A47'
			ctx.fillText('NOT © 2024 FWD:FWD:FWD:', width / 2, height - safePadding)
		}
	} else {
		// Round over screen
		ctx.fillStyle = '#000044'
		ctx.fillText('ROUND', width / 2, currentY + unit * 3)
		ctx.fillText('OVER!!', width / 2, currentY + unit * 5)
		currentY += headerSize * 3 + unit * 2  // Reduced spacing here

		// Score group - all lines with equal spacing
		ctx.fillStyle = '#004A47'
		ctx.font = `${textSize}px "Press Start 2P"`
		const lineSpacing = textSize * 1.8  // Equal spacing between all lines
		
		ctx.fillText(`ROUND SCORE: ${score}`, width / 2, currentY)
		ctx.fillText(
			`TOTAL SCORE: ${totalScore + score}`,
			width / 2,
			currentY + lineSpacing
		)
		ctx.fillText(
			`ROUNDS LEFT: ${roundsLeft - 1}`,
			width / 2,
			currentY + lineSpacing * 2
		)
		currentY += lineSpacing * 3

		// Only show PRESS SPACE after knockout delay
		if (performance.now() - knockoutTime > KNOCKOUT_DELAY) {
			ctx.fillStyle =
				Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
			ctx.fillText('PRESS SPACE', width / 2, currentY)
		}

		// Add cheat mode text if active (in same position as copyright would be)
		if (window.cheatMode) {
			ctx.font = `${copyrightSize}px "Press Start 2P"`
			ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff3333' : '#cc0000'
			ctx.fillText('CHEAT MODE ACTIVATED', width / 2, height - safePadding)
		}
	}
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
		const armWidth = Math.min(scale.width, scale.height) / 8
		const armHeight =
			(armWidth / images.armImage.width) * images.armImage.height
		const gapHalf = GLOVE_OPENING / 2

		// Collision boxes match actual glove dimensions
		const topGlove = {
			x: pair.x - armWidth / 2,
			y: pair.gapY - gapHalf - armHeight,
			width: armWidth,
			height: armHeight,
		}

		const bottomGlove = {
			x: pair.x - armWidth / 2,
			y: pair.gapY + gapHalf,
			width: armWidth,
			height: armHeight,
		}

		if (
			intersectRect(cheeksBox, topGlove) ||
			intersectRect(cheeksBox, bottomGlove)
		) {
			playKnockoutSound()
			// Reset share button state when round ends
			window.shareData = null;
			return true
		}

		if (!pair.passed && cheeks.x > pair.x) {
			pair.passed = true;
			// Add cheat points if in cheat mode
			score += window.cheatPoints || 1;

			// Increase game speed every 3 points up to max speed
			if (score % 3 === 0 && gameSpeed < MAX_SPEED && !window.cheatMode) {
				gameSpeed = Math.min(MAX_SPEED, gameSpeed + SPEED_INCREASE);
				console.log('Speed increased to:', gameSpeed);
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
	const outOfBounds = cheeks.y < 0 || cheeks.y > window.gameScale.height
	if (outOfBounds) {
		playKnockoutSound()
		// Reset share button state when round ends
		window.shareData = null;
	}
	return outOfBounds
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
	console.log('DOM loaded, initializing game...')
	try {
		// Wait for power-on sequence to complete if it exists
		if (window.powerOnComplete) {
			await window.powerOnComplete;
		}

		const initialized = await init()
		if (initialized) {
			console.log('Game initialized, starting game loop...')
			requestAnimationFrame(gameLoop)
		} else {
			console.error('Game initialization failed')
		}
	} catch (error) {
		console.error('Failed to initialize game:', error)
	}
})

// Separate function to activate cheat mode
function activateCheatMode() {
	console.log('Activating cheat mode...')
	cheatMode = true
	window.cheatMode = true // Make it accessible to game.js
	konamiIndex = 0
	window.gameSpeed = 0.5
	window.cheatPoints = 10

	// Play Konami sound effect
	const konamiSound = new Audio('audio/konami.mp3')
	konamiSound.play().catch(e => console.log('Konami sound failed:', e))

	console.log('Game state updated:', {
		cheatMode: window.cheatMode,
		gameSpeed: window.gameSpeed,
		cheatPoints: window.cheatPoints,
	})

	// Flash power LED red rapidly for cheat activation
	let flashCount = 0
	const flashInterval = setInterval(() => {
		if (flashCount >= 6) {
			clearInterval(flashInterval)
			return
		}
		flashPowerLED('#ff3333', 50)
		flashCount++
	}, 100)
}
