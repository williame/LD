"use strict";

function now() { return (new Date()).getTime(); }

function isTouchDevice() { return "ontouchstart" in window; }

var hints = [
	"use your " + (isTouchDevice()? "fingers": "mouse") +" to shoot arrows!",
	"the longer the shot, the higher the score!",
	"hit a dead one to double the points!",
	"hitting on alternate tracks doubles the points too!",
	isTouchDevice()? "": "you should try this on a touch screen too ;)",
];
var hint = 0;

function getParameterByName(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var	regexS = "[\\?&]" + name + "=([^&#]*)",
		regex = new RegExp(regexS),
		results = regex.exec(window.location.search);
	if(results == null) return "";
	return decodeURIComponent(results[1].replace(/\+/g, " "));
}

function storageAvailable(type) {
	try {
		var storage = window[type],
			x = '__storage_test__';
		storage.setItem(x, x);
		storage.removeItem(x);
		return true;
	}
	catch(e) {
		return false;
	}
}

function modal(html) {
	var modal = document.getElementById("modal");
	var dialog = document.getElementById("modal_dialog");
	if (html) {
		dialog.innerHTML = html;
		modal.style.visibility = "visible";
	} else {
		modal.style.visibility = "hidden";
	}
}

function Layer(colour, x_scale, y_scale, y_ofs, y_func) {
	console.assert(this instanceof Layer);
	this.colour = colour;
	this.x_scale = x_scale;
	this.y_scale = y_scale;
	this.y_ofs = y_ofs;
	this.y_func = y_func;
	this._segment_cache = {};
}
Layer.prototype = {
	segment: function(x_start, x_step, x_stop) {
		var key = x_start + ':' + x_step + ':' + x_stop;
		if (key in this._segment_cache)
			return this._segment_cache[key];
		var y_func = this.y_func;
		var y = y_func(x_start);
		var seg = [];
		var emit = function(x1, y1, x2, y2) {
			var dx = x2 - x1, dy = y2 - y1;
			var len = Math.sqrt(dx * dx + dy * dy);
			var x = dx / len * Math.random() * 0.1;
			var y = dy / len * Math.random() * 0.1;
			seg.push(x1 - x, y1 - y, x2 + x, y2 + y);
			return x2 + Math.random() * 0.01;
		};
		while (x_start < x_stop) {
			var next_x = x_start + x_step;
			var next_y = y_func(next_x);
			x_start = emit(x_start, y, next_x, next_y);
			y = next_y;
		}
		this._segment_cache[key] = seg;
		return seg;
	},
	normal: function(x_ofs) {
		var x1 = x_ofs - 0.1, x2 = x_ofs + 0.1;
		var y1 = this.y_func(x1), y2 = this.y_func(x2);
		var dx = x2 - x1, dy = y2 - y1;
		var normalize = 1 / Math.sqrt(dx * dx + dy * dy);
		return [-dy * normalize, dx * normalize];
	},
	render: function(ctx, y_scaler, x_ofs) {
		ctx.strokeStyle = this.colour;
		var x_scale = this.x_scale, y_scale = this.y_scale * y_scaler;
		var y_ofs = (canvas.height / 2) + this.y_ofs * y_scaler;
		var x_start = Math.floor(x_ofs);
		var x_stop = x_start + Math.ceil(canvas.width / x_scale);
		for (var x = x_start; x <= x_stop; x++) {
			var seg = this.segment(x, 0.2, x + 1);
			ctx.beginPath();
			//ctx.moveTo((seg[0] - x_ofs) * x_scale, 0); ctx.lineTo((seg[0] - x_ofs) * x_scale, canvas.height);
			for (var i=0; i<seg.length; ) {
				ctx.moveTo((seg[i++] - x_ofs) * x_scale, seg[i++] * y_scale + y_ofs);
				ctx.lineTo((seg[i++] - x_ofs) * x_scale, seg[i++] * y_scale + y_ofs);
			}
			ctx.stroke();
		}
	},
};

