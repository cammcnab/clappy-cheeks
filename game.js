// Game constants
const GRAVITY = 0.12
const CLAP_SPEED = -4.0 // This is how fast the cheeks move upward when the player taps/clicks - negative means up
const GLOVE_SET_GAP = 0.5
const SPAWN_OFFSET = 1.05
const PLAYER_X = 0.45
const GLOVE_SPEED = 2.5
const KNOCKOUT_DELAY = 1500
const SPEED_INCREASE = 0.08
const MAX_SPEED = 2
const SQUISH_DURATION = 100

// Screen-relative constants (these will be calculated in the Game class)
let GLOVE_WIDTH
let GLOVE_OPENING
let MIN_GAP
let MAX_GAP
let CHEEKS_SIZE
let ARM_SCALE

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

// Debug monitoring
const DEBUG = {
	lastFrameTime: 0,
	frameCount: 0,
	fps: 0,
	memoryUsage: [],
	errors: [],
	logError: function (error) {
		console.error('[DEBUG]', error)
		this.errors.push({ time: Date.now(), error })
		if (this.errors.length > 50) this.errors.shift()
	},
}

// Asset loading
const ASSETS = {
	textures: {
		cheeks: './images/cheeks.png',
		arm: './images/arm.png',
		crowd: './images/crowd-fade.png',
	},
	fonts: {
		pressStart2P: './fonts/PressStart2P-Regular.css',
	},
	audio: {
		clap1: './audio/claps/clap1.mp3',
		clap2: './audio/claps/clap2.mp3',
		clap3: './audio/claps/clap3.mp3',
		clap4: './audio/claps/clap4.mp3',
		clap5: './audio/claps/clap5.mp3',
		clap6: './audio/claps/clap6.mp3',
		clap7: './audio/claps/clap7.mp3',
		clap8: './audio/claps/clap8.mp3',
		clap9: './audio/claps/clap9.mp3',
		cheer: './audio/cheering.mp3',
		boo: './audio/booing.mp3',
		konami: './audio/konami.mp3',
	},
}

// Asset loading function
async function loadGameAssets() {
	try {
		console.log('Loading game assets...')

		// Load textures first
		const texturePromises = Object.entries(ASSETS.textures).map(
			async ([name, url]) => {
				try {
					// Check if texture is already loaded and valid
					let texture = PIXI.Assets.get(name)
					if (!texture || !texture.valid) {
						console.log(`Loading texture: ${name} from ${url}`)
						texture = await PIXI.Assets.load(url)
						if (!texture || !texture.valid) {
							throw new Error(`Failed to load texture: ${name}`)
						}
						// Cache the texture
						PIXI.Assets.cache.set(name, texture)
					} else {
						console.log(`Texture ${name} already loaded and valid`)
					}
					return texture
				} catch (error) {
					console.warn(`Failed to load texture: ${name}`, error)
					return null
				}
			}
		)

		// Wait for all textures to load
		const textures = await Promise.all(texturePromises)
		const allTexturesLoaded = textures.every((texture) => texture !== null)
		if (!allTexturesLoaded) {
			console.warn('Some textures failed to load')
		}

		// Load audio assets if not already loaded
		if (PIXI.sound) {
			const audioPromises = Object.entries(ASSETS.audio).map(
				async ([name, url]) => {
					try {
						if (!PIXI.sound.exists(name)) {
							await PIXI.sound.add(name, {
								url,
								preload: true,
								volume: name.includes('clap')
									? 0.3
									: name === 'cheer'
									? 0.1
									: 0.3,
							})
							console.log(`Loaded audio: ${name}`)
						} else {
							console.log(`Audio ${name} already loaded`)
						}
					} catch (error) {
						console.warn(`Failed to load audio: ${name}`, error)
					}
				}
			)
			await Promise.all(audioPromises)
		}

		console.log('All assets loaded successfully')
		return true
	} catch (error) {
		console.error('Error loading assets:', error)
		return false
	}
}

// Game objects
class Game {
	constructor() {
		// Initialize default text style first
		this.defaultTextStyle = {
			fontFamily: 'Press Start 2P',
			fontSize: 32,
			fill: 0xffffff,
			align: 'center',
			padding: 2,
		}

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

		// Initialize screen-relative constants
		this.updateScreenConstants()

		// Add resize handler
		window.addEventListener('resize', () => {
			this.handleResize()
		})

		// Initial resize to set up layout
		this.handleResize()

		// Show loading screen immediately
		this.showQuickStartScreen()

		// Initialize game after font loads
		this.initializeGame()

		// Start game loop
		this.app.ticker.add((delta) => this.gameLoop(delta))
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

	updateScreenConstants() {
		const height = this.screenHeight
		// Update global constants based on screen height
		GLOVE_WIDTH = height * 0.12
		MIN_GAP = height * 0.3
		MAX_GAP = height * 0.45
		GLOVE_OPENING = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)
		CHEEKS_SIZE = height * 0.12
		ARM_SCALE = height * 0.12
	}

	handleResize() {
		const parent = this.app.view.parentElement
		const parentWidth = parent.clientWidth
		const parentHeight = parent.clientHeight

		// Update app renderer size to match parent exactly
		this.app.renderer.resize(parentWidth, parentHeight)

		// Update screen dimensions
		this.screenWidth = this.app.screen.width
		this.screenHeight = this.app.screen.height

		// Update screen constants
		this.updateScreenConstants()

		// Fill entire width
		this.gameContainer.scale.set(1)
		this.gameContainer.position.set(0, 0)

		// Update UI container to use actual screen dimensions
		this.uiContainer.scale.set(1)
		this.uiContainer.position.set(0, 0)

		// Force immediate background update
		this.createBackground()

		// Ensure all animations are stopped and cleaned up before updating HUD
		this.clearGameOverScreen()

		// Add a small delay before redrawing to ensure cleanup is complete
		setTimeout(() => {
			// Update HUD for current game state
			this.updateHUD()

			// Update game objects if game is running
			if (gameState.gameStarted && !gameState.gameOver) {
				if (this.cheeks) {
					// Keep cheeks at same relative position
					const relativeX = this.cheeks.x / this.screenWidth
					const relativeY = this.cheeks.y / this.screenHeight
					this.cheeks.x = this.screenWidth * relativeX
					this.cheeks.y = this.screenHeight * relativeY

					// Update cheeks scale
					const targetSize = CHEEKS_SIZE
					const cheeksTexture = PIXI.Assets.get('cheeks')
					if (cheeksTexture && cheeksTexture.valid) {
						const baseScale =
							targetSize / Math.max(cheeksTexture.width, cheeksTexture.height)
						this.cheeks.scale.set(baseScale)
					}
				}

				if (this.gloves) {
					// Update glove positions and scales
					this.gloves.pairs.forEach((pair) => {
						const relativeX = pair.x / this.screenWidth
						pair.x = this.screenWidth * relativeX

						// Update glove scales
						pair.children.forEach((glove) => {
							if (glove instanceof PIXI.Sprite) {
								glove.width = ARM_SCALE
								glove.scale.y = glove.scale.x
							}
						})
					})
				}
			}

			// Force a render update
			this.app.renderer.render(this.app.stage)
		}, 50) // Small delay to ensure cleanup is complete
	}

