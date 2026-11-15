import {build} from 'vite';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {sourceBuildProof} from '../source-build-proof.mjs';
export async function serve(){
 const built=await build({configFile:false,logLevel:'error',plugins:[sourceBuildProof('physical-fixture')],build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-atomic.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
 const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk');if(chunks.length!==1)throw Error('bundle-count');
 const code=chunks[0].code,html=await readFile('e2e/physical/manual.html');
 const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'");if(!['/','/fixture.mjs'].includes(req.url)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',req.url==='/fixture.mjs'?'text/javascript':'text/html');res.end(req.url==='/fixture.mjs'?code:html);});server.listen(0,'127.0.0.1');await once(server,'listening');return {server,code,origin:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]?.endsWith('/server.mjs')){const s=await serve();console.log(s.origin+' (loopback only; no remote publication)');}
