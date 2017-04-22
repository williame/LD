import urllib2, re, os, urlparse, sys, socket, getopt, contextlib, time, json
from multiprocessing.dummy import Pool as ThreadPool
from threading import Lock

def scrape_ld(ld_num, dest_folder=None, timeout=30, max_retries=10, concurrent_requests=10):
    socket.setdefaulttimeout(timeout)
    lock = Lock()
    entry_re = re.compile(r"<a href='\?action=(\w+)&uid=([0-9]+)'><img src='([^']*)'><div class='title'><i>(.*?)</i></div>(.*?)</a></div>")
    target_re = re.compile(r'href=\'([^\']+)\' target=\'_blank\'>([^<]+)</a>')
    
    assert ld_num < 38, "does not support ldjam.com yet"
    ld_hostname = "www.ludumdare.com"
    
    if dest_folder is None:
        dest_folder = "%d/thumbs/" % ld_num
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
        
    def get_page(url, timeout=timeout):
        request = urllib2.Request(url)
        request.add_header("Accept", "text/html")
        request.add_header("Connection", "close")
        request.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36")
        for tries in range(max_retries):
            try:
                with contextlib.closing(urllib2.build_opener().open(request, timeout=timeout)) as f:
                    return f.read().decode("utf-8", "replace")
            except Exception as e:
                with lock:
                    print >> sys.stderr, "ERROR getting %s #%d: %s" % (url, tries, e)
                if not isinstance(e, urllib2.URLError) or "[Errno 8]" not in str(e) or ld_hostname not in url:
                    break
                time.sleep(5)
        else:
            raise e

    def get_games_on_page(url):
        return entry_re.findall(get_page(url))
        
    def get_game(entry):
        action,uid,thumburl,title,author = entry
        author = author.encode('ascii','replace')
        title = title.encode('ascii','replace')
        # get thumb
        ext = os.path.splitext(urlparse.urlparse(thumburl).path)[1] or ".jpg"
        with lock:
            print "\tfound %s %s's game %s"%(uid,author,title)  
        thumbfile = "%s/%s%s"%(dest_folder,uid,ext)
        if not os.path.exists(thumbfile):
            try:
                src = urllib2.urlopen(thumburl, timeout=timeout)
            except Exception as e:
                with lock:
                    print >> sys.stderr, "ERROR downloading %s %s's game %s: %s %s"%(uid,author,title,thumburl,e)
                thumbfile = None
            else:
                bytes = src.read()
                src.close()
                with open(thumbfile,"w") as dest:
                    dest.write(bytes)
        # get targets
        url = 'http://%s/compo/ludum-dare-%s/?action=%s&uid=%s' % (ld_hostname, ld_num, action, uid)
        contents = get_page(url)
        contents = contents.partition("<h2>Comments</h2>")[0] # strip off comments
        jam = "</strong></a> - <i>Jam Entry</i></div>" in contents
        contents = contents.partition("<h2>Downloads and Links</h2>")[2]
        contents = contents.partition("</ul>")[0]
        targets, web, unity = [], False, False
        for path, target in target_re.findall(contents):
            targets.append(target)
            target = target.lower()
            unity |= "unity" in target
            web |= "web" in target
        unity_fool = False
        if web and not unity: # see if we're being fooled
            for path, target in target_re.findall(contents):
                if "web" in target.lower() and not path.startswith("https://copy.com"): # blacklist those that have hung the script before
                    try:
                        unity |= "unity3d.com" in get_page(path).lower()
                    except Exception as e:
                        with lock:
                            print >> sys.stderr, "ERROR checking for Unity %s: %s %s" % (uid, path, e)
            if unity:
                unity_fool = True
                with lock:
                    print >> sys.stderr, "WARNING found a Unity game keeping quiet:", uid, targets
        return (action,uid,thumburl,title,author,thumbfile,jam,targets,web,unity,unity_fool)
        
    game_matches = []
    game_count = 0
    pool = ThreadPool(concurrent_requests)        
    while True:
        page = entries_page_url_template = "http://www.ludumdare.com/compo/ludum-dare-%d/?action=preview&etype=&start=%d" % (ld_num, game_count)
        with lock:
            print "%d: getting games on page: %s"%(game_count,page)
        page_matches = get_games_on_page(page)
        if 0==len(page_matches):
            with lock:
                print "done!",len(game_matches),"games found."
            break
        game_count += len(page_matches)
        game_matches.extend(pool.map(get_game,page_matches))
    return game_matches
    
def main(argv):
    opts, args = getopt.getopt(argv, "", ("ld-num=", "base-folder="))
    opts = dict(opts)
    for ld_num in map(int, opts.get("--ld-num", "36").split(",")):
        ld_index = scrape_ld(ld_num, opts.get("--base-folder"))
        with open("%d/games.json" % ld_num, "w") as out:
            json.dump(ld_index, out)

if __name__ == "__main__":
    main(sys.argv[1:])