import json,zipfile,hashlib,sys,statistics,collections,pathlib
root=pathlib.Path(sys.argv[1]); path=root/'diagnostic-trace.zip'
calls={}
for line in zipfile.ZipFile(path).read('trace.trace').splitlines():
 e=json.loads(line); cid=e.get('callId');typ=e.get('type')
 if typ=='before' and e.get('method')=='tap': calls[cid]={'before':e,'logs':[]}
 elif cid in calls:
  if typ=='log':calls[cid]['logs'].append(e)
  elif typ=='after':calls[cid]['after']=e
rows=[];messages=collections.Counter()
for cid,c in calls.items():
 if 'after' not in c:continue
 row={'callId':cid,'duration':c['after']['endTime']-c['before']['startTime'],'selector':c['before'].get('params',{}).get('selector'),'state_wait_success':0,'state_wait_failure':0,'scroll':0,'action':0,'retry':0};starts={}
 for e in c['logs']:
  m=e['message'].strip();t=e['time'];messages[m]+=1
  if m=='retrying tap action':row['retry']+=1
  if m=='waiting for element to be visible, enabled and stable':starts['state']=t
  elif m=='element is visible, enabled and stable' and 'state' in starts:row['state_wait_success']+=t-starts.pop('state')
  elif m in ['element is not stable','element is not visible','element is not enabled'] and 'state' in starts:row['state_wait_failure']+=t-starts.pop('state')
  for key,a,b in [('scroll','scrolling into view if needed','done scrolling'),('action','performing tap action','tap action done')]:
   if m==a:starts[key]=t
   elif m==b and key in starts:row[key]+=t-starts.pop(key)
 row['other']=row['duration']-sum(row[k] for k in ['state_wait_success','state_wait_failure','scroll','action']);rows.append(row)
def stats(v):
 if not v:return None
 s=sorted(v);return {'count':len(s),'sum':sum(s),'median':statistics.median(s),'p95':s[int(.95*(len(s)-1))],'max':max(s)}
ops=[json.loads(l) for l in open(root/'operations.ndjson')];begin={r['id']:r for r in ops if r['event']=='begin'}
taps=[r for r in ops if r['event']=='end' and 'locator.tap(' in begin.get(r['id'],{}).get('location',{}).get('expression','')]
if len(taps)==len(rows):
 for r,o in zip(rows,taps):r['stage']=o['state']['stage']
frames=[r for r in ops if r['event']=='tap-frames'];deltas=[];cost=[];changed=0;samplecount=0;vis=collections.Counter();lifecycle=[]
for e in frames:
 samples=e['record'].get('samples',[]);samplecount+=len(samples);lifecycle+=e['record'].get('lifecycle',[])
 for x in samples:vis[x['visibility']]+=1;cost.append(x['rectMs'])
 for a,b in zip(samples,samples[1:]):
  deltas.append(b['timestamp']-a['timestamp']);changed+=any(a[k]!=b[k] for k in ['x','y','width','height'])
summary={'root':str(root),'trace_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'tap_count':len(rows),'tap_observer_count':len(taps),'retry_calls':sum(r['retry']>0 for r in rows),'phases_ms':{k:stats([r[k] for r in rows]) for k in ['duration','state_wait_success','state_wait_failure','scroll','action','other']},'retry_reasons':{k:v for k,v in messages.items() if 'not stable' in k or 'intercepts pointer' in k},'frame_observation':{'records':len(frames),'samples':samplecount,'rect_changes_between_samples':changed,'first_raf_delay_ms':stats([e['record']['samples'][0]['timestamp']-e['record']['started'] for e in frames if e['record'].get('samples')]),'raf_intervals_ms':stats(deltas),'rect_read_ms':stats(cost),'visibility':dict(vis),'lifecycle':lifecycle,'truncated':sum(e['record'].get('truncated',False) for e in frames),'errors':[e for e in ops if e['event']=='tap-frame-observer-error'],'begin_ms':stats([e['durationMs'] for e in ops if e['event']=='tap-frame-observer-cost' and e['phase']=='begin']),'end_ms':stats([e['durationMs'] for e in ops if e['event']=='tap-frame-observer-cost' and e['phase']=='end'])},'calls':rows,'caveat':'Trace state wait includes visibility/enabled/stable/injected evaluation. action includes protocol dispatch and hit-target cleanup. Frame observer adds layout reads plus host round trips; observed timing is not normal timing. Historical/local diagnostic, not formal acceptance.'}
json.dump(summary,open(root/'tap-phase-analysis.json','w'),indent=2)
print(json.dumps({k:v for k,v in summary.items() if k not in ['calls','retry_reasons']},indent=2))
