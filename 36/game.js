"use strict";

function now() { return (new Date()).getTime(); }

function isTouchDevice() { return "ontouchstart" in window; }

var hints = [
	"use your " + (isTouchDevice()? "fingers": "mouse") +" to shoot arrows!",
	"the longer the shot, the higher the score!",
	"hit a dead one to double the points!",
	"hitting on alternate tracks doubles the points too!",
	isTouchDevice()? "": "you should try this on a touch screen too ;)",
	"keep your eye peeled for the sabre toothed tiger!",
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
	new Layer("black", 50, 300, -100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("black", 100, 500, 100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("black", 200, 300, 400, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; })];

function Sprite(filename, cols, rows, frames, options) {
	console.assert(this instanceof Sprite);
	var self = this;
	this.name = filename;
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
		var frame = Math.floor(idx || 0) % this.frames;
		var sy = Math.floor(frame / this.cols) * this.height;
		var sx = (frame % this.cols) * this.width;
		ctx.drawImage(this.img,
			sx + this.left, sy + this.top, this.width, this.height,
			x + (this.options.x || 0), y + (this.options.y || 0), width * (this.options.scale || 1), height * (this.options.scale || 1));
	},
};
var sprites = {
	buffalo: new Sprite("buffalo.png", 4, 3, 4, {top: 320}),
	mastodon: new Sprite("mastodon.png", 4, 4, 12, {left: 60, top: 40, right: 660, scale: 1.5, y: -20}),
	mammoth: new Sprite("mammoth.png", 4, 4, 4, {left: 100, right: 1300, scale: 1.5, y: -50}),
	boar: new Sprite("boar.png", 4, 2, 4, {top: 300, bottom: 720}),
	smilodon: new Sprite("smilodon.png", 8, 4, 24, {left: 32, top: 270, right: 2090, bottom: 900, scale: 1.5, y: -3}),
};

var backgrounds = [
	[Math.random() * 1000, Math.random() * 5, new Sprite("CavePainting_deer.png", 1, 1)],
	[Math.random() * 1000, Math.random() * 5, new Sprite("CavePainting_dino.png", 1, 1)], 
	[Math.random() * 1000, Math.random() * 5, new Sprite("CavePainting_happyhunter.png", 1, 1)],
	[Math.random() * 1000, Math.random() * 5, new Sprite("CavePainting_hunter.png", 1, 1)],
];
var background = new Sprite("background2.jpg", 1, 1);

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
	this.boss = false;
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
			if (this.boss) {
				var x = x_ofs + canvas.width / layer.x_scale - elapsed * 2;
			} else {
				var x = x_ofs + elapsed;
			}
		} else {
			elapsed /= 500;
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
		return (x < -this.width || x > canvas.width + this.width) && !this.boss;
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

var player = new Thing(layers[1], 0, "black", 80, 100, sprites.mammoth);
player.kills = 0;
var boss;

var things = [
	new Thing(layers[0], 1000, "red", 100, 80, sprites.buffalo, 1),
	new Thing(layers[0], 900, "red", 60, 40, sprites.boar, 1),
	new Thing(layers[2], 1500, "red", 100, 80, sprites.buffalo, 1),
	new Thing(layers[2], 1000, "red", 60, 40, sprites.boar, 1),
];

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

function Sound(filename) {
	console.assert(this instanceof Sound);
	var self = this;
	var audioFactory = window.audioContext || window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
	if(audioFactory) {
		this.audio = new audioFactory();
		var doc = new XMLHttpRequest();
		doc.open("GET", filename, true);
		doc.responseType = "arraybuffer";
		doc.overrideMimeType('text/plain; charset=x-user-defined');
		doc.onerror = function(e) { console.log("cannot load", filename, e); };
		doc.onreadystatechange = function() {
			if (doc.readyState==4 && (!doc.status || doc.status==200))
				self.audio.decodeAudioData(doc.response, function(clip) { self.clip = clip; });
		};
		doc.send();
	} else {
		console.log("no audioContext", filename);
	}
}
Sound.prototype = {
	play: function(volume) {
		if (this.clip) try {
			var source = this.audio.createBufferSource();
			source.buffer = this.clip;
			if(volume) {
				var gainNode = audio.createGainNode();
				source.connect(gainNode);
				gainNode.connect(this.audio.destination);
				gainNode.gain.value = volume;
			} else
				source.connect(this.audio.destination);
			if (source) {
				source.start? source.start(): source.noteOn(0);
			}
		} catch(error) {
			// not fatal
			console.log("ERROR playing sound: ", this.clip, error);
		}
	},
};

var sounds = {
	bow_loose: new Sound("bow_loose.ogg"),
};

var start_time, last_spawn_time, last_boss_time, last_kill_time, last_kill_layer, mouse_pos;

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
		mouse_pos = [Math.max(boss? 0: canvas.width / 2, pos.clientX), pos.clientY];
		bow_draw_start = now();
		if (!hint) hint++;
	};
	canvas.ontouchmove = canvas.onmousemove = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		mouse_pos = [Math.max(boss? 0: canvas.width / 2, pos.clientX), pos.clientY];
	};
	canvas.ontouchend = canvas.ontouchcancel = canvas.onmouseup = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		if (pos) { // touchend doens't have any more touch points, so use previous report
			mouse_pos = [Math.max(boss? 0: canvas.width / 2, pos.clientX), pos.clientY];
		}
		if (bow_draw_start && shoulder && get_bow_draw_len() < 0.90)
			arrows.push(new Arrow());
		bow_draw_start = null;
		sounds.bow_loose.play();
	};
	canvas.setAttribute('tabindex','0');
	canvas.focus();
	start_time = last_spawn_time = now();
	player.uid = null;
	var stats = {
		game: "LD36",
		event: "game_start",
		uid: player.uid,
	};
	if (storageAvailable("localStorage")) try {
		stats.uid = player.uid = window.localStorage.getItem("uid") || Math.floor(Math.random() * 1000000000);
		window.localStorage.setItem("uid", stats.uid);
		stats.prev_plays = parseInt(window.localStorage.getItem("prev_plays") || 0);
		window.localStorage.setItem("prev_plays", stats.prev_plays + 1);
	} catch(e) { console.log("error accessing localStorage:", e); }
	report("info", stats);
	for (var bg=1; bg<backgrounds.length; bg++)
		backgrounds[bg][0] += backgrounds[bg-1][0] + 400;
}

