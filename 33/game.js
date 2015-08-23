
var FOV = Math.PI/4;

var from = {
	eye: null,
	centre: null,
	up: null,
};
var to = {
	eye: null,
	centre: null,
	up: null,
};

var ticks_per_sec = 10;
var step_size = Math.trunc(1000/ticks_per_sec);
var max_step = step_size * ticks_per_sec * 0.5;
var last_tick;

function new_game() {
	 from.eye = to.eye = [0, 0.5, 2];
	 from.centre = to.centre = [0, 0, 12];
	 from.up = to.up = vec3_normalise([1, 1, 0]);
	 init_ball_points(20);
	 camera();
	 last_tick = now();
}

function update() {
	var now = window.now(), t = Math.min(max_step, now - last_tick);
	for(var i=0; i<t; i+=step_size) {
		tick(step_size);
	}
	t = now % step_size;
	last_tick = now - t;
	return t;
}

function tick(t) {
	from.eye = to.eye;
	from.centre = to.centre;
	from.up = to.up;
	// keys?
	var left = keys[37]||keys[65]||keys[97]; //left arrow or A
	var right = keys[39]||keys[68]||keys[100]; //right arrow or D
	var forward = keys[38]||keys[87]||keys[119]; //up arrow or W
	if(!left && !right && !forward) return;
	var d = vec3_sub(from.centre, from.eye);
	if(left && !right) to.up = vec3_rotate(from.up, 0.0001 * t, [0, 0, 0], d);
	if(right && !left) to.up = vec3_rotate(from.up, -0.0001 * t, [0, 0, 0], d);
	if(forward) {
		d = vec3_scale(d, 0.00001 * t);
		to.centre = vec3_add(from.centre, d);
		to.eye = vec3_add(from.eye, d);
	}
	camera();
}

function camera() {
	var avg = ball_point_search(to.eye, 0.4);
	if(avg) {
		var d = vec3_length(avg);
		var n = vec3_scale(avg, 1/d);
		to.up = n;
		var down = vec3_scale(to.up, -d + 0.1);
		to.eye = vec3_add(to.eye, down);
		to.centre = vec3_add(to.centre, down);
	}
}

var ball_points;

function init_ball_points(N) {
	var off = 2 / N;
	var inc =  Math.PI  * (3 - Math.sqrt(5));
	ball_points = [];
	for(var i=0; i<N; i++) {
	    var y = i * off - 1 + (off / 2);
	    var r = Math.sqrt(1 - y*y);
	    var phi = i * inc;
	    ball_points.push(vec3_normalise([Math.cos(phi)*r, y, Math.sin(phi)*r])); 
	}
}

function ball_point_search(p, thres) {
	var sum=[0, 0, 0], count=0;
	for(var i in ball_points) {
		i = ball_points[i];
		var dist = ray_march(p, vec3_add(p, i));
		if(dist < thres) {
			sum[0] += i[0] * dist;
			sum[1] += i[1] * dist;
			sum[2] += i[2] * dist;
			count++;
		}
	}
	return count? vec3_scale(sum, 1/count): null;
}

function ray_march(from, towards) { // same ray march as shader, transcribed to JS
	var freqA = 0.15;
	var freqB = 0.25;
	var ampA = 2.4;
	var ampB = 1.7;
	var tri1 = function(x) { return Math.abs(x-Math.floor(x)-.5); };
	var tri =  function(p) { return [tri1(p[0]), tri1(p[1]), tri1(p[2])]; }; // Triangle function.
	var surfFunc = function(p) {
		var t = tri(vec3_scale(p, 0.25));
		var n = vec3_dot(tri(vec3_add(vec3_scale(p,0.48),[t[1],t[2],t[0]])), [0.444,0.444,0.444]);
		p = [(p[0] + p[2]) * 0.7071, (p[2] - p[0]) * 0.7071, p[2]];
		t = tri(vec3_scale(p,0.36));
		return vec3_dot(tri(vec3_add(vec3_scale(p,0.72), [t[1],t[2],t[0]])), [0.222,0.222,0.222]) + n; // Range [0, 1]
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
	var rd = vec3_normalise(vec3_sub(towards, from));
	var t = 0.0, dt;
	for(var i=0; i<128; i++) {
		dt = map(vec3_add(from, vec3_scale(rd, t)));
		if(dt<0.005 || t>25.) break; 
		t += dt*0.75;
	}
	return t + dt;
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
	if(to.eye) { // game inited
		var t = update() / step_size;
		var eye = vec3_lerp(from.eye, to.eye, t);
		var centre = vec3_lerp(from.centre, to.centre, t);
		var up = vec3_lerp(from.up, to.up, t); // use quat
	}
	if(test_prog && tunnel_vbo) {
		test_prog(function(program) {
			gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);				
		}, {
			texture: test_tex,
		});
		return;
	}
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

var test_prog, test_tex;

function test_rays() { /* this verifies we have a sane ray_marching port */
	var W=320, H=200;
	var pixels = new Array(W*H*4), i=0;
	var forward = vec3_normalise(vec3_sub(from.centre, from.eye));
	var right = vec3_cross(forward, from.up);
	var iResolution = [1024, 1024], iResolutionY = 1/iResolution[1];
	var halfRes = vec2_scale(iResolution, 0.5);
	var iScreenScale = [iResolution[0]/W, iResolution[1]/H];
	for(var y=0; y<H; y++) {
		for(var x=0; x<W; x++) {
			var fragCoord = [(x + 0.5) * iScreenScale[0], (y + 0.5) * iScreenScale[1]];
			var uv = vec2_scale(vec2_sub(fragCoord, halfRes), iResolutionY);
			var rd = vec3_add(vec3_add(forward, vec3_scale(right, FOV*uv[0])), vec3_scale(from.up,FOV*uv[1]));
			var de = ray_march(from.eye, vec3_add(from.eye, rd));
			de *= 10; // from max ~25 to ~250
			pixels[i++] = de;
			pixels[i++] = de;
			pixels[i++] = de;
			pixels[i++] = 255;
		}
	}
	pixels = new Uint8Array(pixels);
	console.log(pixels);
	test_tex = createTexture(test_tex, W, H, pixels);
	test_prog = Program(
		"precision mediump float;\n"+
		"attribute vec3 vertex;\n"+
		"varying vec2 texCoord;\n"+
		"void main() {\n"+
		"	texCoord = vec2(vertex.x==1.?1.:0., vertex.y==1.?1.:0.);\n"+
		"	gl_Position = vec4(vertex,1.0);\n"+
		"}\n",
		"precision mediump float;\n"+
		"uniform sampler2D texture;\n"+
		"varying vec2 texCoord;\n"+
		"void main() {\n"+
		"	gl_FragColor = texture2D(texture, texCoord);\n"+
		"}\n");
}