	async showBasicLoadingScreen() {
		try {
			// Clear any existing HUD content
			this.hud.removeChildren()

			// Hide game objects
			if (this.gloves) this.gloves.visible = false
			if (this.cheeks) this.cheeks.visible = false

			// Create loading text with Arial font
			const basicStyle = {
				fontFamily: 'Arial',
				fontSize: Math.min(
					this.app.screen.height / 20,
					this.app.screen.width / 40
				),
				fill: 0xffffff,
				align: 'center',
			}

			// Create loading text with error handling
			const loadingText = new PIXI.Text('LOADING GAME ASSETS...', basicStyle)
			if (loadingText && loadingText.texture) {
				loadingText.anchor.set(0.5)
				loadingText.x = this.app.screen.width / 2
				loadingText.y = this.app.screen.height / 2 - 40
				this.hud.addChild(loadingText)
				this.loadingText = loadingText
			}

			// Create loading bar container
			const loadingBarContainer = new PIXI.Container()
			loadingBarContainer.x = this.app.screen.width / 2
			loadingBarContainer.y = this.app.screen.height / 2 + 20

			// Create loading bar background
			const barWidth = Math.min(this.app.screen.width * 0.8, 300)
			const barHeight = 20
			const barBg = new PIXI.Graphics()
			barBg.beginFill(0x333333)
			barBg.drawRect(-barWidth / 2, 0, barWidth, barHeight)
			barBg.endFill()
			loadingBarContainer.addChild(barBg)

			// Create loading bar foreground
			const barFg = new PIXI.Graphics()
			barFg.beginFill(0x00ff00)
			barFg.drawRect(-barWidth / 2, 0, 0, barHeight) // Start with 0 width
			barFg.endFill()
			loadingBarContainer.addChild(barFg)

			// Add container to HUD
			this.hud.addChild(loadingBarContainer)

			// Store references
			this.loadingBarContainer = loadingBarContainer
			this.loadingBarFg = barFg
			this.loadingBarWidth = barWidth

			// Force a render update
			this.app.renderer.render(this.app.stage)

			// Return true to indicate successful initialization
			return true
		} catch (error) {
			console.warn('Error showing loading screen:', error)
			return false
		}
	}

	updateLoadingProgress(progress) {
		try {
			if (
				!this.loadingBarFg ||
				!this.loadingBarContainer ||
				!this.loadingBarWidth
			) {
				return
			}

			// Calculate progress width
			const progressWidth =
				this.loadingBarWidth * Math.max(0, Math.min(1, progress))

			// Update progress bar by creating a new shape instead of clearing
			const barFg = new PIXI.Graphics()
			barFg.beginFill(0x00ff00)
			barFg.drawRect(-this.loadingBarWidth / 2, 0, progressWidth, 20)
			barFg.endFill()

			// Replace old foreground with new one
			if (this.loadingBarFg.parent === this.loadingBarContainer) {
				this.loadingBarContainer.removeChild(this.loadingBarFg)
			}
			this.loadingBarContainer.addChild(barFg)
			this.loadingBarFg = barFg

			// Force render update
			this.app.renderer.render(this.app.stage)
		} catch (error) {
			console.warn('Error updating loading progress:', error)
		}
	}

	async loadFonts() {
		try {
			// Create a font face observer for Press Start 2P
			const fontFace = new FontFace(
				'Press Start 2P',
				'url(fonts/PressStart2P-Regular.woff2) format("woff2"), url(fonts/PressStart2P-Regular.woff) format("woff"), url(fonts/PressStart2P-Regular.ttf) format("truetype")'
			)

			// Wait for font to load
			await fontFace.load()

			// Add to document fonts
			document.fonts.add(fontFace)

			// Wait for all fonts to be ready
			await document.fonts.ready

			console.log('Fonts loaded successfully')
			return true
		} catch (error) {
			console.warn('Error loading fonts:', error)
			return false
		}
	}

	async initializeGame() {
		try {
			console.log('Starting game initialization...')

			// Show loading screen first with Arial font
			const loadingScreenSuccess = await this.showBasicLoadingScreen()
			if (!loadingScreenSuccess) {
				throw new Error('Failed to show loading screen')
			}

			// Load fonts first
			const fontsLoaded = await this.loadFonts()
			if (!fontsLoaded) {
				console.warn('Fonts failed to load, using fallback fonts')
			}

			// Load all game assets first
			console.log('Loading game assets...')
			const assetsLoaded = await loadGameAssets()
			if (!assetsLoaded) {
				console.warn('Failed to load some assets, using fallbacks where needed')
			}

			// Verify critical textures
			const criticalTextures = ['arm', 'cheeks']
			for (const textureName of criticalTextures) {
				const texture = PIXI.Assets.get(textureName)
				if (!texture || !texture.valid) {
					console.warn(`Critical texture ${textureName} is invalid or missing`)
				}
			}

			// Initialize game objects
			await this.initGameObjects()

			// Clear loading screen
			this.hud.removeChildren()

			// Create background first
			this.createBackground()

			// Show title screen
			await this.drawTitleScreen()
			console.log('Title screen drawn')

			// Initialize input handlers
			this.initInputHandlers()

			// Start game loop
			this.app.ticker.add((delta) => this.gameLoop(delta))

			console.log('Game initialization complete')
		} catch (error) {
			console.error('Failed to initialize game:', error)
			this.showErrorScreen('Failed to initialize game: ' + error.message)
		}
	}

	async initGameObjects() {
		// Create cheeks sprite with proper texture loading
		try {
			const cheeksTexture = await PIXI.Assets.load('./images/cheeks.png')
			if (cheeksTexture && cheeksTexture.valid) {
				console.log('Creating cheeks sprite with texture')
				this.cheeks = new PIXI.Sprite(cheeksTexture)
				this.cheeks.anchor.set(0.5)
				// Position exactly in center
				this.cheeks.x = this.app.screen.width / 2
				this.cheeks.y = this.app.screen.height / 2
				this.cheeks.velocity = 0
				// Scale based on screen height
				const targetSize = CHEEKS_SIZE
				const scale =
					targetSize / Math.max(cheeksTexture.width, cheeksTexture.height)
				this.cheeks.scale.set(scale)
				this.cheeks.visible = false // Start hidden
				this.gameLayer.addChild(this.cheeks)
				console.log('Cheeks sprite created and added to game layer')
			} else {
				throw new Error('Invalid cheeks texture')
			}
		} catch (error) {
			console.warn('Cheeks texture not found, using fallback shape:', error)
			this.cheeks = new PIXI.Graphics()
			this.cheeks.beginFill(0xffa500)
			this.cheeks.drawCircle(0, 0, CHEEKS_SIZE / 2)
			this.cheeks.endFill()
			this.cheeks.x = this.app.screen.width / 2
			this.cheeks.y = this.app.screen.height / 2
			this.cheeks.velocity = 0
			this.cheeks.visible = false // Start hidden
			this.gameLayer.addChild(this.cheeks)
			console.log('Fallback cheeks shape created and added to game layer')
		}

		// Add gloves container to gameLayer
		this.gloves.visible = false // Start hidden
		this.gameLayer.addChild(this.gloves)
		console.log('Game objects initialized:', {
			cheeksAdded: this.gameLayer.children.includes(this.cheeks),
			glovesAdded: this.gameLayer.children.includes(this.gloves),
			gameLayerChildren: this.gameLayer.children.length,
		})
	}

