
var FOV = Math.PI/5;

var from, to;

var tunnel_length = 90;

var intro = true, intro_prog, intro_vbo, intro_tex;

var game_count = 0, game_eaten = 0, game_exploding, game_over;

var game_over_tex, game_eating;

var game_v = 0, game_h = 0, game_x = 0, game_y = 0;

var dialog;

var ships;

var ticks_per_sec = 5;
var step_size = Math.trunc(1000/ticks_per_sec);
var max_step = step_size * ticks_per_sec * 0.5;
var last_tick;
var speed_forward = 0.02, speed_move = 0.01;

function start_game() {
	stats("start game " + ++game_count);
	intro = game_exploding = game_over = null;
	if(dialog) {
		dialog.hide();
		dialog = null;
	}
	game_eaten = 0;
	from = {
		eye: [0, 0.5, 2],
		centre: [0, 0, 12],
		up: vec3_normalise([1, 1, 0]),
	};
	to = {
		eye: from.eye,
		centre: from.centre,
		up: from.up,
		jaws: 0.5,
		keys: {},
		hit_wall: false,
		z: 0,
	};
	camera();
	ships = [];
	for(var i in ship_models) {
		var speed = [700, 790, 800, 900, 950, 1000, 1200, 1500][i]; // small is faster
		ships.push({
			model: ship_models[i],
			start_time: now() - speed*2,
			path: choose([window.path, path2]),
			speed: speed,
		});
	}
	last_tick = now();
}	

function update() {
	if(game_exploding || game_over) return 0;
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
	from.keys = to.keys;
	from.hit_wall = to.hit_wall;
	from.z = to.z;
	game_v = game_h = 0;
	to.hit_wall = false;
	// biting?
	if(keys[32]) {
		if(to.jaws <= 0.5) {
			playSound(getFile("audio", "data/munch1.ogg"));
		}
		var closing = to.jaws < 7;
		to.jaws = Math.min(7, to.jaws * 1.5);
		if(closing && to.jaws == 7) {
			var eat = false;
			for(var i=ships.length; i-->0; ) {
				var ship = ships[i];
				var z = (now() - ship.start_time) / ship.speed, p = ship.path(z);
				if(vec3_distance_sqrd([p[0], p[1], z], to.eye) < 0.6) {
					ships.splice(i, 1);
					eat = true;
					stats("eat " + game_eaten + " " + to.z.toFixed(2) + " " + ship.model.filename);
					game_eaten++;
				}
			}
			if(eat) {
				game_eating = now();
				playSound(getFile("audio", "data/implosion1.ogg"));
			}
		}
	} else {
		to.jaws = Math.max(0.5, to.jaws * 0.9);
	}
	// move keys?
	var left = keys[37]||keys[65]||keys[97]; //left arrow or A
	var right = keys[39]||keys[68]||keys[100]; //right arrow or D
	var up = keys[38]||keys[87]||keys[119]; //up arrow or W
	var down = keys[40]||keys[83]||keys[115]; //down arrow or S
	to.keys = {
		left: left && !right,
		right: right && !left,
		up: up && !down,
		down: down && !up,
	};	
	if(to.keys.left) game_h = speed_move;
	if(to.keys.right) game_h = -speed_move;
	if(to.keys.up) game_v = speed_move;
	if(to.keys.down) game_v = -speed_move;
	if(game_v || game_h) {
		game_x += game_h;
		game_y += game_v;
		var bonus = (!from.keys.left && to.keys.left) ||
			(!from.keys.right && to.keys.right) ||
			(!from.keys.up && to.keys.up) ||
			(!from.keys.down && to.keys.down)? 4: 1;
		var penalty = from.hit_wall? 0: 1;
		to.z += speed_forward * bonus * penalty; // only move forward when weaving
		camera();
		// check for collisions
		for(var ship in ships) {
			ship = ships[ship];
			var z = (now() - ship.start_time) / ship.speed, p = ship.path(z);
			if(vec3_distance_sqrd([p[0], p[1], z], to.eye) < 0.3) {
				game_exploding = now();
				playSound(getFile("audio", "data/explosion1.ogg"));
				stats("die " + game_eaten + " " + to.z.toFixed(2) + " " + ship.model.filename);
				break;
			}
		}
		// check for end
		if(to.z > tunnel_length -5) {
			game_over = now();
			stats("end " + game_eaten);
		}
	}
}

