"use strict";

var world;

function mod(n, m) { // always returns a positive number
    var remain = n % m;
    return Math.floor(remain >= 0 ? remain : remain + m);
};

function BooleanPalette(False, True) {
	return function(v) {
		return v? True: False;
	};
};

function AlphaPalette(r, g, b, a, max) {
	return function(v) {
		return "rgba(" + r + "," + g + "," + b + "," + (v / max * a) + ")";
	};
};

function Layer(world, palette) {
	console.assert(this instanceof Layer, this);
	console.assert(world instanceof World, world);
	this.world = world;
	this.palette = palette;
	if (this.palette) {
		this.img = document.createElement("canvas");
		this.img.width = this.world.W;
		this.img.height = this.world.H;
		this.ctx = this.img.getContext("2d");
	}
	this.occupied = {};
};
Layer.prototype = {
	get: function(pos) {
			return this.occupied[this.world.encode_pos(pos)];
		},
	set: function(pos, value) {
			var idx = this.world.encode_pos(pos);
			if (value) {
				this.occupied[idx] = value;
				if (this.palette) {
					this.ctx.fillStyle = this.palette(value);
					this.ctx.fillRect(pos[0], pos[1], 1, 1);
				}
			} else {
				delete this.occupied[idx];
				if (this.palette) {
					this.ctx.clearRect(pos[0], pos[1], 1, 1);
				}
			}
		},
};

function World(W, H) {
	console.assert(this instanceof World, this);
	this.W = W;
	this.H = H;
	this.nest = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(0,0,255,1)"));
	this.ants = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(255,255,255,1)"));
	this.food = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(255,0,0,1)"));
	this.pheremone_food_max = 3;
	this.pheremone_food = new Layer(this, AlphaPalette(255, 0, 255, 0.75, this.pheremone_food_max));
	this.pheremone_nest_max = 3;
	this.pheremone_nest = new Layer(this, AlphaPalette(255, 255, 0, 0.75, this.pheremone_nest_max));
};
World.prototype = {
	encode_pos: function(pos) {
			var x = pos[0], y = pos[1];
			console.assert(x >= 0 && x < this.W && y >= 0 && y < this.H, pos);
			return y * this.W + x;
		},
	decode_pos: function(serialized) {
			serialized = parseInt(serialized);
			var pos = [0, parseInt(serialized / this.W)];
			pos[0] = serialized - (pos[1] * this.W);
			return pos;
		},
	dist_score: function(a, b) {
			if (!a || !b)
				return 0;
			var x = a[0] - b[0], y = a[1] - b[1];
			return (x * x + y * y) + Math.random(); // sqrd dist
		},
	step: function() {
			for (var ant in this.ants.occupied) {
				ant = this.ants.occupied[ant];
				if (ant.food) {
					ant.seek_nest();
				} else {
					ant.seek_food(); 
				}
			}
			this.age_pheremone(this.pheremone_food);
			this.age_pheremone(this.pheremone_nest);
		},
	age_pheremone: function(pheremone) {
			var next = {}, faded = [], phem, count = 0;
			for (phem in pheremone.occupied) {
				var age = pheremone.occupied[phem] - 0.001;
				if (age > 0) {
					next[phem] = age;
				} else {
					count++;
					faded.push(phem);
				}
			}
			for (phem = 0; phem < count; phem++) {
				pheremone.set(this.decode_pos(faded[phem]), 0);
			}
			pheremone.occupied = next;
		},		
};

