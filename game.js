// Import CRT effect
import { CRTEffect } from './shaders.js'

// Game constants
const CHEEKS_SIZE = 32 // Base size for cheeks sprite
const GRAVITY = 0.4
const CLAP_SPEED = -8.0

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
const GLOVE_WIDTH = 50
let GLOVE_OPENING = 250
const GLOVE_SET_GAP = 0.65 // Percentage of screen width between arm sets
const GLOVE_SPEED = 4.0
const KNOCKOUT_DELAY = 1500
const SPEED_INCREASE = 0.08
const MAX_SPEED = 1.6

// Game variables
let gameCanvas
let gl
let crtEffect
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
let squishStartTime = 0
let firstAction = false
let hasEverActed = false
const SQUISH_DURATION = 100

// Initialize game scale
window.gameScale = {
	x: window.innerWidth,
	y: window.innerHeight,
	min: Math.min(window.innerWidth, window.innerHeight),
	max: Math.max(window.innerWidth, window.innerHeight),
	unit: Math.min(window.innerWidth, window.innerHeight) / 20,
	width: window.innerWidth,
	height: window.innerHeight,
	dpr: window.devicePixelRatio || 1,
}

// Initialize function
async function init() {
	console.log('Initializing game components...')

	try {
		// Get canvas element
		gameCanvas = document.getElementById('gameCanvas')
		monitorFrame = document.querySelector('.monitor-frame')

		if (!gameCanvas) {
			throw new Error('Game canvas not found')
		}

		if (!monitorFrame) {
			throw new Error('Monitor frame not found')
		}

		// Initialize game scale
		window.gameScale = {
			x: window.innerWidth,
			y: window.innerHeight,
			min: Math.min(window.innerWidth, window.innerHeight),
			max: Math.max(window.innerWidth, window.innerHeight),
			unit: Math.min(window.innerWidth, window.innerHeight) / 20,
			width: window.innerWidth,
			height: window.innerHeight,
			dpr: window.devicePixelRatio || 1,
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
			container.style.width = '100%'
			container.style.height = '100%'
			container.style.touchAction = 'none'
			container.style.webkitTouchCallout = 'none'
			container.style.webkitUserSelect = 'none'
			container.style.userSelect = 'none'
		}

		// Set canvas styles
		gameCanvas.style.position = 'absolute'
		gameCanvas.style.width = '100%'
		gameCanvas.style.height = '100%'
		gameCanvas.style.touchAction = 'none'
		gameCanvas.style.webkitTapHighlightColor = 'transparent'
		gameCanvas.style.userSelect = 'none'
		gameCanvas.style.webkitUserSelect = 'none'
		gameCanvas.style.msTouchAction = 'none'
		gameCanvas.style.msContentZooming = 'none'

		// Initialize WebGL context with CRT effect
		crtEffect = new CRTEffect(gameCanvas)
		if (!crtEffect || !crtEffect.gl) {
			throw new Error('Could not initialize WebGL context')
		}

		// Use the WebGL context for all rendering
		gl = crtEffect.gl
		console.log('WebGL context initialized')

		// Set initial canvas dimensions
		handleResize()

		// Add resize event listeners
		window.addEventListener('resize', handleResize)
		window.addEventListener('orientationchange', handleResize)

		// Rest of initialization
		console.log('Loading game assets...')
		await loadImages()
		console.log('Images loaded')
		await initAudio()
		console.log('Audio initialized')
		initGameObjects()
		console.log('Input handlers initialized')
		initInputHandlers()
		console.log('Game started')
		startGame()

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

	// Get container dimensions
	const container = gameCanvas.parentElement
	if (!container) return

	// Force a small delay to ensure proper dimensions after orientation change
	setTimeout(() => {
		const containerRect = container.getBoundingClientRect()
		const containerWidth = containerRect.width
		const containerHeight = containerRect.height

		// Calculate device pixel ratio
		const dpr = window.devicePixelRatio || 1

		// Set canvas dimensions to match container
		const width = containerWidth
		const height = containerHeight

		// Set display size (CSS pixels)
		gameCanvas.style.width = '100%'
		gameCanvas.style.height = '100%'
		gameCanvas.style.left = '0'
		gameCanvas.style.top = '0'

		// Set actual size in memory (scaled for DPI)
		gameCanvas.width = Math.floor(width * dpr)
		gameCanvas.height = Math.floor(height * dpr)

		// Calculate new base unit for responsive UI sizing
		const baseUnit = Math.min(width, height) / 20

		// Update game scale factors for responsive drawing
		window.gameScale = {
			x: width,
			y: height,
			min: Math.min(width, height),
			max: Math.max(width, height),
			unit: baseUnit,
			width: width,
			height: height,
			dpr: dpr,
		}

		// Update game object positions for new dimensions
		if (cheeks) {
			cheeks.x = width / 3
			if (!gameStarted) {
				cheeks.y = height / 2
			}
		}

		// Update glove gaps and positions
		GLOVE_OPENING = baseUnit * 8

		// Update WebGL viewport if needed
		if (gl) {
			gl.viewport(0, 0, gameCanvas.width, gameCanvas.height)
		}

		console.log('Canvas resized:', {
			containerSize: `${containerWidth}x${containerHeight}`,
			canvasSize: `${width}x${height}`,
			actualSize: `${gameCanvas.width}x${gameCanvas.height}`,
			dpr: dpr,
			baseUnit: baseUnit,
		})
	}, 100)
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
	window.shareData = null

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
		draw(ctx) {
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
		draw(ctx) {
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
		// Prevent all default touch behaviors
		gameCanvas.addEventListener('touchstart', (e) => e.preventDefault(), {
			passive: false,
		})
		gameCanvas.addEventListener('touchmove', (e) => e.preventDefault(), {
			passive: false,
		})
		gameCanvas.addEventListener('touchend', (e) => e.preventDefault(), {
			passive: false,
		})
		gameCanvas.addEventListener('touchcancel', (e) => e.preventDefault(), {
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

		// Prevent scrolling on mobile
		document.body.style.overflow = 'hidden'
		document.documentElement.style.overflow = 'hidden'
		document.body.style.position = 'fixed'
		document.body.style.width = '100%'
		document.body.style.height = '100%'
	}
}

// Game loop
function gameLoop(timestamp) {
	if (!gl || !gameCanvas || !crtEffect || !window.gameScale) {
		console.error('Required components not available:', {
			gl: !!gl,
			gameCanvas: !!gameCanvas,
			crtEffect: !!crtEffect,
			gameScale: !!window.gameScale,
		})
		requestAnimationFrame(gameLoop)
		return
	}

	try {
		// Calculate delta time and cap it
		const deltaTime = Math.min(timestamp - lastFrameTime, 32)
		const timeScale = deltaTime / 16.667
		lastFrameTime = timestamp

		// Clear the canvas
		gl.clear(gl.COLOR_BUFFER_BIT)

		// Create an offscreen canvas for 2D rendering
		const offscreenCanvas = document.createElement('canvas')
		offscreenCanvas.width = gameCanvas.width
		offscreenCanvas.height = gameCanvas.height
		const ctx = offscreenCanvas.getContext('2d')

		if (!ctx) {
			console.error('Could not get 2D context')
			return
		}

		// Set up the transformation for high DPI
		ctx.save()
		ctx.scale(window.gameScale.dpr, window.gameScale.dpr)

		// Draw game elements to offscreen canvas
		if (!gameStarted) {
			drawTitleScreen(ctx)
		} else if (gameOver) {
			drawGameOverScreen(ctx)
			if (window.onGameEnd) {
				const detail = {
					score: totalScore + score,
					isGameOver: true,
					roundsLeft: roundsLeft,
				}
				window.dispatchEvent(new CustomEvent('gameEnd', { detail }))
			}
		} else {
			// Draw background
			drawBackground(ctx)

			// Update game objects with time scaling
			if (cheeks) {
				cheeks.velocity += GRAVITY * gameSpeed * timeScale
				cheeks.y += cheeks.velocity * gameSpeed * timeScale
				if (cheeks.velocity > 4) {
					cheeks.velocity = 4
				}
			}

			if (gloves) {
				if (performance.now() - gameStartTime >= gameStartDelay) {
					const speed =
						GLOVE_SPEED *
						gameSpeed *
						timeScale *
						(window.gameScale.width / 1000)
					gloves.pairs.forEach((pair) => {
						pair.x -= speed
					})

					gloves.pairs = gloves.pairs.filter((pair) => pair.x + GLOVE_WIDTH > 0)

					if (
						gloves.pairs.length === 0 ||
						gloves.pairs[gloves.pairs.length - 1].x <
							window.gameScale.width * GLOVE_SET_GAP
					) {
						gloves.spawn()
					}
				}
			}

			// Check collisions and bounds
			if (checkCollisions() || checkBounds()) {
				gameOver = true
				knockoutTime = performance.now()
				roundsLeft--
			}

			// Draw game objects
			if (gloves) gloves.draw(ctx)
			if (cheeks) cheeks.draw(ctx)
			drawHUD(ctx)
		}

		ctx.restore()

		// Apply CRT effect using the offscreen canvas
		crtEffect.render(offscreenCanvas)

		// Request next frame
		requestAnimationFrame(gameLoop)
	} catch (error) {
		console.error('Game loop error:', error)
		requestAnimationFrame(gameLoop)
	}
}

// Drawing functions
function drawBackground(ctx) {
	const scale = window.gameScale
	if (!scale) return

	const width = scale.width
	const height = scale.height
	const unit = scale.unit

	// Background
	ctx.fillStyle = '#000044'
	ctx.fillRect(0, 0, width, height)

	// Grid pattern
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
	ctx.lineWidth = Math.max(1, unit / 20)

	// Draw grid across full canvas
	const gridSpacing = unit * 1.2
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
		const crowdHeight = unit * 8
		const pattern = ctx.createPattern(images.crowdImage, 'repeat')
		if (pattern) {
			ctx.fillStyle = pattern
			ctx.fillRect(0, 0, width, crowdHeight)
		}
		ctx.globalAlpha = 1.0
	}

	// Only draw ring during gameplay or game over screen
	if (gameStarted || gameOver) {
		drawRing(ctx)
	}
}

// Update drawRing to extend perspective distortion
function drawRing(ctx) {
	const scale = window.gameScale
	if (!scale) return

	const width = scale.width
	const height = scale.height
	const unit = scale.unit

	// Ring elements - minimal insets to extend closer to edges
	const insetX = unit * 1.5
	const ringTop = unit * 4
	const ringBottom = height + unit * 2
	const ringHeight = ringBottom - ringTop

	// Ring floor with increased perspective distortion
	ctx.fillStyle = '#00CEC4'
	ctx.beginPath()
	ctx.moveTo(insetX, ringTop)
	ctx.lineTo(width - insetX, ringTop)
	ctx.lineTo(width + unit * 8, ringBottom) // Moved further right
	ctx.lineTo(-unit * 8, ringBottom) // Moved further left
	ctx.fill()

	// Ring posts - adjusted for minimal insets
	const postWidth = unit * 0.8
	const postHeight = unit * 3
	ctx.fillStyle = '#FFFFFF'
	ctx.fillRect(insetX * 1.5, ringTop - postHeight / 2, postWidth, postHeight)
	ctx.fillRect(
		width - insetX * 1.5 - postWidth,
		ringTop - postHeight / 2,
		postWidth,
		postHeight
	)

	// Ring ropes - adjusted for increased perspective
	ctx.strokeStyle = '#FF69B4'
	ctx.lineWidth = Math.max(unit / 6, 2)

	for (let i = 0; i < 3; i++) {
		const topY = ringTop - postHeight * 0.6 + (i + 1) * (postHeight / 3)
		const bottomY = ringBottom - i * unit

		// Left side rope - extended further left
		ctx.beginPath()
		ctx.moveTo(insetX * 1.5 + postWidth / 2, topY)
		ctx.lineTo(-unit * 6 + i * unit * 2, bottomY) // Progressive extension
		ctx.stroke()

		// Right side rope - extended further right
		ctx.beginPath()
		ctx.moveTo(width - insetX * 1.5 - postWidth / 2, topY)
		ctx.lineTo(width + unit * 6 - i * unit * 2, bottomY) // Progressive extension
		ctx.stroke()

		// Top rope
		ctx.beginPath()
		ctx.moveTo(insetX * 1.5 + postWidth / 2, topY)
		ctx.lineTo(width - insetX * 1.5 - postWidth / 2, topY)
		ctx.stroke()

		// Bottom rope - extended perspective
		ctx.beginPath()
		ctx.moveTo(-unit * 6 + i * unit * 2, bottomY)
		ctx.lineTo(width + unit * 6 - i * unit * 2, bottomY)
		ctx.stroke()
	}
}

// Update helper function for consistent copyright text with blinking cheat mode
function drawCopyright(ctx, color) {
	const scale = window.gameScale
	if (!scale) return

	const width = scale.width
	const height = scale.height
	const unit = scale.unit

	const copyrightSize = Math.min(unit * 0.5, width / 30)
	const copyrightPadding = unit * 2
	ctx.font = `${copyrightSize}px "Press Start 2P"`

	if (window.cheatMode) {
		// Blinking red text for cheat mode
		ctx.fillStyle =
			Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
	} else {
		ctx.fillStyle = color
	}

	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(
		window.cheatMode ? 'CHEAT MODE ACTIVATED' : 'NOT © 2024 FWD:FWD:FWD:',
		width / 2,
		height - copyrightPadding
	)
}

// Update drawTitleScreen to use helper
function drawTitleScreen(ctx) {
	const scale = window.gameScale
	if (!scale) return

	const width = scale.width
	const height = scale.height
	const unit = scale.unit

	// Draw background first
	drawBackground(ctx)

	// Center all text
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'

	// Calculate text sizes with further reductions
	const titleSize = Math.min(unit * 1.6, width / 14)
	const subtitleSize = Math.min(unit * 1.1, width / 20)
	const instructionSize = Math.min(unit * 0.6, width / 28)
	const menuSize = Math.min(unit * 0.9, width / 20)

	// Move text further from edges
	const insetY = unit * 4

	// Title - shifted up
	ctx.font = `${titleSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFA500'
	ctx.fillText('CLAPPY', width / 2, height * 0.25)
	ctx.fillText('CHEEKS!!', width / 2, height * 0.35)

	// Instructions - shifted up and tightened
	ctx.font = `${instructionSize}px "Press Start 2P"`
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText('3 ROUNDS PER MATCH', width / 2, height * 0.48)
	ctx.fillText('DODGE PUNCHES FOR POINTS', width / 2, height * 0.54)

	// Press Space - shifted up
	if (roundsLeft > 0) {
		ctx.font = `${menuSize}px "Press Start 2P"`
		ctx.fillStyle =
			Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
		ctx.fillText('PRESS SPACE', width / 2, height * 0.65)

		// Draw decorative gloves - adjusted for new text position
		if (images.armImage) {
			const gloveSize = menuSize * 2.5
			const textWidth = ctx.measureText('PRESS SPACE').width
			const gloveSpacing = textWidth * 2.4
			const gloveY = height * 0.65
			const moveAmount =
				Math.floor(performance.now() / 250) % 2 ? unit * 0.4 : 0

			// Calculate dimensions for proper centering
			const gloveWidth = gloveSize
			const gloveHeight =
				(gloveSize / images.armImage.width) * images.armImage.height

			// Left glove
			ctx.save()
			ctx.translate(width / 2 - gloveSpacing / 2 - moveAmount, gloveY)
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
			ctx.translate(width / 2 + gloveSpacing / 2 + moveAmount, gloveY)
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
	} else {
		ctx.font = `${menuSize}px "Press Start 2P"`
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText('GAME OVER', width / 2, height * 0.65)
	}

	// Score - shifted up
	if (totalScore > 0) {
		ctx.font = `${instructionSize}px "Press Start 2P"`
		ctx.fillStyle = '#FFFFFF'
		ctx.fillText(`TOTAL SCORE: ${totalScore}`, width / 2, height * 0.75)
	}

	// Use helper for copyright with title screen color
	drawCopyright(ctx, window.cheatMode ? '#FF0000' : '#8888FF')
}

// Update drawGameOverScreen to use helper
function drawGameOverScreen(ctx) {
	const scale = window.gameScale
	if (!scale) return

	const width = scale.width
	const height = scale.height
	const unit = scale.unit

	// Use increased insets
	const insetX = unit * 5
	const insetY = unit * 4

	// Draw background first
	drawBackground(ctx)

	// Center all text
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'

	// Calculate text sizes with further reductions
	const titleSize = Math.min(unit * 1.6, width / 14)
	const scoreSize = Math.min(unit * 0.9, width / 20)
	const textSize = Math.min(unit * 0.9, width / 20)

	// Adjust positions to account for insets
	const effectiveWidth = width - insetX * 2
	const centerX = width / 2

	if (roundsLeft === 0) {
		// Final game over screen - centered vertically
		const knockoutY = height * 0.4 // Center point for knockout group

		// Draw KNOCKOUT!!
		ctx.font = `${titleSize}px "Press Start 2P"`
		ctx.fillStyle = '#00005C'
		ctx.fillText('KNOCKOUT!!', centerX, knockoutY)

		// Final score with white container - closer to KNOCKOUT
		ctx.font = `${scoreSize}px "Press Start 2P"`
		const scoreText = `FINAL SCORE: ${totalScore + score}`
		const scoreWidth = ctx.measureText(scoreText).width + unit * 2
		const scoreHeight = unit * 2
		const scoreY = knockoutY + titleSize * 1.5

		// Draw white container
		ctx.fillStyle = '#FFFFFF'
		ctx.fillRect(
			centerX - scoreWidth / 2,
			scoreY - scoreHeight / 2,
			scoreWidth,
			scoreHeight
		)

		// Draw score text
		ctx.fillStyle = '#000000'
		ctx.fillText(scoreText, centerX, scoreY)

		// Use helper for copyright with dark ring color
		drawCopyright(ctx, '#004643')
	} else {
		// Round over screen - centered group with consistent spacing
		const groupCenterY = height * 0.45 // Center point for entire group
		const titleSpacing = titleSize * 1.5 // Increased space after ROUND OVER
		const textSpacing = titleSize * 0.8 // Consistent spacing for score texts

		// Calculate total group height
		const totalHeight =
			titleSize * 2 + titleSpacing + textSpacing * 3 + textSize

		// Start position to center the group
		const startY = groupCenterY - totalHeight / 2

		// Draw ROUND OVER!!
		ctx.font = `${titleSize}px "Press Start 2P"`
		ctx.fillStyle = '#00005C'
		ctx.fillText('ROUND', centerX, startY)
		ctx.fillText('OVER!!', centerX, startY + titleSize * 1.2)

		// Draw scores with consistent spacing
		ctx.font = `${scoreSize}px "Press Start 2P"`
		ctx.fillStyle = '#004643'
		const scoresY = startY + titleSize * 2 + titleSpacing
		ctx.fillText(`ROUND SCORE: ${score}`, centerX, scoresY)
		ctx.fillText(
			`TOTAL SCORE: ${totalScore + score}`,
			centerX,
			scoresY + textSpacing
		)
		ctx.fillText(
			`ROUNDS LEFT: ${roundsLeft}`,
			centerX,
			scoresY + textSpacing * 2
		)

		// Press space (after delay)
		if (performance.now() - knockoutTime > KNOCKOUT_DELAY) {
			ctx.font = `${textSize}px "Press Start 2P"`
			ctx.fillStyle =
				Math.floor(performance.now() / 250) % 2 ? '#FF0000' : '#FFFFFF'
			ctx.fillText('PRESS SPACE', centerX, scoresY + textSpacing * 3)
		}

		// Use helper for copyright with dark ring color
		drawCopyright(ctx, '#004643')
	}
}

// Update drawHUD to include copyright during gameplay
function drawHUD(ctx) {
	if (!window.gameScale) return

	const scale = window.gameScale
	const unit = scale.unit * 0.7 // Reduced to match smallest text size
	const width = scale.width
	const height = scale.height

	ctx.save()
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.font = `${unit}px 'Press Start 2P'`

	// Move HUD up by increasing top inset
	const insetX = unit * 5
	const insetY = unit * 3
	const hudHeight = unit * 1.5

	// Prepare text
	const pointsText = `POINTS: ${score}`
	const roundsText = `ROUND ${currentRound}`

	// Calculate text widths
	const pointsTextWidth = ctx.measureText(pointsText).width
	const roundsTextWidth = ctx.measureText(roundsText).width

	// Add padding
	const padding = unit * 0.75
	const pointsWidth = pointsTextWidth + padding * 2
	const roundsWidth = roundsTextWidth + padding * 2

	// Calculate center position first
	const centerX = width / 2
	const totalWidth = pointsWidth + roundsWidth

	// Position containers relative to center
	const pointsX = centerX - totalWidth / 2
	const roundsX = centerX - totalWidth / 2 + pointsWidth

	// Draw points container and text
	ctx.fillStyle = '#98FF98'
	ctx.fillRect(pointsX, insetY, pointsWidth, hudHeight)
	ctx.fillStyle = '#000000'
	ctx.fillText(pointsText, pointsX + pointsWidth / 2, insetY + hudHeight / 2)

	// Draw rounds container and text
	ctx.fillStyle = '#000000'
	ctx.fillRect(roundsX, insetY, roundsWidth, hudHeight)
	ctx.fillStyle = '#FFFFFF'
	ctx.fillText(roundsText, roundsX + roundsWidth / 2, insetY + hudHeight / 2)

	ctx.restore()

	// Draw copyright/cheat mode text during gameplay
	drawCopyright(ctx, '#004643') // Using the same color as round over screen
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
			window.shareData = null
			return true
		}

		if (!pair.passed && cheeks.x > pair.x) {
			pair.passed = true
			score += window.cheatPoints || 1

			if (score % 1 === 0 && gameSpeed < MAX_SPEED && !window.cheatMode) {
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
	const outOfBounds = cheeks.y < 0 || cheeks.y > window.gameScale.height
	if (outOfBounds) {
		playKnockoutSound()
		window.shareData = null
	}
	return outOfBounds
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
	console.log('DOM loaded, initializing game...')
	try {
		// Wait for power-on sequence to complete if it exists
		if (window.powerOnComplete) {
			await window.powerOnComplete
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
	konamiSound.play().catch((e) => console.log('Konami sound failed:', e))

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
