// Game constants
const CHEEKS_SIZE = 64 // Base size for cheeks sprite
const GRAVITY = 0.4
const CLAP_SPEED = -8.0
const GLOVE_WIDTH = 50
let GLOVE_OPENING = 250
const GLOVE_SET_GAP = 0.65 // Percentage of screen width between arm sets
const GLOVE_SPEED = 4.0
const KNOCKOUT_DELAY = 1500
const SPEED_INCREASE = 0.08
const MAX_SPEED = 1.6
const SQUISH_DURATION = 100
const BASE_UNIT = 32 // Base unit for sizing elements
const VIRTUAL_WIDTH = BASE_UNIT * 24 // Reduced from 32 to make game taller
const VIRTUAL_HEIGHT = BASE_UNIT * 20 // Increased from 18 to make game taller

// Game state
const gameState = {
	gameStarted: false,
	gameOver: false,
	score: 0,
	totalScore: 0,
	roundsLeft: 3,
	currentRound: 1,
	knockoutTime: 0,
	gameStartDelay: 800,
	gameStartTime: 0,
	gameSpeed: 1,
	lastSpeedIncreaseScore: 0,
	squishStartTime: 0,
	firstAction: false,
	hasEverActed: false,
}

// Audio state
let audio = {
	clapAssets: [],
	cheerAsset: null,
	booAsset: null,
	initialized: false,
	context: null,
}

// Game objects
class Game {
	constructor() {
		// Create PixiJS application immediately with correct settings
		this.app = new PIXI.Application({
			width: window.innerWidth,
			height: window.innerHeight,
			backgroundAlpha: 0,
			backgroundColor: 0x000044,
			resolution: Math.min(window.devicePixelRatio || 1, 2),
			antialias: false,
			view: document.getElementById('gameCanvas'),
			autoDensity: true,
			resizeTo: document.getElementById('gameCanvas').parentElement,
		})

		// Create separate containers for game and UI
		this.gameContainer = new PIXI.Container()
		this.uiContainer = new PIXI.Container()
		this.app.stage.addChild(this.gameContainer)
		this.app.stage.addChild(this.uiContainer)

		// Setup game containers with proper hierarchy
		this.background = new PIXI.Container()
		this.gameLayer = new PIXI.Container()
		this.gloves = new PIXI.Container()
		this.gloves.pairs = []
		this.hud = new PIXI.Container()

		// Set up container hierarchy
		this.gameContainer.addChild(this.background)
		this.gameContainer.addChild(this.gameLayer)
		// Don't add gloves yet - will be added after initialization
		this.uiContainer.addChild(this.hud)

		// Add resize handler
		window.addEventListener('resize', () => this.handleResize())
		// Initial resize to set up layout
		this.handleResize()

		// Show loading screen immediately
		this.showQuickStartScreen()

		// Initialize game after font loads
		this.initializeGame()
	}

	showQuickStartScreen() {
		// Clear any existing HUD content
		this.hud.removeChildren()

		// Hide player and gloves during loading screen
		if (this.gloves) {
			this.gloves.visible = false
		}
		if (this.cheeks) {
			this.cheeks.visible = false
		}

		const width = this.app.screen.width
		const height = this.app.screen.height
		const fontSize = Math.min(height / 10, width / 20)

		// Create loading text
		const loadingText = new PIXI.Text('LOADING...', {
			fontFamily: 'Press Start 2P',
			fontSize: fontSize,
			fill: 0xffffff,
			align: 'center',
		})

		// Center the text
		loadingText.anchor.set(0.5)
		loadingText.x = width / 2
		loadingText.y = height / 2

		// Add to HUD
		this.hud.addChild(loadingText)

		// Store reference to remove later
		this.loadingText = loadingText

		// Create background
		this.createBackground()

		// Initialize filters immediately
		try {
			console.log('Initializing filters...')
			if (!window.PIXI || !window.PIXI.filters) {
				throw new Error('Filter classes not available')
			}

			// Create CRT filter with proper settings
			this.crtFilter = new PIXI.filters.CRTFilter()
			this.crtFilter.curvature = window.isMobile ? 2 : 8
			this.crtFilter.lineWidth = 1.1
			this.crtFilter.lineContrast = 0.1
			this.crtFilter.verticalLine = false
			this.crtFilter.noise = 0.05
			this.crtFilter.noiseSize = 1.1
			this.crtFilter.vignetting = 0.3
			this.crtFilter.vignettingAlpha = 0.3
			this.crtFilter.vignettingBlur = 0.4
			this.crtFilter.seed = Math.random()
			this.crtFilter.time = 0

			// Create Bloom filter with proper settings
			this.bloomFilter = new PIXI.filters.BloomFilter()
			this.bloomFilter.strength = 20
			this.bloomFilter.blurX = window.isMobile ? 2 : 4
			this.bloomFilter.blurY = window.isMobile ? 1 : 2
			this.bloomFilter.quality = 20
			this.bloomFilter.kernelSize = 9

			// Apply filters to the root stage to affect all UI elements
			this.app.stage.filters = [this.bloomFilter, this.crtFilter]

			// Force a render update to apply filters
			this.app.renderer.render(this.app.stage)

			// Enable hardware acceleration for better filter performance
			this.app.renderer.view.style.transform = 'translateZ(0)'

			console.log('Filters initialized successfully')
		} catch (error) {
			console.warn('Failed to initialize filters:', error)
			// Continue without filters
			this.bloomFilter = null
			this.crtFilter = null
		}

		// Initialize audio only after user interaction
		const initAudioOnInteraction = () => {
			if (
				PIXI.sound &&
				PIXI.sound.context &&
				PIXI.sound.context.state === 'suspended'
			) {
				PIXI.sound.context.resume()
			}
			document.removeEventListener('click', initAudioOnInteraction)
			document.removeEventListener('touchstart', initAudioOnInteraction)
		}

		document.addEventListener('click', initAudioOnInteraction)
		document.addEventListener('touchstart', initAudioOnInteraction)
	}

	async initializeGame() {
		try {
			console.log('Starting game initialization...')

			// Show loading screen first
			this.showQuickStartScreen()

			// Wait for font to load first
			try {
				await document.fonts.load('10px "Press Start 2P"')
				console.log('Font loaded successfully')
			} catch (err) {
				console.warn('Font loading failed:', err)
			}

			// Initialize assets
			console.log('Setting up asset bundles...')
			const manifest = {
				bundles: [
					{
						name: 'essential',
						assets: [
							{ name: 'cheeks', srcs: 'images/cheeks.png' },
							{ name: 'arm', srcs: 'images/arm.png' },
							{ name: 'crowd', srcs: 'images/crowd.png' },
						],
					},
					{
						name: 'audio',
						assets: [
							...Array.from({ length: 9 }, (_, i) => ({
								name: `clap${i + 1}`,
								srcs: `audio/claps/clap${i + 1}.mp3`,
							})),
							{ name: 'cheer', srcs: 'audio/cheering.mp3' },
							{ name: 'boo', srcs: 'audio/booing.mp3' },
							{ name: 'konami', srcs: 'audio/konami.mp3' },
						],
					},
				],
			}

			// Initialize assets with manifest
			await PIXI.Assets.init({ manifest })

			// Load essential assets first
			console.log('Loading essential assets...')
			const essentialAssets = await PIXI.Assets.loadBundle('essential')
			if (!essentialAssets) {
				throw new Error('Failed to load essential assets')
			}

			// Initialize game objects and input handlers
			console.log('Initializing game objects...')
			this.initGameObjects()
			this.initInputHandlers()

			// Load audio assets
			console.log('Loading audio assets...')
			try {
				const audioAssets = await PIXI.Assets.loadBundle('audio')
				await this.initializeAudio(audioAssets)
			} catch (error) {
				console.warn('Failed to load audio assets:', error)
				audio.initialized = true
			}

			// Start game loop
			console.log('Starting game loop...')
			this.app.ticker.add(() => this.gameLoop(1))

			// Remove loading screen and show title screen
			console.log('Showing title screen...')
			if (this.loadingText) {
				this.loadingText.parent.removeChild(this.loadingText)
			}
			this.updateHUD()

			console.log('Game initialization complete')
		} catch (error) {
			console.error('Failed to initialize game:', error)
			this.showErrorScreen('Failed to initialize game: ' + error.message)
		}
	}

