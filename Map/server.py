#!/usr/bin/env python

# https://github.com/williame/LD/Map project
# 
# BSD LICENSE:
# 
# Copyright (c) 2016, William Edwards
# All rights reserved.
# 
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#     * Redistributions of source code must retain the above copyright
#       notice, this list of conditions and the following disclaimer.
#     * Redistributions in binary form must reproduce the above copyright
#       notice, this list of conditions and the following disclaimer in the
#       documentation and/or other materials provided with the distribution.
#     * Neither the name of the <organization> nor the
#       names of its contributors may be used to endorse or promote products
#       derived from this software without specific prior written permission.
# 
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
# DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
# ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import os, uuid, logging, time, json, random, string, re
import tornado.ioloop, tornado.web, tornado.httpclient
from tornado.options import define, options, parse_command_line

import sqlite3

def db_init(path):
    global db_conn, db_cursor, positions, user_name_to_uid
    db_conn = sqlite3.connect(path) # detect_types=sqlite3.PARSE_DECLTYPES doesn't work for aggregates etc, so don't bother with it
    db_cursor = db_conn.cursor()
    if os.path.exists("data.json") and not db_cursor.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchall():
        # load users from LD30 game file
        db_cursor.execute("CREATE TABLE IF NOT EXISTS users (user_name TEXT PRIMARY KEY, uid INTEGER UNIQUE, lat INTEGER, lng INTEGER)")
        for user in json.load(open("data.json"))["authors"]:
            user_name, uid = user["username"], user["uid"]
            lat, lng = user.get("position", [None, None])
            if lat is not None and lng is not None: # small wobble to deal with stacked old data
                lat += random.random() * 0.001
                lng += random.random() * 0.001
            db_cursor.execute("INSERT INTO users (uid, user_name, lat, lng) VALUES (?, ?, ?, ?)", (uid, user_name, lat, lng))
        db_conn.commit()
    user_name_to_uid = {}
    for uid, user_name in db_cursor.execute("SELECT uid, user_name FROM users").fetchall():
        user_name_to_uid[user_name.lower()] = uid
    positions, now = {}, int(time.time())
    for uid, lat, lng in db_cursor.execute("SELECT uid, lat, lng FROM users WHERE lat IS NOT NULL AND lng IS NOT NULL").fetchall():
        positions[uid] = [lat, lng, now]
db_init("ld_map.db")

options.define("port",default=28285,type=int)
options.define("cookie_secret",type=str,default="ld_map")

log = []

def now():
    return time.strftime("%Y-%m-%d %H:%M:%S",time.gmtime())

def _add_to_log(level,ctx,fmt,*args,**kwargs):
    log.append((level,now(),ctx,fmt%args))
    logging.log(level,fmt,*args,**kwargs)

class BaseHandler(tornado.web.RequestHandler):
    def initialize(self):
        origin = self.request.headers.get("Origin")
        if self.is_test() or origin in ("http://williame.github.io", "https://williame.github.io"):
            self.set_header("Access-Control-Allow-Origin", origin)
            self.set_header("Access-Control-Allow-Credentials", "true")
        else:
            self.log_warning("bad origin: %s" % origin)
            raise tornado.web.HTTPError(403) # if you fork, get your own server!
    def is_test(self):
        return self.request.remote_ip == "::1"
    def get_current_user(self):
        session = self.get_secure_cookie("session")
        if not session:
            session = str(uuid.uuid4())
            self.set_secure_cookie("session", session)
        return session
    def write_error(self,status_code,**kwargs):
        if status_code == 401:
            self.set_header("WWW-Authenticate","Basic realm=Restricted")
        self.log_warning("%s",status_code)
        tornado.web.RequestHandler.write_error(self,status_code,**kwargs)
    def log(self,level,fmt,*args,**kwargs):
        _add_to_log(level,self._request_summary(),fmt,*args,**kwargs)
    def log_error(self,fmt,*args,**kwargs):
        self.log(logging.ERROR,fmt,*args,**kwargs)
    def log_warning(self,fmt,*args,**kwargs):
        self.log(logging.WARNING,fmt,*args,**kwargs)
    def log_info(self,fmt,*args,**kwargs):
        self.log(logging.INFO,fmt,*args,**kwargs)
    def _request_summary(self):
        return "%s %s (%s %s %s)" % (self.request.method, self.request.uri,
            self.request.remote_ip, self.current_user, self.get_secure_cookie("user_name")) 
        
class GeoIPHandler(BaseHandler):
    @tornado.web.asynchronous
    def get(self):
        http = tornado.httpclient.AsyncHTTPClient()
        remote_ip = self.request.remote_ip if self.request.remote_ip != "::1" else ""
        http.fetch("http://freegeoip.net/json/%s" % remote_ip, callback=self.on_response)
    def on_response(self, response):
        if response.error: raise tornado.web.HTTPError(500)
        self.write(response.body)
        self.finish()        