function game_over() {
	report("info", {
		game: "LD36",
		event: "game_over",
		uid: player.uid,
		score: player.score,
		kills: player.kills,
		play_time: (now() - start_time) / 1000,
		things: things.length,
	});
	modal("<big>GAME OVER!</big><hr/><centre>You have to shoot the sabre toothed tigers too!<br/>You scored " + player.score + "!<br>" +
		'<small><u><a onclick="window.location.reload()" style="cursor:pointer">play again?</a></u></small></centre>');
	setTimeout(function() { window.location.reload(); }, 3000);
}

function spawn_boss() {
	if (!boss) {
		boss = new Thing(layers[1], 1000, "red", 50, 40, sprites.smilodon, 100);
		boss.boss = true;
		things.push(boss);
	}
}

function spawn() {
	last_spawn_time = now();
	if (things.length > 10) {
		if (!last_boss_time || last_spawn_time - last_boss_time > 20000) {
			spawn_boss();
		}
		return;
	}
	var mins = new Array(layers.length);
	// which layer has a thing furthest from the end?
	for (var thing in things) {
		thing = things[thing];
		var layer = layers.indexOf(thing.layer);
		if (thing.pos && !thing.boss && (!mins[layer] || thing.pos[0] < mins[layer][0])) {
			mins[layer] = [thing.pos[0], thing, layer];
		}
	}
	mins.sort(function (a, b) { return !a? -1: !b? 1: b[0] - a[0]; });
	if (mins[0])
		things.push(mins[0][1].clone());
}			

function render() {
	var reqid = window.requestAnimationFrame(render);
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
		var bg_ofs = (-x_ofs * 100) % canvas.width;
		background.render(ctx, bg_ofs, 0, canvas.width, canvas.height);
		background.render(ctx, bg_ofs + canvas.width, 0, canvas.width, canvas.height);
		var bg_wrap = (backgrounds[backgrounds.length-1][0] + 500);
		for (var bg in backgrounds) {
			bg = backgrounds[bg];
			bg[2].render(ctx, (bg[0] - x_ofs * 100) % bg_wrap, canvas.height / 8 * bg[1], 300, 200);
			bg[2].render(ctx, (bg[0] - x_ofs * 100) % bg_wrap + bg_wrap, canvas.height / 8 * bg[1], 300, 200);
		}
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
					event: "kill",
					layer: layers.indexOf(thing.layer),
					uid: player.uid,
					kind: thing.sprite.name,
					kills: player.kills,
					award: thing.score * thing.score_multiplier,
					score: player.score,
					play_time: elapsed / 1000,
					things: things.length,
				};
				report("info", stats);
			}
			things.splice(old[idx], 1);
			if (thing.boss) {
				if (mouse_pos)
					mouse_pos[0] = Math.max(canvas.width / 2, mouse_pos[0]);
				boss = null;
			} else {
				thing = thing.clone();
				thing.speed * 1.1;
				things.push(thing);
			}
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
			var scale = 40;
			shoulder = [player.pos[0] - player.normal[0] * player.height * 0.8,
				player.pos[1] - player.normal[1] * player.height * 0.8];
			var x1 = shoulder[0], y1 = shoulder[1], x2 = mouse_pos[0], y2 = mouse_pos[1];
			var dx = x2 - x1, dy = y2 - y1;
			var normalize = (1 / Math.sqrt(dx * dx + dy * dy)) * scale;
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
				scale * 0.5,
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
		if (boss && boss.pos[0] < player.pos[0]) {
			window.cancelAnimationFrame(reqid);
			game_over();
		}
	} catch(e) {
		window.onerror(e.message, e.filename, e.lineno, e.colno, e.error);
	}
}