	handleResize() {
		const parent = this.app.view.parentElement
		const parentWidth = parent.clientWidth
		const parentHeight = parent.clientHeight

		// Update app renderer size to match parent exactly
		this.app.renderer.resize(parentWidth, parentHeight)

		// Fill entire width
		this.gameContainer.scale.set(1)
		this.gameContainer.position.set(0, 0)

		// Update UI container to use actual screen dimensions
		this.uiContainer.scale.set(1)
		this.uiContainer.position.set(0, 0)

		// Force immediate background update
		this.createBackground()

		// Update HUD for current game state
		this.updateHUD()

		// Update game objects if game is running
		if (gameState.gameStarted && !gameState.gameOver) {
			if (this.cheeks) {
				// Keep cheeks at same relative position
				const relativeX = this.cheeks.x / this.app.screen.width
				const relativeY = this.cheeks.y / this.app.screen.height
				this.cheeks.x = this.app.screen.width * relativeX
				this.cheeks.y = this.app.screen.height * relativeY
			}

			if (this.gloves) {
				// Update glove positions
				this.gloves.pairs.forEach((pair) => {
					const relativeX = pair.x / this.app.screen.width
					const relativeY = pair.gapY / this.app.screen.height
					pair.x = this.app.screen.width * relativeX
					pair.gapY = this.app.screen.height * relativeY
				})
			}
		}

		// Force a render update
		this.app.renderer.render(this.app.stage)
	}

	// Update all screen width/height references to use BASE_UNIT * 32 for width and BASE_UNIT * 18 for height
	get screenWidth() {
		return VIRTUAL_WIDTH
	}

	get screenHeight() {
		return VIRTUAL_HEIGHT
	}

	/*
	updateDebugOverlay() {
		let debugOverlay = document.getElementById('debugOverlay')
		if (!debugOverlay) {
			debugOverlay = document.createElement('div')
			debugOverlay.id = 'debugOverlay'
			debugOverlay.style.position = 'fixed'
			debugOverlay.style.top = '10px'
			debugOverlay.style.left = '10px'
			debugOverlay.style.backgroundColor = 'rgba(0,0,0,0.7)'
			debugOverlay.style.color = '#fff'
			debugOverlay.style.padding = '10px'
			debugOverlay.style.fontFamily = 'monospace'
			debugOverlay.style.fontSize = '12px'
			debugOverlay.style.zIndex = '10000'
			debugOverlay.style.pointerEvents = 'none'
			debugOverlay.style.transform = 'translateZ(0)'
			document.body.appendChild(debugOverlay)
		}

		// Only update if app is initialized
		if (!this.app || !this.app.stage) {
			debugOverlay.innerHTML = 'Initializing...'
			return
		}

		const fps = Math.round(this.app.ticker.FPS)
		const scale = this.app.stage.scale.x || 1
		const virtualWidth = VIRTUAL_WIDTH
		const virtualHeight = VIRTUAL_HEIGHT
		const gameSpeed = gameState.gameSpeed || 1

		debugOverlay.innerHTML = `
			Screen: ${window.innerWidth}x${window.innerHeight}<br>
			Canvas: ${this.app.screen.width}x${this.app.screen.height}<br>
			Virtual: ${virtualWidth}x${virtualHeight}<br>
			Scale: ${scale.toFixed(2)}<br>
			Speed: ${gameSpeed.toFixed(2)}x<br>
			FPS: ${fps}
		`
	}
	*/

	async loadAssets() {
		try {
			// Set base URL for assets
			const baseURL = window.location.href.substring(
				0,
				window.location.href.lastIndexOf('/') + 1
			)

			// Load textures with error handling and timeout
			const loadTextureWithTimeout = async (url, timeout = 5000) => {
				try {
					const texturePromise = PIXI.Assets.load(url)
					const timeoutPromise = new Promise((_, reject) =>
						setTimeout(() => reject(new Error('Timeout')), timeout)
					)
					return await Promise.race([texturePromise, timeoutPromise])
				} catch (error) {
					console.error(`Failed to load texture ${url}:`, error)
					return null
				}
			}

			console.log('Loading textures...')
			const [cheeksTexture, armTexture, crowdTexture] = await Promise.all([
				loadTextureWithTimeout(baseURL + 'images/cheeks.png'),
				loadTextureWithTimeout(baseURL + 'images/arm.png'),
				loadTextureWithTimeout(baseURL + 'images/crowd.png'),
			])

			// For mobile, just store the audio URLs for later use
			const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
			if (isMobile) {
				console.log('Mobile device detected, deferring audio loading')
				audio.initialized = true
			} else {
				// Desktop audio loading
				try {
					const audioContext = new (window.AudioContext ||
						window.webkitAudioContext)()

					const loadAudio = async (url) => {
						try {
							const response = await fetch(url)
							const arrayBuffer = await response.arrayBuffer()
							return await audioContext.decodeAudioData(arrayBuffer)
						} catch (error) {
							console.warn(`Failed to load audio ${url}:`, error)
							return null
						}
					}

					// Load all audio files
					console.log('Loading audio files...')
					const audioBuffers = {
						claps: await Promise.all(
							Array.from({ length: 9 }, (_, i) =>
								loadAudio(baseURL + `audio/claps/clap${i + 1}.mp3`)
							)
						),
						cheer: await loadAudio(baseURL + 'audio/cheering.mp3'),
						boo: await loadAudio(baseURL + 'audio/booing.mp3'),
					}

					audio.clapBuffers = audioBuffers.claps.filter(
						(buffer) => buffer !== null
					)
					audio.cheerBuffer = audioBuffers.cheer
					audio.booBuffer = audioBuffers.boo
					audio.context = audioContext
					audio.initialized = true

					console.log('Audio loaded:', {
						claps: audio.clapBuffers.length,
						cheer: !!audio.cheerBuffer,
						boo: !!audio.booBuffer,
					})
				} catch (error) {
					console.warn('Error loading audio:', error)
					audio.initialized = true
				}
			}

			// Only wait for textures
			if (!cheeksTexture || !armTexture) {
				throw new Error('Failed to load essential textures')
			}

			console.log('Essential assets loaded')
			return true
		} catch (error) {
			console.error('Error loading assets:', error)
			return false
		}
	}

