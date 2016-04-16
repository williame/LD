"use strict";

var player, circuit, car, start_time, last_tick;

function new_game() {
	player = {
		x: 300,
		y: 300,
		facing: 0.2,
		speed: 0,
	};
	car = new UIWindow(false, new UIImage("data/car.png"));
	car.show();
	circuit = new UIWindow(false, new UIImage("data/circuit_snetterton.png"));
	circuit.show();
	start_time = last_tick = now();
}

function render() {
	if (!player || !car.ctrl.image || !circuit.ctrl.image) return;
	// movement?
	var current_tick = now() - start_time;
	var elapsed = (current_tick - last_tick) * 0.001;
	last_tick = current_tick;
	var	left = keys[37] || keys[65],
		right = keys[39] || keys[68],
		up = keys[38] || keys[87],
		down = keys[40] || keys[83];
	if (up && !down) {
		player.speed = Math.min(player.speed + elapsed, 2);
	} else if (down && !up) {
		player.speed = Math.max(player.speed - elapsed, 0);
	} else if (player.speed > 0) {
		player.speed = Math.max(player.speed - elapsed, 0);
	}
	if (left && !right) {
		player.facing -= elapsed * player.speed;
	} else if (right && !left) {
		player.facing += elapsed * player.speed;
	}
	var dir = vec3_normalise(vec3_rotate([0,-1,0], player.facing, [0,0,0], [0,0,1]));
	player.x += dir[0] * player.speed; 
	player.y += dir[1] * player.speed;
	player.x = Math.min(Math.max(player.x, 0), circuit.ctrl.image.width);
	player.y = Math.min(Math.max(player.y, 0), circuit.ctrl.image.height);
	// decide where to draw everything
	var canvas_x = canvas.width >> 2, canvas_y = (canvas.height >> 2)*3;
	var circuit_x = circuit.ctrl.image.width>>1, circuit_y = circuit.ctrl.image.height>>1;
	var circuit_scale = 8; //1 + Math.sin(current_tick * 0.001);
	var transform = mat4_multiply(
		mat4_rotation(player.facing, [0, 0, 1]),
		mat4_translation([-circuit_x, -circuit_y, 0]));
	transform = mat4_multiply(transform, mat4_translation([(circuit_x - player.x), (circuit_y - player.y), 0]));
	transform = mat4_multiply(mat4_scale(circuit_scale, circuit_scale, 1), transform);
	transform = mat4_multiply(mat4_translation([canvas_x, canvas_y, 0]), transform);
	circuit.transform = transform;
	car.transform = mat4_translation([canvas_x -(car.ctrl.image.width>>1), canvas_y -(car.ctrl.image.height>>1), 0]);
	// where are we on the circuit?
	var pix_ofs = ((player.y|0)*circuit.ctrl.image.width+(player.x|0))*4;
}