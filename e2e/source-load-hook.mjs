import {fileURLToPath} from 'node:url';
import {captureLoad} from './source-load-write.mjs';
export async function load(url,context,nextLoad){const result=await nextLoad(url,context);if(url.startsWith('file:'))captureLoad(fileURLToPath(url),result.source,'esm-load');return result;}