	async initGameObjects() {
		// Create cheeks sprite
		const cheeksTexture = PIXI.Assets.get('cheeks')
		if (cheeksTexture) {
			console.log('Creating cheeks sprite with texture')
			this.cheeks = new PIXI.Sprite(cheeksTexture)
			this.cheeks.anchor.set(0.5)
			this.cheeks.x = this.app.screen.width / 3
			this.cheeks.y = this.app.screen.height / 2
			this.cheeks.velocity = 0
			this.cheeks.scale.set(BASE_UNIT / CHEEKS_SIZE)
			this.cheeks.visible = false // Start hidden
			this.gameLayer.addChild(this.cheeks)
		} else {
			console.warn('Cheeks texture not found, using fallback shape')
			this.cheeks = new PIXI.Graphics()
			this.cheeks.beginFill(0xffa500)
			this.cheeks.drawCircle(0, 0, BASE_UNIT)
			this.cheeks.endFill()
			this.cheeks.x = this.app.screen.width / 3
			this.cheeks.y = this.app.screen.height / 2
			this.cheeks.velocity = 0
			this.cheeks.visible = false // Start hidden
			this.gameLayer.addChild(this.cheeks)
		}

		// Add gloves container to gameLayer
		this.gloves.visible = false // Start hidden
		this.gameLayer.addChild(this.gloves)
	}

	updateGrid(graphics) {
		const canvas = this.app.view
		const width = canvas.width
		const height = canvas.height

		// Clear any existing graphics
		graphics.clear()

		// Fill entire canvas with blue background
		graphics.beginFill(0x000044, 1)
		graphics.drawRect(0, 0, width, height)
		graphics.endFill()

		// Draw grid lines with higher alpha for better visibility
		graphics.lineStyle(1, 0x4444ff, 0.3)

		// Draw horizontal lines
		const gridSpacing = height * 0.05 // 5% of canvas height
		const horizontalLines = Math.ceil(height / gridSpacing) + 1
		for (let i = 0; i <= horizontalLines; i++) {
			const y = i * gridSpacing
			graphics.moveTo(0, y)
			graphics.lineTo(width, y)
		}

		// Draw vertical lines
		const verticalLines = Math.ceil(width / gridSpacing) + 1
		for (let i = 0; i <= verticalLines; i++) {
			const x = i * gridSpacing
			graphics.moveTo(x, 0)
			graphics.lineTo(x, height)
		}
	}

	updateRing() {
		this.ring.removeChildren()

		const width = this.app.screen.width
		const height = this.app.screen.height

		// Ring dimensions relative to canvas
		const ringPadding = height * 0.05 // 5% padding from edges
		const ringTop = height * 0.2 // Position at 10% of canvas height
		const ringBottom = height + ringPadding // Extend slightly below canvas
		const postWidth = Math.max(width * 0.015, 10) // 1% of width, min 6px
		const postHeight = height * 0.2 // 20% of canvas height
		const floorExtension = width * 0.1 // Extend 10% beyond edges

		// Center offset for the entire ring
		const centerOffset = width * 0.1 // 10% of width for centering
		const ringLeft = centerOffset
		const ringRight = width - centerOffset

		// Ring floor
		const floor = new PIXI.Graphics()
		floor.beginFill(0x00cec4)
		floor.moveTo(ringLeft - floorExtension, ringTop - floorExtension / 3)
		floor.lineTo(ringRight + floorExtension, ringTop - floorExtension / 2)
		floor.lineTo(ringRight + floorExtension, ringBottom)
		floor.lineTo(ringLeft - floorExtension, ringBottom)
		floor.endFill()
		this.ring.addChild(floor)

		// Ring posts
		const posts = new PIXI.Graphics()
		posts.beginFill(0xffffff)
		posts.drawRect(ringLeft, ringTop - postHeight, postWidth, postHeight) // Left post
		posts.drawRect(
			ringRight - postWidth,
			ringTop - postHeight,
			postWidth,
			postHeight
		) // Right post
		posts.endFill()
		this.ring.addChild(posts)

		// Ring ropes
		const ropes = new PIXI.Graphics()
		const ropeThickness = Math.max(width * 0.002, 4) // Min thickness of 2px
		ropes.lineStyle(ropeThickness, 0xff69b4)

		// Draw three ropes on each side
		for (let i = 0; i < 3; i++) {
			const ropeSpacing = postHeight / 4 // Even spacing between ropes
			const topY = ringTop - postHeight + ropeSpacing * (i + 1)
			const bottomY = ringBottom - (ringPadding * (i + 1)) / 2

			// Left side rope
			ropes.moveTo(ringLeft + postWidth / 2, topY)
			ropes.lineTo(ringLeft - floorExtension, bottomY)

			// Right side rope
			ropes.moveTo(ringRight - postWidth / 2, topY)
			ropes.lineTo(ringRight + floorExtension, bottomY)

			// Horizontal rope connecting posts
			ropes.moveTo(ringLeft + postWidth / 2, topY)
			ropes.lineTo(ringRight - postWidth / 2, topY)
		}
		this.ring.addChild(ropes)
	}

	updateHUD() {
		// Remove existing ticker handlers
		if (this.hud.children) {
			this.hud.children.forEach((child) => {
				if (child._blinkHandler) {
					this.app.ticker.remove(child._blinkHandler)
				}
				if (child._moveHandler) {
					this.app.ticker.remove(child._moveHandler)
				}
			})
		}

		// Clear existing HUD
		this.hud.removeChildren()

		// Update background for current state
		this.createBackground()

		// Draw appropriate screen
		if (!gameState.gameStarted) {
			this.drawTitleScreen()
		} else if (gameState.gameOver) {
			this.drawGameOverScreen()
		} else {
			this.drawGameHUD()
		}
	}

	drawTitleScreen() {
		// Use app.screen dimensions to ensure canvas-relative positioning
		const width = this.app.screen.width
		const height = this.app.screen.height
		const maxWidth = width * 0.95
		const maxHeight = height * 0.95

		// Larger base font size - adjusted for text only
		const baseFontSize = Math.min(height / 10, width / 14)

		// Hide player/cheeks during title screen
		if (this.cheeks) {
			this.cheeks.visible = false
		}

		// Create separate containers for text and gloves
		const textContainer = new PIXI.Container()
		const glovesContainer = new PIXI.Container()

		// Title group
		const titleGroup = new PIXI.Container()

		const title1 = new PIXI.Text('CLAPPY', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: 0xffa500,
			align: 'center',
		})
		title1.anchor.set(0.5)
		title1.y = 0

