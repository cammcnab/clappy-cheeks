// Vertex shader for CRT effect
const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying vec2 vTextureCoord;
    uniform float uScale;
    
    void main() {
        // Scale from center and flip Y coordinate for correct orientation
        vec2 position = aVertexPosition.xy;
        position = position * 1.2;  // Increase base size
        gl_Position = vec4(position.x, -position.y, 0.0, 1.0);  // Negate Y coordinate
        vTextureCoord = aTextureCoord;
    }
`

// Fragment shader for CRT effect
const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    uniform vec2 uResolution;
    uniform float uTime;

    // CRT parameters
    const float SCANLINE_INTENSITY = 0.15;
    const float CURVATURE = 3.5;
    const float BRIGHTNESS = 1.35;
    const float DISTORTION = 0.1;
    const float RGB_OFFSET = 0.002;
    const float CORNER_RADIUS = 0.15;
    const float CORNER_SMOOTHNESS = 0.15;
    const float VIGNETTE_INTENSITY = 0.6;
    const float NOISE_INTENSITY = 0.015;
    const float BLUR_AMOUNT = 0.7;
    const float PHOSPHOR_BLUR = 1.2;

    // Random function
    float rand(vec2 co) {
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    // Screen noise
    float noise(vec2 uv, float time) {
        vec2 noise_uv = uv * vec2(uResolution.x / 3.0, uResolution.y / 3.0);
        float noise = rand(noise_uv + vec2(time * 0.1, 0.0));
        return noise;
    }

    // Screen curvature
    vec2 curveRemapUV(vec2 uv) {
        vec2 coord = uv * 2.0 - 1.0;
        float rsq = coord.x * coord.x + coord.y * coord.y;
        coord += coord * (rsq * DISTORTION);
        vec2 offset = abs(coord.yx) / vec2(CURVATURE);
        coord += coord * offset * offset * 0.5;
        coord *= 0.98;
        return coord * 0.5 + 0.5;
    }

    // Corner masking
    float crtMask(vec2 coord) {
        vec2 uv = coord * 2.0 - 1.0;
        vec2 abs_uv = abs(uv);
        vec2 corner_dist = max(abs_uv - vec2(1.0 - CORNER_RADIUS), 0.0);
        float corner_len = length(corner_dist);
        return smoothstep(0.0, CORNER_SMOOTHNESS, 1.0 - corner_len / CORNER_RADIUS);
    }

    // Enhanced vignette effect
    float vignette(vec2 uv) {
        uv = uv * 2.0 - 1.0;
        float vignette = 1.0 - length(uv * vec2(0.49, 0.56));
        return smoothstep(0.2, 1.3, pow(vignette, 1.1));
    }

    // Enhanced scanline effect with subtle animation
    float scanline(vec2 uv) {
        float time_factor = uTime * 0.5;
        float scan1 = sin(uv.y * uResolution.y * 1.0 + time_factor) * 0.5 + 0.5;
        float scan2 = sin(uv.y * uResolution.y * 2.0 + time_factor * 1.1) * 0.3 + 0.7;
        float fineScan = sin(uv.y * uResolution.y * 4.0 + time_factor * 0.5) * 0.2 + 0.8;
        float scan_mix = mix(scan1, scan2, 0.5) * fineScan;
        float horizontalVariation = sin(uv.x * uResolution.x * 0.2 - time_factor) * 0.02;
        return mix(1.0, scan_mix + horizontalVariation, SCANLINE_INTENSITY);
    }

    // Enhanced RGB split with stronger chromatic aberration
    vec3 rgbSplit(sampler2D tex, vec2 uv) {
        vec2 center = vec2(0.5, 0.5);
        vec2 toCenter = uv - center;
        float distFromCenter = length(toCenter) * 2.0;
        float dynamicOffset = RGB_OFFSET * (1.0 + distFromCenter * 0.5);
        vec2 redOffset = normalize(toCenter) * dynamicOffset;
        vec2 blueOffset = -redOffset;
        float red = texture2D(tex, uv + redOffset).r;
        float green = texture2D(tex, uv).g;
        float blue = texture2D(tex, uv + blueOffset).b;
        return vec3(red, green, blue);
    }

    // Gaussian blur approximation
    vec3 blur(sampler2D tex, vec2 uv, vec2 resolution) {
        vec2 pixel = vec2(1.0) / resolution;
        vec3 color = vec3(0.0);
        float k00 = 0.0625; float k01 = 0.125; float k02 = 0.0625;
        float k10 = 0.125;  float k11 = 0.25;  float k12 = 0.125;
        float k20 = 0.0625; float k21 = 0.125; float k22 = 0.0625;
        color += rgbSplit(tex, uv + vec2(-1.0, -1.0) * pixel * PHOSPHOR_BLUR).rgb * k00;
        color += rgbSplit(tex, uv + vec2( 0.0, -1.0) * pixel * PHOSPHOR_BLUR).rgb * k01;
        color += rgbSplit(tex, uv + vec2( 1.0, -1.0) * pixel * PHOSPHOR_BLUR).rgb * k02;
        color += rgbSplit(tex, uv + vec2(-1.0,  0.0) * pixel * PHOSPHOR_BLUR).rgb * k10;
        color += rgbSplit(tex, uv + vec2( 0.0,  0.0) * pixel * PHOSPHOR_BLUR).rgb * k11;
        color += rgbSplit(tex, uv + vec2( 1.0,  0.0) * pixel * PHOSPHOR_BLUR).rgb * k12;
        color += rgbSplit(tex, uv + vec2(-1.0,  1.0) * pixel * PHOSPHOR_BLUR).rgb * k20;
        color += rgbSplit(tex, uv + vec2( 0.0,  1.0) * pixel * PHOSPHOR_BLUR).rgb * k21;
        color += rgbSplit(tex, uv + vec2( 1.0,  1.0) * pixel * PHOSPHOR_BLUR).rgb * k22;
        return color;
    }

    void main() {
        float mask = crtMask(vTextureCoord);
        if (mask <= 0.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec2 uv = curveRemapUV(vTextureCoord);
        
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec3 col = blur(uSampler, uv, uResolution);
        vec3 rgbSplitColor = rgbSplit(uSampler, uv);
        col = mix(col, rgbSplitColor, 0.7);
        float scanlineEffect = scanline(uv);
        float vignetteEffect = mix(1.0, vignette(uv), VIGNETTE_INTENSITY);
        float screenNoiseEffect = noise(uv, uTime);
        col *= scanlineEffect;
        col *= vignetteEffect;
        col *= BRIGHTNESS;
        col += vec3(screenNoiseEffect) * NOISE_INTENSITY;
        vec2 pixelSize = 1.0 / uResolution;
        vec3 bloom = vec3(0.0);
        float bloomStrength = 0.45;
        for(float i = -2.0; i <= 2.0; i += 1.0) {
            for(float j = -2.0; j <= 2.0; j += 1.0) {
                vec2 offset = vec2(i, j) * pixelSize * BLUR_AMOUNT;
                bloom += rgbSplit(uSampler, uv + offset).rgb;
            }
        }
        bloom /= 25.0;
        col += bloom * bloomStrength;
        col = mix(col, bloom, 0.1);
        gl_FragColor = vec4(col, mask);
    }
`

