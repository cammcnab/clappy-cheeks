// Vertex shader for CRT effect
const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    
    varying vec2 vTextureCoord;
    
    uniform float uScale;
    
    void main() {
        // Scale from center
        vec2 position = aVertexPosition.xy;
        position = position * 1.2;  // Increase base size
        gl_Position = vec4(position.x, -position.y, 0.0, 1.0);
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
    const float RGB_OFFSET = 0.0013;
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
    
    // Screen curvature with increased distortion
    vec2 curveRemapUV(vec2 uv) {
        // Apply barrel distortion
        vec2 coord = uv * 2.0 - 1.0;
        float rsq = coord.x * coord.x + coord.y * coord.y;
        coord += coord * (rsq * DISTORTION);
        
        // Apply screen curve
        vec2 offset = abs(coord.yx) / vec2(CURVATURE);
        coord += coord * offset * offset * 0.5;
        
        // Scale to fit
        coord *= 0.98;  // Increased from 0.975 to show slightly more content
        
        return coord * 0.5 + 0.5;
    }
    
    // Corner masking with proper rounding
    float crtMask(vec2 coord) {
        vec2 uv = coord * 2.0 - 1.0;
        vec2 abs_uv = abs(uv);
        
        // Calculate rounded corners
        vec2 corner_dist = max(abs_uv - vec2(1.0 - CORNER_RADIUS), 0.0);
        float corner_len = length(corner_dist);
        
        // Smooth corner transition
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
        
        // Main scanlines
        float scan1 = sin(uv.y * uResolution.y * 1.0 + time_factor) * 0.5 + 0.5;
        float scan2 = sin(uv.y * uResolution.y * 2.0 + time_factor * 1.1) * 0.3 + 0.7;
        
        // Finer scanlines for more detail
        float fineScan = sin(uv.y * uResolution.y * 4.0 + time_factor * 0.5) * 0.2 + 0.8;
        
        // Combine different scanline patterns
        float scan_mix = mix(scan1, scan2, 0.5) * fineScan;
        
        // Add slight horizontal variation
        float horizontalVariation = sin(uv.x * uResolution.x * 0.2 - time_factor) * 0.02;
        
        return mix(1.0, scan_mix + horizontalVariation, SCANLINE_INTENSITY);
    }
    
    // Enhanced RGB split with stronger chromatic aberration
    vec3 rgbSplit(sampler2D tex, vec2 uv) {
        // Dynamic offset based on distance from center
        vec2 center = vec2(0.5, 0.5);
        vec2 toCenter = uv - center;
        float distFromCenter = length(toCenter) * 2.0;
        float dynamicOffset = RGB_OFFSET * (1.0 + distFromCenter * 0.5);
        
        // Apply radial offset
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
        
        // Define kernel weights individually for WebGL1 compatibility
        float k00 = 0.0625; float k01 = 0.125; float k02 = 0.0625;
        float k10 = 0.125;  float k11 = 0.25;  float k12 = 0.125;
        float k20 = 0.0625; float k21 = 0.125; float k22 = 0.0625;
        
        // Unrolled 3x3 convolution for compatibility
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
        
        // Apply phosphor blur first
        vec3 col = blur(uSampler, uv, uResolution);
        
        // Apply RGB split after blur
        vec3 rgbSplitColor = rgbSplit(uSampler, uv);
        col = mix(col, rgbSplitColor, 0.7);
        
        // Apply all effects in sequence
        float scanlineEffect = scanline(uv);
        float vignetteEffect = mix(1.0, vignette(uv), VIGNETTE_INTENSITY);
        float screenNoiseEffect = noise(uv, uTime);
        
        // Combine all effects
        col *= scanlineEffect;
        col *= vignetteEffect;
        col *= BRIGHTNESS;
        col += vec3(screenNoiseEffect) * NOISE_INTENSITY;
        
        // Enhanced bloom with larger radius
        vec2 pixelSize = 1.0 / uResolution;
        vec3 bloom = vec3(0.0);
        float bloomStrength = 0.45;
        
        // Unrolled 5x5 bloom for compatibility
        for(float i = -2.0; i <= 2.0; i += 1.0) {
            for(float j = -2.0; j <= 2.0; j += 1.0) {
                vec2 offset = vec2(i, j) * pixelSize * BLUR_AMOUNT;
                bloom += rgbSplit(uSampler, uv + offset).rgb;
            }
        }
        bloom /= 25.0;
        
        // Mix the bloom with the main color
        col += bloom * bloomStrength;
        
        // Slightly soften the final result
        col = mix(col, bloom, 0.1);
        
        // Final output with mask
        gl_FragColor = vec4(col, mask);
    }
`

// WebGL initialization and helper functions
class CRTEffect {
	constructor(canvas) {
		this.canvas = canvas

		// Try to get WebGL2 context first, then fall back to WebGL1
		this.gl =
			canvas.getContext('webgl2', {
				alpha: true,
				antialias: false,
				depth: false,
				preserveDrawingBuffer: false,
				powerPreference: 'high-performance',
				failIfMajorPerformanceCaveat: false, // Important for mobile support
			}) ||
			canvas.getContext('webgl', {
				alpha: true,
				antialias: false,
				depth: false,
				preserveDrawingBuffer: false,
				powerPreference: 'high-performance',
				failIfMajorPerformanceCaveat: false, // Important for mobile support
			})

		if (!this.gl) {
			console.error('WebGL not supported')
			return
		}

		// Log WebGL context info
		console.log('WebGL context:', {
			version: this.gl instanceof WebGL2RenderingContext ? '2.0' : '1.0',
			vendor: this.gl.getParameter(this.gl.VENDOR),
			renderer: this.gl.getParameter(this.gl.RENDERER),
			maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
		})

		// Handle high DPI displays
		this.handleResize = this.handleResize.bind(this)
		window.addEventListener('resize', this.handleResize)
		this.handleResize()

		this.initShaders()
		this.initBuffers()
		this.createTexture()

		// Start time for animation effects
		this.startTime = Date.now()
	}

	handleResize() {
		if (!this.canvas || !this.gl) return

		const dpr = window.devicePixelRatio || 1
		const displayWidth = Math.floor(this.canvas.clientWidth * dpr)
		const displayHeight = Math.floor(this.canvas.clientHeight * dpr)

		// Only update if dimensions have changed
		if (
			this.canvas.width !== displayWidth ||
			this.canvas.height !== displayHeight
		) {
			// Set canvas buffer size
			this.canvas.width = displayWidth
			this.canvas.height = displayHeight

			// Update WebGL viewport
			this.gl.viewport(0, 0, displayWidth, displayHeight)

			console.log('CRT canvas resized:', {
				displaySize: `${this.canvas.clientWidth}x${this.canvas.clientHeight}`,
				actualSize: `${displayWidth}x${displayHeight}`,
				dpr: dpr,
			})
		}
	}

	initShaders() {
		const gl = this.gl

		// Create shader program
		const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource)
		const fragmentShader = this.createShader(
			gl.FRAGMENT_SHADER,
			fragmentShaderSource
		)

		this.program = gl.createProgram()
		gl.attachShader(this.program, vertexShader)
		gl.attachShader(this.program, fragmentShader)
		gl.linkProgram(this.program)

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			console.error('Unable to initialize shader program')
			return
		}

		// Get attribute and uniform locations
		this.positionLocation = gl.getAttribLocation(
			this.program,
			'aVertexPosition'
		)
		this.texcoordLocation = gl.getAttribLocation(this.program, 'aTextureCoord')
		this.resolutionLocation = gl.getUniformLocation(this.program, 'uResolution')
		this.timeLocation = gl.getUniformLocation(this.program, 'uTime')
		this.scaleLocation = gl.getUniformLocation(this.program, 'uScale') // Add scale uniform location
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

	initBuffers() {
		const gl = this.gl

		// Create position buffer with larger coordinates
		const positions = new Float32Array([
			-1.0,
			-1.0, // Bottom left
			1.0,
			-1.0, // Bottom right
			-1.0,
			1.0, // Top left
			1.0,
			1.0, // Top right
		])

		this.positionBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

		// Create texture coordinate buffer
		const texcoords = new Float32Array([
			0.0,
			0.0, // Bottom left
			1.0,
			0.0, // Bottom right
			0.0,
			1.0, // Top left
			1.0,
			1.0, // Top right
		])

		this.texcoordBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW)
	}

	createTexture() {
		const gl = this.gl
		this.texture = gl.createTexture()
		gl.bindTexture(gl.TEXTURE_2D, this.texture)

		// Set texture parameters
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	}

	render(sourceCanvas) {
		const gl = this.gl
		if (!gl) return

		// Update canvas size if needed
		this.handleResize()

		// Clear and set viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
		gl.clearColor(0.0, 0.0, 0.0, 1.0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		// Use shader program
		gl.useProgram(this.program)

		// Update uniforms
		gl.uniform2f(this.resolutionLocation, gl.canvas.width, gl.canvas.height)
		gl.uniform1f(this.timeLocation, (Date.now() - this.startTime) * 0.001)
		gl.uniform1f(this.scaleLocation, 1.0) // Keep scale at 1.0 since we're using vertex positions

		// Update texture with source canvas
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, this.texture)

		try {
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				sourceCanvas
			)
		} catch (error) {
			console.error('Error updating texture:', error)
			return
		}

		// Set up position attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.enableVertexAttribArray(this.positionLocation)
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

		// Set up texcoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer)
		gl.enableVertexAttribArray(this.texcoordLocation)
		gl.vertexAttribPointer(this.texcoordLocation, 2, gl.FLOAT, false, 0, 0)

		// Enable blending for proper alpha handling
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

		// Draw
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

		// Clean up
		gl.disableVertexAttribArray(this.positionLocation)
		gl.disableVertexAttribArray(this.texcoordLocation)
		gl.bindBuffer(gl.ARRAY_BUFFER, null)
		gl.bindTexture(gl.TEXTURE_2D, null)
	}
}

// Export the CRTEffect class
export { CRTEffect }
