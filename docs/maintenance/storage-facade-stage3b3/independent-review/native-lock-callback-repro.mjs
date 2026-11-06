// Isolates Node 24 native LockManager behavior, not a real-browser claim.
const mode=process.argv[2];
if(!['sync','async'].includes(mode)) throw Error('mode required');
console.log(JSON.stringify({node:process.version,mode,nativeLocks:typeof navigator.locks?.request}));
let queue=Promise.resolve();
const timeout=setTimeout(()=>{console.log('TIMEOUT: lock request after synchronous callback throw did not settle');process.exit(1)},1000);
function request(cb){
  const run=async()=>await navigator.locks.request('independent-review-native-'+mode, mode==='async' ? async()=>await cb() : cb);
  const result=queue.then(run,run); queue=result.catch(()=>undefined);return result;
}
console.log('first',await request(()=>7));
try{await request(()=>{throw Error('intentional callback rejection')})}catch(e){console.log('caught',e.message)}
console.log('after rejection',await request(()=>9));
clearTimeout(timeout);
