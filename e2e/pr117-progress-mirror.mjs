import {StringDecoder} from 'node:string_decoder';

// Does not change stream encoding: the existing raw Buffer -> worker.log pipe stays intact.
export function mirrorProgressLines(stream,sink,onFailure) {
  const decoder=new StringDecoder('utf8'),errors=[];let pending='',ended=false;
  function fail(error){errors.push(String(error));onFailure(error);}
  function append(text){
    pending+=text;let newline;
    while((newline=pending.indexOf('\n'))>=0){
      const line=pending.slice(0,newline);pending=pending.slice(newline+1);
      if(line.startsWith('DIAG_PROGRESS '))try{sink(line);}catch(error){fail(error);}
    }
  }
  stream.on('data',chunk=>{try{append(decoder.write(chunk));}catch(error){fail(error);}});
  stream.on('end',()=>{try{append(decoder.end());ended=true;}catch(error){fail(error);}});
  // Unterminated text/bytes stay partial; never promote them to a completed record.
  return {state:()=>({ended,partialLine:pending,errors:[...errors]})};
}