var layers = [
	new Layer("blue", 50, 300, -100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("red", 100, 500, 100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("green", 200, 300, 400, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; })];

function Sprite(filename, cols, rows, frames, options) {
	console.assert(this instanceof Sprite);
	var self = this;
	this.cols = cols;
	this.rows = rows;
	this.frames = frames || (cols * rows);
	this.width = 0;
	this.height = 0;
	this.options = options || {};
	this.img = new Image();
	this.img.onerror = function(e) { console.log("cannot load", filename, e); };
	this.img.onload = function() {
		self.left = self.options.left || 0;
		self.right = self.options.right || self.img.width;
		self.top = self.options.top || 0;
		self.bottom = self.options.bottom || self.img.height;
		self.width = (self.right - self.left) / self.cols;
		self.height = (self.bottom - self.top) / self.rows;
	};
	this.img.src = filename;
}
Sprite.prototype = {
	render: function(ctx, x, y, width, height, idx) {
		var frame = Math.floor(idx) % this.frames;
		var sy = Math.floor(frame / this.cols) * this.height;
		var sx = (frame % this.cols) * this.width;
		ctx.drawImage(this.img,
			sx + this.left, sy + this.top, this.width, this.height,
			x + (this.options.x || 0), y + (this.options.y || 0), width * (this.options.scale || 1), height * (this.options.scale || 1));
	},
};
var sprites = {
	buffalo: new Sprite("buffalo.png", 4, 4, 16, {left: 0, top: 60}),
	mastodon: new Sprite("mastodon.png", 4, 4, 12, {left: 60, top: 40, right: 660, scale: 1.5, y: -20}),
};

function Thing(layer, speed, colour, width, height, sprite, score) {
	console.assert(this instanceof Thing);
	this.layer = layer;
	this.speed = speed;
	this.normal = null;
	this.pos = null;
	this.colour = colour;
	this.width = width;
	this.height = height;
	this.sprite = sprite;
	this.start_time = now();
	this.step = 0;
	this.died_time = null;
	this.score = score || 0;
	this.score_multiplier = 1;
}
Thing.prototype = {
	render: function(ctx, now, y_scaler, x_ofs) {
		if (this.died_time) {
			var elapsed = (now - this.died_time) / 2000;
			var x = this.pos[0], y = this.pos[1];
			if (this.sprite && this.sprite.width) {
				ctx.save();
				ctx.scale(1, -1);
				this.sprite.render(ctx, x-this.width, -y, this.width, this.height, 0);
				ctx.restore();
			}
			ctx.save();
			ctx.textBaseline = "top";
			ctx.textAlign = "right";
			ctx.font = "24px fantasy, 'Comic Sans', Serif";
			ctx.fillStyle = this.colour;
			ctx.fillText(Math.floor(this.score * this.score_multiplier), x, y);
			ctx.restore();
			y -= elapsed;
			this.pos[1] = y;
			return y < 0;
		}
		var layer = this.layer;
		var elapsed = (now - this.start_time);
		if (this.speed) {
			elapsed /= this.speed;
			var x = x_ofs + elapsed;
		} else {
			elapsed /= 300;
			var x = x_ofs + 1;
		}
		var y_scale = layer.y_scale * y_scaler;
		var y_ofs = (canvas.height / 2) + layer.y_ofs * y_scaler;
		var y = layer.y_func(x) * y_scale + y_ofs;
		var normal = layer.normal(x);
		normal[0] *= (layer.y_scale * y_scaler) / layer.x_scale;
		x = (x - x_ofs) * layer.x_scale;
		ctx.strokeStyle = this.colour;
		if (debugging) {
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.arc(x, y, 5, 0, Math.PI*2);
			ctx.stroke();
		}
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(Math.atan2(normal[1], normal[0]) + Math.PI * 1.5);
		if (this.sprite && this.sprite.width) {
			this.sprite.render(ctx, -this.width, -this.height, this.width, this.height, elapsed * 5);
		} else {
			ctx.rect(-this.width, -this.height, this.width, this.height);
			ctx.stroke();
		}
		ctx.restore();
		this.pos = [x, y];
		this.normal = normal;
		return x < -this.width || x > canvas.width + this.width;
	},
	corners: function() {
		var ret = [];
		var angle = Math.atan2(this.normal[1], this.normal[0]) + Math.PI * 1.5;
		var transform = new Transform2D();
		transform.translate(this.pos[0], this.pos[1]);
		if (!this.died_time)
			transform.rotate(angle);
		ret.push(
			transform.project(-this.width, -this.height),
			transform.project(-this.width, 0),
			transform.project(0, 0),
			transform.project(0, -this.height));
		return ret;
	},
	clone: function() {
		return new Thing(this.layer, this.speed, this.colour, this.width, this.height, this.sprite, this.score);
	}
};

var player = new Thing(layers[1], 0, "blue", 50, 50, sprites.mastodon);
player.kills = 0;

var things = [
	new Thing(layers[0], 1000, "red", 50, 40, sprites.buffalo, 1),
	new Thing(layers[2], 2000, "red", 50, 40, sprites.buffalo, 1)];
	
function Arrow() {
	console.assert(this instanceof Arrow);
	this.hand = hand;
	var dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1];
	var normalize = 1 / Math.sqrt(dx * dx + dy * dy);
	this.pos = this.last_pos = null;
	this.dir = [dx * normalize, dy * normalize];
	this.start_time = now();
	this.azimuth = bow_azimuth;
	this.power = 1 - get_bow_draw_len(this.start_time);
	this.lifetime = 1000 * this.power;
}
Arrow.prototype = {
	colour: "black",
	path_colour: "lightgray",
	length: 16,
	_cheveron: function(ctx, x, y, dx, dy, ofs, len) {
		ctx.beginPath();
		var x1 = x + dx * ofs, y1 = y + dy * ofs;
		var x2 = dx * len, y2 = dy * len;
		ctx.moveTo(x1 - y2 - x2, y1 + x2 - y2);
		ctx.lineTo(x1, y1);
		ctx.lineTo(x1 + y2 - x2, y1 - x2 - y2);
		ctx.stroke();
	},
	render: function(ctx, now, x_ofs) {
		var t = ((now - this.start_time) * this.power) / 3;
		var hand_x = this.hand[0], hand_y = this.hand[1];
		var dx = this.dir[0], dy = this.dir[1];
		ctx.strokeStyle = this.path_colour;
		ctx.save();
		ctx.setLineDash([5]);
		ctx.beginPath();
		ctx.moveTo(hand_x, hand_y);
		ctx.lineTo(hand_x + dx * this.lifetime, hand_y + dy * this.lifetime);
		ctx.stroke();
		ctx.restore();
		ctx.strokeStyle = this.colour;
		var x1 = hand_x + dx * t;
		var y1 = hand_y + dy * t;
		var x2 = x1 - dx * this.length;
		var y2 = y1 - dy * this.length;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		this._cheveron(ctx, x2, y2, dx, dy, this.length, 3);
		this._cheveron(ctx, x2, y2, dx, dy, 0, 3);
		this._cheveron(ctx, x2, y2, dx, dy, 3, 3);
		this.last_pos = this.pos;
		this.pos = [x1, y1];
		return t > this.lifetime;
	},
};
var arrows = [];

