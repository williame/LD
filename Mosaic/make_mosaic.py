import os, json, random, sys, getopt, gzip, math, time
from cStringIO import StringIO
from PIL import Image
import numpy as np
    
import scrape_ld
    
class Game:
    def __init__(self,args):
        action, self.uid, self.thumburl, self.title, self.author, self.thumbfile, self.jam = args[:7]
        if not self.thumbfile:
            print "SKIPPING %s: NO THUMBNAIL"%self
            self.img = None
            self.aspect = 0
        else:
            with open(self.thumbfile) as f:
                f = StringIO(f.read())
                self.img = Image.open(f) # problem with too-many-files-open errors
                if self.img.mode != colour_format:
                    print "CONVERTING %s from %s to %s"%(self,self.img.mode,colour_format)
                    try:
                        self.img = self.img.convert(colour_format)
                    except Exception as e:
                        print "Error converting %s:" % self, e
                        self.img = None
                        self.aspect = 0
                        return
            self.aspect = float(self.img.size[1])/(self.img.size[0] or 1)
        self.placed = None
    def compute_mse(self,target_data,target_w,target_h,patch_w,patch_h):
        # TODO multiprocessing? or numpy?
        img = np.int_(list(self.img.resize((patch_w,patch_h),Image.ANTIALIAS).getdata())).flatten()
        self.scores_mse = self.scores = [int(((img-tile)**2).sum()) for tile in target_data]
    def __str__(self):
        return "%s %s's game %s"%(self.uid,self.author,self.title)
    
