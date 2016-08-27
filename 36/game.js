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
	this.y_at = y_func;
	this._segment_cache = {}
}
Layer.prototype.segment = function(x_start, x_step, x_stop) {
	var key = x_start + ':' + x_step + ':' + x_stop;
	if (key in this._segment_cache)
		return this._segment_cache[key];
	var y_func = this.y_at;
	var y = y_func(x_start);
	var seg = [];
	var emit = function(x1, y1, x2, y2) {
		var len = Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2));
		var x = (x2 - x1) / len * Math.random() * 0.1;
		var y = (y2 - y1) / len * Math.random() * 0.1;
		seg.push(x1 - x, y1 - y, x2 + x, y2 + y);
		return x2 + 0.01;
	};
	while (x_start < x_stop) {
		var next_x = x_start + x_step;
		var next_y = y_func(next_x);
		x_start = emit(x_start, y, next_x, next_y);
		y = next_y;
	}
	this._segment_cache[key] = seg;
	return seg;
};
Layer.prototype.render = function(ctx, y_scaler, x_ofs) {
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

};

var layers = [
	new Layer("blue", 50, 300, -100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("red", 100, 500, 100, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; }),
	new Layer("green", 200, 300, 400, function(x) { return Math.sin(x) * 0.1 + Math.sin(x * 0.3) * 0.2; })];

var start_time;

function start() {
	start_time = now();
}

function render() {
	window.requestAnimationFrame(render);
	try {
		var elapsed = now() - start_time;
		var x_ofs = elapsed / 1000;
		var y_scaler = canvas.height / 1000;
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (var layer in layers) {
			layers[layer].render(ctx, y_scaler, x_ofs);
		}
	} catch(e) {
		window.onerror(e.message, e.filename, e.lineno, e.colno, e.error);
	}
}