		const title2 = new PIXI.Text('CHEEKS!!', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: 0xffa500,
			align: 'center',
		})
		title2.anchor.set(0.5)
		title2.y = baseFontSize * 1.1

		// Instructions
		const instr1 = new PIXI.Text('3 ROUNDS PER MATCH', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize * 0.5,
			fill: 0xffffff,
			align: 'center',
		})
		instr1.anchor.set(0.5)
		instr1.y = baseFontSize * 2.8

		const instr2 = new PIXI.Text('DODGE PUNCHES FOR POINTS', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize * 0.5,
			fill: 0xffffff,
			align: 'center',
		})
		instr2.anchor.set(0.5)
		instr2.y = baseFontSize * 3.6

		titleGroup.addChild(title1, title2, instr1, instr2)
		textContainer.addChild(titleGroup)

		// Press Space with gloves
		if (gameState.roundsLeft > 0) {
			const pressSpaceGroup = new PIXI.Container()

			// Create gloves with larger size and spacing
			const gloveSize = baseFontSize
			const gloveSpacing = width * 1 // Use percentage of screen width
			const armTexture = PIXI.Assets.get('arm')
			// Check if mobile device
			const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

			if (armTexture) {
				// Left glove
				const leftGlove = new PIXI.Sprite(armTexture)
				leftGlove.anchor.set(0.5)
				leftGlove.x = -gloveSpacing / 2
				leftGlove.y = -gloveSize / 8
				leftGlove.angle = 90
				leftGlove.scale.x = -1
				leftGlove.width = gloveSize
				leftGlove.height = (gloveSize / armTexture.width) * armTexture.height
				pressSpaceGroup.addChild(leftGlove)

				// Right glove
				const rightGlove = new PIXI.Sprite(armTexture)
				rightGlove.anchor.set(0.5)
				rightGlove.x = gloveSpacing / 2
				rightGlove.y = -gloveSize / 8
				rightGlove.angle = -90
				rightGlove.width = gloveSize
				rightGlove.height = (gloveSize / armTexture.width) * armTexture.height
				pressSpaceGroup.addChild(rightGlove)

				// Retro-style stepped movement
				const moveHandler = () => {
					const time = performance.now()
					const step = Math.floor(time / 250) % 2
					const moveAmount = step ? BASE_UNIT * (isMobile ? 0.3 : 1) : 0
					leftGlove.x = -gloveSpacing / 2 - moveAmount
					rightGlove.x = gloveSpacing / 2 + moveAmount
				}
				this.app.ticker.add(moveHandler)
				leftGlove._moveHandler = moveHandler
			}

			const buttonText = isMobile ? 'TAP SCREEN' : 'PRESS SPACE'

			// Add press space/tap screen text
			const pressSpace = new PIXI.Text(buttonText, {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.7,
				fill: 0xff0000,
				align: 'center',
			})
			pressSpace.anchor.set(0.5)
			pressSpaceGroup.addChild(pressSpace)

			// Color alternating effect
			const blinkHandler = () => {
				const time = performance.now()
				pressSpace.style.fill = Math.floor(time / 250) % 2 ? 0xff0000 : 0xffffff
			}
			this.app.ticker.add(blinkHandler)
			pressSpace._blinkHandler = blinkHandler

			pressSpaceGroup.y = baseFontSize * 5.4
			textContainer.addChild(pressSpaceGroup)
		}

		// Total score
		if (gameState.totalScore > 0) {
			const scoreGroup = new PIXI.Container()
			const totalScoreText = new PIXI.Text(
				`TOTAL SCORE: ${gameState.totalScore}`,
				{
					fontFamily: 'Press Start 2P',
					fontSize: baseFontSize * 0.5,
					fill: 0xffffff,
					align: 'center',
				}
			)
			totalScoreText.anchor.set(0.5)
			scoreGroup.addChild(totalScoreText)
			scoreGroup.y = baseFontSize * 6.0
			textContainer.addChild(scoreGroup)
		}

		// Position and scale text container
		textContainer.x = width / 2
		textContainer.y = height * 0.25

		// Get bounds of text content only
		const bounds = textContainer.getBounds()

		// Only constrain by height, allow width to extend
		const scale = Math.min(
			maxHeight / bounds.height,
			1 // Never scale up
		)

		// Apply scale to text container if needed
		if (scale < 1) {
			textContainer.scale.set(scale)
		}

		// Add containers to HUD
		this.hud.addChild(textContainer)
		this.drawCopyright()
	}

	drawGameOverScreen() {
		const width = this.app.screen.width
		const height = this.app.screen.height
		const maxWidth = width * 0.9
		const maxHeight = height * 0.9
		const baseFontSize = Math.min(height / 10, width / 12)

		// Hide gloves and player during game over screen
		if (this.gloves) {
			this.gloves.visible = false
		}
		if (this.cheeks) {
			this.cheeks.visible = false
		}

		// Create main container for all content
		const mainContainer = new PIXI.Container()
		mainContainer.x = width / 2
		mainContainer.y = height * 0.3

		if (gameState.roundsLeft === 0) {
			// Final game over screen
			const knockout = new PIXI.Text('KNOCKOUT!!', {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize,
				fill: 0x00005c,
				align: 'center',
			})
			knockout.anchor.set(0.5)
			knockout.y = 0

			const finalScore = gameState.totalScore + gameState.score
			const scoreText = `FINAL SCORE: ${finalScore}`
			const scoreContainer = new PIXI.Graphics()
			const scoreTextObj = new PIXI.Text(scoreText, {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.8,
				fill: 0x000000,
				align: 'center',
			})
			scoreTextObj.anchor.set(0.5)
			scoreTextObj.y = baseFontSize * 1.5

			// Add padding around score text
			const padding = baseFontSize * 0.3
			scoreContainer.beginFill(0xffffff)
			scoreContainer.drawRect(
				-scoreTextObj.width / 2 - padding,
				scoreTextObj.y - scoreTextObj.height / 2 - padding / 2,
				scoreTextObj.width + padding * 2,
				scoreTextObj.height + padding
			)

			mainContainer.addChild(scoreContainer, knockout, scoreTextObj)
		} else {
			// Round over screen
			const roundOver1 = new PIXI.Text('ROUND', {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize,
				fill: 0x00005c,
				align: 'center',
			})
			roundOver1.anchor.set(0.5)
			roundOver1.y = 0

			const roundOver2 = new PIXI.Text('OVER!!', {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize,
				fill: 0x00005c,
				align: 'center',
			})
			roundOver2.anchor.set(0.5)
			roundOver2.y = baseFontSize * 1.2

			const roundScore = new PIXI.Text(`ROUND SCORE: ${gameState.score}`, {
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.6,
				fill: 0x004643,
				align: 'center',
			})
			roundScore.anchor.set(0.5)
			roundScore.y = baseFontSize * 2.4

			const totalScoreText = new PIXI.Text(
				`TOTAL SCORE: ${gameState.totalScore + gameState.score}`,
				{
					fontFamily: 'Press Start 2P',
					fontSize: baseFontSize * 0.6,
					fill: 0x004643,
					align: 'center',
				}
			)
			totalScoreText.anchor.set(0.5)
			totalScoreText.y = baseFontSize * 3.2

			const roundsLeftText = new PIXI.Text(
				`ROUNDS LEFT: ${gameState.roundsLeft}`,
				{
					fontFamily: 'Press Start 2P',
					fontSize: baseFontSize * 0.6,
					fill: 0x004643,
					align: 'center',
				}
			)
			roundsLeftText.anchor.set(0.5)
			roundsLeftText.y = baseFontSize * 4.0

			mainContainer.addChild(
				roundOver1,
				roundOver2,
				roundScore,
				totalScoreText,
				roundsLeftText
			)

			// Press space (after delay)
			if (performance.now() - gameState.knockoutTime > KNOCKOUT_DELAY) {
				const pressSpace = new PIXI.Text('PRESS SPACE', {
					fontFamily: 'Press Start 2P',
					fontSize: baseFontSize * 0.6,
					fill: 0xffffff,
					align: 'center',
				})
				pressSpace.anchor.set(0.5)
				pressSpace.y = baseFontSize * 5.2

				// Blinking effect
				this.app.ticker.add(() => {
					pressSpace.visible = Math.floor(performance.now() / 250) % 2
				})

				mainContainer.addChild(pressSpace)
			}
		}

		// Scale container if needed
		const bounds = mainContainer.getBounds()
		const scale = Math.min(
			maxWidth / bounds.width,
			maxHeight / bounds.height,
			1 // Never scale up
		)
		if (scale < 1) {
			mainContainer.scale.set(scale)
		}

		this.hud.addChild(mainContainer)
		this.drawCopyright()
	}

	addDecorativeGloves(pressSpaceGroup, menuSize) {
		const armTexture = PIXI.Assets.get('arm')
		if (armTexture) {
			// Force a render update
			this.app.renderer.render(this.app.stage)

			// Fixed spacing based on menu size rather than text width
			const gloveSize = menuSize * 2.5
			const gloveSpacing = menuSize * 12 // Fixed spacing relative to menu size

			// Left glove
			const leftGlove = new PIXI.Sprite(armTexture)
			leftGlove.anchor.set(0.5)
			leftGlove.x = -gloveSpacing / 2
			leftGlove.y = 0
			leftGlove.angle = 90
			leftGlove.scale.x = -1
			leftGlove.width = gloveSize
			leftGlove.height = (gloveSize / armTexture.width) * armTexture.height

			// Right glove
			const rightGlove = new PIXI.Sprite(armTexture)
			rightGlove.anchor.set(0.5)
			rightGlove.x = gloveSpacing / 2
			rightGlove.y = 0
			rightGlove.angle = -90
			rightGlove.width = gloveSize
			rightGlove.height = (gloveSize / armTexture.width) * armTexture.height

			pressSpaceGroup.addChild(leftGlove, rightGlove)

			// Retro-style stepped movement
			const moveHandler = () => {
				const time = performance.now()
				// Use step function instead of sine for retro feel
				const step = Math.floor(time / 250) % 2
				const moveAmount = step ? BASE_UNIT * 0.8 : 0
				leftGlove.x = -gloveSpacing / 2 - moveAmount
				rightGlove.x = gloveSpacing / 2 + moveAmount
			}
			this.app.ticker.add(moveHandler)
			leftGlove._moveHandler = moveHandler

			// Force another render to ensure gloves are visible
			this.app.renderer.render(this.app.stage)
		}
	}

	drawGameHUD() {
		const width = this.app.screen.width
		const height = this.app.screen.height
		const fontSize = Math.min(width / 40, height / 20)
		const padding = fontSize * 0.75

		// Clear existing HUD
		this.hud.removeChildren()

		// Points display (left side)
		const pointsText = `POINTS: ${gameState.score}`
		const pointsStyle = {
			fontFamily: 'Press Start 2P',
			fontSize: fontSize,
			fill: 0x000000,
			align: 'left',
		}

		const pointsLabel = new PIXI.Text(pointsText, pointsStyle)
		const pointsWidth = pointsLabel.width + padding * 2
		const hudHeight = fontSize * 1.5

		// Rounds display (right side)
		const roundsText = `ROUND ${gameState.currentRound}`
		const roundsStyle = {
			fontFamily: 'Press Start 2P',
			fontSize: fontSize,
			fill: 0xffffff,
			align: 'right',
		}

		const roundsLabel = new PIXI.Text(roundsText, roundsStyle)
		const roundsWidth = roundsLabel.width + padding * 2

		// Create containers with proper dimensions
		const pointsContainer = new PIXI.Graphics()
		pointsContainer.beginFill(0x98ff98)
		pointsContainer.drawRect(0, 0, pointsWidth, hudHeight)

		const roundsContainer = new PIXI.Graphics()
		roundsContainer.beginFill(0x000000)
		roundsContainer.drawRect(0, 0, roundsWidth, hudHeight)

		// Position labels centered within their containers
		pointsLabel.position.set(padding, hudHeight / 2)
		pointsLabel.anchor.set(0, 0.5)

		roundsLabel.position.set(roundsWidth - padding, hudHeight / 2)
		roundsLabel.anchor.set(1, 0.5)

		// Create groups and add containers and labels
		const pointsGroup = new PIXI.Container()
		pointsGroup.addChild(pointsContainer, pointsLabel)

		const roundsGroup = new PIXI.Container()
		roundsGroup.addChild(roundsContainer, roundsLabel)

		// Position groups to touch in center
		const centerX = width / 2
		pointsGroup.position.set(centerX - pointsWidth, 0)
		roundsGroup.position.set(centerX, 0)

		this.hud.addChild(pointsGroup, roundsGroup)
	}

	initInputHandlers() {
		// Keyboard controls
		window.addEventListener('keydown', (e) => {
			if (e.code === 'Space') {
				e.preventDefault()
				this.handleInput()
			}
		})

		// Mouse/touch controls
		const canvas = this.app.view
		canvas.addEventListener('touchstart', (e) => e.preventDefault(), {
			passive: false,
		})
		canvas.addEventListener('touchmove', (e) => e.preventDefault(), {
			passive: false,
		})
		canvas.addEventListener('touchend', (e) => e.preventDefault(), {
			passive: false,
		})
		canvas.addEventListener('touchcancel', (e) => e.preventDefault(), {
			passive: false,
		})

		canvas.addEventListener('click', () => this.handleInput())
		canvas.addEventListener('touchstart', () => this.handleInput())

		// Prevent double-tap zoom
		let lastTap = 0
		canvas.addEventListener('touchend', (e) => {
			const currentTime = new Date().getTime()
			const tapLength = currentTime - lastTap
			if (tapLength < 500 && tapLength > 0) {
				e.preventDefault()
			}
			lastTap = currentTime
		})

		// Prevent scrolling
		document.body.style.overflow = 'hidden'
		document.documentElement.style.overflow = 'hidden'
		document.body.style.position = 'fixed'
		document.body.style.width = '100%'
		document.body.style.height = '100%'
	}

	handleInput() {
		// Don't allow game input if we're in Konami sequence
		if (
			window.konamiState &&
			(window.konamiState.isWaitingForAB() ||
				window.konamiState.isCompletingKonami())
		) {
			console.log('Blocking game input during Konami sequence')
			return
		}

		console.log('Input received:', {
			gameStarted: gameState.gameStarted,
			roundsLeft: gameState.roundsLeft,
			gameOver: gameState.gameOver,
		})
		if (!gameState.gameStarted) {
			if (gameState.roundsLeft > 0) {
				console.log('Starting game...')
				gameState.gameStarted = true
				gameState.gameStartTime = performance.now()
				playCheerSound()
				this.startGame()
				this.updateHUD()
			}
		} else if (
			gameState.gameOver &&
			performance.now() - gameState.knockoutTime > KNOCKOUT_DELAY
		) {
			if (gameState.roundsLeft > 0) {
				console.log('Starting next round...')
				gameState.totalScore += gameState.score
				gameState.currentRound++
				this.startGame()
				gameState.gameStarted = true
				gameState.gameOver = false
				gameState.firstAction = false
				gameState.gameStartTime = performance.now()
				playCheerSound()
			}
		} else if (!gameState.gameOver) {
			if (this.cheeks) {
				console.log('Flapping cheeks...')
				gameState.firstAction = true
				gameState.hasEverActed = true
				this.cheeks.velocity = CLAP_SPEED
				gameState.squishStartTime = performance.now()
				playFlapSound()
			}
		}
	}

	startGame() {
		gameState.score = 0
		gameState.gameSpeed = 1
		gameState.lastSpeedIncreaseScore = 0
		gameState.firstAction = false
		window.shareData = null

		if (this.cheeks) {
			this.cheeks.visible = true // Show player when game starts
			this.cheeks.x = this.screenWidth / 3
			this.cheeks.y = this.screenHeight / 2
			this.cheeks.velocity = 0
		}

		if (this.gloves) {
			this.gloves.visible = true // Show gloves when game starts
			this.gloves.pairs = []
			this.spawnGloves()
		}

		this.updateHUD()
	}

	spawnGloves() {
		const width = this.screenWidth
		const height = this.screenHeight
		const safePadding = Math.max(BASE_UNIT * 3, width * 0.08)
		const safeHeight = height - safePadding * 2

		// Increase minimum gap between arms
		GLOVE_OPENING = Math.min(height * 0.35, BASE_UNIT * 10)

		// Adjust the spawn range to prevent arms from being too close to edges
		const minY = safePadding + GLOVE_OPENING * 0.8
		const maxY = height - safePadding - GLOVE_OPENING * 0.8
		let y = Math.random() * (maxY - minY) + minY

		// Create glove pair container
		const pair = new PIXI.Container()
		pair.x = width + safePadding
		pair.gapY = y
		pair.passed = false

		const armWidth = Math.min(width, height) / 8
		const armHeight = armWidth * 2 // Default height if texture is missing
		const gapHalf = GLOVE_OPENING / 2

		// Create gloves
		const armTexture = PIXI.Assets.get('arm')
		if (armTexture) {
			// Create sprite-based gloves
			const topGlove = new PIXI.Sprite(armTexture)
			topGlove.anchor.set(0.5, 0)
			topGlove.x = 0
			topGlove.y = -gapHalf
			topGlove.angle = 180
			topGlove.width = armWidth
			topGlove.height = (armWidth / armTexture.width) * armTexture.height

			const bottomGlove = new PIXI.Sprite(armTexture)
			bottomGlove.anchor.set(0.5, 0)
			bottomGlove.x = 0
			bottomGlove.y = gapHalf
			bottomGlove.width = armWidth
			bottomGlove.height = (armWidth / armTexture.width) * armTexture.height

			pair.addChild(topGlove, bottomGlove)
		} else {
			// Create fallback shape-based gloves
			const topGlove = new PIXI.Graphics()
			topGlove.beginFill(0xff0000)
			topGlove.drawRect(-armWidth / 2, -armHeight, armWidth, armHeight)
			topGlove.endFill()
			topGlove.y = -gapHalf

			const bottomGlove = new PIXI.Graphics()
			bottomGlove.beginFill(0xff0000)
			bottomGlove.drawRect(-armWidth / 2, 0, armWidth, armHeight)
			bottomGlove.endFill()
			bottomGlove.y = gapHalf

			pair.addChild(topGlove, bottomGlove)
		}

		this.gloves.pairs.push(pair)
		this.gloves.addChild(pair)
	}

	gameLoop(delta) {
		if (document.hidden) return

		// Update filters if they exist
		if (this.crtFilter && this.bloomFilter) {
			// Update CRT filter time and seed for animation
			this.crtFilter.time += delta * 0.1
			this.crtFilter.seed = Math.random()
		}

		if (gameState.gameStarted && !gameState.gameOver) {
			if (this.cheeks) {
				// Calculate new velocity
				let newVelocity =
					this.cheeks.velocity + GRAVITY * gameState.gameSpeed * delta
				newVelocity = Math.max(-8, Math.min(8, newVelocity))
				this.cheeks.velocity = newVelocity

				// Update position
				this.cheeks.y += this.cheeks.velocity * gameState.gameSpeed * delta

				// Handle squish effect
				if (gameState.squishStartTime > 0) {
					const elapsed = performance.now() - gameState.squishStartTime
					if (elapsed < SQUISH_DURATION) {
						const progress = elapsed / SQUISH_DURATION
						const xScale = 1 - 0.3 * Math.sin(progress * Math.PI)
						const yScale = 1 + (1 - xScale) * 0.5
						const baseScale = BASE_UNIT / CHEEKS_SIZE
						this.cheeks.scale.x = xScale * baseScale
						this.cheeks.scale.y = yScale * baseScale
					} else {
						gameState.squishStartTime = 0
						this.cheeks.scale.set(BASE_UNIT / CHEEKS_SIZE)
					}
				}
			}

			// Update gloves
			if (
				this.gloves &&
				performance.now() - gameState.gameStartTime >= gameState.gameStartDelay
			) {
				const speed =
					GLOVE_SPEED * gameState.gameSpeed * delta * (this.screenWidth / 1000)

				// Move existing gloves
				this.gloves.pairs.forEach((pair) => {
					pair.x -= speed
				})

				// Remove off-screen gloves
				for (let i = this.gloves.pairs.length - 1; i >= 0; i--) {
					const pair = this.gloves.pairs[i]
					if (pair.x + GLOVE_WIDTH <= 0) {
						this.gloves.removeChild(pair)
						this.gloves.pairs.splice(i, 1)
					}
				}

				// Spawn new gloves if needed
				if (
					this.gloves.pairs.length === 0 ||
					this.gloves.pairs[this.gloves.pairs.length - 1].x <
						this.screenWidth * GLOVE_SET_GAP
				) {
					this.spawnGloves()
				}
			}

			// Check for collisions and bounds
			if (this.checkCollisions() || this.checkBounds()) {
				gameState.gameOver = true
				gameState.knockoutTime = performance.now()
				gameState.roundsLeft--
				this.updateHUD()
			}
		}
	}

	checkCollisions() {
		if (!this.cheeks || !this.gloves) return false

		const size = Math.min(this.screenWidth, this.screenHeight) / 15
		const cheeksBox = {
			x: this.cheeks.x - size,
			y: this.cheeks.y - size,
			width: size * 2,
			height: size * 2,
		}

		for (const pair of this.gloves.pairs) {
			const armWidth = Math.min(this.screenWidth, this.screenHeight) / 8
			const armTexture = PIXI.Assets.get('images/arm.png')
			const armHeight = armTexture
				? (armWidth / armTexture.width) * armTexture.height
				: armWidth * 2 // Default height if texture is missing
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
				this.intersectRect(cheeksBox, topGlove) ||
				this.intersectRect(cheeksBox, bottomGlove)
			) {
				playKnockoutSound()
				window.shareData = null
				return true
			}

			if (!pair.passed && this.cheeks.x > pair.x) {
				pair.passed = true
				gameState.score += window.cheatPoints || 1

				if (
					gameState.score % 1 === 0 &&
					gameState.gameSpeed < MAX_SPEED &&
					!window.cheatMode
				) {
					gameState.gameSpeed = Math.min(
						MAX_SPEED,
						gameState.gameSpeed + SPEED_INCREASE
					)
					console.log('Speed increased to:', gameState.gameSpeed)
				}

				this.updateHUD()
			}
		}

		return false
	}

	intersectRect(r1, r2) {
		return !(
			r2.x > r1.x + r1.width ||
			r2.x + r2.width < r1.x ||
			r2.y > r1.y + r1.height ||
			r2.y + r2.height < r1.y
		)
	}

	checkBounds() {
		if (!this.cheeks) return false
		const outOfBounds = this.cheeks.y < 0 || this.cheeks.y > this.screenHeight
		if (outOfBounds) {
			playKnockoutSound()
			window.shareData = null
		}
		return outOfBounds
	}

	activateCheatMode() {
		console.log('Activating cheat mode...')
		window.cheatMode = true
		window.gameSpeed = 0.5
		window.cheatPoints = 10

		// Play Konami sound using PIXI.sound
		if (PIXI.sound && PIXI.sound.exists('konami')) {
			PIXI.sound.play('konami', { volume: 0.3 })
		}

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
			if (window.flashPowerLED) {
				window.flashPowerLED('#ff3333', 50)
			}
			flashCount++
		}, 100)

		// Update HUD to show cheat mode
		this.updateHUD()
	}

	drawCopyright() {
		const width = this.app.screen.width
		const height = this.app.screen.height
		const baseFontSize = Math.min(height / 32, width / 38) // Reduced size

		const copyrightText = window.cheatMode
			? 'CHEAT MODE ACTIVATED'
			: 'NOT © 2024 FWD:FWD:FWD:'

		// Use same color as round score text during game over screens
		const textColor = gameState.gameOver
			? 0x004643
			: window.cheatMode
			? 0xff0000
			: 0x8888ff

		const copyright = new PIXI.Text(copyrightText, {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: textColor,
			align: 'center',
		})
		copyright.anchor.set(0.5)

		// Create container for copyright
		const copyrightContainer = new PIXI.Container()
		copyrightContainer.addChild(copyright)

		// Position at bottom of screen
		copyrightContainer.x = width / 2
		copyrightContainer.y = height - baseFontSize * 3

		// Scale if needed
		const bounds = copyrightContainer.getBounds()
		const maxWidth = width * 0.9
		const scale = Math.min(maxWidth / bounds.width, 1)
		if (scale < 1) {
			copyrightContainer.scale.set(scale)
		}

		if (window.cheatMode) {
			// Blinking effect for cheat mode
			this.app.ticker.add(() => {
				copyright.visible = Math.floor(performance.now() / 250) % 2
			})
		}

		this.hud.addChild(copyrightContainer)
	}

	createBackground() {
		// Clear existing background
		this.background.removeChildren()

		const width = this.app.screen.width
		const height = this.app.screen.height

		// Create grid pattern that fills entire canvas
		const gridGraphics = new PIXI.Graphics()

		// Fill background with blue - 100% coverage
		gridGraphics.beginFill(0x000044, 1)
		gridGraphics.drawRect(0, 0, width, height)
		gridGraphics.endFill()

		// Draw grid lines - fixed size grid that tiles from center
		gridGraphics.lineStyle(1, 0x4444ff, 0.3)
		const gridSize = 32 // Fixed grid size

		// Calculate grid offsets to center the pattern
		const centerX = width / 2
		const centerY = height / 2
		const startX = (centerX % gridSize) - gridSize / 2
		const startY = (centerY % gridSize) - gridSize / 2

		// Draw horizontal lines from center
		for (let y = startY; y <= height; y += gridSize) {
			gridGraphics.moveTo(0, y)
			gridGraphics.lineTo(width, y)
		}
		for (let y = startY - gridSize; y >= 0; y -= gridSize) {
			gridGraphics.moveTo(0, y)
			gridGraphics.lineTo(width, y)
		}

		// Draw vertical lines from center
		for (let x = startX; x <= width; x += gridSize) {
			gridGraphics.moveTo(x, 0)
			gridGraphics.lineTo(x, height)
		}
		for (let x = startX - gridSize; x >= 0; x -= gridSize) {
			gridGraphics.moveTo(x, 0)
			gridGraphics.lineTo(x, height)
		}

		this.background.addChild(gridGraphics)

		// Create ring and crowd for gameplay and game over screens, but not title screen
		if (gameState.gameStarted || gameState.gameOver) {
			// Add crowd at top of screen
			const crowdTexture = PIXI.Assets.get('crowd')
			if (crowdTexture) {
				const crowdHeight = height * 0.2
				const scale = crowdHeight / crowdTexture.height
				const scaledWidth = crowdTexture.width * scale

				// Create crowd sprite to fill width
				this.crowd = new PIXI.TilingSprite(
					crowdTexture,
					width, // Just use screen width
					crowdHeight
				)

				// Position at top of screen
				this.crowd.position.set(0, 0)
				this.crowd.tileScale.set(scale)
				this.crowd.alpha = 0.6
				this.background.addChild(this.crowd)
			}

			// Add ring
			this.ring = new PIXI.Container()
			this.updateRing()
			this.background.addChild(this.ring)
		}
	}

	showErrorScreen(message) {
		// Clear existing HUD
		this.hud.removeChildren()

		const width = this.screenWidth
		const height = this.screenHeight
		const fontSize = Math.min(BASE_UNIT * 0.8, width / 20)

		const errorText = new PIXI.Text(message, {
			fontFamily: 'Press Start 2P',
			fontSize: fontSize,
			fill: 0xff0000,
			align: 'center',
			wordWrap: true,
			wordWrapWidth: width * 0.8,
		})
		errorText.anchor.set(0.5)
		errorText.x = width / 2
		errorText.y = height / 2

		this.hud.addChild(errorText)
	}

	async initializeAudio(audioAssets) {
		try {
			// Initialize PIXI sound
			if (!PIXI.sound) {
				console.warn('PIXI.sound not available')
				audio.initialized = true
				return
			}

			console.log('Initializing audio with assets:', audioAssets)

			// Remove any existing sounds first
			PIXI.sound.removeAll()

			// Add all sounds to PIXI sound library
			const loadPromises = []

			// Add clap sounds
			for (let i = 1; i <= 9; i++) {
				const clapAsset = audioAssets[`clap${i}`]
				if (clapAsset) {
					loadPromises.push(
						PIXI.sound.add(`clap${i}`, {
							url: `audio/claps/clap${i}.mp3`,
							preload: true,
							volume: 0.3,
						})
					)
				}
			}

			// Add other sounds
			const otherSounds = {
				cheer: { url: 'audio/cheering.mp3', volume: 0.1, loop: true },
				boo: { url: 'audio/booing.mp3', volume: 0.3 },
				konami: { url: 'audio/konami.mp3', volume: 0.3 },
			}

			for (const [name, options] of Object.entries(otherSounds)) {
				if (audioAssets[name]) {
					const { url, ...soundOptions } = options
					loadPromises.push(
						PIXI.sound.add(name, {
							url,
							preload: true,
							...soundOptions,
						})
					)
				}
			}

			// Wait for all sounds to load
			await Promise.all(loadPromises)

			// Log loaded sounds for debugging
			console.log('Loaded sounds:', Object.keys(PIXI.sound._sounds))

			audio.initialized = true
			console.log(
				'PIXI Sound initialized with sounds:',
				Object.keys(PIXI.sound._sounds)
			)
		} catch (error) {
			console.warn('Failed to initialize audio:', error)
			audio.initialized = true
		}
	}
}