// WebGL initialization with optimized settings
function initWebGL(canvas) {
	const contextAttributes = {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: false,
	}

	const gl =
		canvas.getContext('webgl', contextAttributes) ||
		canvas.getContext('experimental-webgl', contextAttributes)

	if (!gl) {
		throw new Error('WebGL not supported')
	}

	// Disable unnecessary features
	gl.disable(gl.DEPTH_TEST)
	gl.disable(gl.CULL_FACE)
	gl.disable(gl.DITHER)
	gl.disable(gl.STENCIL_TEST)
	gl.disable(gl.SCISSOR_TEST)

	// Enable blend mode once and keep it consistent
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

	return gl
}

// CRT effect with optimized shader code
export class CRTEffect {
	constructor(canvas) {
		this.gl = initWebGL(canvas)
		this.canvas = canvas
		this.startTime = Date.now()
		this.initShaders()
		this.initBuffers()
		this.initTexture()
	}

	createShader(type, source) {
		const gl = this.gl
		const shader = gl.createShader(type)
		gl.shaderSource(shader, source)
		gl.compileShader(shader)

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader compile error:', gl.getShaderInfoLog(shader))
			gl.deleteShader(shader)
			return null
		}

		return shader
	}

	createProgram(vertexShader, fragmentShader) {
		const gl = this.gl
		const program = gl.createProgram()
		gl.attachShader(program, vertexShader)
		gl.attachShader(program, fragmentShader)
		gl.linkProgram(program)

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('Program link error:', gl.getProgramInfoLog(program))
			return null
		}

		return program
	}

	initShaders() {
		const gl = this.gl

		// Create shader program
		const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource)
		const fragmentShader = this.createShader(
			gl.FRAGMENT_SHADER,
			fragmentShaderSource
		)
		this.program = this.createProgram(vertexShader, fragmentShader)

		if (!this.program) {
			throw new Error('Failed to create shader program')
		}

		// Get attribute locations
		this.positionLocation = gl.getAttribLocation(
			this.program,
			'aVertexPosition'
		)
		this.texCoordLocation = gl.getAttribLocation(this.program, 'aTextureCoord')

		// Get uniform locations
		this.resolutionLocation = gl.getUniformLocation(this.program, 'uResolution')
		this.timeLocation = gl.getUniformLocation(this.program, 'uTime')
		this.samplerLocation = gl.getUniformLocation(this.program, 'uSampler')
		this.scaleLocation = gl.getUniformLocation(this.program, 'uScale')
	}

	initBuffers() {
		const gl = this.gl

		// Create position buffer
		const positions = new Float32Array([
			-1.0,
			-1.0,
			0.0,
			1.0, // Bottom left
			1.0,
			-1.0,
			0.0,
			1.0, // Bottom right
			-1.0,
			1.0,
			0.0,
			1.0, // Top left
			1.0,
			1.0,
			0.0,
			1.0, // Top right
		])

		this.positionBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

		// Create texture coordinate buffer
		const texCoords = new Float32Array([
			0.0,
			0.0, // Bottom left
			1.0,
			0.0, // Bottom right
			0.0,
			1.0, // Top left
			1.0,
			1.0, // Top right
		])

		this.texCoordBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
	}

	initTexture() {
		const gl = this.gl
		this.texture = gl.createTexture()
		gl.bindTexture(gl.TEXTURE_2D, this.texture)

		// Set texture parameters
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	}

	render(sourceCanvas, isMobile = false) {
		const gl = this.gl
		if (!gl || !this.program) return

		// Set viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

		// Clear canvas
		gl.clearColor(0.0, 0.0, 0.0, 1.0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		// Use shader program
		gl.useProgram(this.program)

		// Set uniforms
		gl.uniform2f(this.resolutionLocation, gl.canvas.width, gl.canvas.height)
		gl.uniform1f(this.timeLocation, (Date.now() - this.startTime) * 0.001)
		gl.uniform1f(this.scaleLocation, 1.0)
		gl.uniform1i(this.samplerLocation, 0)

		// Update texture with source canvas
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, this.texture)
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			sourceCanvas
		)

		// Set up position attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.enableVertexAttribArray(this.positionLocation)
		gl.vertexAttribPointer(this.positionLocation, 4, gl.FLOAT, false, 0, 0)

		// Set up texcoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
		gl.enableVertexAttribArray(this.texCoordLocation)
		gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0)

		// Draw
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

		// Clean up
		gl.disableVertexAttribArray(this.positionLocation)
		gl.disableVertexAttribArray(this.texCoordLocation)
		gl.bindBuffer(gl.ARRAY_BUFFER, null)
		gl.bindTexture(gl.TEXTURE_2D, null)
	}
}