function camera() {
	var p = path(to.z), p2 = path2(to.z);
	for(var i=0; ; i++) {
		to.eye = [p[0] + game_x, p[1] + game_y, to.z];
		var search = get_ball_points(to.eye);
		if(search[search[0]+1] > 0.3) break; // no collision?
		var side = vec2_distance_sqrd(to.eye, p) < vec2_distance_sqrd(to.eye, p2)? p: p2;
		var move = vec2_scale(vec2_normalise(vec2_sub(to.eye, side)), 0.1);
		game_x -= move[0];
		game_y -= move[1];
		to.hit_wall = true;
	}
	p = path(to.z + 0.1);
	to.centre = [p[0] + game_x, p[1] + game_y, to.z + 1];
	to.up = [0, 1, 0];
}

function stats(message) {
	report_info(message + " [" + canvas.offsetWidth + "x" + canvas.offsetHeight + ", " +
		canvas.width + "x" + canvas.height + "] " + perf.fps(3).toFixed(2)+" fps");
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

var explosion_prog, explosion_channel_0, game_eating_tex;

var night_sky;

var ship_prog, ship_models = [];

var paused_at;

function onKeyUp(evt) {
	if(intro || dialog) {
		start_game();
	} else if(evt.which == 27) {
		paused = !paused;
		if(paused) {
			paused_at = now();
		} else {
			var elapsed = now() - paused_at;
			for(var i in ships)
				ships[i].start_time += elapsed;
		}
	}
}

function init_game() {
	stats("init");
	init_ball_points(20);
	//test_rays();
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
	// explosion
	loadFile("shader", "explosion", function(prog) { explosion_prog = prog; });
	loadFile("image", "data/noise1.jpg", function(tex) { explosion_channel_0 = tex; });
	loadFile("image", "data/noise1.png", function(tex) { game_eating_tex = tex; });
	// load ships
	loadFile("shader","model", function(prog) { ship_prog = prog; });
	var model_loaded = function(model) { ship_models.push(model); if(ship_models.length == 8) 	init_intro(); };
	for(var i=1; i<=8; i++)
		new G3D("data/fighter"+i+".g3d", model_loaded);
	// end game
	loadFile("image", "data/game_over.png", function(tex) { game_over_tex = tex; });
}

function render() {
	if(intro) {
		if(!intro_tex) return;
		var t = Math.min(-1.2, -3.5 + (now() - intro) / 8000);
		var pMatrix = createPerspective(RAD2DEG*FOV,canvas.offsetWidth / canvas.offsetHeight,0.01,100);
		var mvMatrix = createLookAt([0, -6, 2], [0, 0, 0], [0, 1, 0]);
		mvMatrix = mat4_multiply(mvMatrix, mat4_scale(1, 2, 1));
		mvMatrix = mat4_multiply(mvMatrix, mat4_translation([0, t, 0]));
		intro_prog(function(program) {
				gl.bindBuffer(gl.ARRAY_BUFFER, intro_vbo);
				gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 5*4, 0);
				gl.vertexAttribPointer(program.texCoord, 2, gl.FLOAT, false, 5*4, 3*4);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
				gl.bindBuffer(gl.ARRAY_BUFFER, null);	
			},{
				pMatrix: pMatrix,
				mvMatrix: mvMatrix,
				texture: intro_tex,
			});
		return;
	}
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
			iTunnelLength: tunnel_length,
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
	if(ship_prog && ships.length && eye && !game_exploding && !game_over) {
		var pMatrix = createPerspective(RAD2DEG*FOV,canvas.offsetWidth / canvas.offsetHeight,0.01,100);
		var camMatrix = createLookAt(eye,centre,up);
		var all_out = true;
		for(var ship in ships) {
			ship = ships[ship];
			var z = (now() - ship.start_time) / ship.speed, p = ship.path(z);
			if(z < tunnel_length) all_out = false;
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
		if(all_out)
			game_over = now();
	}
	if(game_eating && !game_exploding && explosion_prog && tunnel_vbo && explosion_channel_0) {
		var t = (now() - game_eating) / 1000;
		if(t > 0.5) {
			game_eating = false;
		}
		explosion_prog(function(program) {
			gl.depthFunc(gl.ALWAYS);
			gl.depthMask(false);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, game_eating_tex);
			gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);	
			gl.depthMask(true);
			gl.depthFunc(gl.LEQUAL);
		}, {
			__proto__: uniforms,
			iChannelResolution0: [explosion_channel_0.width, explosion_channel_0.height],
			iGlobalTime: t,
			iColour: [0.4, 0.5, 1.0],
		});
	}
	if(game_exploding && explosion_prog && tunnel_vbo && explosion_channel_0) {
		var t = (now() - game_exploding) / 1000;
		if(t > 3 && !game_over) {
			game_over = now();
		}
		t = Math.min(t, 4.5);
		explosion_prog(function(program) {
			gl.depthMask(false);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, explosion_channel_0);
			gl.bindBuffer(gl.ARRAY_BUFFER, tunnel_vbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);	
			gl.depthMask(true);			
		}, {
			__proto__: uniforms,
			iChannelResolution0: [explosion_channel_0.width, explosion_channel_0.height],
			iGlobalTime: t,
			iColour: [1, 0.4, 0],
		});
	}
	if(game_over && intro_prog) {
		var t = now() - game_over;
		if((t % 500) < 250 || t > 2000) {
			var pMatrix = createPerspective(RAD2DEG*FOV,canvas.offsetWidth / canvas.offsetHeight,0.01,100);
			var mvMatrix = createLookAt([0, 0, 6], [0, 0, 0], [0, 1, 0]);
			intro_prog(function(program) {
					gl.depthMask(false);
					gl.bindBuffer(gl.ARRAY_BUFFER, intro_vbo);
					gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 5*4, 0);
					gl.vertexAttribPointer(program.texCoord, 2, gl.FLOAT, false, 5*4, 3*4);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
					gl.bindBuffer(gl.ARRAY_BUFFER, null);
					gl.depthMask(true);
				},{
					pMatrix: pMatrix,
					mvMatrix: mvMatrix,
					texture: game_over_tex,
				});
			if(t > 3000 && !dialog) {
				if(game_exploding) {
					show_end_game("(Try biting the ships instead of colliding with them next time!)");
				} else {
					show_end_game();
				}
			}
		}
	}
}

