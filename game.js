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

// Track loaded images
let loadedImages = 0
const totalImages = 2

function handleImageLoad() {
	loadedImages++
	if (loadedImages === totalImages) {
		startGame()
	}
}

// Set up image loading
cheeksImage.onload = handleImageLoad
armImage.onload = handleImageLoad

cheeksImage.src = 'images/cheeks.png'
armImage.src = 'images/arm.png'

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

// Set cheer volume lower and make it loop
gameAudio.cheer.volume = 0.3
gameAudio.cheer.loop = true

// Load clap sounds
for (let i = 1; i <= 9; i++) {
	const sound = new Audio(`audio/claps/clap${i}.wav`)
	clapSounds.push(sound)
}

let currentClapSound = 0

// Add sound functions
function playFlapSound() {
	clapSounds[currentClapSound].currentTime = 0
	clapSounds[currentClapSound].play()
	currentClapSound = (currentClapSound + 1) % clapSounds.length
}

function playCheerSound() {
	gameAudio.cheer.currentTime = 0
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
	// Dark background base
	ctx.fillStyle = '#000000'
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	// Crowd section (top third)
	const crowdHeight = canvas.height / 3

	// Crowd gradient background
	const crowdGradient = ctx.createLinearGradient(0, 0, 0, crowdHeight)
	crowdGradient.addColorStop(0, '#000022')
	crowdGradient.addColorStop(1, '#000044')
	ctx.fillStyle = crowdGradient
	ctx.fillRect(0, 0, canvas.width, crowdHeight)

	// Crowd dots (more like Punch-Out!!)
	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
	for (let row = 0; row < 12; row++) {
		for (let col = 0; col < canvas.width / 8; col++) {
			if ((row + col) % 2 === 0) {
				ctx.fillRect(col * 8, row * 8, 4, 4)
			}
		}
	}

	// Ring floor (darker green like original)
	ctx.fillStyle = '#003300'
	ctx.fillRect(0, crowdHeight, canvas.width, canvas.height - crowdHeight)

	// Ring mat pattern (more authentic)
	ctx.strokeStyle = '#004400'
	ctx.lineWidth = 2
	const matSize = 40
	for (let x = 0; x < canvas.width; x += matSize) {
		for (let y = crowdHeight; y < canvas.height; y += matSize) {
			ctx.strokeRect(x, y, matSize, matSize)
		}
	}

	// Ring ropes (thicker, more prominent)
	const ropePositions = [crowdHeight, crowdHeight + 40, crowdHeight + 80]

	ropePositions.forEach((y) => {
		// Rope shadow
		ctx.strokeStyle = '#002200'
		ctx.lineWidth = 8
		ctx.beginPath()
		ctx.moveTo(0, y + 4)
		ctx.lineTo(canvas.width, y + 4)
		ctx.stroke()

		// Main rope
		ctx.strokeStyle = '#FFFFFF'
		ctx.lineWidth = 8
		ctx.beginPath()
		ctx.moveTo(0, y)
		ctx.lineTo(canvas.width, y)
		ctx.stroke()
	})

	// Ring posts (taller and more defined)
	const postWidth = 30
	const postHeight = 160

	function drawPost(x, shadow = false) {
		// Post gradient
		const postGradient = ctx.createLinearGradient(x, 0, x + postWidth, 0)
		postGradient.addColorStop(0, shadow ? '#880000' : '#CC0000')
		postGradient.addColorStop(1, shadow ? '#AA0000' : '#FF0000')

		ctx.fillStyle = postGradient
		ctx.fillRect(x, crowdHeight - postHeight, postWidth, postHeight)

		// Post highlight
		ctx.fillStyle = shadow ? '#660000' : '#FF2222'
		ctx.fillRect(
			x + (shadow ? 0 : postWidth - 6),
			crowdHeight - postHeight,
			6,
			postHeight
		)
	}

	// Draw posts
	drawPost(0, true) // Left post with shadow
	drawPost(canvas.width - postWidth) // Right post
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

		ctx.fillStyle = '#000000'
		ctx.font = `48px "Press Start 2P"`
		ctx.textAlign = 'center'
		ctx.fillText('CLAPPY', canvas.width / 2 + 4, canvas.height / 3 + 4)
		ctx.fillText('CHEEKS', canvas.width / 2 + 4, canvas.height / 3 + 52)

		ctx.fillStyle = '#FF9C00'
		ctx.fillText('CLAPPY', canvas.width / 2, canvas.height / 3)
		ctx.fillText('CHEEKS', canvas.width / 2, canvas.height / 3 + 48)

		ctx.fillStyle = '#FFFFFF'
		ctx.font = '24px "Press Start 2P"'
		ctx.fillText(
			'CREDITS: ' + credits,
			canvas.width / 2,
			(canvas.height * 2) / 3
		)

		if (credits > 0) {
			if (Math.floor(Date.now() / 500) % 2) {
				ctx.fillText(
					'PRESS SPACE',
					canvas.width / 2,
					(canvas.height * 2) / 3 + 40
				)
			}
		}

		drawCopyright() // Add copyright to title screen
	} else if (gameOver) {
		// Game over screen
		drawBackground()
		if (Date.now() - knockoutTime > 1500) {
			ctx.fillStyle = '#FF0000'
			ctx.font = '36px "Press Start 2P"'
			ctx.textAlign = 'center'
			ctx.fillText('T.K.O.!!', canvas.width / 2, canvas.height / 3)

			ctx.fillStyle = '#FFFFFF'
			ctx.font = '24px "Press Start 2P"'
			ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2)
			ctx.fillText(
				`CREDITS: ${credits}`,
				canvas.width / 2,
				canvas.height / 2 + 40
			)

			if (credits > 0) {
				if (Math.floor(Date.now() / 500) % 2) {
					ctx.fillText('PRESS SPACE', canvas.width / 2, (canvas.height * 2) / 3)
				}
			}

			drawCopyright() // Add copyright to game over screen
		}
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

// Add this function to draw copyright
function drawCopyright() {
	ctx.fillStyle = '#666666'
	ctx.font = '16px "Press Start 2P"'
	ctx.textAlign = 'center'
	ctx.fillText('not © 2024', canvas.width / 2, canvas.height - 30)

	// Draw FWD:FWD:FWD in gold
	ctx.fillStyle = '#FF9C00'
	ctx.fillText('Fwd:Fwd:Fwd:', canvas.width / 2, canvas.height - 10)
}

// Add after canvas initialization
function resizeGame() {
	const container = canvas.parentElement
	const windowRatio = container.clientWidth / container.clientHeight
	const gameRatio = canvas.width / canvas.height

	let newWidth, newHeight

	if (windowRatio < gameRatio) {
		// Window is taller than game ratio - fit to width
		newWidth = container.clientWidth
		newHeight = newWidth / gameRatio
	} else {
		// Window is wider than game ratio - fit to height
		newHeight = container.clientHeight
		newWidth = newHeight * gameRatio
	}

	canvas.style.width = `${newWidth}px`
	canvas.style.height = `${newHeight}px`
}

// Call on load and window resize
window.addEventListener('load', resizeGame)
window.addEventListener('resize', resizeGame)
