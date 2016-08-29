"use strict";

var DEG2RAD = Math.PI/180;
var RAD2DEG = 180/Math.PI;

function LatLng(lat,lng) { //Y, X!
	console.assert(this instanceof LatLng);
	this.lat = lat;
	this.lng = lng;
}
LatLng.prototype = {
	to_mercator: function() { //inverted Y!
		var y = this.lat * DEG2RAD;
		y = RAD2DEG * Math.log(Math.tan(Math.PI/4.0+y*DEG2RAD/2.0));
		return [this.lng * DEG2RAD, -y];
	},
	distance: function(other) {
		assert(other instanceof LatLng);
		var	lng1 = this.lng, lat1 = this.lat,
			lng2 = other.lng, lat2 = other.lat,
			dlat = (lat2-lat1) * DEG2RAD,
			dlng = (lng2-lng1) * DEG2RAD;
		lat1 *= DEG2RAD;
		lat2 *= DEG2RAD;			
		var	a = Math.sin(dlat/2) * Math.sin(dlat/2) +
				Math.cos(lat1) * Math.cos(lat2) *
				Math.sin(dlng/2) * Math.sin(dlng/2),
			c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		return 6371 * c;
	},
};
LatLng.from_mercator = function(pos) { //inverted Y!
	var x = pos[0], y = -pos[1];
	return new LatLng(RAD2DEG * RAD2DEG * Math.log(Math.tan(Math.PI / 4.0 + y *DEG2RAD / 2.0)), x * RAD2DEG);
};

var	map_topo_bl = new LatLng(-94, -180).to_mercator(),
	map_topo_tr = new LatLng(90, 180).to_mercator(); // our map isn't perfectly aligned
	