function show_end_game(message) {
	var colour = game_exploding? [0,0,0,1]: [1,1,1,1];
	var panel = new UIPanel([
			new UILabel((message? message+"\n": "") + "You ate " + game_eaten + " ship" + (game_eaten == 1? "": "s") +"!", colour),
			new UILabel("<ANY KEY TO PLAY AGAIN>", colour),
		], UILayoutRows);
	panel.bgColour = [0,0,0,0];
	for(var child in panel.children) {
		child = panel.children[child];
		child.bgColour = [0,0,0,0];
		child.fgColour = colour;
	}
	dialog = new UIWindow(false, panel);
	var layout = dialog.layout;
	dialog.layout = function() {
		layout.apply(dialog, arguments);
		panel.setPos([(canvas.offsetWidth-panel.width())/2, canvas.offsetHeight-panel.height()*2]);
	}
	dialog.layout();
	dialog.show();
}

function init_intro() {
	stats("intro");
	intro_prog = Program(
		"precision mediump float;\n"+
		"attribute vec3 vertex;\n"+
		"attribute vec2 texCoord;\n"+
		"uniform mat4 mvMatrix, pMatrix;\n"+
		"varying vec2 texel;\n"+
		"void main() {\n"+
		"	texel = texCoord;\n"+
		"	gl_Position = pMatrix * mvMatrix * vec4(vertex,1.0);\n"+
		"}\n",
		"precision mediump float;\n"+
		"uniform sampler2D texture;\n"+
		"varying vec2 texel;\n"+
		"void main() {\n"+
		"	gl_FragColor = texture2D(texture, texel);\n"+
		"}\n");
	loadFile("image", "data/intro.png", function(tex) { intro_tex = tex; intro = now(); });
	intro_vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, intro_vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1, 0,0, 1,1,1, 1,1, -1,1,1, 0,1, -1,-1,1, 0,0, 1,-1,1, 1,0, 1,1,1, 1,1]), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
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