// Audio playback functions
function playSound(buffer, options = {}) {
	if (!audio.initialized || !audio.context || !buffer) return null

	try {
		// Resume context if suspended
		if (audio.context.state === 'suspended') {
			audio.context.resume()
		}

		const source = audio.context.createBufferSource()
		const gainNode = audio.context.createGain()

		source.buffer = buffer
		source.loop = options.loop || false
		gainNode.gain.value = options.volume || 1.0

		source.connect(gainNode)
		gainNode.connect(audio.context.destination)

		source.start()

		return {
			source,
			gainNode,
			stop: () => {
				try {
					source.stop()
					source.disconnect()
					gainNode.disconnect()
				} catch (e) {
					console.warn('Error stopping sound:', e)
				}
			},
		}
	} catch (e) {
		console.warn('Error playing sound:', e)
		return null
	}
}

let cheerSound = null

function stopCheerSound() {
	if (cheerSound) {
		try {
			PIXI.sound.stop('cheer')
			cheerSound = null
		} catch (e) {
			console.warn('Stop cheer sound error:', e)
		}
	}
}

async function playFlapSound() {
	if (!audio.initialized || !PIXI.sound) return

	try {
		// Randomly select a clap sound from 1-9
		const randomClap = Math.floor(Math.random() * 9) + 1
		const soundId = `clap${randomClap}`
		console.log('Playing flap sound:', soundId)
		if (PIXI.sound.exists(soundId)) {
			await PIXI.sound.play(soundId)
		} else {
			console.warn('Sound not found:', soundId)
		}
	} catch (e) {
		console.warn('Flap sound error:', e)
	}
}