var start_time, last_spawn_time, last_kill_time, last_kill_layer, mouse_pos;

var bow_draw_start, shoulder, hand, bow_azimuth = 0;

function get_bow_draw_len(now) {
	now = now || window.now();
	var elapsed = now - bow_draw_start;
	var max_draw = 1000; // millisecs to draw back fully
	return 1 - Math.min(elapsed, max_draw + 1) / max_draw;
}

function start() {
	canvas.ontouchstart = canvas.onmousedown = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		mouse_pos = [Math.max(canvas.width / 2, pos.clientX), pos.clientY];
		bow_draw_start = now();
		if (!hint) hint++;
	};
	canvas.ontouchmove = canvas.onmousemove = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		mouse_pos = [Math.max(canvas.width / 2, pos.clientX), pos.clientY];
	};
	canvas.ontouchend = canvas.ontouchcancel = canvas.onmouseup = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		if (pos) { // touchend doens't have any more touch points, so use previous report
			mouse_pos = [Math.max(canvas.width / 2, pos.clientX), pos.clientY];
		}
		if (bow_draw_start && shoulder)
			arrows.push(new Arrow());
		bow_draw_start = null;
	};
	canvas.setAttribute('tabindex','0');
	canvas.focus();
	start_time = last_spawn_time = now();
	player.uid = null;
	var stats = {
		game: "LD36",
		uid: player.uid,
	};
	if (storageAvailable("localStorage")) try {
		stats.uid = player.uid = window.localStorage.getItem("uid") || Math.floor(Math.random() * 1000000000);
		window.localStorage.setItem("uid", stats.uid);
		stats.prev_plays = parseInt(window.localStorage.getItem("prev_plays") || 0);
		window.localStorage.setItem("prev_plays", stats.prev_plays + 1);
	} catch(e) { console.log("error accessing localStorage:", e); }
	report("info", stats);
}