function launch(uid) {
	window.open("http://www.ludumdare.com/compo/" + event_id + "/?action=preview&uid=" + uid);
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

function logout() {
	api("logout", function() { window.location.reload(); });
}

function forget() {
	var html = "We will remove your location from our database.";
	html += "<br/>Are you sure?";
	html += ' <button onclick="api(\'forget\', function() { window.location.reload(); })">yes</button>';
	html += ' <button onclick="modal()">no</button>';
	modal(html);
}

function getParameterByName(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var	regexS = "[\\?&]" + name + "=([^&#]*)",
		regex = new RegExp(regexS),
		results = regex.exec(window.location.search);
	if(results == null) return "";
	return decodeURIComponent(results[1].replace(/\+/g, " "));
}

function update_feedback_friends_feed(cb) {
	var doc = new XMLHttpRequest();
	doc.open("GET", "http://feedback.ld.intricati.com/api.php?action=eventsummary&event=" + event_id, true);
	doc.overrideMimeType("application/json");
	doc.onerror = window.onerror;
	doc.onreadystatechange = function() {
		if (doc.readyState==4 && (!doc.status || doc.status==200)) {
			window.entries = JSON.parse(doc.response);
			update_map();
			cb();
		}
	};
	doc.send();	
}

function load_img(path, cb) {
	var img = new Image();
	img.onerror = window.onerror;
	img.onload = function() {
		cb(img);
		render();
	};
	img.src = path;	
}

function load_shapefile() {
	var doc = new XMLHttpRequest();
	doc.open("GET", "data/TM_WORLD_BORDERS_SIMPL-0.3.shp", true);
	doc.responseType = "arraybuffer";
	doc.overrideMimeType('text/plain; charset=x-user-defined');
	doc.onerror = window.onerror;
	doc.onreadystatechange = function() {
		if (doc.readyState==4 && (!doc.status || doc.status==200)) {
			var shp = new DataView(doc.response);
			var len = shp.getUint32(24) * 2;
			var ofs = 100, points = [], shapes = [];
			var box = [1000, 1000, -1000, -1000];
			while(ofs < len) {
				ofs += 4;
				var next = ofs + (2 * shp.getUint32(ofs)) + 4;
				ofs += 8 + 4*8;
				var num_parts = shp.getUint32(ofs, true), num_points = shp.getUint32(ofs + 4, true);
				ofs += 8;
				var part, parts = [], point;
				for (part=0; part < num_parts; part++, ofs += 4)
					parts.push(shp.getUint32(ofs, true));
				for (point=0; point < num_points; point++, ofs += 16) {
					var pt = new LatLng(shp.getFloat64(ofs + 8, true), shp.getFloat64(ofs, true));
					pt = pt.to_mercator();
					box[0] = Math.min(pt[0], box[0]);
					box[1] = Math.min(pt[1], box[1]);
					box[2] = Math.max(pt[0], box[2]);
					box[3] = Math.max(pt[1], box[3]);
					points.push(pt[0], pt[1]);
				}
				var start = 0;
				for(part=1; part<num_parts; part++) {
					var end = parts[part];
					shapes.push(end-start);
					start = end;
				}
				shapes.push(num_points-start);
				ofs = next;
			}
			window.lines_map = {
				points: points,
				shapes: shapes,
			};
			render();
		}
	};
	doc.send();	
}

function api(path, cb, data, method) {
	var doc = new XMLHttpRequest();
	doc.open(method || "GET", "http://" + server + "/api/" + path, true);
	doc.overrideMimeType("application/json");
	doc.onerror = window.onerror;
	doc.onreadystatechange = function() {
		if (doc.readyState==4 && (!doc.status || doc.status==200)) {
			cb(doc.response? JSON.parse(doc.response): null);
		}
	};
	doc.withCredentials = true;
	doc.send(data);	
}

var background_update_running, background_update_timer, background_update_forced_before;
function background_update(forced) {
	if (forced && !background_update_forced_before) {
		background_update_forced_before = true;
		var html = "We check every minute with the ";
		html += '<u><b><a href="http://feedback.ld.intricati.com" style="cursor: pointer">feedback friends</a></b></u> ';
		html += 'website to see if they\'ve scraped anything new.  They themselves scrape the real ';
		html += '<u><b><a href="http://www.ludumdare.com/compo" style="cursor: pointer">Ludum Dare</a></b></u> ';
		html += 'website to see if there is anything new, but that takes time.  So if your comments ';
		html += 'aren\'t showing up, just have patience!  They will appear eventually :D<br/>';
		html += ' <button onclick="modal()">got it!</button>';	
		modal(html);
	}
	if (!background_update_running) {
		var a = function() { a = null; background_update_running = b; };
		var b = function() { b = null; background_update_running = a; };
		background_update_running = true;
		if (background_update_timer)
			window.clearTimeout(background_update_timer);
		background_update_timer = window.setTimeout(background_update, 60*1000); // every minute
		update_feedback_friends_feed(a);
		update_positions(b);
	}
}

function wizard_start(resp) {
	if (resp) console.log("login resp:", resp);
	api("user", function(user) {
		console.log("got user:", user);
		window.user = user;
		if (!user.user_name) {
			var msg = "";
			if (resp && resp.note) {
				msg = " <i>(" + resp.note + ")</i>";
			}
			wizard.innerHTML = '<form onsubmit="try { wizard_user_name(this) } catch(error) { window.onerror(error); }; return false">' +
				'Please enter your Ludum Dare username: ' +
				'<input type="text" id="user_name" name="user_name"/>' + msg + '</form>' +
				'<small><u style="cursor: pointer" onclick="play()">I\'d like to browse the map anonymously, thanks</u> / ' +
						'<u style="cursor: help" onclick="wizard_privacy()">privacy info</u>';
			document.getElementById("user_name").focus();
		} else if (!user.position || (!user.position.lat && !user.position.lng)) {
			console.log("user has no position", user);
			api("geoip", function(geoip) {
					console.log("geoip", geoip);
					var city = (geoip.city || geoip.region_name || "");
					var near = (city? "near ": geoip.country_name? "in ": "") + city;
					near += (city && geoip.country_name? ", ": "") + (geoip.country_name || "");
					if (near) {
						near = "We guess you are <i><b>" + near + "</b></i>! ";
						if (geoip.latitude || geoip.longitude) {
							user.position = new LatLng(geoip.latitude, geoip.longitude);
							console.log("geoip", user.position);
							centre_and_zoom_map_on_user();
							near += "Zoom in, drag it around and, when you are happy, " +
								'<b><u><a onclick="play()" style="cursor: pointer;">click here to continue!</a></u></b>';
						}
					} else {
						near = "We have no idea where you are :) " +
							"Please click on the map approximately where you live &uarr;";
					}
					set_mode("set_position");
					near += '<br/><small><u style="cursor: pointer" onclick="user.position = null; play()">proceed without saying where I live</u> / ';
					near += '<u style="cursor: help" onclick="wizard_privacy()">privacy info</u>';
					wizard.innerHTML = near;
			});
			wizard.innerHTML = 'We are trying to guess where you may be... :)';
		} else if (user.position && (user.position.lat || user.position.lng)) {
			user.position = new LatLng(user.position.lat, user.position.lng);
			centre_and_zoom_map_on_user();				
			play();
		} else {
			wizard_set_position();
		}
	});
}

function wizard_user_name(form) {
	var user_name = form["user_name"].value;
	api("login", wizard_start, JSON.stringify({"user_name": user_name}), "POST");
}

function wizard_privacy() {
	modal('<div onclick="modal()">' +
		'<center><u>PRIVACY INFO</u></center>' +
		'You don\'t really have to tell everyone where you live!<br/>' +
		'You could choose to not say, or you could outright lie :)<br/>' +
		'All the positions on this map have been volunteered by LDers for the<br/>' +
		'very purpose of telling other LDers where they (pretend to) live.<br/>' +
		'All this info is made publically available to everyone.<br/>' +
		'<small>' +
		'<span id="privacy_info_wipe"></span>' +
		'<center><u style="cursor: pointer">got it!</u></center>' +
		'</small></div>');
}

var last_position_update = 0;
function update_positions(cb) {
	api("positions?cursor=" + last_position_update, function(positions) {
		var refresh = !!last_position_update, count = 0;
		for (var uid in positions) {
			var pos = positions[uid];
			uid_to_name[uid] = pos[3];
			window.positions[uid] = new LatLng(pos[0], pos[1]).to_mercator();
			last_position_update = Math.max(last_position_update, pos[2]);
			count++;
		}
		if (refresh && count) {
			console.log("loaded " + count + " new positions");
		}
		update_map();
		cb();
	});
}

function wizard_set_position() {
	set_mode("set_position");
	wizard.style.display = "block";
	wizard.innerHTML = "Zoom in, drag it around and, when you are happy, " +
		'<b><u><a onclick="play()" style="cursor: pointer;">click here to continue!</a></u></b>';
}

function play() {
	wizard.style.display = "none";
	set_mode("play");
}

function PinFactory(img) {
	var cache = {};
	return function(colour) {
		if (colour in cache)
			return cache[colour];
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext("2d");
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.beginPath();
		ctx.arc(img.width/2, img.width/2, img.width/2-2, 0, 2 * Math.PI, false);
		ctx.fillStyle = colour;
		ctx.fill();
		ctx.drawImage(img, 0, 0);
		cache[colour] = canvas;
		return canvas;
	};
}

function centre_map(new_centre) {
	var old_centre = camera.unproject(canvas.width / 2, canvas.height / 2);
	camera.translate(old_centre[0] - new_centre[0], old_centre[1] - new_centre[1]);
}

function zoom_map(factor) {
	var max = 2300, min = 200;
	if ((camera.factor > min && factor < 1) || (camera.factor < max && factor > 1)) {
		var old_centre = camera.unproject(canvas.width / 2, canvas.height / 2);
		camera.scale(Math.max(Math.min(camera.factor * factor, max), min) / camera.factor);
		var new_centre = camera.unproject(canvas.width / 2, canvas.height / 2);
		camera.translate(new_centre[0] - old_centre[0], new_centre[1] - old_centre[1]);
	}
}

function centre_and_zoom_map_on_user() {
	if (user && user.position && (user.position.lat || user.position.lng)) {
		console.log("zooming in on user");
		centre_map(user.position.to_mercator());
		zoom_map(10000); // zoom in as much as it lets us
	}
}

var pos_queue = [], set_position_first = true;
function set_position(mercator) {
	var next = function() {
		var pos = pos_queue[pos_queue.length-1];
		pos_queue = [null];
		if (pos) {
			console.log("sending position", pos);
			api("set_position", next, JSON.stringify(pos), "POST");
		} else {
			pos_queue = [];
		}
	};
	var pos = LatLng.from_mercator(mercator);
	if (!pos_queue.length) {
		pos_queue = [pos];
		next();
	} else {
		pos_queue.push(pos);
	}
	user.position = pos;
	if (known_user_idx >= 0) {
		known_entries[known_user_idx][0] = mercator[0];
		known_entries[known_user_idx][1] = mercator[1];
	}
	if (set_position_first) {
		set_mode();
		wizard_set_position();
		set_position_first = false;
	} else {
		render();
	}
}

function set_mode(mode) {
	window.mode = mode = mode || window.mode;
	console.log("mode", mode);
	canvas.ondblclick = function(e) {
		// recentre on point
		var new_centre = camera.unproject(e.clientX, e.clientY);
		if (mode == "set_position") {
			set_position(new_centre);
		} else {
			centre_map(new_centre);
			zoom_map(2);
			redraw();
		}
	};
	var drag, drag_user;
	canvas.onmousedown = function(e) {
		selected = null;
		drag = drag_user = null;
		// hit anything?
		var test = function(mercator) {
			var pin = camera.project(mercator[0], mercator[1]);
			if (pin[1] < e.clientY)
				return -1;
			if (pin[1] > e.clientY + 39)
				return 1;
			var x = e.clientX - pin[0];
			var y = e.clientY - (pin[1] - 39 + 13);
			return (x*x + y*y <= 13*13)? 0: -1;
		};
		if (mode == "set_position") {
			drag_user = (user.position && (user.position.lng || user.position.lat));
			drag = camera.unproject(e.clientX, e.clientY);
			if (drag_user) {
				var pos = user.position.to_mercator();
				drag_user = !test(pos);
				if (drag_user)
					drag = [pos[0] - drag[0], pos[1] - drag[1]];
			}
		} else {
			selected = selected_ghosts = null;
			var hit = null;
			for (var entry in known_entries) {
				entry = known_entries[entry];
				var cmp = test(entry);
				if (cmp > 0)
					break;
				if (!cmp) {
					hit = hit || {};
					hit[entry[2].uid] = entry;
				}
			}
			if (hit) {
				selected = hit;
			} else {
				// check for ghosts
				for (var ghost in ghosts) {
					ghost = ghosts[ghost];
					var cmp = test(ghost);
					if (cmp > 0)
					break;
					if (!cmp) {
						hit = hit || {};
						hit[ghost[2]] = ghost;
					}
				}
				if (hit) {
					selected_ghosts = hit;
				} else {
					// ok, drag instead
					drag = camera.unproject(e.clientX, e.clientY);
				}
			}
			redraw();
		}
	};
	canvas.onmousemove = function(e) {
		if (drag_user) {
			var pos = camera.unproject(e.clientX, e.clientY);
			set_position([pos[0] + drag[0], pos[1] + drag[1]]);
		} else if (drag) {
			var pos = camera.unproject(e.clientX, e.clientY);
			camera.translate(pos[0] - drag[0], pos[1] - drag[1]);
			redraw();
		}
	};
	canvas.onmouseup = function(e) {
		drag = drag_user = null;
	};
	canvas.onmouseenter = function(e) {
		drag = null;
	};
	canvas.onmouseleave = function(e) {
		drag = null;
	};
	var keys = {};
	canvas.onkeydown = function(e) {
		keys[e.key] = true;
		if (keys['+'] && !keys['-']) {
			zoom_map(1.1);
		} else if (keys['-'] && !keys['+']) {
			zoom_map(0.9);
		}
		var speed = 8;
		if ((keys['A'] || keys['a']) && !(keys['D'] || keys['d'])) {
			camera.translate(speed / camera.factor, 0);
		} else if (!(keys['A'] || keys['a']) && (keys['D'] || keys['d'])) {
			camera.translate(-speed / camera.factor, 0);
		}
		if ((keys['W'] || keys['w']) && !(keys['S'] || keys['s'])) {
			camera.translate(0, -speed / camera.factor);
		} else if (!(keys['W'] || keys['w']) && (keys['S'] || keys['s'])) {
			camera.translate(0, speed / camera.factor);
		}
		redraw();
	};
	canvas.onkeyup = function(e) {
		// arrow keys?
		keys[e.key] = false;
	};
	canvas.onmousewheel = function(e, delta) {
		zoom_map(1 + (delta * 0.001));
		redraw();
	};
	canvas.setAttribute('tabindex','0');
	canvas.focus();
	var menu_bar = document.getElementById("menu_bar");
	menu_bar.style.visibility = "visible";
	var menu_options = document.getElementById("menu_options");
	var menu = document.getElementById("menu");
	var html = '<hr/><button onclick="background_update(true)">check for new data</button><br/>';
	if (mode != "set_position")
		html += '<button onclick="wizard_set_position(); set_mode(\'set_position\')">change my own location</button><br/>';
	if (user && user.position && (user.position.lat || user.position.lng))
		html += '<button onclick="forget()">forget my location</button><br/>';
	html += '<button onclick="logout()">logout ' + user.user_name + '</button><br/>';
	html += '<button onclick="wizard_privacy()">privacy info</button><br/>';
	html += '<button onclick="window.location = \'http://ludumdare.com/compo/2016/08/27/the-ld-map-is-live/\'">feedback and bugs</button>';
	menu.innerHTML = html;
	menu_options.addEventListener('mouseenter', function(e) {
		menu.style.display = "inline";
	}, false);
	menu_options.addEventListener('mouseleave', function(e) {
		menu.style.display = "none";
	}, false);
	document.getElementById("menu_zoom_in").onclick = function() { zoom_map(1.1); redraw(); };
	document.getElementById("menu_zoom_out").onclick = function() { zoom_map(0.9); redraw(); };
	document.getElementById("menu_zoom_fit").onclick = function() { update_camera(); };
	redraw();
}

function redraw() {
	show_selection();
	render();
}

function show_selection() {
	var info = document.getElementById("info");
	info.style.visibility = "hidden";
	var html = "";
	if (selected && mode == "play") {
		var pos, count = 0;
		for (var uid in selected) {
			count++;
			var entry = selected[uid];
			pos = pos || camera.project(entry[0], entry[1]);
			entry = entry[2];
			html += '<td class="entry' + (count&1) + '" onclick="launch(' + entry.uid + ')">';
			html += '<img width=128 height=96 src="http://feedback.ld.intricati.com/data/' + event_id + "/" + entry.uid + '.jpg"/>';
			html += "<br/><b>" + entry.title + "</b><br/><small> by <i>" + entry.author + "</i>";
			if (entry.platforms != "Unknown") html += "<hr/>(" + entry.platforms + ")";
			if (entry.uid in commented) html += "<hr/><em>You have commented!</em>";
			if (entry.uid in commenter) html += "<hr/><em>Commented on you!</em>";
			html += "</small></td>";
		}
		html = "<table><tr>" + html + "</tr></table>";
	} else if (selected_ghosts && mode == "play") {
		var pos, count = 0;
		for (var uid in selected_ghosts) {
			var ghost = selected_ghosts[uid];
			pos = pos || camera.project(ghost[0], ghost[1]);
			if (count++) html += ", ";
			html += '<span class="entry' + (count&1) + '">' + ghost[3] + "</span>";
		}
		html += "<hr/>";
		if (count == 1) {
			html += "hasn't submitted a game";
		} else {
			html += " have not submitted any games";
		}
		if (event_id == "ludum-dare-36" && new Date() < new Date(2016, 8, 30)) {
			html += " yet!<br/>Maybe check back later?";
		}
	}
	if (html && pos[0] >= 0 && pos[1] >= 0 && pos[0] < canvas.width && pos[1] < canvas.height) {
		info.innerHTML = html;
		var x = Math.max(0, pos[0] - (info.clientWidth / 2));
		if (x + info.clientWidth > canvas.width) x = canvas.width - info.clientWidth;
		var y = pos[1] - 40 - info.clientHeight;
		if (y < 0) y = pos[1] + 20;
		info.style.left = x + "px";
		info.style.top = y + "px";
		info.style.visibility = "visible";
	}
}

function update_map() {
	if (entries && positions && img_pin) {
		known_user_idx = -1;
		known_entries = [];
		var used = {};
		for (var entry in entries) {
			entry = entries[entry];
			var pos = positions[entry.uid];
			if (pos) {
				if (user && entry.commenter_ids.indexOf(user.uid) != -1) {
					commented[user.uid] = 1;
				}
				if (user && entry.uid == user.uid) {
					for (var other in entry.commenter_ids)
						commenter[entry.commenter_ids[other]] = 1;
				}
				if (entry.uid == user.uid)
					known_user_idx = known_entries.length;
				known_entries.push([pos[0], pos[1], entry]);
				used[entry.uid] = 1;
			}
		}
		var zsort = function (a, b) {
			if (a[1] == b[1])
				return a[0] - b[0];
			return a[1] - b[1];
		};
		known_entries.sort(zsort);
		ghosts = [];
		for (var uid in positions) {
			if (!(uid in used)) {
				var pos = positions[uid];
				ghosts.push([pos[0], pos[1], uid, uid_to_name[uid] || uid]);
			}
		}
		ghosts.sort(zsort);
	}
	redraw();
}

function update_camera() {
	camera = new Transform2D();
	camera.translate(canvas.width / 2, canvas.height / 2);
	camera.scale(Math.min(canvas.width / (2 * Math.PI), canvas.height / Math.PI));
	redraw();
}

function render() {
	var ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (!camera) return;
	if (img_map_topo) {
		var map_topo_tl = camera.project(map_topo_bl[0], map_topo_tr[1]);
		var map_topo_br = camera.project(map_topo_tr[0], map_topo_bl[1]);
		ctx.drawImage(img_map_topo,
			0, 0, img_map_topo.width, img_map_topo.height,
			map_topo_tl[0], map_topo_tl[1],
			map_topo_br[0] - map_topo_tl[0], map_topo_br[1] - map_topo_tl[1]);
	}
	if (lines_map) {
		ctx.strokeStyle = "cyan";
		ctx.beginPath();
		var ofs = 0, shapes = lines_map.shapes, points = lines_map.points;
		for (var len in shapes) {
			len = shapes[len];
			var pos = camera.project(points[ofs++], points[ofs++]);
			ctx.moveTo(pos[0], pos[1]);
			for (var seg=1; seg<len; seg++) {
				pos = camera.project(points[ofs++], points[ofs++]);
				ctx.lineTo(pos[0], pos[1]);
			}
		}
		ctx.stroke();
	}
	if (mode == "play") {
		for (var ghost in ghosts) {
			ghost = ghosts[ghost];
			var pin =
				selected_ghosts && ghost[2] in selected_ghosts? "white":
				"rgba(230,250,240,0.3)";
			pin = img_pin(pin);
			var pos = camera.project(ghost[0], ghost[1]);
			ctx.drawImage(pin, pos[0] - pin.width / 2, pos[1] - pin.height);
		}
	}
	if (user && user.position && (user.position.lat || user.position.lng) && img_pin) {
		var pos = user.position.to_mercator();
		pos = camera.project(pos[0], pos[1]);
		var pin = img_pin("cyan");
		ctx.drawImage(pin, pos[0] - pin.width / 2, pos[1] - pin.height);
	}
	if (mode == "play") {
		for (var entry in known_entries) {
			var entry = known_entries[entry];
			var uid = entry[2].uid;
			var you_commented = uid in commented;
			var commented_on_you = uid in commenter;
			var pin = 
				user && uid == user.uid? "cyan":
				selected && uid in selected? "yellow":
				you_commented && commented_on_you? "purple":
				you_commented? "green":
				commented_on_you? "blue":
					"red";
			pin = img_pin(pin);
			var pos = camera.project(entry[0], entry[1]);
			ctx.drawImage(pin, pos[0] - pin.width / 2, pos[1] - pin.height);
		}
	}
}