if __name__=="__main__":
    
    opts, args = getopt.getopt(sys.argv[1:],"",
        ("ld-num=","algo=","target-image=","thumb-width=","patch-width=","skip-json=","colour-format="))
    opts = dict(opts)
    colour_format = opts.get("--colour-format","RGB")
    ld_num = int(opts.get("--ld-num","32"))
    algo = opts.get("--algo","kuhn-munkres")
    save_json = int(opts.get("--save-json","1"))
    if algo not in ("greedy","timed","test","kuhn-munkres"):
        sys.exit("unsupported algo %s" % algo)
    if len(args) == 1:
        target_filename = args[0]
    elif args:
        sys.exit("unsupported argument %s" % args[0])
    else:
        target_filename = None
    
    # thumbs not already downloaded?
    index_file = "%d/games.json"%ld_num 
    if not os.path.exists(index_file):
        index = scrape_ld.scrape_ld(ld_num)
        with open(index_file,"w") as out:
            json.dump(index,out)
    else:
        # load the index
        with open(index_file) as index:
            index = json.load(index)
     
    # open all the images
    games = filter(lambda x: x.img,map(Game,index))
    print "loaded %d games for ld %d"%(len(games),ld_num)
 
    # load the target image
    target_imagename = opts.get("--target-image","mona_lisa.jpg")
    target = Image.open(target_imagename)
    print "target image %s is %dx%d"%(target_imagename,target.size[0],target.size[1])
    target_prefix = "%d/%s" % (ld_num, os.path.splitext(os.path.basename(target_imagename))[0])
    
    # work out target size
    thumb_aspect = sum(game.aspect for game in games) / len(games)
    patch_w = int(opts.get("--patch-width","10"))
    patch_h = int(float(patch_w)*thumb_aspect)
    print "patches are %dx%d"%(patch_w,patch_h)
    target_w, target_h = target.size
    target_aspect = float(target_w) / target_h
    def calc_layout(patch_w, patch_h):
        cols, rows = 1, 1
        while cols*rows < len(games):
            col_asp = float((cols+1)*patch_w) / (math.ceil(float(len(games)) / (cols+1))*patch_h)
            row_asp = float(cols*patch_w) / (math.ceil(float(len(games)) / cols)*patch_h)
            if abs(col_asp-target_aspect) < abs(row_asp-target_aspect):
                cols += 1
            else:
                rows += 1
        return cols, rows
    if algo == "test":
        # probe to find various choices of patch size that best fill the image
        best, best_score = None, sys.maxint
        for w in range(5, 25):
            h = int(float(w)*thumb_aspect)
            if h:
                c, r = calc_layout(w, h)
                score = c * r - len(games)
                if score <= best_score:
                    best = w, c, r
                    best_score = score
        w, c, r = best
        print "(probe for best fit: --patch-width=%d x %d = %d tiles and %d images and %d empty tiles)" % (w,
           int(float(w)*thumb_aspect), c*r, len(games), c*r-len(games)) 
    cols, rows = calc_layout(patch_w, patch_h)
    print "there are %d tiles and %d images and %d empty tiles"%(cols*rows,len(games), cols*rows - len(games))
    assert cols and rows        
    target_w = cols * patch_w
    target_h = rows * patch_h
    print "target is %dx%d tiles, %dx%d pixels"%(cols,rows,target_w,target_h)
    target_img = target.resize((target_w,target_h),Image.ANTIALIAS).convert(colour_format)
    target = target_img.load()
    target_data_mse = []
    for y in range(rows):
        yofs = y * patch_h
        for x in range(cols):
            xofs = x * patch_w
            target_data_mse.append(np.int_([channel for yy in range(patch_h) for xx in range(patch_w) for channel in target[xofs+xx,yofs+yy]]))
    # compute mse
    if algo != "test":
        start_time = time.clock()
        mse_file = "%s.mse.json.gz"%(target_prefix)
        if not os.path.exists(mse_file):
            print "computing mse for each thumbnail for each tile in the target:"
            for game in games:
                sys.stdout.write(".")
                sys.stdout.flush()
                game.compute_mse(target_data_mse,target_w,target_h,patch_w,patch_h)
            if save_json > 1:
                gzip.open(mse_file,"wb",9).write(json.dumps({game.uid:game.scores for game in games}))
        else:
            print "loading mse matches from file..."
            data = json.loads(gzip.open(mse_file,"rb").read())
            for game in games:
                game.scores = data[game.uid]
        print "took",int(time.clock()-start_time),"seconds"
 
    # work out output size etc
    thumb_w = int(opts.get("--thumb-width","48"))
    thumb_h = int(round(float(thumb_w)*thumb_aspect))
    out_w, out_h = cols*thumb_w, rows*thumb_h
    print "thumbs are %dx%d"%(thumb_w,thumb_h)
    print "output is %dx%d"%(out_w,out_h)
    out = Image.new(colour_format,(out_w,out_h))
    
    def done():
        # actually paste them into the output mosaic
        for game in games:
            if not game.placed:
                print "game %s not placed :("%game
            else:
                out.paste(game.img.resize((thumb_w,thumb_h),Image.ANTIALIAS),game.placed)
        # done
        if target_filename:
            target_pre, target_ext = os.path.splitext(os.path.basename(target_filename))
        else:
            target_pre = "%s.%s.%s"%(target_prefix, colour_format.lower(), algo)
            target_ext = ".jpg"
        print "saving %s%s"%(target_pre,target_ext)
        out.save("%s%s"%(target_pre,target_ext))
        if save_json > 0:
            print "saving %s.idx.json"%target_pre
            json.dump({game.uid:game.placed for game in games},open("%s.idx.json"%target_pre,"w"))
    
    # place them
    print "%s placement:" % algo
    start_time = time.clock()
    used = {}
    placements = 0
    score = 0
    def place(game,err,xy,symbol="."):
        global placements, score
        x = xy % cols
        y = xy // cols
        game.placed = (x*thumb_w,y*thumb_h)
        used[xy] = (err,game)
        sys.stdout.write(symbol)
        sys.stdout.flush()
        placements += 1
        score += err
    if algo == "test":
        index = range(len(games))
        random.shuffle(index)
        for i,game in enumerate(games):
            place(game,0,index[i])
    elif algo == "kuhn-munkres":
        import kuhnMunkres
        costs = [game.scores for game in games]
        profits = max(max(game.scores) for game in games)
        profits = [[profits-score for score in game.scores] for game in games]
        best = kuhnMunkres.maxWeightMatching(profits)[0]
        for game, xy in best.items():
            game = games[game]
            place(game, game.scores[xy], xy)
    elif algo in ("greedy","timed"):
        print "sorting MSE scores..."
        matches = []
        for game in games:
            for i,score in enumerate(game.scores):
                matches.append((score,i,game))
            if is_cuckoo:
                game.by_place = range(cols*rows)
                game.by_err = sorted(game.by_place, key=lambda i: game.scores[i])
                for i, j in enumerate(game.by_err):
                    game.by_place[j] = i
                game.by_err.append(len(game.scores))
                game.scores.append(sys.maxint)
        matches = sorted(matches)
        print " took",int(time.clock()-start_time),"seconds"
        start_time = time.clock()
        while True:
            for err, xy, game in matches:
                if not game.placed:
                    place(game,err,xy)
            if all(game.placed for game in games):
                break
            print "@",
    else:
        raise Exception("unsupported algo %s" % algo)
    print " ",placements,"placements",algo,"made in",int(time.clock()-start_time),"seconds, scoring",score
    
    if algo in ("timed",):
        while True:
            try:
                start_time = time.clock()
                start_score = score
                placements = 0
                while True:
                    pos_1 = random.randint(1,cols*rows) - 1
                    pos_2 = random.randint(1,cols*rows) - 1
                    if pos_1 not in used or pos_1 == pos_2:
                        continue
                    test = score
                    err_1, game_1 = used[pos_1]
                    test -= err_1
                    test += game_1.scores[pos_2]
                    if pos_2 in used:
                        err_2, game_2 = used[pos_2]
                        test -= err_2
                        test += game_2.scores[pos_1]
                    if test < score:
                        if pos_2 in used:
                            score -= err_2
                            place(game_2,game_2.scores[pos_1],pos_1,"")
                        else:
                            del used[pos_1]
                        score -= err_1
                        place(game_1,game_1.scores[pos_2],pos_2, ".")
                        assert score == test, (score, test)
                    elif pos_2 in used:
                        test -= game_2.scores[pos_1]
                        for i in xrange(10):
                            pos_3 = random.randint(1,cols*rows) - 1
                            if pos_3 in used:
                                test += game_2.scores[pos_3]
                                err_3, game_3 = used[pos_3]
                                test -= game_3.scores[pos_3]
                                test += game_3.scores[pos_1]
                                if test < score:
                                    score -= err_1
                                    place(game_1,game_1.scores[pos_2],pos_2,"")
                                    score -= err_2
                                    place(game_2,game_2.scores[pos_3],pos_3,"")
                                    score -= err_3
                                    place(game_3,game_3.scores[pos_1],pos_1,str(i))
                                    assert score == test, (score, test)
                                    break
                                test -= game_2.scores[pos_3]
                                test += game_3.scores[pos_3]
                                test -= game_3.scores[pos_1]
            except KeyboardInterrupt:
                pass
            print " ",placements,"improvements made in",int(time.clock()-start_time),"seconds, scoring",score,"(%d improvement)"%(start_score-score)
            done()
            while True:
                print "Continue?",
                cmd = raw_input().lower()
                if cmd in ("y", "n"):
                    if cmd == "n":
                        sys.exit()
                    break
                else:
                    print "(y n)?"
    else:
        done()
        
