(function(root){
'use strict';
const bases='TCAG', amino='FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const code={}; let k=0;
for(const a of bases) for(const b of bases) for(const c of bases) code[a+b+c]=amino[k++];
function clean(s){s=s.replace(/\s/g,'').toUpperCase();if(!s || /[^ACGTRYSWKMBDHVN]/.test(s))throw Error('Use IUPAC DNA letters only (for example A, T, C, G, N). U, digits and punctuation are not accepted.');return s;}
function parsedRecords(records){const {dna,circular,format}=records[0];return {dna,circular,format,records};}
function parseText(text){
 const lines=text.split(/\r\n|\r|\n/),first=lines.findIndex(line=>line.trim());
 if(first<0)throw Error('The file contains no DNA sequence.');
 if(!lines[first].trim().startsWith('>')){
  const headerLine=lines.findIndex(line=>line.trim().startsWith('>'));
  if(headerLine>=0)throw Error(`FASTA sequence data at line ${first+1} appears before the first record header (line ${headerLine+1}). Every FASTA record must begin with > and a nonempty name.`);
  return parsedRecords([{id:'',description:'',header:'',dna:clean(text),circular:false,format:'Text DNA'}]);
 }
 const records=[];let record=null,parts=[],headerLine=0;
 const context=()=>`FASTA record ${records.length+1}${record?.id?' ("'+record.id+'")':''}`;
 const finish=()=>{
  if(!parts.length)throw Error(`${context()} has no DNA sequence after its header at line ${headerLine}.`);
  record.dna=parts.join('');records.push(record);
 };
 for(let i=first;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  if(line.startsWith('>')){
   if(record)finish();
   const header=line.slice(1).trim();
   if(!header)throw Error(`FASTA record ${records.length+1} has an empty header at line ${i+1}. Enter a name after >.`);
   const match=header.match(/^(\S+)(?:\s+([\s\S]*))?$/);
   record={id:match[1],description:match[2]||'',header,dna:'',circular:false,format:'FASTA'};
   parts=[];headerLine=i+1;
  }else{
   try{parts.push(clean(line));}catch(error){throw Error(`${context()}, line ${i+1}: ${error.message}`);}
  }
 }
 finish();return parsedRecords(records);
}
function parse(buffer){
 const b=new Uint8Array(buffer),v=new DataView(buffer),dec=new TextDecoder('utf-8',{fatal:true});
 // SnapGene starts with a binary cookie packet; a leading tab in text is
 // also byte 9, but is not followed by the cookie's zero length bytes.
 if(b[0]!==9 || (b.length>1 && b[1]!==0)){let t;try{t=dec.decode(b);}catch{throw Error('Unrecognized file. Use SnapGene .dna, DNA FASTA records or plain-text DNA.');}return parseText(t);}
 let pos=0,dna=null,circular=false;
 while(pos<b.length){if(pos+5>b.length)throw Error('Incomplete SnapGene packet header.');const type=b[pos],len=v.getUint32(pos+1,false),start=pos+5,end=start+len;
 if(end>b.length)throw Error('The SnapGene file is truncated.');
 if(pos===0 && (len!==14 || dec.decode(b.slice(start,start+8))!=='SnapGene'))throw Error('Invalid SnapGene file header.');
 if(type===0){if(dna!==null || len<2)throw Error('Missing or duplicate DNA packet.');circular=Boolean(b[start]&1);dna=clean(dec.decode(b.slice(start+1,end)));}pos=end;}
 if(!dna)throw Error('The file contains no DNA sequence.');return parsedRecords([{id:'',description:'',header:'',dna,circular,format:'SnapGene'}]);
}
// Join records in input order, without separators. The returned source is a new
// object: one record retains its metadata; multiple records have blank header
// metadata, the first record's format and linear topology. Apply convert() only
// after joining so intervals, reverse complement, frame and stop handling are
// global, and a codon may span a record boundary. Inputs are never mutated.
function joinRecords(records){
 if(!Array.isArray(records)||!records.length)throw Error('At least one DNA record is required.');
 const dna=records.map((record,index)=>{
  if(!record||typeof record.dna!=='string')throw Error(`DNA record ${index+1} is missing a DNA sequence.`);
  try{return clean(record.dna);}catch(error){throw Error(`DNA record ${index+1}: ${error.message}`);}
 }).join('');
 if(records.length===1)return {...records[0],dna};
 return {dna,id:'',description:'',header:'',format:records[0].format,circular:false};
}
const comp={A:'T',T:'A',C:'G',G:'C',R:'Y',Y:'R',S:'S',W:'W',K:'M',M:'K',B:'V',V:'B',D:'H',H:'D',N:'N'};
function convert(dna,{start=1,end=dna.length,reverse=false,frame=0,stop=true}={}){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>dna.length||start>end)throw Error('Enter a valid 1-based interval within the sequence, with start not greater than end.');
 if(![0,1,2].includes(frame))throw Error('Invalid reading frame.');
 let oriented=dna.slice(start-1,end);if(reverse)oriented=Array.from(oriented).reverse().map(x=>comp[x]).join('');
 const coding=oriented.slice(frame);let protein='',stops=0,stoppedAt=null;
 for(let i=0;i+2<coding.length;i+=3){const aa=code[coding.slice(i,i+3)]||'X';if(aa==='*'){stops++;if(stop){stoppedAt=i/3+1;break;}}protein+=aa;}
 return {rna:oriented.replace(/T/g,'U'),protein,stops,stoppedAt,remainder:coding.length%3};
}
function id(s){return s.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,40)||'sequence';}
function fasta(name,seq,description=''){return '>'+id(name)+(description?' '+description:'')+'\n'+(seq.match(/.{1,60}/g)||[]).join('\n')+'\n';}
function genpept(name,seq,description=''){
 if(!seq || /[^A-Z*]/.test(seq))throw Error('No protein sequence is available to export.');
 const date=new Date().toUTCString().split(' ');const stamp=date[1]+'-'+date[2].toUpperCase()+'-'+date[3];
 const locus=id(name).slice(0,16);let out=`LOCUS       ${locus.padEnd(16)} ${String(seq.length).padStart(11)} aa                     UNK ${stamp}\nDEFINITION  Local DNA translation.\nACCESSION   ${id(name)}\nVERSION     ${id(name)}\nKEYWORDS    .\nSOURCE      .\n  ORGANISM  .\n            .\nCOMMENT     Standard genetic code; ${description}\nFEATURES             Location/Qualifiers\nORIGIN\n`;
 for(let i=0;i<seq.length;i+=60)out+=String(i+1).padStart(9)+' '+seq.slice(i,i+60).toLowerCase().match(/.{1,10}/g).join(' ')+'\n';return out+'//\n';
}
function normalizeProtein(input){
 let text=input.trim();
 if(text.startsWith('>')){const lines=text.split(/\r?\n/);lines.shift();if(lines.some(line=>line.trim().startsWith('>')))throw Error('Enter one protein sequence at a time.');text=lines.join('');}
 const query=text.replace(/\s/g,'').toUpperCase();
 if(!query)throw Error('Enter a protein sequence to compare.');
 if(/[^ACDEFGHIKLMNPQRSTVWYBXZJUO*]/.test(query))throw Error('Use single-letter amino acid codes or a single FASTA record. Digits, gaps and punctuation are not accepted.');
 return query;
}
function matchProtein(protein,input){
 const query=normalizeProtein(input);
 const matches=[];let offset=0;
 while(offset<=protein.length-query.length){const pos=protein.indexOf(query,offset);if(pos<0)break;matches.push({start:pos+1,end:pos+query.length});offset=pos+1;}
 return {query,matches};
}