function spawn() {
	last_spawn_time = now();
	if (things.length > 20) return;
	var mins = new Array(layers.length);
	// which layer has a thing furthest from the end?
	for (var thing in things) {
		thing = things[thing];
		var layer = layers.indexOf(thing.layer);
		if (thing.pos && (!mins[layer] || thing.pos[0] < mins[layer][0])) {
			mins[layer] = [thing.pos[0], thing, layer];
		}
	}
	mins.sort(function (a, b) { return !a? -1: !b? 1: b[0] - a[0]; });
	if (mins[0])
		things.push(mins[0][1].clone());
}			

function render() {
	window.requestAnimationFrame(render);
	try {
		var now = window.now();
		var elapsed = now - start_time;
		if (now - last_spawn_time > 10000) {
			spawn();
		}
		var x_ofs = elapsed / 1000;
		var y_scaler = canvas.height / 1000;
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (var layer in layers) {
			layers[layer].render(ctx, y_scaler, x_ofs);
		}
		var old = [];
		for (var idx in things) {
			var thing = things[idx];
			if (thing.render(ctx, now, y_scaler, x_ofs))
				old.push(idx);
		}
		for (var idx = old.length; idx --> 0; ) {
			var thing = things[old[idx]];
			if (thing.died_time) {
				player.score += Math.floor(thing.score * thing.score_multiplier);
				player.kills++;
				var stats = {
					game: "LD36",
					uid: player.uid,
					kills: player.kills,
					award: thing.score,
					score: player.score,
					play_time: elapsed / 1000,
					things: things.length,
				};
				report("info", stats);
			}
			things.splice(old[idx], 1);
			thing = thing.clone();
			thing.speed * 1.1;
			things.push(thing);
		}
		player.render(ctx, now, y_scaler, x_ofs);
		if (mouse_pos) {
			if (bow_draw_start) {
				if (now - bow_draw_start > 2500)
					bow_draw_start = null;
				else
					var bow_draw_len = get_bow_draw_len(now);
			}
			ctx.strokeStyle = player.colour;
			ctx.beginPath();
			shoulder = [player.pos[0] - player.normal[0] * player.height * 1.1,
				player.pos[1] - player.normal[1] * player.height * 1.1];
			var x1 = shoulder[0], y1 = shoulder[1], x2 = mouse_pos[0], y2 = mouse_pos[1];
			var dx = x2 - x1, dy = y2 - y1;
			var normalize = (1 / Math.sqrt(dx * dx + dy * dy)) * player.height;
			hand = [x1 + dx * normalize, y1 + dy * normalize];
			bow_azimuth = Math.atan2(dy, dx);
			ctx.moveTo(x1, y1);
			ctx.lineTo(hand[0], hand[1]);
			if (bow_draw_start) {
				ctx.moveTo(x1 + dx * bow_draw_len * normalize, y1 + dy * bow_draw_len * normalize);
			} else {
				ctx.stroke();
				ctx.beginPath();
			}
			ctx.arc(x1 + dx * normalize * 0.5, y1 + dy * normalize * 0.5,
				player.height * 0.5,
				bow_azimuth - 1, bow_azimuth + 1);
			if (bow_draw_start) {
				ctx.lineTo(x1 + dx * bow_draw_len * normalize, y1 + dy * bow_draw_len * normalize);
			}
			ctx.stroke();
		}
		var old = [];
		for (var idx in arrows) {
			var arrow = arrows[idx];
			var is_old = arrow.render(ctx, now, x_ofs);
			var is_lethal = false;
			for (var thing_idx in things) {
				var thing = things[thing_idx];
				if (!thing.pos) continue;
				var dx = arrow.pos[0] - thing.pos[0], dy = arrow.pos[1] - thing.pos[1];
				if (dx * dx + dy * dy <= thing.width * thing.width + thing.height * thing.height && arrow.last_pos) {
					var corners = thing.corners();
					var hits = [];
					var check = function(a, b) {
						var hit = line_intersection(
							arrow.pos[0], arrow.pos[1], arrow.last_pos[0], arrow.last_pos[1],
							a[0], a[1], b[0], b[1]);
						if (hit)
							hits.push(hit);
					};
					check(corners[0], corners[1]);
					check(corners[1], corners[2]);
					check(corners[2], corners[3]);
					check(corners[3], corners[0]);
					if (debugging) {
						ctx.strokeStyle = hits.length? "red": "lime";
						ctx.beginPath();
						ctx.moveTo(corners[0][0], corners[0][1]);
						ctx.lineTo(corners[1][0], corners[1][1]);
						ctx.lineTo(corners[2][0], corners[2][1]);
						ctx.lineTo(corners[3][0], corners[3][1]);
						ctx.lineTo(corners[0][0], corners[0][1]);
						ctx.stroke();
					}
					if (hits.length) {
						if (hint == 1 || (now - last_kill_time > 1000))
							hint++;
						last_kill_time = now;
						is_lethal = true;
						if (thing.died_time) {
							// if you hit a dead one, it doubles its score each time...
							thing.score_multiplier *= 2;
						} else {
							thing.died_time = now;
							thing.score_multiplier += Math.floor(((now - arrow.start_time) * arrow.power) / 30);
							if (last_kill_layer !== thing.layer) { // different track from last time?
								thing.score_multipler *= 2;
								last_kill_layer = thing.layer;
							}
						}
						break;
					}
				}
			}
			if (is_old || is_lethal)
				old.push(idx);
		}
		for (var idx = old.length; idx --> 0; ) {
			arrows.splice(old[idx], 1);
		}
		ctx.save();
		ctx.textBaseline = "top";
		ctx.font = "32px fantasy, 'Comic Sans', Serif";
		ctx.fillStyle = "red";
		ctx.textAlign = "right";
		ctx.fillText(player.score + " pts", canvas.width - 10, 10);
		if (hint < hints.length) {
			ctx.font = "24px fantasy, 'Comic Sans', Serif";
			ctx.textAlign = "left";
			ctx.fillText(hints[hint], 10, 10);
		}
		ctx.restore();
	} catch(e) {
		window.onerror(e.message, e.filename, e.lineno, e.colno, e.error);
	}
}