	updateGrid(graphics) {
		const canvas = this.app.view
		const width = canvas.width
		const height = canvas.height

		// Clear any existing graphics
		graphics.clear()

		// Use different background color based on game state
		const bgColor = gameState.gameStarted ? 0x4b2f2f : 0x000044 // Darker shade of ring floor during gameplay
		graphics.beginFill(bgColor, 1)
		graphics.drawRect(0, 0, width, height)
		graphics.endFill()

		// Only draw grid lines when game hasn't started
		if (!gameState.gameStarted) {
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
	}

	updateRing() {
		if (!this.ring) return

		this.ring.removeChildren()

		const width = this.screenWidth
		const height = this.screenHeight

		// Ring dimensions
		const ringPadding = height * 0.05 // 5% padding from edges
		const ringTop = height * 0.3 // Position at 30% of canvas height
		const floorTop = ringTop - height * 0.06 // Shift floor top edge up slightly
		const ringBottom = height + ringPadding // Extend slightly below canvas
		const postWidth = Math.max(width * 0.015, 10) // 1.5% of width, min 10px
		const postHeight = height * 0.2 // 20% of canvas height
		const floorExtension = width * 0.24 // 15% extension for bottom corners
		const topExtension = width * 0.05 // 8% extension for top corners

		// Center offset for the entire ring
		const centerOffset = width * 0.15 // Keep posts inset from edges
		const ringLeft = centerOffset
		const ringRight = width - centerOffset

		// Ring floor
		const floor = new PIXI.Graphics()
		floor.beginFill(0x00cec4, 1.0)

		// Calculate curve height for top edge
		const curveHeight = height * 0.02 // 2% of screen height

		// Draw floor with curved top edge and perspective
		floor.moveTo(ringLeft - topExtension, floorTop) // Start at top left with moderate extension
		floor.bezierCurveTo(
			ringLeft + (ringRight - ringLeft) * 0.25,
			floorTop - curveHeight,
			ringLeft + (ringRight - ringLeft) * 0.75,
			floorTop - curveHeight,
			ringRight + topExtension,
			floorTop // End at top right with moderate extension
		)
		floor.lineTo(ringRight + floorExtension, ringBottom) // Wider at bottom right
		floor.lineTo(ringLeft - floorExtension, ringBottom) // Wider at bottom left
		floor.closePath()
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
		const ropeThickness = Math.max(width * 0.002, 4) // Min thickness of 4px
		const ropeColors = [0xff0000, 0xffffff, 0xff0000] // Red, white, red

		// Draw three ropes on each side
		for (let i = 0; i < 3; i++) {
			const ropeSpacing = postHeight / 4 // Even spacing between ropes
			const topY = ringTop - postHeight + ropeSpacing * (i + 1)

			// Space bottom points evenly with slight outward progression
			const bottomY = ringBottom - ringPadding * 0.8 // All ropes end at same height
			// Reverse the spread order (2,1,0 instead of 0,1,2)
			const sideOffset = floorExtension * (0.6 + (2 - i) * 0.15) // Top rope spreads most, bottom least

			// Very gentle curve
			const curveWidth = width * 0.01 // Minimal curve

			// Set rope color
			ropes.lineStyle(ropeThickness, ropeColors[i], 0.8)

			// Left side rope with minimal curve - single outward arc
			ropes.moveTo(ringLeft + postWidth / 2, topY)
			ropes.bezierCurveTo(
				ringLeft - sideOffset * 0.4, // Move control point out less
				topY + (bottomY - topY) * 0.4, // Move to middle for smooth arc
				ringLeft - sideOffset * 0.2, // Keep same distance for smooth arc
				topY + (bottomY - topY) * 0.2, // Keep at middle for smooth arc
				ringLeft - sideOffset,
				bottomY
			)

			// Right side rope with minimal curve - single outward arc
			ropes.moveTo(ringRight - postWidth / 2, topY)
			ropes.bezierCurveTo(
				ringRight + sideOffset * 0.4, // Move control point out less
				topY + (bottomY - topY) * 0.4, // Move to middle for smooth arc
				ringRight + sideOffset * 0.2, // Keep same distance for smooth arc
				topY + (bottomY - topY) * 0.2, // Keep at middle for smooth arc
				ringRight + sideOffset,
				bottomY
			)

			// Calculate relative curve height for each rope
			// Top rope has full curve, middle and bottom ropes have progressively less curve
			const ropeCurveHeight = curveHeight * (1 - i * 0.2) // Reduce curve by 20% for each lower rope

			// Horizontal rope connecting posts - gentle upward arc
			ropes.moveTo(ringLeft + postWidth / 2, topY)
			ropes.bezierCurveTo(
				ringLeft + (ringRight - ringLeft) * 0.25,
				topY - ropeCurveHeight * 0.5, // Inverted curve height for upward arc
				ringLeft + (ringRight - ringLeft) * 0.75,
				topY - ropeCurveHeight * 0.5, // Inverted curve height for upward arc
				ringRight - postWidth / 2,
				topY
			)
		}
		this.ring.addChild(ropes)

		// Add ring to background behind crowd
		this.background.addChild(this.ring)
	}

	async updateHUD() {
		try {
			// Clear existing HUD with proper cleanup
			this.clearGameOverScreen()

			// Update background for current state
			this.createBackground()

			// Ensure game objects are visible during gameplay
			if (gameState.gameStarted && !gameState.gameOver) {
				if (this.cheeks) {
					this.cheeks.visible = true
				}
				if (this.gloves) {
					this.gloves.visible = true
				}
			}

			// Draw appropriate screen
			if (!gameState.gameStarted) {
				await this.drawTitleScreen()
			} else if (gameState.gameOver) {
				await this.drawGameOverScreen()
			} else {
				await this.drawGameHUD()
			}

			// Force a render update
			this.app.renderer.render(this.app.stage)
		} catch (error) {
			console.error('Error updating HUD:', error)
			this.showErrorScreen('Error updating HUD: ' + error.message)
		}
	}

	async drawGameOverScreen() {
		try {
			const width = this.screenWidth
			const height = this.screenHeight
			const maxWidth = width * 0.95
			const maxHeight = height * 0.95

			// Hide game objects
			if (this.cheeks) {
				this.cheeks.visible = false
			}
			if (this.gloves) {
				this.gloves.visible = false
			}

			// Create container for game over content
			const gameOverContainer = new PIXI.Container()
			gameOverContainer.name = 'gameOverContainer'

			// Calculate base font size based on screen dimensions
			const baseFontSize = Math.min(height / 10, width / 14)

			// Create text objects with validation
			const roundScore = await this.createText(
				`ROUND SCORE: ${gameState.score}`,
				{
					fontFamily: this.defaultTextStyle.fontFamily,
					fontSize: baseFontSize * 0.8,
					fill: 0x004643,
					align: 'center',
					padding: 4,
				}
			)

			if (roundScore) {
				roundScore.anchor.set(0.5)
				roundScore.y = 0
				gameOverContainer.addChild(roundScore)
			}

			const totalScore = await this.createText(
				`TOTAL SCORE: ${gameState.totalScore}`,
				{
					fontFamily: this.defaultTextStyle.fontFamily,
					fontSize: baseFontSize * 0.8,
					fill: 0x004643,
					align: 'center',
					padding: 4,
				}
			)

			if (totalScore) {
				totalScore.anchor.set(0.5)
				totalScore.y = baseFontSize * 1.2
				gameOverContainer.addChild(totalScore)
			}

			// Show rounds left or game complete message
			const roundsMessage =
				gameState.roundsLeft > 0
					? `${gameState.roundsLeft} ROUNDS LEFT`
					: 'GAME COMPLETE!'

			const roundsText = await this.createText(roundsMessage, {
				fontFamily: this.defaultTextStyle.fontFamily,
				fontSize: baseFontSize * 0.6,
				fill: 0x004643,
				align: 'center',
				padding: 4,
			})

			if (roundsText) {
				roundsText.anchor.set(0.5)
				roundsText.y = baseFontSize * 2.4
				gameOverContainer.addChild(roundsText)
			}

			// Add continue message with blink effect
			const continueText = await this.createText(
				gameState.roundsLeft > 0 ? 'TAP TO CONTINUE' : 'TAP TO RESTART',
				{
					fontFamily: this.defaultTextStyle.fontFamily,
					fontSize: baseFontSize * 0.5,
					fill: 0x004643,
					align: 'center',
					padding: 4,
				}
			)

			if (continueText) {
				continueText.anchor.set(0.5)
				continueText.y = baseFontSize * 3.6

				// Add blink effect
				let visible = true
				const blinkInterval = setInterval(() => {
					visible = !visible
					continueText.visible = visible
				}, 500)

				// Store interval for cleanup
				continueText._blinkInterval = blinkInterval
				gameOverContainer.addChild(continueText)
			}

			// Position and scale container
			gameOverContainer.x = width / 2
			gameOverContainer.y = height * 0.25

			// Get bounds of content
			const bounds = gameOverContainer.getBounds()
			if (bounds && isFinite(bounds.width) && isFinite(bounds.height)) {
				// Scale if needed
				const scale = Math.min(
					maxWidth / bounds.width,
					maxHeight / bounds.height,
					1
				)
				if (scale < 1) {
					gameOverContainer.scale.set(scale)
				}
			}

			// Add to HUD
			this.hud.addChild(gameOverContainer)

			// Draw copyright
			await this.drawCopyright()

			// Force a render update
			this.app.renderer.render(this.app.stage)
		} catch (error) {
			console.error('Error drawing game over screen:', error)
			this.showErrorScreen('Error drawing game over screen: ' + error.message)
		}
	}

	clearGameOverScreen() {
		// Remove all existing HUD children with proper cleanup
		while (this.hud.children.length > 0) {
			const child = this.hud.children[0]
			if (child._blinkTicker) {
				child._blinkTicker.stop()
				child._blinkTicker.destroy()
				child._blinkTicker = null
			}
			if (child._animationFrameId) {
				cancelAnimationFrame(child._animationFrameId)
				child._animationFrameId = null
				child._moveHandler = null
			}
			if (child instanceof PIXI.Text) {
				child.destroy(true)
			} else if (child instanceof PIXI.Container) {
				// Recursively destroy container contents
				this.destroyContainer(child)
			} else {
				child.destroy({ children: true, texture: true, baseTexture: true })
			}
			this.hud.removeChild(child)
		}

		// Force garbage collection
		this.app.renderer.textureGC.run()
		this.app.renderer.batch.reset()
	}

	destroyContainer(container) {
		while (container.children.length > 0) {
			const child = container.children[0]
			if (child._blinkTicker) {
				child._blinkTicker.stop()
				child._blinkTicker.destroy()
				child._blinkTicker = null
			}
			if (child._animationFrameId) {
				cancelAnimationFrame(child._animationFrameId)
				child._animationFrameId = null
				child._moveHandler = null
			}
			if (child instanceof PIXI.Text) {
				child.destroy(true)
			} else if (child instanceof PIXI.Container) {
				this.destroyContainer(child)
			} else {
				child.destroy({ children: true, texture: true, baseTexture: true })
			}
			container.removeChild(child)
		}
		container.destroy({ children: true })
	}

	async drawFinalKnockout(mainContainer, baseFontSize) {
		const knockout = await this.createText('KNOCKOUT!!', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: 0x00005c,
			align: 'center',
		})

		if (knockout) {
			knockout.anchor.set(0.5)
			knockout.y = 0
			mainContainer.addChild(knockout)
		}

		const finalScore = gameState.totalScore + gameState.score
		const scoreText = `FINAL SCORE: ${finalScore}`
		const scoreContainer = new PIXI.Graphics()
		const scoreTextObj = await this.createText(scoreText, {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize * 0.8,
			fill: 0x000000,
			align: 'center',
		})

		if (scoreTextObj) {
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

			mainContainer.addChild(scoreContainer, scoreTextObj)
		}
	}

