import {register,createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {captureLoad} from './source-load-write.mjs';
// CJS receives the exact string passed to V8; ESM receives nextLoad's source.
const require=createRequire(import.meta.url),Module=require('node:module');
const compile=Module.prototype._compile;
Module.prototype._compile=function(content,filename){captureLoad(filename,content,'cjs-compile');return compile.call(this,content,filename);};
register('./source-load-hook.mjs',import.meta.url);
captureLoad(fileURLToPath(import.meta.url),await (await import('node:fs/promises')).readFile(fileURLToPath(import.meta.url)),'preload');
