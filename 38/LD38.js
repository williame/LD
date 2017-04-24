"use strict";

function LD38() {
	UIViewport.call(this,this);
	var self = this;
	this.map = null;
	this.flat_shading = true;
	this.vary_height = false;
	this.camera = {
		centre: [0, 0, 0],
		up: vec3_normalise([0, 1, 0]),
		right: vec3_normalise([0, 0, 1]),
		eye: [3, 1, 0],
	};
	this.uniforms = {
		colour: [1, 1, 1, 1],
		lightColour: [1, 0.95, 1],
		lightDir: [0.2, 0.2, -1],
		ambientLight: [0.3, 0.3, 0.3],
		fogColour: [1,1,0.8,1],
		fogDensity: 0.02,
		pMatrix: null,
		mvMatrix: null,
	};
	loadFile("image","data/world_physical_enhanced_pacific_giclee_lg.jpg", function(tex) {
			self.uniforms.texture = tex;
	});
	this.program = Program(
		"precision mediump float;\n"+
		"attribute vec3 vertex;\n"+
		"attribute vec3 colour;\n"+
		"varying vec3 vertex_colour;\n"+
		"uniform mat4 mvMatrix, pMatrix;\n"+
		"void main() {\n"+
		"	gl_Position = pMatrix * mvMatrix * vec4(vertex,1.0);\n"+
		"	vertex_colour = colour;\n"+
		"}\n",
		"precision mediump float;\n"+
		"varying vec3 vertex_colour;\n"+
		"void main() {\n"+
		"	gl_FragColor = vec4(vertex_colour, 1.0);\n"+
		"}\n");
	this.win = new UIWindow(false,this); // a window to host this viewport in
	this.lastTick = now();
	this.tool = null;
	this.win = new UIWindow(false, this); // a window to host this viewport in
	this.iterations = Math.max(2, parseInt(getParameterByName("level")) || 0);
	this.map = this.makeMap();
	this.minefield = this.makeMinefield((this.map.triangles.length / 10)|0);
	this.overlay = {
		vbo: gl.createBuffer(),
		count: 0,
		shown: {},
		triangles: [],
	};
	this.highlight = {
		vbo: gl.createBuffer(),
		count: 0,
		hit: -1,
		lineWidth: 3,
	};
	this.zoomDiff = 1;
	this.toolTip = new UIWindow(false, new UIPanel([new UILabel("", OPAQUE, "label")]));
}

