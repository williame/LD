"use strict";

function now() { return (new Date()).getTime(); }

function getParameterByName(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var	regexS = "[\\?&]" + name + "=([^&#]*)",
		regex = new RegExp(regexS),
		results = regex.exec(window.location.search);
	if(results == null) return "";
	return decodeURIComponent(results[1].replace(/\+/g, " "));
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
	this._segment_cache = {}
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
			var len = Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2));
			var x = (x2 - x1) / len * Math.random() * 0.1;
			var y = (y2 - y1) / len * Math.random() * 0.1;
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

function Sprite(filename, cols, rows, frames) {
	console.assert(this instanceof Sprite);
	var self = this;
	this.cols = cols;
	this.rows = rows;
	this.frames = frames || (cols * rows);
	this.width = 0;
	this.height = 0;
	this.img = new Image();
	this.img.onerror = function(e) { console.log("cannot load", filename, e); };
	this.img.onload = function() {
		self.width = self.img.width / self.cols;
		self.height = self.img.height / self.rows;
	};
	this.img.src = filename;
}
Sprite.prototype = {
	render: function(ctx, x, y, width, height, idx) {
		var frame = Math.floor(idx) % this.frames;
		var sy = 3 * this.height; //Math.floor(frame / this.cols) * this.height;
		var sx = 2 * this.height; //(frame % this.cols) * this.width;
		ctx.drawImage(this.img,
			sx, sy, this.width, this.height,
			x, y, width, height);
	},
};
var sprites = {
	buffalo: new Sprite("buffalo.png", 4, 4),
};

function Thing(layer, speed, colour, width, height, sprite) {
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
}
Thing.prototype = {
	render: function(ctx, now, y_scaler, x_ofs) {
		var layer = this.layer;
		var elapsed = (now - this.start_time);
		if (this.speed) {
			elapsed /= this.speed;
			var x = x_ofs + elapsed;
		} else {
			elapsed /= 100;
			var x = x_ofs + 1;
		}
		var y_scale = layer.y_scale * y_scaler;
		var y_ofs = (canvas.height / 2) + layer.y_ofs * y_scaler;
		var y = layer.y_func(x) * y_scale + y_ofs;
		var normal = layer.normal(x);
		normal[0] *= (layer.y_scale * y_scaler) / layer.x_scale;
		var dx = normal[0], dy = normal[1];
		x = (x - x_ofs) * layer.x_scale;
		ctx.strokeStyle = this.colour;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.arc(x, y, 5, 0, Math.PI*2);
		ctx.stroke();
		ctx.save();
		ctx.translate(x, y - this.height / 2);
		ctx.rotate(Math.atan2(dy, dx));
		if (this.sprite && this.sprite.width) {
			this.sprite.render(ctx, -this.width/2, 0, this.width, this.height, elapsed / 10);
		}
		ctx.rect(-this.width/2, 0, this.width, this.height);
		ctx.stroke();
		ctx.restore();
		this.pos = [x, y];
		this.normal = normal;
	},
};

var player = new Thing(layers[1], 0, "blue", 20, 30);

var things = [
	new Thing(layers[0], 1000, "green", 25, 40, sprites.buffalo),
	new Thing(layers[2], 2000, "maroon", 20, 50, sprites.buffalo)];
	
function Arrow() {
	console.assert(this instanceof Arrow);
	this.hand = hand;
	var dx = hand[0] - shoulder[0], dy = hand[1] - shoulder[1];
	var normalize = 1 / Math.sqrt(dx * dx + dy * dy);
	this.arm = [dx * normalize, dy * normalize];
	this.start_time = now();
	this.azimuth = bow_azimuth;
	this.power = 1 - get_bow_draw_len(this.start_time);
	this.lifetime = 1000 * this.power;
}
Arrow.prototype = {
	colour: "black",
	path_colour: "lightgray",
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
		var dx = this.arm[0], dy = this.arm[1];
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
		var x2 = x1 - dx * 15;
		var y2 = y1 - dy * 15;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		this._cheveron(ctx, x2, y2, dx, dy, 14.5, 3);
		this._cheveron(ctx, x2, y2, dx, dy, 0, 3);
		this._cheveron(ctx, x2, y2, dx, dy, 3, 3);
		return t > this.lifetime;
	},
};
var arrows = [];

var start_time, mouse_pos;

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
	};
	canvas.ontouchmove = canvas.onmousemove = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		mouse_pos = [Math.max(canvas.width / 2, pos.clientX), pos.clientY];
	};
	canvas.ontouchend = canvas.ontouchcancel = canvas.onmouseup = function(evt) {
		evt.preventDefault();
		var pos = evt.touches? evt.touches[0]: evt;
		if (pos) {
			mouse_pos = [Math.max(canvas.width / 2, pos.clientX), pos.clientY];
		}
		if (bow_draw_start && shoulder)
			arrows.push(new Arrow());
		bow_draw_start = null;
	};
	canvas.setAttribute('tabindex','0');
	canvas.focus();
	start_time = now();
}

function render() {
	window.requestAnimationFrame(render);
	try {
		var now = window.now();
		var elapsed = now - start_time;
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
			thing.render(ctx, now, y_scaler, x_ofs);
			if (thing.pos[0] < -thing.width || thing.pos[0] > canvas.width + thing.width)
				old.push(idx);
		}
		for (var idx = old.length; idx --> 0; ) {
			var thing = things[old[idx]];
			things.splice(old[idx], 1);
			things.push(new Thing(thing.layer, thing.speed, thing.colour, thing.width, thing.height, thing.sprite));
		}
		player.render(ctx, now, y_scaler, x_ofs);
		if (mouse_pos) {
			if (bow_draw_start) {
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
			if (arrow.render(ctx, now, x_ofs))
				old.push(idx);
		}
		for (var idx = old.length; idx --> 0; ) {
			arrows.splice(old[idx], 1);
		}
	} catch(e) {
		window.onerror(e.message, e.filename, e.lineno, e.colno, e.error);
	}
}