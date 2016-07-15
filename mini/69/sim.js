"use strict";

function assert(cond) {
	if (!cond) {
		console.log.apply(console, arguments);
		throw Error(123);
	}
}

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
		return "rgba(" + r + "," + g + "," + b + "," + Math.min(v / max * a, a) + ")";
	};
};

function Layer(world, palette, storage) {
	assert(this instanceof Layer, this);
	assert(world instanceof World, world);
	this.world = world;
	this.palette = palette;
	if (this.palette) {
		this.img = document.createElement("canvas");
		this.img.width = this.world.W;
		this.img.height = this.world.H;
		this.ctx = this.img.getContext("2d");
	}
	this.storage = storage? new storage(this.world.W * this.world.H): null;
	this.occupied = storage? null: {};
};
Layer.prototype = {
	get: function(pos) {
			if (this.storage) {
				return this.storage[this.world.encode_pos(pos)];
			} else {
				return this.occupied[this.world.encode_pos(pos)];
			}
		},
	set: function(pos, value) {
			var idx = this.world.encode_pos(pos);
			if (value) {
				if (this.storage) {
					this.storage[idx] = value;
				} else {
					this.occupied[idx] = value;
				}
				if (this.palette) {
					this.ctx.fillStyle = this.palette(value);
					this.ctx.fillRect(pos[0], pos[1], 1, 1);
				}
			} else {
				if (this.storage) {
					this.storage[idx] = 0;
				} else {
					delete this.occupied[idx];
				}
				if (this.palette) {
					this.ctx.clearRect(pos[0], pos[1], 1, 1);
				}
			}
		},
};

function World(W, H) {
	assert(this instanceof World, this);
	this.W = W;
	this.H = H;
	this.nest = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(0,0,255,1)"));
	this.ants = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(255,255,255,1)"));
	this.foraging = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(200,200,255,1)"), window.Uint8Array);
	this.returning = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(200,255,200,1)"), window.Uint8Array);
	this.food = new Layer(this, BooleanPalette("rgba(0,0,0,0)", "rgba(255,0,0,1)"), window.Uint16Array);
	this.pheromone_food_max = 3;
	this.pheromone_food = new Layer(this, AlphaPalette(255, 0, 255, 0.75, this.pheromone_food_max), window.Float32Array);
	this.pheromone_nest_max = 3;
	this.pheromone_nest = new Layer(this, AlphaPalette(255, 255, 0, 0.75, this.pheromone_nest_max), window.Float32Array);
	this.dropped = 0;
};
World.prototype = {
	encode_pos: function(pos) {
			var x = pos[0], y = pos[1];
			assert(x >= 0 && x < this.W && y >= 0 && y < this.H, pos);
			return y * this.W + x;
		},
	decode_pos: function(serialized) {
			serialized = parseInt(serialized);
			var pos = [0, parseInt(serialized / this.W)];
			pos[0] = serialized - (pos[1] * this.W);
			return pos;
		},
	step: function() {
			this.age_pheromone(this.pheromone_food);
			this.age_pheromone(this.pheromone_nest);
			for (var ant in this.ants.occupied) {
				ant = this.ants.occupied[ant];
				if (ant.food) {
					ant.seek_nest();
				} else {
					ant.seek_food(); 
				}
			}
			if (this.dropped) {
				for (var idx in this.nest.occupied) {
					var pos = this.decode_pos(idx);
					var amount = this.food.get(pos);
					while (amount > 3) {
						var x = pos[0], y = pos[1], loc = [0, 0];
						var DIR = Ant.prototype.DIR, dir, create = false;
						for (dir = DIR.length; dir --> 0; ) {
							loc[0] = x + DIR[dir][0];
							loc[1] = y + DIR[dir][1];
							if (!this.ants.get(loc)) {
								create = true;
								break;
							}
						}
						if (create) {
							console.log("creating new ant at " + loc);
							new Ant(this, dir, loc[0], loc[1]);
							amount -= 3;
							this.food.set(pos, amount);
						} else {
							break;
						}
					}
				}
				this.dropped = 0;
			}
		},
	age_pheromone: function(pheromone) {
			var next = {}, faded = [], phem, count = 0;
			for (phem in pheromone.occupied) {
				var age = pheromone.occupied[phem] - 0.001;
				if (age > 0) {
					next[phem] = age;
				} else {
					count++;
					faded.push(phem);
				}
			}
			for (phem = 0; phem < count; phem++) {
				pheromone.set(this.decode_pos(faded[phem]), 0);
			}
			pheromone.occupied = next;
		},
};

