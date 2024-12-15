// Vertex shader for CRT effect
const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    
    varying vec2 vTextureCoord;
    
    void main() {
        gl_Position = aVertexPosition;
        vTextureCoord = vec2(aTextureCoord.x, 1.0 - aTextureCoord.y);
    }
`;

// Fragment shader for CRT effect
const fragmentShaderSource = `
    precision mediump float;
    
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    uniform vec2 uResolution;
    uniform float uTime;
    
    // CRT parameters
    const float SCANLINE_INTENSITY = 0.125;
    const float CURVATURE = 4.0;
    const float VIGNETTE_INTENSITY = 0.25;
    const float BRIGHTNESS = 1.1;
    const float DISTORTION = 0.2;
    const float RGB_OFFSET = 0.001;
    
    // Helper function to create screen curvature
    vec2 curveRemapUV(vec2 uv) {
        uv = uv * 2.0 - 1.0;
        vec2 offset = abs(uv.yx) / vec2(CURVATURE, CURVATURE);
        uv = uv + uv * offset * offset;
        uv = uv * 0.5 + 0.5;
        return uv;
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
        // Apply screen curvature
        vec2 uv = curveRemapUV(vTextureCoord);
        
        // Check if UV coordinates are outside the valid range
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
        
        // Apply RGB split
        vec3 col = rgbSplit(uSampler, uv);
        
        // Apply scanlines
        col *= scanline(uv);
        
        // Apply vignette
        col *= mix(1.0, vignette(uv), VIGNETTE_INTENSITY);
        
        // Apply brightness and random noise
        float noise = fract(sin(dot(uv + uTime * 0.001, vec2(12.9898, 78.233))) * 43758.5453);
        col *= BRIGHTNESS + noise * 0.02;
        
        // Output final color
        gl_FragColor = vec4(col, 1.0);
    }
`;

// WebGL initialization and helper functions
class CRTEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        this.initShaders();
        this.initBuffers();
        this.createTexture();
        
        // Start time for animation effects
        this.startTime = Date.now();
    }
    
    initShaders() {
        const gl = this.gl;
        
        // Create shader program
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Unable to initialize shader program');
            return;
        }
        
        // Get attribute and uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'aVertexPosition');
        this.texcoordLocation = gl.getAttribLocation(this.program, 'aTextureCoord');
        this.resolutionLocation = gl.getUniformLocation(this.program, 'uResolution');
        this.timeLocation = gl.getUniformLocation(this.program, 'uTime');
    }
    
    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    initBuffers() {
        const gl = this.gl;
        
        // Create position buffer
        const positions = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
             1.0,  1.0,
        ]);
        
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        // Create texture coordinate buffer
        const texcoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
        ]);
        
        this.texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);
    }
    
    createTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    
    render(sourceCanvas) {
        const gl = this.gl;
        
        // Update texture with source canvas
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        
        // Set viewport and clear
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Use shader program
        gl.useProgram(this.program);
        
        // Set uniforms
        gl.uniform2f(this.resolutionLocation, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(this.timeLocation, Date.now() - this.startTime);
        
        // Set up position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Set up texcoord attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.enableVertexAttribArray(this.texcoordLocation);
        gl.vertexAttribPointer(this.texcoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

// Export the CRTEffect class
export { CRTEffect }; 