class LogHandler(BaseHandler):
    def get(self):
        self.write("<html><head><title>LD map log</title>")
        self.write('<style type="text/css">')
        self.write(' body { font-family: "Helvetica Narrow","Arial Narrow",Tahoma,Arial,Helvetica,sans-serif; }')
        self.write(" .L40 { background-color: crimson; color: yellow; font-weight: bold; }")
        self.write(" .L30 { background-color: lightsalmon; }")
        self.write(" .L20 { background-color: aliceblue; }")
        self.write("</style></head>")
        self.write("<body><table border=1>")
        for entry in log:
            self.write('<tr class="L%d">'%entry[0])
            for column in entry[1:]:
                self.write("<td>%s</td>"%column)
            self.write("</tr>")
        self.write("</table><p>as at: %s</p></body></html>"%now())
        
class PositionsHandler(BaseHandler):
    def get(self):
        cursor = float(self.get_argument("cursor", 0))
        ret = {k:v for k,v in positions.iteritems() if v[-1] > cursor}
        self.write(ret)
        
class UserHandler(BaseHandler):
    def get(self):
        uid, user_name, position = None, self.get_secure_cookie("user_name"), None
        if user_name:
            row = db_cursor.execute("SELECT uid, lng, lat FROM users WHERE user_name = ? COLLATE NOCASE", (user_name,)).fetchone()
            if row:
                uid, position = row[0], {"lng": row[1], "lat": row[2]}
        self.write({"uid": uid, "user_name": user_name, "position": position})

class LoginHandler(BaseHandler):
    legal_chars = string.ascii_letters + string.digits + "_"
    regex_author_entries = re.compile(r'\.\./\.\./([^/]+)/\?action=preview\&uid=(\d+)')
    @tornado.web.asynchronous
    def post(self):
        self.user_name = json.loads(self.request.body)["user_name"]
        if any(ch not in self.legal_chars for ch in self.user_name):
            return self.done(False, "illegal characters in user name")
        if db_cursor.execute("SELECT 1 FROM users WHERE user_name = ? COLLATE NOCASE", (self.user_name,)).fetchone():
            return self.done(True, "welcome back!")
        http = tornado.httpclient.AsyncHTTPClient()
        http.fetch("http://ludumdare.com/compo/author/%s/" % self.user_name, callback=self.on_response)
    def on_response(self, response):
        if response.error: return self.done(False, "could not find you!")
        entries = self.regex_author_entries.findall(response.body)
        if entries:
            uid = list(set(u for c, u in entries))
            assert len(uid) == 1, uid
            uid = uid[0]
            db_cursor.execute("INSERT INTO users (uid, user_name) VALUES (?, ?)", (uid, self.user_name,))
            db_conn.commit()
            user_name_to_uid[self.user_name.lower()] = uid
            self.done(True)
        else:
            self.done(True, "you have not entered any games?")
    def done(self, success, note = None):
        if success:
            self.set_secure_cookie("user_name", self.user_name)
        self.write({"note": note})
        self.finish()        

class LogoutHandler(BaseHandler):
    def get(self):
        self.clear_cookie("user_name")
        
class ForgetHandler(BaseHandler):
    def get(self):
        user_name = self.get_secure_cookie("user_name")
        if user_name:
            uid = user_name_to_uid.get(user_name.lower())
            self.log_info("forgetting user %s (%s)" % (user_name, uid));
            db_cursor.execute("UPDATE users SET lat = NULL, lng = NULL WHERE user_name = ? COLLATE NOCASE", (user_name,))
            db_conn.commit()
            if uid:
                positions[uid] = [None, None, time.time()]
        else:
            self.log_warning("cannot forget user");
            
class SetPositionHandler(BaseHandler):
    def post(self):
        user_name = self.get_secure_cookie("user_name")
        if user_name:
            uid = user_name_to_uid.get(user_name.lower())
            data = json.loads(self.request.body)
            lng = float(data["lng"])
            lat = float(data["lat"])
            self.log_info("setting position %s (%s) to %f,%f" % (user_name, uid, lat, lng))
            db_cursor.execute("UPDATE users SET lat = ?, lng = ? WHERE user_name = ? COLLATE NOCASE", (lat, lng, user_name,))
            db_conn.commit()
            if uid:
                positions[uid] = [lat, lng, time.time()]
        else:
            self.log_warning("cannot set position")
            

class ReportHandler(BaseHandler):
    def post(self, entryPoint):
        if entryPoint == "error":
            self.log_error(" ====== USER ERROR ======\n%s\n ========================", self.request.body)
        elif entryPoint == "info":
            self.log_info(" ====== USER INFO ======\n%s\n ========================", self.request.body)
        else:
            raise tornado.web.HTTPError(404)

if __name__ == "__main__":
    parse_command_line()
    application = tornado.web.Application((
        (r"/api/user", UserHandler),
        (r"/api/login", LoginHandler),
        (r"/api/logout", LogoutHandler),
        (r"/api/forget", ForgetHandler),
        (r"/api/set_position", SetPositionHandler),
        (r"/api/positions", PositionsHandler),
        (r"/api/report_(.*)", ReportHandler),
        (r"/api/geoip", GeoIPHandler),
        (r"/api/log", LogHandler),
    ), cookie_secret = options.cookie_secret)
    _add_to_log(logging.INFO, "server", "serving on port %d", options.port)
    application.listen(options.port)
    try:
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        _add_to_log(logging.INFO,"server","bye!")
