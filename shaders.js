// Vertex shader for CRT effect
const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    
    varying vec2 vTextureCoord;
    
    void main() {
        gl_Position = vec4(aVertexPosition.x, -aVertexPosition.y, aVertexPosition.z, aVertexPosition.w);
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
    const float SCANLINE_INTENSITY = 0.125;
    const float CURVATURE = 3.0;
    const float VIGNETTE_INTENSITY = 0.3;
    const float BRIGHTNESS = 1.5;
    const float DISTORTION = 0.12;
    const float RGB_OFFSET = 0.0012;
    
    // Helper function to create screen curvature
    vec2 curveRemapUV(vec2 uv) {
        vec2 coord = uv * 2.0 - 1.0;
        
        // Apply curve distortion
        vec2 offset = abs(coord.yx) / vec2(CURVATURE, CURVATURE);
        coord = coord + coord * offset * offset * 0.8;
        
        // Convert back to 0 to 1 space
        coord = coord * 0.5 + 0.5;
        
        return coord;
    }
    
    // Helper function to check if point is within CRT screen bounds
    float crtMask(vec2 coord) {
        vec2 uv = coord * 2.0 - 1.0;
        float cornerRadius = 0.1;
        vec2 abs_uv = abs(uv);
        vec2 dist = abs_uv - vec2(1.0 - cornerRadius);
        float outside = length(max(dist, 0.0)) / cornerRadius;
        float inside = min(max(dist.x, dist.y), 0.0);
        return 1.0 - smoothstep(0.0, 1.0, inside + outside);
    }
    
    // Vignette effect
    float vignette(vec2 uv) {
        uv = uv * 2.0 - 1.0;
        return pow(1.0 - length(uv * 0.8), 1.5);
    }
    
    // Scanline effect
    float scanline(vec2 uv) {
        return sin(uv.y * uResolution.y * 1.0) * SCANLINE_INTENSITY + (1.0 - SCANLINE_INTENSITY);
    }
    
    // RGB split
    vec3 rgbSplit(sampler2D tex, vec2 uv) {
        float red = texture2D(tex, vec2(uv.x + RGB_OFFSET, uv.y)).r;
        float green = texture2D(tex, uv).g;
        float blue = texture2D(tex, vec2(uv.x - RGB_OFFSET, uv.y)).b;
        return vec3(red, green, blue);
    }
    
    void main() {
        // First apply the CRT mask to determine if we should render
        float mask = crtMask(vTextureCoord);
        if (mask <= 0.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
        
        // Get distorted coordinates for valid pixels
        vec2 uv = curveRemapUV(vTextureCoord);
        
        // Check if UV coordinates are invalid from distortion
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
        
        // Get the color from the distorted coordinates
        vec3 col = rgbSplit(uSampler, uv);
        col *= scanline(uv);
        col *= mix(1.0, vignette(uv), VIGNETTE_INTENSITY);
        
        // Apply brightness and noise
        float noise = fract(sin(dot(uv + uTime * 0.001, vec2(12.9898, 78.233))) * 43758.5453);
        col *= BRIGHTNESS + noise * 0.02;
        
        // Apply the mask as an alpha value
        gl_FragColor = vec4(col, mask);
    }
`

// WebGL initialization and helper functions
class CRTEffect {
	constructor(canvas) {
		this.canvas = canvas
		this.gl = canvas.getContext('webgl')
		if (!this.gl) {
			console.error('WebGL not supported')
			return
		}

		this.initShaders()
		this.initBuffers()
		this.createTexture()

		// Start time for animation effects
		this.startTime = Date.now()
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

		// Create position buffer
		const positions = new Float32Array([
			-1.0,
			-1.0,
			1.0,
			-1.0,
			-1.0,
			1.0,
			1.0,
			1.0,
		])

		this.positionBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

		// Create texture coordinate buffer
		const texcoords = new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0])

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

		// Update texture with source canvas
		gl.bindTexture(gl.TEXTURE_2D, this.texture)
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			sourceCanvas
		)

		// Set viewport and clear
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
		gl.clear(gl.COLOR_BUFFER_BIT)

		// Use shader program
		gl.useProgram(this.program)

		// Set uniforms
		gl.uniform2f(this.resolutionLocation, gl.canvas.width, gl.canvas.height)
		gl.uniform1f(this.timeLocation, Date.now() - this.startTime)

		// Set up position attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
		gl.enableVertexAttribArray(this.positionLocation)
		gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

		// Set up texcoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer)
		gl.enableVertexAttribArray(this.texcoordLocation)
		gl.vertexAttribPointer(this.texcoordLocation, 2, gl.FLOAT, false, 0, 0)

		// Draw
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
	}
}

// Export the CRTEffect class
export { CRTEffect }