function Ant(world, dir, x, y) {
	console.assert(this instanceof Ant, this);
	console.assert(world instanceof World, world);
	this.world = world;
	this.dir = dir;
	this.pos = [x, y];
	this.food = false;
	this.age = 0;
	this.history = {};
	console.assert(!this.world.ants.get(this.pos));
	this.world.ants.set(this.pos, this);
}
Ant.prototype = {
	DIR: [[0, -1], [1, -1], [1, 0], [1,  1], [0,  1], [-1,  1], [-1, 0], [-1, -1]],
	turn: function(num) { 
			this.dir = mod(this.dir + num, 8);
		},
	turn_left: function() { this.turn(-1); },
	turn_right: function() { this.turn(1); },
	move_forward: function() {
			console.assert(this.world.ants.get(this.pos) == this);
			this.world.ants.set(this.pos, null);
			this.history[this.pos[1] * this.world.W + this.pos[0]] = this.age++;
			var delta = this.DIR[this.dir];
			this.pos[0] = Math.min(Math.max(this.pos[0] + delta[0], 0), this.world.W-1);
			this.pos[1] = Math.min(Math.max(this.pos[1] + delta[1], 0), this.world.H-1);
			console.assert(!this.world.ants.get(this.pos));
			this.world.ants.set(this.pos, this);
		},
	drop_food: function() {
			console.assert(this.food);
			this.world.food.set(this.pos, (this.world.food.get(this.pos) || 0) + 1);
			this.food = false;
			this._mark_trail(world.nest, world.pheremone_nest, world.pheremone_nest_max);
		},
	take_food: function() {
			console.assert(!this.food);
			var food = this.world.food.get(this.pos);
			console.assert(food, this.pos);
			this.world.food.set(this.pos, food - 1);
			this.food = true;
			this._mark_trail(world.food, world.pheremone_food, world.pheremone_food_max);
		},
	_mark_trail: function(target, pheremone, max) {
			var world = this.world;
			var threshold = Math.max(0, this.age - Math.max(world.W, world.H) * 2);
			var max = (this.age - threshold);
			if (max) {
				var trail = {};
				for (var old in this.history) {
					var age = this.history[old];
					if (age >= threshold) {
						var pos = world.decode_pos(old), loc = [0, 0];
						for (var x = -1; x <= 1; x++) {
							loc[0] = pos[0] + x;
							if (loc[0] >= 0 && loc[0] < world.W) {
								for (var y = -1; y <= 1; y++) {
									loc[1] = pos[1] + y;
									if (loc[1] >= 0 && loc[1] < world.H) {
										var idx = world.encode_pos(loc);
										trail[idx] = Math.max(trail[idx] || 0, age);
									}
								}
							}
						}
					}
				}
				for (pos in trail) {
					var weight = (trail[pos] - threshold) / max;
					pos = world.decode_pos(pos);
					pheremone.set(pos, Math.min((pheremone.get(pos) || 0) + weight, max));
				}
			}
			this.age = 0;
			this.history = {};
		},
    neighbour: function(dir) {
			dir = this.DIR[mod(dir, 8)];
			var x = this.pos[0] + dir[0], y = this.pos[1] + dir[1];
			if (x < 0 || x >= this.world.W || y < 0 || y >= this.world.H)
				return null;
			return [x, y];
		},
	ahead: function() { return this.neighbour(this.dir); },
	seek_food: function() {
			var pos = this.pos, ahead = this.ahead(), world = this.world;
			if (world.food.get(pos) && !world.nest.get(pos)) {
				this.take_food();
			} else if (ahead && world.food.get(ahead) && !world.nest.get(ahead) && !world.ants.get(ahead)) {
				this.move_forward();
			} else {
				this._seek(world.food, world.pheremone_food, world.pheremone_food_max);
			}
		},
	seek_nest: function() {
			var pos = this.pos, ahead = this.ahead(), world = this.world;
			if (world.nest.get(pos)) {
				this.drop_food();
			} else if (ahead && world.nest.get(ahead) && !world.ants.get(ahead)) {
				this.move_forward();
			} else {
				this._seek(world.nest, world.pheremone_nest, world.pheremone_nest_max);
			}
		},
	_seek: function(target, pheremone, max) {
			var world = this.world;
			var nearby = new Array(5), ahead = 2, can_move = false, i;
			for (i = nearby.length; i --> 0; ) {
				nearby[i] = this.neighbour(this.dir - (ahead - i));
				can_move = can_move || nearby[i];
			}
			if (!can_move) { // nowhere legal to go?
				this.turn_right();
				return;
			}
			if (nearby[ahead] && world.ants.get(nearby[ahead])) {
				nearby[ahead] = null;
			}
			var candidates = new Array(nearby.length), i;
			for (i = nearby.length; i --> 0; ) {
				candidates[i] = 0;
				if (nearby[i]) {
					candidates[i] += (target.get(nearby[i]) || 0) * max; // favour real target over pheremone
					candidates[i] += pheremone.get(nearby[i]) || 0;
				}
			}
			var max = Math.max.apply(null, candidates);
			if (!max) { // nowhere tempting?  favour going forwards
				for (i = nearby.length; i --> 0; ) {
					if (nearby[i]) {
						candidates[i] = Math.random() + (i == ahead? Math.random() * 2: 0);
						max = Math.max(max, candidates[i]);
					}
				}
			}
			var target = 0;
			for (i = nearby.length; i --> 0; ) {
				if (candidates[i] == max) {
					candidates[i] *= 1.2; // boost the best choice(s)
				}
				target += candidates[i];
			}
			target *= Math.random();
			var dirs = [this.turn_left, this.turn_left, this.move_forward, this.turn_right, this.turn_right];
			for (i = nearby.length; i --> 0; ) {
				if (nearby[i] && candidates[i] >= target) {
					dirs[i].apply(this);
					return;
				}
				target -= candidates[i];
			}
			console.assert(!"off end of roulette!", nearby, candidates);
		},
};