async function playCheerSound() {
	if (!audio.initialized || !PIXI.sound) return

	try {
		stopCheerSound()
		console.log('Playing cheer sound')
		if (PIXI.sound.exists('cheer')) {
			cheerSound = await PIXI.sound.play('cheer')
		} else {
			console.warn('Cheer sound not found')
		}
	} catch (e) {
		console.warn('Cheer sound error:', e)
	}
}

async function playKnockoutSound() {
	if (!audio.initialized || !PIXI.sound) return

	try {
		stopCheerSound()
		console.log('Playing knockout sound')
		if (PIXI.sound.exists('boo')) {
			await PIXI.sound.play('boo')
		} else {
			console.warn('Boo sound not found')
		}
	} catch (e) {
		console.warn('Knockout sound error:', e)
	}
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
	console.log('DOM loaded, waiting for power-on...')

	// Initialize game after power-on sequence
	const initGame = async () => {
		try {
			console.log('Creating game instance...')
			const gameInstance = new Game()
			window.game = gameInstance // Explicitly set window.game

			// Expose handleInput method globally
			window.game.handleInput = gameInstance.handleInput.bind(gameInstance)

			console.log('Game instance created and methods exposed:', {
				gameExists: !!window.game,
				handleInputExists: !!window.game.handleInput,
			})
		} catch (error) {
			console.error('Failed to create game:', error)
		}
	}

	// Wait for power-on if needed, otherwise start immediately
	if (window.powerOnComplete) {
		window.powerOnComplete.then(initGame).catch((error) => {
			console.error('Power-on sequence failed:', error)
			// Start game anyway
			initGame()
		})
	} else {
		initGame()
	}

	// Initialize Konami code state
	let konamiIndex = 0
	let waitingForAB = false // Flag to indicate we're in A/B sequence
	let completingKonami = false // Flag to prevent any other input during completion
	const konamiCode = [
		'ArrowUp',
		'ArrowUp',
		'ArrowDown',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'ArrowLeft',
		'ArrowRight',
		'b',
		'a',
	]

	// Function to reset Konami state
	const resetKonamiState = () => {
		konamiIndex = 0
		waitingForAB = false
		completingKonami = false
	}

	// Function to handle Konami input
	const handleKonamiInput = (key) => {
		// If we're in completion state, ignore all inputs
		if (completingKonami) {
			return true
		}

		console.log(
			'Konami input:',
			key,
			'Current index:',
			konamiIndex,
			'Waiting for BA:',
			waitingForAB
		)

		// If we're waiting for B/A but get an arrow key, reset
		if (waitingForAB && key.startsWith('Arrow')) {
			if (window.flashPowerLED) {
				window.flashPowerLED('#ff3333') // Flash red for incorrect input
			}
			resetKonamiState()
			return false
		}

		if (key.toLowerCase() === konamiCode[konamiIndex].toLowerCase()) {
			// Flash power LED for feedback
			if (window.flashPowerLED) {
				window.flashPowerLED('#3333ff') // Flash blue for correct input
			}

			// Check if we've completed the arrow sequence
			if (konamiIndex === 7) {
				console.log('Arrow sequence complete, waiting for BA...')
				waitingForAB = true
			}

			// Increment after checking for arrow sequence
			konamiIndex++

			// Check if we've completed the entire sequence
			if (konamiIndex === konamiCode.length) {
				console.log('Arrow sequence complete, waiting for BA...')
				waitingForAB = true

				if (!window.cheatMode && window.game) {
					window.game.activateCheatMode()
				}

				// Delay reset to prevent any immediate game input
				setTimeout(() => {
					resetKonamiState()
				}, 500) // Increased delay for safety

				return true
			}
		} else {
			// Flash red for incorrect input
			if (window.flashPowerLED) {
				window.flashPowerLED('#ff3333')
			}
			resetKonamiState()
		}

		return waitingForAB
	}

	// Keyboard event handler
	window.addEventListener('keydown', (e) => {
		const key = e.key.toLowerCase()

		// If we're waiting for A/B input or completing Konami, prevent all input
		if ((waitingForAB && (key === 'a' || key === 'b')) || completingKonami) {
			e.preventDefault()
			e.stopPropagation()
		}

		// Handle Konami input
		handleKonamiInput(key)
	})

	// Expose Konami state and handlers for touch controls
	window.konamiState = {
		code: konamiCode,
		getIndex: () => konamiIndex,
		isWaitingForAB: () => waitingForAB,
		isCompletingKonami: () => completingKonami,
		handleInput: handleKonamiInput,
		reset: resetKonamiState,
	}
})
