import urllib, re, os, urlparse, sys
from multiprocessing.dummy import Pool as ThreadPool

def scrape_ld(ld_num, dest_folder=None):

    entry_re = re.compile(r"<a href='\?action=(\w+)&uid=([0-9]+)'><img src='([^']*)'><div class='title'><i>(.*?)</i></div>(.*?)</a></div>")
    target_re = re.compile(r'href=\'([^\']+)\' target=\'_blank\'>([^<]+)</a>')
    
    if dest_folder is None:
        dest_folder = "%d/thumbs/" % ld_num
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)

    def get_games_on_page(url):
        r"""return a list of match objects
            action will be in group 1.
            id will be in group 2.  
            url to thumbnail will be in group 3
            game title will be in group 4
            author will be in group 5"""
        f = urllib.urlopen(url)
        contents = f.read().decode('utf-8','replace')
        f.close()
        return entry_re.findall(contents)
        
    def get_game(entry):
        action,uid,thumburl,title,author = entry
        author = author.encode('ascii','replace')
        title = title.encode('ascii','replace')
        # get thumb
        ext = os.path.splitext(urlparse.urlparse(thumburl).path)[1] or ".jpg"
        print "\tfound %s %s's game %s"%(uid,author,title)  
        thumbfile = "%s/%s%s"%(dest_folder,uid,ext)
        if not os.path.exists(thumbfile):
            src = urllib.urlopen(thumburl)
            if src.code != 200:
                print >> sys.stderr, "ERROR downloading %s %s's game %s: %s %s"%(uid,author,title,thumburl,src.code)
                thumbfile = None
            else:
                bytes = src.read()
                src.close()
                with open(thumbfile,"w") as dest:
                    dest.write(bytes)
        # get targets
        url = 'http://www.ludumdare.com/compo/ludum-dare-%s/?action=%s&uid=%s' % (ld_num, action, uid)
        f = urllib.urlopen(url)
        contents = f.read().decode('utf-8', 'replace')
        f.close()
        contents = contents.partition("<h2>Comments</h2>")[0] # strip off comments
        jam = "</strong></a> - <i>Jam Entry</i></div>" in contents
        contents = contents.partition("<h2>Downloads and Links</h2>")[2]
        contents = contents.partition("</ul>")[0]
        targets = [target for path, target in target_re.findall(contents)] # throw away paths
        return (action,uid,thumburl,title,author,thumbfile,jam,targets)
        
    game_matches = []
    game_count = 0
    pool = ThreadPool()        
    while True:
        page = entries_page_url_template = "http://www.ludumdare.com/compo/ludum-dare-%d/?action=preview&etype=&start=%d" % (ld_num, game_count)
        print "%d: getting games on page: %s"%(game_count,page)
        page_matches = get_games_on_page(page)
        if 0==len(page_matches):
            print "done!",len(game_matches),"games found."
            break
        game_count += len(page_matches)
        game_matches.extend(pool.map(get_game,page_matches))
    return game_matches
