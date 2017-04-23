
function LD38() {
	UIViewport.call(this,this);
	this.map = null;
	this.flat_shading = true;
	this.vary_height = false;
	this.camera = {
		centre: [0, 0, 0],
		up: vec3_normalise([0, 1, 1]),
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
	this.win = new UIWindow(false,this); // a window to host this viewport in
	this.lastTick = now();
	this.tool = null;
	this.win = new UIWindow(false, this); // a window to host this viewport in
	this.iterations = 4;
	this.map = this.makeMap();
	var self = this;
	loadFile("image","data/world_physical_enhanced_pacific_giclee_lg.jpg", function(tex) {
			self.uniforms.texture = tex;
	});
}

LD38.prototype = {
	__proto__: UIViewport.prototype,
	render: function(ctx) {
		gl.clearColor(0.25, 0.3, 0.2, 1);
		gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
		// spin the sphere
		var elapsed = now()-this.lastTick;
		//this.camera.eye = vec3_rotate(this.camera.eye, elapsed / 10000, this.camera.centre, vec3_add(this.camera.centre, this.camera.up));
		this.lastTick += elapsed;
		this.uniforms.mvMatrix = createLookAt(this.camera.eye, this.camera.centre, this.camera.up);
		// and draw it
		var self = this;
		programs.standard(function(program) {
			gl.bindBuffer(gl.ARRAY_BUFFER, self.map.vVbo);
			gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 8*4, 0);
			gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, 8*4, 3*4);
			gl.vertexAttribPointer(program.texCoord, 2, gl.FLOAT, false, 8*4, 6*4);
			gl.drawArrays(gl.TRIANGLES, 0, self.map.vCount);
			gl.uniform4fv(program.colour, [1, 0, 0, 255]);
			gl.bindTexture(gl.TEXTURE_2D,programs.blankTex);
			gl.drawArrays(gl.LINES, 0, self.map.vCount);
			gl.bindBuffer(gl.ARRAY_BUFFER,null);
		}, this.uniforms);
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
	onMouseDown: function(e) {
		console.log("aha", e);
	},
	makeMap: function() {
		var iterations = this.iterations;
		// (my old blog post: http://williamedwardscoder.tumblr.com/post/36660467688/rendering-spheres-with-triangles )
		// first we make an icosphere
		var	vertices = [],
			vIndex = {},
			indices = [],
			edges = {},
			heights = [],
			addTriangle = function(a, b, c) {
				edges[a+","+b] = edges[b+","+c] = edges[c+","+a] = heights.length;
				heights.push(0);
				indices.push(a, b, c);
			},
			addVertex = function(v) {
				var key = vec3_scale(v, 10000); // round by this much to avoid floating point errors
				key = [key[0]|0, key[1]|0, key[2]|0];
				if(!(key in vIndex)) {
					vIndex[key] = vertices.length;
					vertices.push(v);
				}
				return vIndex[key];
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
		var HEIGHT = 0.05;
		if (this.vary_height) {
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
		var triangles = [];
		var addFace = function(A, B, a, b) {
			var c = vertices[A],
				d = vertices[B];
			var n = triangle_normal(c, b, a);
			triangles.push(
				a[0], a[1], a[2], n[0], n[1], n[2], 0, 0,
				b[0], b[1], b[2], n[0], n[1], n[2], 0, 0, 
				c[0], c[1], c[2], n[0], n[1], n[2], 0, 0,
				b[0], b[1], b[2], n[0], n[1], n[2], 0, 0,
				d[0], d[1], d[2], n[0], n[1], n[2], 0, 0, 
				c[0], c[1], c[2], n[0], n[1], n[2], 0, 0);
		};
		var texcoord = function(pt) {
			pt = vec3_normalise(pt);
			var u = 0.5 + Math.atan2(pt[2], pt[0]) / (Math.PI * 2);
			var v = 0.5 - Math.asin(pt[1]) / Math.PI;
			return [u, v];
		};
		for (var i=0; i<heights.length; i++) {
			var height = heights[i];
			var A = indices[i*3 + 0], a = vertices[A],
				B = indices[i*3 + 1], b = vertices[B],
				C = indices[i*3 + 2], c = vertices[C];
			var ta = texcoord(a), tb = texcoord(b), tc = texcoord(c);
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
				if (ab < height) addFace(A, B, a, b);
				if (bc < height) addFace(B, C, b, c);
				if (ca < height) addFace(C, A, c, a);
			}
			if (this.flat_shading) {
				var n = triangle_normal(a,b,c);
				triangles.push(
					a[0], a[1], a[2], n[0], n[1], n[2], ta[0], ta[1],
					c[0], c[1], c[2], n[0], n[1], n[2], tc[0], tc[1],
					b[0], b[1], b[2], n[0], n[1], n[2], tb[0], tb[1]);
			} else {
				triangles.push(
					a[0], a[1], a[2], -a[0], -a[1], -a[2], ta[0], ta[1],
					c[0], c[1], c[2], -c[0], -c[1], -c[2], tc[0], tc[1],
					b[0], b[1], b[2], -b[0], -b[1], -b[2], tb[0], tb[1]);
			}
		}
		triangles = new Float32Array(triangles);
		// generate the VBO
		var map = {
			vVbo: gl.createBuffer(),
			vCount: triangles.length / 8,
		};
		gl.bindBuffer(gl.ARRAY_BUFFER, map.vVbo);
		gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		console.log(iterations,"iterations = ",heights.length,"triangles,",vertices.length,"vertices");
		return map;
	},
}