	async drawRoundOver(mainContainer, baseFontSize) {
		const roundOver1 = await this.createText('ROUND', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: 0x00005c,
			align: 'center',
		})

		if (roundOver1) {
			roundOver1.anchor.set(0.5)
			roundOver1.y = 0
			mainContainer.addChild(roundOver1)
		}

		const roundOver2 = await this.createText('OVER!!', {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize,
			fill: 0x00005c,
			align: 'center',
		})

		if (roundOver2) {
			roundOver2.anchor.set(0.5)
			roundOver2.y = baseFontSize * 1.2
			mainContainer.addChild(roundOver2)
		}

		const roundScore = await this.createText(
			`ROUND SCORE: ${gameState.score}`,
			{
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.6,
				fill: 0x004643,
				align: 'center',
			}
		)

		if (roundScore) {
			roundScore.anchor.set(0.5)
			roundScore.y = baseFontSize * 2.4
			mainContainer.addChild(roundScore)
		}

		const totalScoreText = await this.createText(
			`TOTAL SCORE: ${gameState.totalScore + gameState.score}`,
			{
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.6,
				fill: 0x004643,
				align: 'center',
			}
		)

		if (totalScoreText) {
			totalScoreText.anchor.set(0.5)
			totalScoreText.y = baseFontSize * 3.2
			mainContainer.addChild(totalScoreText)
		}

		const roundsLeftText = await this.createText(
			`ROUNDS LEFT: ${gameState.roundsLeft}`,
			{
				fontFamily: 'Press Start 2P',
				fontSize: baseFontSize * 0.6,
				fill: 0x004643,
				align: 'center',
			}
		)

		if (roundsLeftText) {
			roundsLeftText.anchor.set(0.5)
			roundsLeftText.y = baseFontSize * 4.0
			mainContainer.addChild(roundsLeftText)
		}

		// Check if mobile device
		const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
		const buttonText = isMobile ? 'TAP SCREEN' : 'PRESS SPACE'

		const pressSpace = await this.createText(buttonText, {
			fontFamily: 'Press Start 2P',
			fontSize: baseFontSize * 0.6,
			fill: 0xff0000,
			align: 'center',
		})