function Ant(world, dir, x, y) {
	assert(this instanceof Ant, this);
	assert(world instanceof World, world);
	this.world = world;
	this.dir = dir;
	this.pos = [x, y];
	this.food = false;
	this.age = 0;
	this.history = {};
	assert(!this.world.ants.get(this.pos));
	this.world.ants.set(this.pos, this);
	this.world.foraging.set(this.pos, 1);
}
Ant.prototype = {
	DIR: [[0, -1], [1, -1], [1, 0], [1,  1], [0,  1], [-1,  1], [-1, 0], [-1, -1]],
	turn: function(num) { 
			this.dir = mod(this.dir + num, 8);
		},
	turn_left: function() { this.turn(-1); },
	turn_right: function() { this.turn(1); },
	move_forward: function() {
			var world = this.world;
			var map = this.food? world.returning: world.foraging;
			assert(world.ants.get(this.pos) == this);
			world.ants.set(this.pos, null);
			assert(map.get(this.pos));
			map.set(this.pos, 0);
			this.history[this.pos[1] * world.W + this.pos[0]] = this.age++;
			var delta = this.DIR[this.dir];
			this.pos[0] = Math.min(Math.max(this.pos[0] + delta[0], 0), world.W-1);
			this.pos[1] = Math.min(Math.max(this.pos[1] + delta[1], 0), world.H-1);
			assert(!world.ants.get(this.pos));
			world.ants.set(this.pos, this);
			assert(!map.get(this.pos));
			map.set(this.pos, 1);
		},
	drop_food: function() {
			var world = this.world;
			assert(this.food);
			world.food.set(this.pos, (world.food.get(this.pos) || 0) + 1);
			this.food = false;
			assert(!world.foraging.get(this.pos));
			world.foraging.set(this.pos, 1);
			assert(world.returning.get(this.pos));
			world.returning.set(this.pos, 0);
			world.dropped++;
		},
	take_food: function() {
			var world = this.world;
			assert(!this.food);
			var food = world.food.get(this.pos);
			assert(food, this.pos);
			world.food.set(this.pos, food - 1);
			this.food = true;
			this._mark_trail(world.food, world.pheromone_food, world.pheromone_food_max);
			assert(world.foraging.get(this.pos));
			world.foraging.set(this.pos, 0);
			assert(!world.returning.get(this.pos));
			world.returning.set(this.pos, 1);
		},
	_mark_trail: function(target, pheromone, max) {
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
					pheromone.set(pos, Math.min((pheromone.get(pos) || 0) + weight, max));
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
			var nest = world.nest.get(pos);
			if (nest) {
				this._mark_trail(world.nest, world.pheromone_nest, world.pheromone_nest_max);
			}
			if (world.food.get(pos) && !nest) {
				this.take_food();
			} else if (ahead && world.food.get(ahead) && !world.nest.get(ahead) && !world.ants.get(ahead)) {
				this.move_forward();
			} else {
				this._seek(world.food, world.pheromone_food, world.pheromone_food_max);
			}
		},
	seek_nest: function() {
			var pos = this.pos, ahead = this.ahead(), world = this.world;
			if (world.nest.get(pos)) {
				this.drop_food();
			} else if (ahead && world.nest.get(ahead) && !world.ants.get(ahead)) {
				this.move_forward();
			} else {
				this._seek(world.nest, world.pheromone_nest, world.pheromone_nest_max);
			}
		},
	_seek: function(target, pheromone, max) {
			var world = this.world;
			var nearby = new Array(5), ahead = 2;
			var can_move = false, i;
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
				if (this.food) { // check to see if circumstances are right to create a new nest...
					var x = this.pos[0], y = this.pos[1], DIR = this.DIR, count = 0;
					if (x > 0 && x < world.W - 1 && y > 0 && y < world.H - 1) {
						for (i = DIR.length; i --> 0; count++) {
							if (!world.returning.get([x + DIR[i][0], y + DIR[i][1]]))
								break;
						}
					}
					if (count == DIR.length) {
						console.log("CREATING new nest at", this.pos);
						world.nest.set(this.pos, 1);
					}
				}
			}
			var candidates = new Array(nearby.length), i;
			for (i = nearby.length; i --> 0; ) {
				candidates[i] = 0;
				if (nearby[i]) {
					candidates[i] += target.get(nearby[i])? max: 0; // favour real target over pheromone
					candidates[i] += pheromone.get(nearby[i]) || 0;
				}
			}
			var max = Math.max.apply(null, candidates);
			if (!max) { // nowhere tempting?  favour going forwards
				for (i = nearby.length; i --> 0; ) {
					if (nearby[i]) {
						candidates[i] = (i == ahead? 3: 1); // favour ahead
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
			for (i = nearby.length; i --> 0; ) {
				if (nearby[i] && candidates[i] >= target) {
					if (i < ahead)
						this.turn_left();
					else if (i > ahead)
						this.turn_right();
					else
						this.move_forward();
					return;
				}
				target -= candidates[i];
			}
			assert(!"off end of roulette!", nearby, candidates);
		},
};