// Smith–Waterman local alignment. Scores are literal match +2, mismatch -1,
// and a linear gap penalty of -2; ambiguous amino-acid letters are not wildcards.
const ALIGNMENT_LIMITS=Object.freeze({maxSequenceLength:200000,maxCells:80000000});
async function alignProtein(reference,input,{signal,onProgress}={}){
 const checkAbort=()=>{
  if(signal && signal.aborted){const error=Error('Alignment cancelled.');error.name='AbortError';throw error;}
 };
 checkAbort();
 reference=normalizeProtein(reference);
 const query=normalizeProtein(input),n=reference.length,m=query.length;
 if(n>ALIGNMENT_LIMITS.maxSequenceLength || m>ALIGNMENT_LIMITS.maxSequenceLength)throw Error(`Each protein sequence may contain at most ${ALIGNMENT_LIMITS.maxSequenceLength.toLocaleString('en-US')} characters. Select a smaller interval.`);
 const total=n*m;
 if(total>ALIGNMENT_LIMITS.maxCells)throw Error(`The product of the two sequence lengths must not exceed ${ALIGNMENT_LIMITS.maxCells.toLocaleString('en-US')}. Shorten the sequences or select smaller intervals.`);
 if(onProgress!==undefined && typeof onProgress!=='function')throw Error('The alignment progress callback must be a function.');
 const report=value=>{if(onProgress)onProgress(value);checkAbort();};
 report(0);
 let previous=new Int32Array(m+1),current=new Int32Array(m+1);
 const trace=new Uint8Array(total);
 const now=typeof performance!=='undefined' && typeof performance.now==='function' ? ()=>performance.now() : ()=>Date.now();
 let sliceStarted=now(),checkedCells=0,processed=0,bestScore=0,bestI=0,bestJ=0;
 for(let i=1;i<=n;i++){
  const residue=reference[i-1],rowOffset=(i-1)*m;
  current[0]=0;
  for(let block=1;block<=m;block+=1024){
   const last=Math.min(m,block+1023);
   for(let j=block;j<=last;j++){
    const diagonal=previous[j-1]+(residue===query[j-1]?2:-1);
    const up=previous[j]-2,left=current[j-1]-2;
    let score=0,direction=0;
    // Equal scores prefer diagonal, then up, then left. Retain the first
    // row-major best endpoint so repeats always produce the same result.
    if(diagonal>score){score=diagonal;direction=1;}
    if(up>score){score=up;direction=2;}
    if(left>score){score=left;direction=3;}
    current[j]=score;
    trace[rowOffset+j-1]=direction;
    if(score>bestScore){bestScore=score;bestI=i;bestJ=j;}
   }
   const count=last-block+1;processed+=count;checkedCells+=count;
   if(checkedCells>=1024){
    checkedCells=0;checkAbort();
    if(now()-sliceStarted>=20){
     report(processed/total);
     await new Promise(resolve=>setTimeout(resolve,0));
     checkAbort();sliceStarted=now();
    }
   }
  }
  const swap=previous;previous=current;current=swap;
 }
 const referenceChars=[],queryChars=[];
 let i=bestI,j=bestJ,matches=0,mismatches=0,gaps=0;
 while(i>0 && j>0){
  const direction=trace[(i-1)*m+j-1];
  if(direction===0)break;
  if(direction===1){
   const a=reference[--i],b=query[--j];referenceChars.push(a);queryChars.push(b);
   if(a===b)matches++;else mismatches++;
  }else if(direction===2){referenceChars.push(reference[--i]);queryChars.push('-');gaps++;}
  else{referenceChars.push('-');queryChars.push(query[--j]);gaps++;}
 }
 const columns=referenceChars.length;
 const result={
  reference,query,referenceLength:n,queryLength:m,score:bestScore,
  referenceStart:columns?i+1:null,referenceEnd:columns?bestI:null,
  queryStart:columns?j+1:null,queryEnd:columns?bestJ:null,
  alignedReference:referenceChars.reverse().join(''),alignedQuery:queryChars.reverse().join(''),
  matches,mismatches,gaps,columns,identity:columns?matches/columns:0,
  referenceCoverage:columns?(bestI-i)/n:0,queryCoverage:columns?(bestJ-j)/m:0
 };
 report(1);
 return result;
}
const api={parse,clean,joinRecords,convert,fasta,genpept,normalizeProtein,matchProtein,alignProtein,ALIGNMENT_LIMITS};if(typeof module!=='undefined')module.exports=api;else root.DNA=api;
})(typeof globalThis!=='undefined'?globalThis:this);
