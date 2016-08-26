function Transform2D(m) {
	console.assert(this instanceof Transform2D);
	this.m = m || this.identity;
	this.inv = null;
	this.factor = 1;
}
Transform2D.prototype = {
	identity: [1,0,0,1,0,0],
	reset: function() {
		this.m = this.m.slice();
		this.inv = null;
		this.factor = 1;
	},
	multiply: function(matrix) {
		var m = this.m, mm = matrix.m;
		this.m = [
			m[0] * mm[0] + m[2] * mm[1],
			m[1] * mm[0] + m[3] * mm[1],
			m[0] * mm[2] + m[2] * mm[3],
			m[1] * mm[2] + m[3] * mm[3],
			m[0] * mm[4] + m[2] * mm[5] + m[4],
			m[1] * mm[4] + m[3] * mm[5] + m[5]];
		this.inv = null;
		this.factor * matrix.factor;
	},
	rotate: function(rad) {
		var c = Math.cos(rad), s = Math.sin(rad), m = this.m;
		this.m = [
			m[0] *  c + m[2] * s,
			m[1] *  c + m[3] * s,
			m[0] * -s + m[2] * c,
			m[1] * -s + m[3] * c];
		this.inv = null;
	},
	translate: function(x, y) {
		var m = this.m;
		this.m = [
			m[0],
			m[1],
			m[2],
			m[3],
			m[4] + m[0] * x + m[2] * y,
			m[5] + m[1] * x + m[3] * y];
		this.inv = null;
	},
	scale: function(s) {
		var m = this.m;
		this.m = [
			m[0] * s,
			m[1] * s,
			m[2] * s,
			m[3] * s,
			m[4],
			m[5]];
		this.inv = null;
		this.factor *= s;
	},
	project: function(px, py) {
		var m = this.m;
		return [
			px * m[0] + py * m[2] + m[4],
			px * m[1] + py * m[3] + m[5]];
	},
	inversion: function() {
		if(!this.inv) {
			var m = this.m;
			var d = 1 / (m[0] * m[3] - m[1] * m[2]);
			this.inv = new Transform2D([
				m0 = m[3] * d,
				-m[1] * d,
				-m[2] * d,
				m[0] * d,
				d * (m[2] * m[5] - m[3] * m[4]),
				d * (m[1] * m[4] - m[0] * m[5])]);
		}
		return this.inv;
	},
	unproject: function(px, py) {
		return this.inversion().project(px, py);
	}
};
