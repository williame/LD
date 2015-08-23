
var FOV = Math.PI/2;

var from = {
	eye: null,
	centre: null,
	up: null,
	jaws: 0.5,
};
var to = {
	eye: null,
	centre: null,
	up: null,
	jaws: 0.5,
};

var game_z = 0;

var ships = [];

var ticks_per_sec = 10;
var step_size = Math.trunc(1000/ticks_per_sec);
var max_step = step_size * ticks_per_sec * 0.5;
var last_tick;
var speed_forward = 0.02, speed_turn = 0.0001;

function new_game() {
	 from.eye = to.eye = [0, 0.5, 2];
	 from.centre = to.centre = [0, 0, 12];
	 from.up = to.up = vec3_normalise([1, 1, 0]);
	 init_ball_points(20);
	 camera();
	 //test_rays();
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
	from.jaws = to.jaws;
	// biting?
	if(keys[32]) {
		if(to.jaws <= 0.5) {
			playSound(getFile("audio", "data/munch1.ogg"));
		}
		to.jaws = Math.min(7, to.jaws * 1.5);
	} else {
		to.jaws = Math.max(0.5, to.jaws * 0.9);
	}
	// move keys?
	var left = keys[37]||keys[65]||keys[97]; //left arrow or A
	var right = keys[39]||keys[68]||keys[100]; //right arrow or D
	var up = keys[38]||keys[87]||keys[119]; //up arrow or W
	var down = keys[40]||keys[83]||keys[115]; //down arrow or S
	if(!left && !right && !up && !down) return;
	if(up && !down) {
		game_z += speed_forward;
	}
	camera();
}

function camera() {
	var p = path(game_z);
	to.eye = [p[0], p[1], game_z];
	p = path(game_z + 0.1);
	to.centre = [p[0], p[1], game_z + 1];
	to.up = [0, 1, 0];
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
	    ball_points.push(vec3_normalise([Math.cos(phi)*r, y, Math.sin(phi)*r])); // actually already normalised
	}
}

function get_ball_points(p, smooth) {
	var nearest;
	var ret = [0]; // first slot is nearest_idx, thereafter actual dists 
	for(var i=0; i<ball_points.length; i++) {
		var dist = ray_march(p, vec3_add(p, ball_points[i]), smooth);
		ret.push(dist);
		if(!i || dist < nearest) {
			ret[0] = i;
			nearest = dist;
		}
	}
	return ret;
}

var freqA = 0.15, freqB = 0.25, ampA = 2.4, ampB = 1.7;

function path(z) { return [ampA*Math.sin(z * freqA), ampB*Math.cos(z * freqB)]; }

function path2(z) { return [ampB*Math.sin(z * freqB*1.5), ampA*Math.cos(z * freqA*1.3)]; }

function ray_march(from, towards, smooth) { // same ray march as shader, transcribed to JS
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
	var map = function(p) {
	     var tun = vec2_sub(p, path(p[2]));
	     var tun2 = vec2_sub(p, path2(p[2]));
	     return 1.- smoothMinP(vec2_length(tun), vec2_length(tun2), 4.) + (smooth? 0: 0.5-surfFunc(p));
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

var night_sky;

var ship_prog, ship_models = [];

function init_render() {
	// load tunnel
	loadFile("shader", "tunnel", function(prog) { tunnel_prog = prog; });
	loadFile("image", "data/stone2.jpg", function(tex) {
		tunnel_channel_0 = tex;
		gl.bindTexture(gl.TEXTURE_2D, tunnel_channel_0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	});
	tunnel_vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1, 1,1,1, -1,1,1, -1,-1,1, 1,-1,1, 1,1,1]), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	// starry night
	loadFile("image", "data/lh94_hst.jpg", function(tex) { night_sky = tex; });
	// load ships
	loadFile("shader","model", function(prog) { ship_prog = prog; });
	var model_loaded = function(model) { ship_models.push(model); new_ship(model); };
	for(var i=1; i<=8; i++)
		new G3D("data/fighter"+i+".g3d", model_loaded);
}

function new_ship(model, path, speed) {
	model = model || choose(ship_models);
	ships.push({
		model: model,
		start_time: now(),
		path: path || choose([window.path, path2]),
		speed: speed || choose([300, 1000, 1500]), // small is faster
	});
}

function render() {
	if(to.eye) { // game inited
		var t = update() / step_size;
		var eye = vec3_lerp(from.eye, to.eye, t);
		var centre = vec3_lerp(from.centre, to.centre, t);
		var up = vec3_normalise(vec3_lerp(from.up, to.up, t)); //TODO quats
		var jaws = lerp(from.jaws, to.jaws, t);
		var uniforms = {
			iResolution: [canvas.offsetWidth, canvas.offsetHeight], // based on window not canvas res
			iScreenScale: [canvas.offsetWidth/canvas.width, canvas.offsetHeight/canvas.height],
			iChannel0: 0,
			iChannel1: 1,
			iScale0: 0.7,
			iFOV: FOV,
			iEye: eye,
			iCentre: centre,
			iUp: up,
			iJaws: jaws,
			iTunnelLength: 30,
		};
	}
	if(test_prog && tunnel_vbo) {
		test_prog(function(program) {
			gl.depthMask(false);
			gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);	
			gl.depthMask(true);			
		}, {
			texture: test_tex,
		});
	}
	if(!test_prog && tunnel_prog && tunnel_channel_0 && eye) {
		tunnel_prog(function(program) {
				gl.depthMask(false);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, night_sky);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, tunnel_channel_0);
				gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
				gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
				gl.bindBuffer(gl.ARRAY_BUFFER, null);	
				gl.depthMask(true);
			}, uniforms);
	}
	if(ship_prog && ships.length && eye) {
		var pMatrix = new Float32Array(createPerspective(RAD2DEG*FOV,canvas.offsetWidth / canvas.offsetHeight,0.01,100));
		var camMatrix = new Float32Array(createLookAt(eye,centre,up));
		for(var ship in ships) {
			ship = ships[ship];
			var z = (now() - ship.start_time) / ship.speed;
			var p = vec3_lerp(ship.path(z), ship.path(z+1/(ship.speed/ticks_per_sec)), t);
			var mvMatrix = mat4_multiply(mat4_rotation(Math.PI, [0, 1, 0]), mat4_scale(0.1));
			mvMatrix = mat4_multiply(mat4_translation([p[0], p[1], z]), mvMatrix);
			mvMatrix = mat4_multiply(camMatrix, mvMatrix);
			var nMatrix = mat4_mat3(mat4_transpose(mat4_inverse(mvMatrix)));
			ship.model.drawCustom({
					__proto__: uniforms,
					pMatrix: pMatrix,
					mvMatrix: mvMatrix,
					nMatrix: nMatrix,
					colour: OPAQUE,
					fogColour: [0.2,0.2,0.2,1.0],
					fogDensity: 0.0,
					lightColour: [1,1,1],
					lightDir: [0,1,0],
					lightPos: [-0.5,1,1],
					ambientLight: [0.5,0.5,0.5],
					diffuseLight: [0.6,0.6,0.6],
					specularLight: [0,0,0.2],
				}, ship_prog);
		}

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

