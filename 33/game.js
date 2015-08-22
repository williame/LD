
var eye, centre, up, FOV = Math.PI/4, lastTick;

function new_game() {
	 eye = [0, 0.5, 0];
	 centre = [0, 0, 10];
	 up = vec3_normalise([1, 1, 0]);
}

function move() {
	var now = window.now(), t = now - lastTick;
	if(t < 0.05) return;
	lastTick = now;
	var left = keys[37]||keys[65]||keys[97]; //left arrow or A
	var right = keys[39]||keys[68]||keys[100]; //right arrow or D
	var forward = keys[38]||keys[87]||keys[119]; //up arrow or W
	if(!left && !right && !forward) return;
	var d = vec3_sub(centre, eye);
	if(left && !right) up = vec3_rotate(up, 0.001 * t, [0, 0, 0], d);
	if(right && !left) up = vec3_rotate(up, -0.001 * t, [0, 0, 0], d);
	if(forward) {
		d = vec3_scale(d, 0.0001 * t);
		centre = vec3_add(centre, d);
		eye = vec3_add(eye, d);
	}
	console.log(de(eye, centre));
}

function de(eye, centre) { // same distance-estimator as shader, transcribed to JS
	var freqA = 0.15;
	var freqB = 0.25;
	var ampA = 2.4;
	var ampB = 1.7;
	var tri1 = function(x) { return Math.abs(x-Math.floor(x)-.5); };
	var tri =  function(p) { return [tri1(p[0]), tri1(p[1]), tri1(p[2])]; }; // Triangle function.
	var surfFunc = function(p) {
		var t = tri(vec3_scale(p, 0.25));
		var n = vec3_dot(tri(vec3_add(vec3_scale(p,0.48),[t[1],t[2],t[0]])), [0.444,0,0]);
		p = [(p[0] + p[2]) * 0.7071, (p[2] - p[0]) * 0.7071, p[2]];
		t = tri(vec3_scale(p,0.36));
		return vec3_dot(tri(vec3_add(vec3_scale(p,0.72), [t[1],t[2],t[0]])), [0.222,0,0]) + n; // Range [0, 1]
    	};
	var smoothMinP = function(a, b, smoothing) {
		var h = Math.max(Math.min(1, (b-a)*0.5/smoothing + 0.5), 0);
		return lerp(b, a, h) - smoothing*h*(1.0-h);
	};
	var path = function(z) { return [ampA*Math.sin(z * freqA), ampB*Math.cos(z * freqB)]; };
	var path2 = function(z) { return [ampB*Math.sin(z * freqB*1.5), ampA*Math.cos(z * freqA*1.3)]; };
	var map = function(p) {
	     var tun = vec2_sub(p, path(p[2]));
	     var tun2 = vec2_sub(p, path2(p[2]));
	     return 1.- smoothMinP(vec2_length(tun), vec2_length(tun2), 4.) + (0.5-surfFunc(p));
	};
	// Using the above to produce the unit ray-direction vector.
	var forward = vec3_normalise(vec3_sub(centre, eye));
	// rd - Ray direction.
	var rd = vec3_normalise(forward);
	// Standard ray marching routine 
	var t = 0.0, dt;
	for(var i=0; i<128; i++) {
		dt = map(vec3_add(eye, vec3_scale(rd, t)));
		if(dt<0.005 || t>150.) break; 
		t += dt*0.75;
	}
	return t;
}

var tunnel_prog, tunnel_vbo, tunnel_channel_0;

function init_render() {
	loadFile("shader", "tunnel", function(prog) { tunnel_prog = prog; });
	loadFile("image", "data/stone.jpg", function(tex) {
		tunnel_channel_0 = tex;
		gl.bindTexture(gl.TEXTURE_2D, tunnel_channel_0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	});
	tunnel_vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1, 1,1,1, -1,1,1, -1,-1,1, 1,-1,1, 1,1,1]), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function render() {
	move();
	if(tunnel_prog && tunnel_channel_0 && eye) {
		tunnel_prog(function(program) {
				gl.bindTexture(gl.TEXTURE_2D, tunnel_channel_0);
				gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
				gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
				gl.bindBuffer(gl.ARRAY_BUFFER, null);				
			}, {
				iResolution: [canvas.offsetWidth, canvas.offsetHeight], // based on window not canvas res
				iScreenScale: [canvas.offsetWidth/canvas.width, canvas.offsetHeight/canvas.height],
				iChannel0: tunnel_channel_0,
				iScale0: 0.7,
				iFOV: FOV,
				iEye: eye,
				iCentre: centre,
				iUp: up,
			});
	}
}

