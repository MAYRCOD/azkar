import sys, json, pathlib
def fnv(s):
    h=2166136261
    for ch in s:
        h^=ord(ch); h=(h*16777619)&0xffffffff
    return format(h,'x')
def unpack(p):
    mins=[int(p[i:i+2])*60+int(p[i+2:i+4]) for i in range(0,24,4)]
    i=24
    while i<len(p):
        if p[i]=='~':
            v=p[i+1:i+5]; mins.append(int(v[:2])*60+int(v[2:])); i+=5
        else:
            mins.append(mins[-6]+ord(p[i])-109); i+=1
    return mins
out={}
for f in sys.argv[1:]:
    blocks=pathlib.Path(f).read_text(encoding="utf-8").strip().split("\n\n")
    for b in blocks:
        name,h,p=b.strip().split("\n")
        m=unpack(p)
        s="".join(f"{x//60:02d}{x%60:02d}" for x in m)
        ok=fnv(s)==h and len(m)==365*6
        print(name, "OK" if ok else f"ОШИБКА (hash {fnv(s)} != {h}, дней {len(m)/6})")
        out[name]=m
json.dump(out, open("/tmp/claude-0/sched/data.json","w",encoding="utf-8"), ensure_ascii=False)