		if (pressSpace) {
			pressSpace.anchor.set(0.5)
			pressSpace.y = baseFontSize * 5.2

			// Set initial visibility based on knockout delay
			pressSpace.alpha =
				performance.now() - gameState.knockoutTime > KNOCKOUT_DELAY ? 1 : 0

			// Create new blink ticker with cleanup
			this._blinkTicker = new PIXI.Ticker()
			this._blinkTicker.add(() => {
				const time = performance.now()
				if (time - gameState.knockoutTime > KNOCKOUT_DELAY) {
					pressSpace.alpha = 1
					// Match title screen blink rate of 250ms
					const step = Math.floor(time / 250) % 2
					pressSpace.style.fill = step ? 0xff0000 : 0xffffff
				} else {
					pressSpace.alpha = 0
				}
			})
			this._blinkTicker.start()

			mainContainer.addChild(pressSpace)
		}
	}

	addDecorativeGloves(pressSpaceGroup, menuSize) {
		const armTexture = PIXI.Assets.get('arm')
		if (armTexture) {
			// Force a render update
			this.app.renderer.render(this.app.stage)

			// Fixed spacing based on menu size rather than text width
			const gloveSize = menuSize * 2.5
			const gloveSpacing = menuSize * 12

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

			// Retro-style stepped movement with optimized handler
			const moveHandler = () => {
				if (this.isIdle) return // Skip animation in idle state

				const time = performance.now()
				const step = Math.floor(time / 250) % 2
				const moveAmount = step ? BASE_UNIT * 0.8 : 0

				// Only update if position changed
				if (leftGlove.x !== -gloveSpacing / 2 - moveAmount) {
					leftGlove.x = -gloveSpacing / 2 - moveAmount
					rightGlove.x = gloveSpacing / 2 + moveAmount
				}
			}

			this.app.ticker.add(moveHandler)
			leftGlove._moveHandler = moveHandler

			// Store initial positions for reset
			leftGlove._baseX = -gloveSpacing / 2
			rightGlove._baseX = gloveSpacing / 2
		}
	}

	async drawGameHUD() {
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
		// Update last interaction time
		this.lastInteractionTime = performance.now()

		// Exit idle state if needed
		if (this.isIdle) {
			this.exitIdleState()
		}

		// Don't allow game input if we're in Konami sequence completion
		if (window.konamiState && window.konamiState.isCompletingKonami()) {
			console.log('Blocking game input during Konami completion')
			return
		}

		console.log('Input received:', {
			gameStarted: gameState.gameStarted,
			roundsLeft: gameState.roundsLeft,
			gameOver: gameState.gameOver,
			cheeksVisible: this.cheeks?.visible,
			glovesVisible: this.gloves?.visible,
			gameState: { ...gameState },
		})

		if (!gameState.gameStarted) {
			console.log('Starting game...')
			gameState.gameStarted = true
			gameState.gameStartTime = performance.now()
			gameState.roundsLeft = 3
			gameState.currentRound = 1
			this.playCheerSound()
			this.startGame()
			this.updateHUD()
		} else if (
			gameState.gameOver &&
			performance.now() - gameState.knockoutTime > KNOCKOUT_DELAY
		) {
			if (gameState.roundsLeft > 0) {
				console.log('Starting next round...')
				gameState.totalScore += gameState.score
				gameState.currentRound++
				gameState.gameStarted = true
				gameState.gameOver = false
				gameState.firstAction = false
				gameState.gameStartTime = performance.now()
				this.startGame()
				this.playCheerSound()
			} else {
				console.log('Game complete, resetting...')
				gameState.gameStarted = false
				gameState.gameOver = false
				gameState.score = 0
				gameState.totalScore = 0
				gameState.roundsLeft = 3
				gameState.currentRound = 1
				this.updateHUD()
			}
		} else if (!gameState.gameOver) {
			if (this.cheeks && this.cheeks.visible) {
				console.log('Flapping cheeks...')
				gameState.firstAction = true
				gameState.hasEverActed = true
				this.cheeks.velocity = CLAP_SPEED
				gameState.squishStartTime = performance.now()
				this.playFlapSound()
			}
		}
	}

	startGame() {
		console.log('Starting game with state:', {
			gameStarted: gameState.gameStarted,
			roundsLeft: gameState.roundsLeft,
			currentRound: gameState.currentRound,
			gameOver: gameState.gameOver,
			initialCheeksVisible: this.cheeks?.visible,
			initialGlovesVisible: this.gloves?.visible,
		})

		// Clear existing game state
		gameState.score = 0
		gameState.gameSpeed = 1
		gameState.lastSpeedIncreaseScore = 0
		gameState.firstAction = false
		window.shareData = null

		// Clear HUD and title screen
		this.hud.removeChildren()

		// Clean up any existing game objects
		this.cleanupGameObjects()

		// Create game background with ring and crowd
		this.createBackground()

		// Initialize game HUD
		this.updateHUD()

		if (this.cheeks) {
			console.log('Setting cheeks visibility to true')
			this.cheeks.visible = true
			this.cheeks.x = this.app.screen.width * PLAYER_X
			this.cheeks.y = this.app.screen.height / 2
			this.cheeks.velocity = 0
			console.log('Cheeks position:', {
				x: this.cheeks.x,
				y: this.cheeks.y,
				visible: this.cheeks.visible,
			})
		} else {
			console.warn('Cheeks object not initialized')
		}

		if (this.gloves) {
			console.log('Setting gloves visibility to true')
			this.gloves.visible = true
			// Clear existing glove pairs safely
			while (this.gloves.pairs.length > 0) {
				const pair = this.gloves.pairs.pop()
				if (pair) {
					pair.children.forEach((glove) => {
						if (glove.texture) {
							glove.texture = null
						}
					})
					pair.destroy({ children: true })
				}
			}
			this.gloves.removeChildren()
			this.gloves.pairs = []
			this.spawnGloves()
			console.log('Gloves state:', {
				visible: this.gloves.visible,
				pairs: this.gloves.pairs.length,
			})
		} else {
			console.warn('Gloves object not initialized')
		}

		// Force a render update to ensure visibility changes take effect
		this.app.renderer.render(this.app.stage)

		console.log('End of startGame:', {
			cheeksVisible: this.cheeks?.visible,
			glovesVisible: this.gloves?.visible,
		})
	}

	cleanupGameObjects() {
		// Clean up gloves without destroying textures
		if (this.gloves) {
			this.gloves.pairs.forEach((pair) => {
				if (pair) {
					pair.children.forEach((glove) => {
						if (glove instanceof PIXI.Sprite) {
							// Just clear the reference, don't destroy the texture
							glove.texture = null
						}
					})
					pair.destroy({ children: true, texture: false, baseTexture: false })
				}
			})
			this.gloves.pairs = []
			this.gloves.removeChildren()
		}

		// Reset cheeks
		if (this.cheeks) {
			this.cheeks.velocity = 0
			this.cheeks.visible = true
			const targetSize = CHEEKS_SIZE
			const cheeksTexture = PIXI.Assets.get('cheeks')
			if (cheeksTexture && cheeksTexture.valid) {
				const baseScale =
					targetSize / Math.max(cheeksTexture.width, cheeksTexture.height)
				this.cheeks.scale.set(baseScale)
			}
		}

		// Force a cleanup but preserve essential textures
		this.app.renderer.textureGC.run()
		this.app.renderer.batch.reset()
	}

	async spawnGloves() {
		const width = this.screenWidth
		const height = this.screenHeight
		const safePadding = height * 0.05

		// Randomize the gap size relative to screen height
		GLOVE_OPENING = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)

		// Calculate gap position - between 30% and 70% of screen height
		const minY = height * 0.3
		const maxY = height * 0.7
		let gapCenter = minY + Math.random() * (maxY - minY)

		// Create glove pair container
		const pair = new PIXI.Container()

		// Position the pair
		if (this.gloves.pairs.length === 0) {
			pair.x = width * SPAWN_OFFSET
		} else {
			const lastPair = this.gloves.pairs[this.gloves.pairs.length - 1]
			pair.x = lastPair.x + width * GLOVE_SET_GAP
		}

		pair.gapY = gapCenter
		pair.passed = false

		// Get cached arm texture
		let armTexture = PIXI.Assets.get('arm')

		// If no valid texture, create fallback shapes
		if (!armTexture || !armTexture.valid) {
			console.warn('Using fallback shapes for gloves')
			const armHeight = ARM_SCALE * 4

			const topGlove = new PIXI.Graphics()
			topGlove.beginFill(0xff0000)
			topGlove.drawRect(-ARM_SCALE / 2, 0, ARM_SCALE, armHeight)
			topGlove.endFill()
			topGlove.y = gapCenter - GLOVE_OPENING / 2

			const bottomGlove = new PIXI.Graphics()
			bottomGlove.beginFill(0xff0000)
			bottomGlove.drawRect(-ARM_SCALE / 2, 0, ARM_SCALE, armHeight)
			bottomGlove.endFill()
			bottomGlove.y = gapCenter + GLOVE_OPENING / 2

			pair.addChild(topGlove, bottomGlove)
		} else {
			// Calculate dimensions
			const targetWidth = ARM_SCALE
			const naturalRatio = armTexture.height / armTexture.width
			const armHeight = targetWidth * naturalRatio

			// Create top glove
			const topGlove = new PIXI.Sprite(armTexture)
			topGlove.anchor.set(0.5, 0)
			topGlove.x = 0
			topGlove.y = 0
			topGlove.angle = 180
			topGlove.width = targetWidth
			topGlove.scale.y = topGlove.scale.x
			topGlove.position.y = gapCenter - GLOVE_OPENING / 2

			// Create bottom glove
			const bottomGlove = new PIXI.Sprite(armTexture)
			bottomGlove.anchor.set(0.5, 0)
			bottomGlove.x = 0
			bottomGlove.y = gapCenter + GLOVE_OPENING / 2
			bottomGlove.width = targetWidth
			bottomGlove.scale.y = bottomGlove.scale.x

			pair.addChild(topGlove, bottomGlove)
		}

		// Enable culling for the pair
		pair.cullable = true

		this.gloves.pairs.push(pair)
		this.gloves.addChild(pair)

		// Clean up old pairs
		this.gloves.pairs = this.gloves.pairs.filter((p) => {
			if (p.x + ARM_SCALE < 0) {
				p.destroy({ children: true })
				return false
			}
			return true
		})
	}

	gameLoop(delta) {
		if (document.hidden) return

		// Update filters if they exist
		if (this.crtFilter && this.bloomFilter) {
			// Update CRT filter time and seed for animation
			this.crtFilter.time += delta * 0.1
			this.crtFilter.seed = Math.random()
		}

		// Only update game state if game is started and not over
		if (gameState.gameStarted && !gameState.gameOver) {
			this.updateGameState(delta)
		}

		// Force a render update
		this.app.renderer.render(this.app.stage)
	}

	updateGameState(delta) {
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
					const targetSize = CHEEKS_SIZE
					const cheeksTexture = PIXI.Assets.get('cheeks')
					const baseScale = cheeksTexture
						? targetSize / Math.max(cheeksTexture.width, cheeksTexture.height)
						: 1
					this.cheeks.scale.x = xScale * baseScale
					this.cheeks.scale.y = yScale * baseScale
				} else {
					gameState.squishStartTime = 0
					const targetSize = CHEEKS_SIZE
					const cheeksTexture = PIXI.Assets.get('cheeks')
					const baseScale = cheeksTexture
						? targetSize / Math.max(cheeksTexture.width, cheeksTexture.height)
						: 1
					this.cheeks.scale.set(baseScale)
				}
			}
		}

		// Update gloves
		if (
			this.gloves &&
			performance.now() - gameState.gameStartTime >= gameState.gameStartDelay
		) {
			this.updateGloves(delta)
		}

		// Check for collisions and bounds
		if (this.checkCollisions() || this.checkBounds()) {
			gameState.gameOver = true
			gameState.knockoutTime = performance.now()
			gameState.roundsLeft--
			this.updateHUD()
		}
	}

	checkCollisions() {
		// Early exit if game objects aren't ready
		if (
			!this.cheeks ||
			!this.gloves ||
			!this.cheeks.visible ||
			!this.gloves.visible
		) {
			return false
		}

		try {
			// Cache texture references
			const armTexture = PIXI.Assets.get('arm')
			if (!armTexture || !armTexture.valid) {
				console.warn('Arm texture invalid, attempting to reload')
				return false
			}

			// Use CHEEKS_SIZE for collision box with additional validation
			const cheeksBox = {
				x: this.cheeks.x - CHEEKS_SIZE * 0.4,
				y: this.cheeks.y - CHEEKS_SIZE * 0.4,
				width: CHEEKS_SIZE * 0.8,
				height: CHEEKS_SIZE * 0.8,
			}

			// Validate cheeks collision box
			if (!this.isValidCollisionBox(cheeksBox)) {
				console.warn('Invalid cheeks collision box')
				return false
			}

			// Create a copy of pairs array to prevent modification during iteration
			const currentPairs = [...this.gloves.pairs]

			for (const pair of currentPairs) {
				// Skip invalid pairs
				if (!pair || !pair.children || pair.children.length < 2) {
					continue
				}

				const topGlove = pair.children[0]
				const bottomGlove = pair.children[1]

				// Skip if gloves are invalid
				if (!topGlove || !bottomGlove) {
					continue
				}

				try {
					// For sprites, ensure textures are valid
					if (topGlove instanceof PIXI.Sprite) {
						if (!topGlove.texture || !topGlove.texture.valid) {
							topGlove.texture = armTexture
						}
					}
					if (bottomGlove instanceof PIXI.Sprite) {
						if (!bottomGlove.texture || !bottomGlove.texture.valid) {
							bottomGlove.texture = armTexture
						}
					}

					// Get bounds safely with validation
					const topBounds = this.getSafeBounds(topGlove)
					const bottomBounds = this.getSafeBounds(bottomGlove)

					if (!topBounds || !bottomBounds) {
						continue
					}

					// Create collision boxes with validation
					const topCollision = this.createCollisionBox(topBounds, 0.9)
					const bottomCollision = this.createCollisionBox(bottomBounds, 0.9)

					if (!topCollision || !bottomCollision) {
						continue
					}

					// Check for collisions
					if (
						this.intersectRect(cheeksBox, topCollision) ||
						this.intersectRect(cheeksBox, bottomCollision)
					) {
						this.playKnockoutSound()
						window.shareData = null
						return true
					}

					// Score points for passing gloves
					if (!pair.passed && this.cheeks.x > pair.x) {
						pair.passed = true
						const pointsToAdd = window.cheatMode ? window.cheatPoints || 10 : 1
						gameState.score += pointsToAdd

						// Update HUD immediately after score change
						this.updateHUD()

						// Update game speed
						if (
							gameState.score % 1 === 0 &&
							gameState.gameSpeed < MAX_SPEED &&
							!window.cheatMode
						) {
							gameState.gameSpeed = Math.min(
								MAX_SPEED,
								gameState.gameSpeed + SPEED_INCREASE
							)
						}
					}
				} catch (error) {
					console.warn('Error processing glove pair:', error)
					continue
				}
			}
		} catch (error) {
			console.error('Collision check error:', error)
			return false
		}

		return false
	}

	getSafeBounds(displayObject) {
		try {
			if (!displayObject || !displayObject.getBounds) {
				return null
			}

			// For sprites, validate texture before getting bounds
			if (displayObject instanceof PIXI.Sprite) {
				if (!displayObject.texture || !displayObject.texture.valid) {
					return null
				}
			}

			const bounds = displayObject.getBounds()
			if (
				!bounds ||
				!isFinite(bounds.width) ||
				!isFinite(bounds.height) ||
				bounds.width <= 0 ||
				bounds.height <= 0
			) {
				return null
			}
			return bounds
		} catch (error) {
			console.warn('Error getting bounds:', error)
			return null
		}
	}

	createCollisionBox(bounds, shrinkFactor) {
		if (!bounds) return null

		try {
			const box = {
				x: bounds.x + (bounds.width * (1 - shrinkFactor)) / 2,
				y: bounds.y + (bounds.height * (1 - shrinkFactor)) / 2,
				width: bounds.width * shrinkFactor,
				height: bounds.height * shrinkFactor,
			}

			return this.isValidCollisionBox(box) ? box : null
		} catch (error) {
			console.warn('Error creating collision box:', error)
			return null
		}
	}

	isValidCollisionBox(box) {
		return (
			box &&
			typeof box.x === 'number' &&
			isFinite(box.x) &&
			typeof box.y === 'number' &&
			isFinite(box.y) &&
			typeof box.width === 'number' &&
			isFinite(box.width) &&
			box.width > 0 &&
			typeof box.height === 'number' &&
			isFinite(box.height) &&
			box.height > 0
		)
	}

	checkBounds() {
		if (!this.cheeks) return false
		const outOfBounds = this.cheeks.y < 0 || this.cheeks.y > this.screenHeight
		if (outOfBounds) {
			this.playKnockoutSound()
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

	createBackground() {
		// Clear existing background
		this.background.removeChildren()

		const width = this.screenWidth
		const height = this.screenHeight

		// 1. Background color based on game state
		const bgGraphics = new PIXI.Graphics()
		const bgColor = gameState.gameStarted ? 0x002321 : 0x000044 // Darker version of 0x004643
		bgGraphics.beginFill(bgColor, 1)
		bgGraphics.drawRect(0, 0, width, height)
		bgGraphics.endFill()
		this.background.addChild(bgGraphics)

		// 2. Grid pattern - only show when game hasn't started
		if (!gameState.gameStarted) {
			const gridGraphics = new PIXI.Graphics()
			gridGraphics.lineStyle(1, 0x4444ff, 0.3)

			// Draw grid lines - fixed size grid that tiles from center
			const gridSize = 32 // Fixed grid size

			// Calculate grid offsets to center the pattern
			const centerX = width / 2
			const centerY = height / 2
			const startX = (centerX % gridSize) - gridSize / 2
			const startY = (centerY % gridSize) - gridSize / 2

			// Calculate maximum distortion at corners (as percentage of screen size)
			const maxDistortion = Math.min(width, height) * 0.15

			// Draw horizontal curved lines from center
			for (let y = startY; y <= height; y += gridSize) {
				gridGraphics.moveTo(0, y)
				const distFromCenter = Math.abs(y - centerY) / height
				const curveHeight = maxDistortion * distFromCenter * distFromCenter
				const direction = y < centerY ? -1 : 1
				gridGraphics.bezierCurveTo(
					width * 0.25,
					y + curveHeight * direction,
					width * 0.75,
					y + curveHeight * direction,
					width,
					y
				)
			}
			for (let y = startY - gridSize; y >= 0; y -= gridSize) {
				gridGraphics.moveTo(0, y)
				const distFromCenter = Math.abs(y - centerY) / height
				const curveHeight = maxDistortion * distFromCenter * distFromCenter
				const direction = y < centerY ? -1 : 1
				gridGraphics.bezierCurveTo(
					width * 0.25,
					y + curveHeight * direction,
					width * 0.75,
					y + curveHeight * direction,
					width,
					y
				)
			}

			// Draw vertical curved lines
			for (let x = startX; x <= width; x += gridSize) {
				gridGraphics.moveTo(x, 0)
				const distFromCenter = Math.abs(x - centerX) / width
				const curveWidth = maxDistortion * distFromCenter * distFromCenter
				const direction = x < centerX ? -1 : 1
				gridGraphics.bezierCurveTo(
					x + curveWidth * direction,
					height * 0.25,
					x + curveWidth * direction,
					height * 0.75,
					x,
					height
				)
			}
			for (let x = startX - gridSize; x >= 0; x -= gridSize) {
				gridGraphics.moveTo(x, 0)
				const distFromCenter = Math.abs(x - centerX) / width
				const curveWidth = maxDistortion * distFromCenter * distFromCenter
				const direction = x < centerX ? -1 : 1
				gridGraphics.bezierCurveTo(
					x + curveWidth * direction,
					height * 0.25,
					x + curveWidth * direction,
					height * 0.75,
					x,
					height
				)
			}
			this.background.addChild(gridGraphics)
		}

		// Only show ring and crowd during gameplay or game over
		if (gameState.gameStarted || gameState.gameOver) {
			// Create ring container first
			this.ring = new PIXI.Container()
			this.updateRing()
			this.background.addChild(this.ring)

			// Add crowd behind ring
			const crowdTexture = PIXI.Assets.get('crowd')
			if (crowdTexture && crowdTexture.valid) {
				const crowdHeight = height * 0.3
				const scale = crowdHeight / crowdTexture.height
				const scaledWidth = crowdTexture.width * scale

				// Create crowd container for masking
				const crowdContainer = new PIXI.Container()

				// Create crowd sprite
				this.crowd = new PIXI.TilingSprite(crowdTexture, width, crowdHeight)
				this.crowd.position.set(0, 0)
				this.crowd.tileScale.set(scale)
				this.crowd.alpha = 0.2
				this.crowd.blendMode = PIXI.BLEND_MODES.LIGHTEN

				// Create gradient mask
				const gradientMask = new PIXI.Graphics()
				gradientMask.beginFill(0xffffff, 1)
				gradientMask.drawRect(0, 0, width, crowdHeight * 0.8) // Solid part

				// Draw gradient part
				const gradientHeight = crowdHeight * 0.2
				for (let i = 0; i < gradientHeight; i++) {
					const alpha = 1 - i / gradientHeight
					gradientMask.beginFill(0xffffff, alpha)
					gradientMask.drawRect(0, crowdHeight * 0.8 + i, width, 1)
					gradientMask.endFill()
				}

				// Add crowd and mask to container
				crowdContainer.addChild(this.crowd)
				crowdContainer.mask = gradientMask
				crowdContainer.addChild(gradientMask) // Add mask as child to ensure it's rendered

				// Insert crowd container behind ring
				this.background.addChildAt(
					crowdContainer,
					this.background.getChildIndex(this.ring)
				)
			}
		}

		// Force a render update
		this.app.renderer.render(this.app.stage)
	}

	async showErrorScreen(message) {
		// Clear existing HUD
		this.hud.removeChildren()

		const width = this.screenWidth
		const height = this.screenHeight
		const fontSize = Math.min(height * 0.04, width * 0.05) // 4% of screen height

		const errorText = new PIXI.Text(message, {
			fontFamily: 'Press Start 2P',
			fontSize: fontSize,
			fill: 0xff0000,
			align: 'center',
			wordWrap: true,
			wordWrapWidth: width * 0.8,
		})

		if (errorText) {
			errorText.anchor.set(0.5)
			errorText.x = width / 2
			errorText.y = height / 2
			this.hud.addChild(errorText)
		}
	}

	async initializeAudio() {
		try {
			// Initialize PIXI sound
			if (!PIXI.sound) {
				console.warn('PIXI.sound not available')
				return false
			}

			console.log('Initializing audio...')

			// Remove any existing sounds first
			PIXI.sound.removeAll()

			// Define audio files with proper paths and settings
			const audioFiles = {
				clap1: { url: 'audio/claps/clap1.mp3', volume: 0.3 },
				clap2: { url: 'audio/claps/clap2.mp3', volume: 0.3 },
				clap3: { url: 'audio/claps/clap3.mp3', volume: 0.3 },
				clap4: { url: 'audio/claps/clap4.mp3', volume: 0.3 },
				clap5: { url: 'audio/claps/clap5.mp3', volume: 0.3 },
				clap6: { url: 'audio/claps/clap6.mp3', volume: 0.3 },
				clap7: { url: 'audio/claps/clap7.mp3', volume: 0.3 },
				clap8: { url: 'audio/claps/clap8.mp3', volume: 0.3 },
				clap9: { url: 'audio/claps/clap9.mp3', volume: 0.3 },
				cheer: { url: 'audio/cheering.mp3', volume: 0.1, loop: true },
				boo: { url: 'audio/booing.mp3', volume: 0.3 },
				konami: { url: 'audio/konami.mp3', volume: 0.3 },
			}

			// Load each sound with proper error handling
			for (const [name, options] of Object.entries(audioFiles)) {
				try {
					if (!PIXI.sound.exists(name)) {
						await PIXI.sound.add(name, {
							...options,
							preload: true,
							autoPlay: false,
						})
						console.log(`Loaded audio: ${name}`)
					}
				} catch (error) {
					console.warn(`Failed to load sound: ${name}`, error)
				}
			}

			// Resume audio context if suspended
			if (PIXI.sound.context?.state === 'suspended') {
				await PIXI.sound.context.resume()
			}

			// Verify all sounds loaded
			const loadedSounds = Object.keys(PIXI.sound._sounds)
			console.log('Loaded sounds:', loadedSounds)

			return true
		} catch (error) {
			console.warn('Failed to initialize audio:', error)
			return false
		}
	}

	// Update sound playback functions
	async playFlapSound() {
		if (!PIXI.sound) return

		try {
			// Randomly select a clap sound from 1-9
			const randomClap = Math.floor(Math.random() * 9) + 1
			const soundId = `clap${randomClap}`

			if (PIXI.sound.exists(soundId)) {
				PIXI.sound.play(soundId, {
					volume: 0.3,
					singleInstance: true,
				})
			}
		} catch (error) {
			console.warn('Error playing flap sound:', error)
		}
	}

	async playCheerSound() {
		if (!PIXI.sound) return

		try {
			stopCheerSound()
			if (PIXI.sound.exists('cheer')) {
				cheerSound = PIXI.sound.play('cheer', {
					volume: 0.1,
					loop: true,
				})
			}
		} catch (error) {
			console.warn('Error playing cheer sound:', error)
		}
	}

	async playKnockoutSound() {
		if (!PIXI.sound) return

		try {
			stopCheerSound()
			if (PIXI.sound.exists('boo')) {
				PIXI.sound.play('boo', {
					volume: 0.3,
					singleInstance: true,
				})
			}
		} catch (error) {
			console.warn('Error playing knockout sound:', error)
		}
	}

	// Add back the intersectRect function
	intersectRect(r1, r2) {
		return !(
			r2.x > r1.x + r1.width ||
			r2.x + r2.width < r1.x ||
			r2.y > r1.y + r1.height ||
			r2.y + r2.height < r1.y
		)
	}

	async drawTitleScreen() {
		try {
			console.log('Drawing title screen...')
			// Clear any existing HUD content with proper cleanup
			this.clearGameOverScreen()

			// Ensure app.ticker is valid
			if (!this.app || !this.app.ticker) {
				throw new Error('Invalid application state')
			}

			// Use screen dimensions to ensure canvas-relative positioning
			const width = this.screenWidth
			const height = this.screenHeight
			const maxWidth = width * 0.95
			const maxHeight = height * 0.95

			// Larger base font size - adjusted for text only
			const baseFontSize = Math.min(height / 10, width / 14)

			// Hide player/cheeks during title screen
			if (this.cheeks) this.cheeks.visible = false
			if (this.gloves) this.gloves.visible = false

			// Create separate containers for text and gloves
			const textContainer = new PIXI.Container()
			textContainer.name = 'titleTextContainer'

			// Title group
			const titleGroup = new PIXI.Container()
			titleGroup.name = 'titleGroup'

			// Create title text
			const title1 = new PIXI.Text('CLAPPY', {
				fontFamily: 'Press Start 2P, Arial',
				fontSize: baseFontSize,
				fill: 0xffa500,
				align: 'center',
				padding: 4,
			})
			title1.anchor.set(0.5)
			title1.y = 0
			titleGroup.addChild(title1)

			const title2 = new PIXI.Text('CHEEKS!!', {
				fontFamily: 'Press Start 2P, Arial',
				fontSize: baseFontSize,
				fill: 0xffa500,
				align: 'center',
				padding: 4,
			})
			title2.anchor.set(0.5)
			title2.y = baseFontSize * 1.1
			titleGroup.addChild(title2)

			// Instructions
			const instr1 = new PIXI.Text('3 ROUNDS PER MATCH', {
				fontFamily: 'Press Start 2P, Arial',
				fontSize: baseFontSize * 0.4,
				fill: 0xffffff,
				align: 'center',
				padding: 4,
			})
			instr1.anchor.set(0.5)
			instr1.y = baseFontSize * 2.8
			titleGroup.addChild(instr1)

			const instr2 = new PIXI.Text('DODGE PUNCHES FOR POINTS', {
				fontFamily: 'Press Start 2P, Arial',
				fontSize: baseFontSize * 0.4,
				fill: 0xffffff,
				align: 'center',
				padding: 4,
			})
			instr2.anchor.set(0.5)
			instr2.y = baseFontSize * 3.4
			titleGroup.addChild(instr2)

			// Create press space group
			const pressSpaceGroup = new PIXI.Container()
			pressSpaceGroup.name = 'pressSpaceGroup'
			pressSpaceGroup.y = baseFontSize * 4.5

			// Create press space text
			const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
			const pressText = new PIXI.Text(
				isMobile ? 'TAP TO START' : 'PRESS SPACE',
				{
					fontFamily: 'Press Start 2P, Arial',
					fontSize: baseFontSize * 0.5,
					fill: 0xff0000,
					align: 'center',
					padding: 4,
				}
			)
			pressText.anchor.set(0.5)
			pressSpaceGroup.addChild(pressText)

			// Add decorative gloves
			const armTexture = PIXI.Assets.get('arm')
			if (armTexture) {
				const gloveSize = baseFontSize * 1.5
				const gloveSpacing = pressText.width * 1.5

				// Left glove
				const leftGlove = new PIXI.Sprite(armTexture)
				leftGlove.anchor.set(0.5)
				leftGlove.x = -gloveSpacing / 2
				leftGlove.y = pressText.height / 4
				leftGlove.angle = 90
				leftGlove.scale.x = -1
				leftGlove.width = gloveSize
				leftGlove.height = (gloveSize / armTexture.width) * armTexture.height

				// Right glove
				const rightGlove = new PIXI.Sprite(armTexture)
				rightGlove.anchor.set(0.5)
				rightGlove.x = gloveSpacing / 2
				rightGlove.y = pressText.height / 4
				rightGlove.angle = -90
				rightGlove.width = gloveSize
				rightGlove.height = (gloveSize / armTexture.width) * armTexture.height

				pressSpaceGroup.addChild(leftGlove, rightGlove)

				try {
					// Create animation handler with proper cleanup checks
					const moveHandler = () => {
						// Check if container is still in the display list
						if (!pressSpaceGroup.parent) {
							if (pressSpaceGroup._animationFrameId) {
								cancelAnimationFrame(pressSpaceGroup._animationFrameId)
								pressSpaceGroup._animationFrameId = null
							}
							return
						}

						if (this.isIdle) return

						const time = performance.now()
						const step = Math.floor(time / 500) % 2 // Slower blink

						// Only update if objects still exist and are in the display list
						if (pressText?.parent && pressText.style) {
							pressText.style.fill = step ? 0xff0000 : 0xffffff
						}

						const moveAmount = step ? gloveSize * 0.2 : 0
						if (leftGlove?.parent && rightGlove?.parent) {
							leftGlove.x = -gloveSpacing / 2 - moveAmount
							rightGlove.x = gloveSpacing / 2 + moveAmount
						} else {
							// If gloves are gone, stop animation
							if (pressSpaceGroup._animationFrameId) {
								cancelAnimationFrame(pressSpaceGroup._animationFrameId)
								pressSpaceGroup._animationFrameId = null
							}
						}
					}

					// Store handler reference for cleanup
					pressSpaceGroup._moveHandler = moveHandler

					// Use requestAnimationFrame for smoother animation
					let animationFrameId
					const animate = () => {
						if (!pressSpaceGroup.parent) {
							cancelAnimationFrame(animationFrameId)
							pressSpaceGroup._animationFrameId = null
							return
						}
						moveHandler()
						animationFrameId = requestAnimationFrame(animate)
					}
					animationFrameId = requestAnimationFrame(animate)

					// Store animation frame ID for cleanup
					pressSpaceGroup._animationFrameId = animationFrameId
				} catch (error) {
					console.warn('Failed to setup animation:', error)
					// Continue without animation if it fails
				}
			}

			titleGroup.addChild(pressSpaceGroup)
			textContainer.addChild(titleGroup)

			// Position and scale text container
			textContainer.x = width / 2
			textContainer.y = height * 0.25

			// Add containers to HUD
			this.hud.addChild(textContainer)

			// Draw copyright
			await this.drawCopyright()

			console.log('Title screen drawing complete')
		} catch (error) {
			console.error('Error drawing title screen:', error)
			this.showErrorScreen('Error drawing title screen: ' + error.message)
		}
	}

	async drawCopyright() {
		const width = this.screenWidth
		const height = this.screenHeight
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

		const copyright = await this.createText(copyrightText, {
			fontFamily: this.defaultTextStyle.fontFamily,
			fontSize: baseFontSize,
			fill: textColor,
			align: 'center',
		})

		if (copyright) {
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
	}

	async createText(text, style = {}) {
		if (!this.defaultTextStyle) {
			console.warn('Default text style not initialized')
			return null
		}

		try {
			// Merge with default style and ensure fallback fonts
			const mergedStyle = {
				...this.defaultTextStyle,
				...style,
				fontFamily: style.fontFamily || this.defaultTextStyle.fontFamily,
				fontSize: style.fontSize || this.defaultTextStyle.fontSize,
				fill: style.fill || this.defaultTextStyle.fill,
				align: style.align || this.defaultTextStyle.align,
				wordWrap: style.wordWrap || false,
				wordWrapWidth: style.wordWrapWidth || 0,
				letterSpacing: style.letterSpacing || 0,
				padding: style.padding || 2,
			}

			// Create text with error handling
			const textObj = new PIXI.Text(text, mergedStyle)
			if (!textObj) {
				console.warn('Failed to create text object')
				return null
			}

			// Wait for texture to be created
			await new Promise((resolve) => requestAnimationFrame(resolve))

			// Validate texture
			if (!textObj.texture || !textObj.texture.valid) {
				console.warn('Invalid text texture')
				return null
			}

			// Force immediate texture update
			textObj.updateText(true)

			// Cache as bitmap for better performance
			textObj.cacheAsBitmap = true

			return textObj
		} catch (error) {
			console.warn('Error creating text:', error)
			return null
		}
	}

	updateGloves(delta) {
		const speed =
			GLOVE_SPEED * gameState.gameSpeed * delta * (this.screenWidth / 1000)

		// Move existing gloves
		this.gloves.pairs.forEach((pair) => {
			pair.x -= speed
		})

		// Remove off-screen gloves
		for (let i = this.gloves.pairs.length - 1; i >= 0; i--) {
			const pair = this.gloves.pairs[i]
			if (pair.x + ARM_SCALE <= 0) {
				this.gloves.removeChild(pair)
				this.gloves.pairs.splice(i, 1)
			}
		}

		// Spawn new gloves if needed
		const lastPair = this.gloves.pairs[this.gloves.pairs.length - 1]
		if (!lastPair || lastPair.x <= this.screenWidth * SPAWN_OFFSET) {
			this.spawnGloves()
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

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
	console.log('DOM loaded, waiting for power-on...')

	// Initialize game after power-on sequence
	const initGame = async () => {
		try {
			console.log('Creating game instance...')
			const gameInstance = new Game()
			window.game = gameInstance

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