LD38.prototype = {
	__proto__: UIViewport.prototype,
	colours: {
		0:	[1, 1, 1],
		1:	[0.8, 0.8, 0.8],
		2:	[0.7, 0.7, 0.7],
		3:	[0.6, 0.6, 0.6],
		4:	[0.5, 0.5, 0.5],
		5:	[0.4, 0.4, 0.4],
		6:	[0.3, 0.3, 0.3],
		"M":[1, 0, 0],
	},
	render: function(ctx) {
		gl.clearColor(0.25, 0.3, 0.2, 1);
		gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
		// spin the sphere
		var elapsed = now()-this.lastTick;
		this.lastTick += elapsed;
		var scroll_speed = 1000;
		if(keys[37] && !keys[39]) { // left
			this.camera.eye = vec3_rotate(this.camera.eye, elapsed / scroll_speed, this.camera.centre, vec3_add(this.camera.centre, this.camera.up));
			this.setHighlight();
		} else if(keys[39] && !keys[37]) { // right
			this.camera.eye = vec3_rotate(this.camera.eye, -elapsed / scroll_speed, this.camera.centre, vec3_add(this.camera.centre, this.camera.up));
			this.setHighlight();
		} if(keys[38] && !keys[40]) { // up
			this.camera.eye = vec3_rotate(this.camera.eye, elapsed / scroll_speed, this.camera.centre, vec3_add(this.camera.centre, this.camera.right));
			this.setHighlight();
		} else if(keys[40] && !keys[38]) { // down
			this.camera.eye = vec3_rotate(this.camera.eye, -elapsed / scroll_speed, this.camera.centre, vec3_add(this.camera.centre, this.camera.right));
			this.setHighlight();
		} // and draw it
		this.uniforms.mvMatrix = createLookAt(vec3_scale(this.camera.eye, Math.min(2, Math.max(1 - (0.1 * this.iterations), this.zoomDiff))), this.camera.centre, this.camera.up);
		var self = this;
		programs.standard(function(program) {
			gl.bindBuffer(gl.ARRAY_BUFFER, self.map.vbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 8*4, 0);
			gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, 8*4, 3*4);
			gl.vertexAttribPointer(program.texCoord, 2, gl.FLOAT, false, 8*4, 6*4);
			gl.drawArrays(gl.TRIANGLES, 0, self.map.count);
			gl.bindTexture(gl.TEXTURE_2D,programs.blankTex);
			gl.drawArrays(gl.LINES, 0, self.map.count);
			gl.bindBuffer(gl.ARRAY_BUFFER,null);
		}, this.uniforms);
		if (this.overlay.count) {
			this.program(function(program) {
				gl.bindBuffer(gl.ARRAY_BUFFER, self.overlay.vbo);
				gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 6*4, 0);
				gl.vertexAttribPointer(program.colour, 3, gl.FLOAT, false, 6*4, 3*4);
				gl.drawArrays(gl.TRIANGLES, 0, self.overlay.count);
				gl.bindBuffer(gl.ARRAY_BUFFER,null);
			}, this.uniforms);
		}
		if (this.highlight.count) {
			programs.solidFill(function(program) {
				gl.bindBuffer(gl.ARRAY_BUFFER, self.highlight.vbo);
				gl.uniform4fv(program.colour, [1, 0, 0, 1]);
				gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 3*4, 0);
				var oldLineWidth = gl.getParameter(gl.LINE_WIDTH);
				gl.lineWidth(self.highlight.lineWidth);
				gl.drawArrays(gl.LINE_LOOP, 0, self.highlight.count);
				gl.bindBuffer(gl.ARRAY_BUFFER,null);
				gl.lineWidth(oldLineWidth);
			}, this.uniforms);
		}
	},
	show: function() {
		this.onResize();
		this.win.show(-1);
	},
	hide: function() {
		this.win.hide();
	},
	onResize: function() {
		this.setPos([0, 0]);
		this.setSize([canvas.width, canvas.height]);
		this.layout();
		this.uniforms.pMatrix = new Float32Array(createPerspective(30.0, canvas.width/canvas.height, 0.01, 30));
	},
	onMouseMove: function(evt) {
		var line = this.mouseRay(evt),
			ray_origin = line[0],
			ray_dir = vec3_sub(line[1], line[0]),
			map = this.map,
			vertices = map.vertices,
			triangles = map.triangles,
			best = -1, best_dist = Number.MAX_SAFE_INTEGER;
		for (var t in triangles) {
			var tri = triangles[t],
				a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]], n = tri[3],
				hit = triangle_ray_intersection(a, c, b, ray_origin, ray_dir, n, true, false);
			if (hit && (best == -1 || hit[0] < best_dist)) {
				best = t;
				best_dist = hit[0];
			}
		}
		this.setHighlight(best);
	},
	onMouseDown: function(evt) {
		var t = this.highlight.hit;
		if (t == -1)
			return;
		var open = [t],
			map = this.map,
			triangles = map.triangles,
			neighbours = map.neighbours,
			vertices = map.vertices,
			overlay = this.overlay;
		while (open.length) {
			var t = open.pop();
			if (t in overlay.shown)
				continue;
			overlay.shown[t] = 1;
			var type = this.minefield.field[t];
			var tri = triangles[t],
				a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]],
				colour = this.colours[type == "M"? type: Math.min(type, 6)];
			overlay.triangles.push(
				a[0], a[1], a[2], colour[0], colour[1], colour[2],
				c[0], c[1], c[2], colour[0], colour[1], colour[2],
				b[0], b[1], b[2], colour[0], colour[1], colour[2]);
			if (type === 0) {
				for (c=0; c<3; c++)
					open = open.concat(neighbours[tri[c]]);
			} else if (type == "M") {
				console.log("BOOM!");
			}
			overlay.count += 3;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.overlay.triangles), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.setHighlight();
		this.setHighlight(t);
	},
	onMouseWheel: function(evt, amount) {
		if(this.isMouseInRect(evt)) {
			this.zoomDiff += amount / 1000;
			this.setHighlight();
			return true;
		}
		return false;
	},
	uvMapping: function(pt) {
		pt = vec3_normalise(pt);
		var u = 0.5 + Math.atan2(pt[2], pt[0]) / (Math.PI * 2);
		var v = 0.5 - Math.asin(pt[1]) / Math.PI;
		return [u, v];
	},
	makeMap: function() {
		var iterations = this.iterations;
		// (my old blog post: http://williamedwardscoder.tumblr.com/post/36660467688/rendering-spheres-with-triangles )
		// first we make an icosphere
		var	self = this,
			vertices = [],
			index = {},
			indices = [],
			edges = {},
			heights = [],
			neighbours = [],
			addTriangle = function(a, b, c) {
				edges[a+","+b] = edges[b+","+c] = edges[c+","+a] = heights.length;
				heights.push(0);
				indices.push(a, b, c);
			},
			addVertex = function(v) {
				var key = vec3_scale(v, 10000); // round by this much to avoid floating point errors
				key = [key[0]|0, key[1]|0, key[2]|0];
				if(!(key in index)) {
					index[key] = vertices.length;
					vertices.push(v);
					neighbours.push([]);
				}
				return index[key];
			},
			halfway = function(a, b) {
				a = vertices[a];
				b = vertices[b];
				var v = vec3_normalise(vec3_add(a,vec3_scale(vec3_sub(b,a),0.5)));
				return addVertex(v);
			},
			bisect = function(a,b,c,iteration) {
				var	ab = halfway(a,b), ac = halfway(a,c), bc = halfway(b,c),
					func = iteration==iterations? addTriangle: bisect;
				func(a,ab,ac,iteration+1);
				func(b,bc,ab,iteration+1);
				func(c,ac,bc,iteration+1);
				func(ab,bc,ac,iteration+1);
			},
			top = addVertex([0,-1,0]),
			bottom = addVertex([0,1,0]),
			leftFront = addVertex(vec3_normalise([-1,0,-1])),
			leftBack = addVertex(vec3_normalise([-1,0,1])),
			rightFront = addVertex(vec3_normalise([1,0,-1])),
			rightBack = addVertex(vec3_normalise([1,0,1]));
		bisect(leftFront,top,rightFront,0);
		bisect(rightFront,bottom,leftFront,0);
		bisect(leftBack,top,leftFront,0);
		bisect(bottom,leftBack,leftFront,0);
		bisect(rightFront,top,rightBack,0);
		bisect(bottom,rightFront,rightBack,0);
		bisect(rightBack,top,leftBack,0);
		bisect(bottom,rightBack,leftBack,0);
		// now we have a unit icosphere...
		// make some a different height
		if (this.vary_height) {
			var HEIGHT = 0.05;
			for (var i=0; i<heights.length; i+=(Math.random()*5)|1)
				heights[i] = HEIGHT;
			// fill in any voids
			do {
				var changed = false;
				for (var i=0; i<heights.length; i++) {
					var A = indices[i*3 + 0],
						B = indices[i*3 + 1],
						C = indices[i*3 + 2],
						neighbours = heights[edges[B+","+A]] + heights[edges[C+","+B]] + heights[edges[A+","+C]];
					if (heights[i] && neighbours < HEIGHT && Math.random() > 0.8) {
						heights[i] = 0;
						changed = true;
					} else if (!heights[i] && neighbours > HEIGHT && Math.random() > 0.8) {
						heights[i] = HEIGHT;
						changed = true;
					}
				}
			} while(changed);
		}
		// turn into triangles
		var count = 0, output = [], triangles = [], adjacency = {};
		var addFlatFace = function(A, B, a, b) {
			var c = vertices[A],
				d = vertices[B];
			var n = triangle_normal(c, b, a);
			output.push(
				a[0], a[1], a[2], n[0], n[1], n[2], 0, 0,
				b[0], b[1], b[2], n[0], n[1], n[2], 0, 0, 
				c[0], c[1], c[2], n[0], n[1], n[2], 0, 0,
				b[0], b[1], b[2], n[0], n[1], n[2], 0, 0,
				d[0], d[1], d[2], n[0], n[1], n[2], 0, 0, 
				c[0], c[1], c[2], n[0], n[1], n[2], 0, 0);
			triangles.push(null, null);
			count += 2;
		};
		for (var i=0; i<heights.length; i++) {
			var A = indices[i*3 + 0], a = vertices[A],
				B = indices[i*3 + 1], b = vertices[B],
				C = indices[i*3 + 2], c = vertices[C];
			var height = heights[i];
			if (height) {
				a = vec3_scale(a, 1 + height);
				b = vec3_scale(b, 1 + height);
				c = vec3_scale(c, 1 + height);
				var ab = heights[edges[B+","+A]],
					bc = heights[edges[C+","+B]],
					ca = heights[edges[A+","+C]];
					assert(!isNaN(ab));
					assert(!isNaN(bc));
					assert(!isNaN(ca));
				if (ab < height) addFlatFace(A, B, a, b);
				if (bc < height) addFlatFace(B, C, b, c);
				if (ca < height) addFlatFace(C, A, c, a);
			}
			var ta = this.uvMapping(a), tb = this.uvMapping(b), tc = this.uvMapping(c);
			var n = triangle_normal(a,b,c);
			if (this.flat_shading) {
				output.push(
					a[0], a[1], a[2], n[0], n[1], n[2], ta[0], ta[1],
					c[0], c[1], c[2], n[0], n[1], n[2], tc[0], tc[1],
					b[0], b[1], b[2], n[0], n[1], n[2], tb[0], tb[1]);
			} else {
				output.push(
					a[0], a[1], a[2], -a[0], -a[1], -a[2], ta[0], ta[1],
					c[0], c[1], c[2], -c[0], -c[1], -c[2], tc[0], tc[1],
					b[0], b[1], b[2], -b[0], -b[1], -b[2], tb[0], tb[1]);
			}
			triangles.push([A, B, C, n]);
			neighbours[A].push(count);
			neighbours[B].push(count);
			neighbours[C].push(count);
			count++;
		}
		// generate the VBO
		var map = {
			vbo: gl.createBuffer(),
			count: count * 3,
			vertices: vertices,
			index: index,
			indices: indices,
			edges: edges,
			heights: heights,
			triangles: triangles,
			neighbours: neighbours,
			adjacency: adjacency,
		};
		gl.bindBuffer(gl.ARRAY_BUFFER, map.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(output), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		console.log(iterations,"iterations = ",heights.length,"triangles,",vertices.length,"vertices");
		return map;
	},
	setHighlight: function(t) {
		if (isNaN(t)) t = -1;
		if (t == this.highlight.hit)
			return;
		this.highlight.hit = t;
		if (t == -1) {
			this.highlight.count = 0;
			this.toolTip.hide();
		} else {
			var tri = this.map.triangles[t],
				vertices = this.map.vertices,
				a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]];
			gl.bindBuffer(gl.ARRAY_BUFFER, this.highlight.vbo);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
				a[0], a[1], a[2],
				c[0], c[1], c[2],
				b[0], b[1], b[2]]), gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
			this.highlight.count = 3;
			var type = this.minefield.field[t];
			if (type !== 0 && t in this.overlay.shown) {
				var label =  this.toolTip.find("label");
				label.setText("" + type);
				this.toolTip.ctrl.setPos(mousePos);
				this.toolTip.show();
			} else
				this.toolTip.hide();
		}
	},
	makeMinefield: function(n) {
		var map = this.map,
			field = [],
			mines = [],
			i;
		for (i=0; i<map.triangles.length; i++) {
			mines.push(i);
			field.push([]);
		}
		mines = array_shuffle(mines).slice(0, Math.min(n, mines.length));
		for (i=0; i<mines.length; i++) {
			field[mines[i]] = "M";
		}
		for (var m in mines) {
			m = mines[m];
			var triangle = map.triangles[m];
			for (var c=0; c<3; c++) {
				var corner = triangle[c];
				for (var neighbour in map.neighbours[corner]) {
					neighbour = field[map.neighbours[corner][neighbour]];
					if (neighbour != "M" && !array_contains(neighbour, corner))
						neighbour.push(corner);
				}
			}
		}
		for (i=0; i<field.length; i++) {
			if (field[i] != "M")
				field[i] = field[i].length;
		}
		return {
			n: n,
			mines: mines,
			field: field,
		};
	},
}

function array_shuffle(array) {
    var counter = array.length;
    while (counter > 0) {
        var index = Math.floor(Math.random() * counter);
        counter--;
        var temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }
    return array;
}

function array_contains(array, needle) {
	for (var i in array)
		if (array[i] == needle)
			return true;
	return false;
}
