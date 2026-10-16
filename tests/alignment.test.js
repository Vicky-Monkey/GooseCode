'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeProtein,matchProtein,alignProtein,convert,fasta,genpept}=require('../core.js');

// Deliberately use a complete score matrix and derive traceback from its scores,
// independently of the production implementation's two rows and direction grid.
function oracle(reference,query){
 const n=reference.length,m=query.length;
 const matrix=Array.from({length:n+1},()=>Array(m+1).fill(0));
 let score=0,endI=0,endJ=0;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  matrix[i][j]=Math.max(0,matrix[i-1][j-1]+(reference[i-1]===query[j-1]?2:-1),matrix[i-1][j]-2,matrix[i][j-1]-2);
  if(matrix[i][j]>score){score=matrix[i][j];endI=i;endJ=j;}
 }
 let i=endI,j=endJ,alignedReference='',alignedQuery='',matches=0,mismatches=0,gaps=0;
 while(matrix[i][j]>0){
  if(i>0 && j>0 && matrix[i][j]===matrix[i-1][j-1]+(reference[i-1]===query[j-1]?2:-1)){
   const a=reference[--i],b=query[--j];alignedReference=a+alignedReference;alignedQuery=b+alignedQuery;
   if(a===b)matches++;else mismatches++;
  }else if(i>0 && matrix[i][j]===matrix[i-1][j]-2){alignedReference=reference[--i]+alignedReference;alignedQuery='-'+alignedQuery;gaps++;}
  else{alignedReference='-'+alignedReference;alignedQuery=query[--j]+alignedQuery;gaps++;}
 }
 const columns=alignedReference.length;
 return {
  reference,query,referenceLength:n,queryLength:m,score,
  referenceStart:columns?i+1:null,referenceEnd:columns?endI:null,
  queryStart:columns?j+1:null,queryEnd:columns?endJ:null,
  alignedReference,alignedQuery,matches,mismatches,gaps,columns,
  identity:columns?matches/columns:0,referenceCoverage:columns?(endI-i)/n:0,queryCoverage:columns?(endJ-j)/m:0
 };
}

function assertInvariants(result){
 const {reference,query,alignedReference:a,alignedQuery:b}=result;
 assert.equal(a.length,b.length);
 assert.equal(result.columns,a.length);
 assert.equal(result.matches+result.mismatches+result.gaps,result.columns);
 assert.equal(result.score,result.matches*2-result.mismatches-result.gaps*2);
 if(result.columns){
  assert.equal(a.replace(/-/g,''),reference.slice(result.referenceStart-1,result.referenceEnd));
  assert.equal(b.replace(/-/g,''),query.slice(result.queryStart-1,result.queryEnd));
  assert.equal(a[0],b[0]);assert.equal(a.at(-1),b.at(-1));
 }else{
  assert.equal(result.referenceStart,null);assert.equal(result.referenceEnd,null);
  assert.equal(result.queryStart,null);assert.equal(result.queryEnd,null);
 }
}

test('normalizes single FASTA, whitespace and lowercase; exact search still finds overlapping matches',()=>{
 assert.equal(normalizeProtein('  >query description\r\n acD \n ef*  '),'ACDEF*');
 assert.equal(normalizeProtein('ACDEFGHIKLMNPQRSTVWYBXZJUO*'),'ACDEFGHIKLMNPQRSTVWYBXZJUO*');
 assert.deepEqual(matchProtein('AAAA','>q\naa'),{query:'AA',matches:[{start:1,end:2},{start:2,end:3},{start:3,end:4}]});
 assert.deepEqual(matchProtein('ACDE','FFF'),{query:'FFF',matches:[]});
});

test('rejects empty, multiple FASTA, numbers, gaps, and punctuation',async()=>{
 for(const input of ['', ' \n ', '>empty\n', '>a\nAA\n >b\nCC','AA1','A-C','AC.','>a\nAC\n>b\nDE']){
  assert.throws(()=>normalizeProtein(input));
  await assert.rejects(alignProtein('ACDE',input));
  await assert.rejects(alignProtein(input,'ACDE'));
 }
 await assert.rejects(alignProtein('AC','AC',{onProgress:true}),/progress.*function/i);
});

test('returns full exact alignment and normalized inputs',async()=>{
 const result=await alignProtein(' >r\nacdef\n','>q\n ACDEF');
 assert.deepEqual(result,oracle('ACDEF','ACDEF'));
 assert.equal(result.referenceCoverage,1);assert.equal(result.queryCoverage,1);assert.equal(result.identity,1);
 assertInvariants(result);
});

test('finds the start of a partial local alignment in both sequences',async()=>{
 const result=await alignProtein('PPPACDEFGQQQ','TTACDEFGSS');
 assert.deepEqual([result.referenceStart,result.referenceEnd,result.queryStart,result.queryEnd],[4,9,3,8]);
 assert.equal(result.alignedReference,'ACDEFG');assert.equal(result.alignedQuery,'ACDEFG');
 assert.equal(result.referenceCoverage,6/12);assert.equal(result.queryCoverage,6/10);
 assert.deepEqual(result,oracle(result.reference,result.query));assertInvariants(result);
});

test('keeps a supported internal mismatch in the local alignment',async()=>{
 const result=await alignProtein('ACDEFGHIK','ACNEFGHIK');
 assert.equal(result.matches,8);assert.equal(result.mismatches,1);assert.equal(result.gaps,0);
 assert.equal(result.score,15);assert.equal(result.identity,8/9);
 assert.deepEqual(result,oracle(result.reference,result.query));assertInvariants(result);
});

test('represents insertions and deletions as gap columns without shifting coordinates',async()=>{
 const insertion=await alignProtein('ACDEFGHIK','ACDMEFGHIK');
 assert.equal(insertion.alignedReference,'ACD-EFGHIK');assert.equal(insertion.alignedQuery,'ACDMEFGHIK');
 assert.equal(insertion.gaps,1);assert.equal(insertion.matches,9);assert.equal(insertion.identity,9/10);
 assert.deepEqual([insertion.referenceStart,insertion.referenceEnd,insertion.queryStart,insertion.queryEnd],[1,9,1,10]);
 const deletion=await alignProtein('ACDMEFGHIK','ACDEFGHIK');
 assert.equal(deletion.alignedReference,'ACDMEFGHIK');assert.equal(deletion.alignedQuery,'ACD-EFGHIK');
 for(const result of [insertion,deletion]){assert.deepEqual(result,oracle(result.reference,result.query));assertInvariants(result);}
});

test('no common literal residues gives an empty alignment, and ambiguous letters are literal',async()=>{
 for(const [reference,query] of [['AAAA','CCCC'],['XXX','AAA'],['B','D'],['Z','E']]){
  const result=await alignProtein(reference,query);
  assert.deepEqual(result,oracle(reference,query));assert.equal(result.score,0);assertInvariants(result);
 }
 const stops=await alignProtein('X*UO','X*UO');
 assert.equal(stops.score,8);assert.equal(stops.matches,4);
});

test('repeated optimal hits return only the deterministic first row-major endpoint',async()=>{
 const result=await alignProtein('ACDACD','ACD');
 assert.deepEqual([result.referenceStart,result.referenceEnd,result.queryStart,result.queryEnd],[1,3,1,3]);
 const second=await alignProtein('AA','AAAA');
 assert.deepEqual([second.referenceStart,second.referenceEnd,second.queryStart,second.queryEnd],[1,2,1,2]);
});

test('agrees with independent full-matrix oracle on exhaustive short pairs and seeded longer cases',async()=>{
 const words=[];
 function extend(prefix,length){if(prefix.length===length){words.push(prefix);return;}for(const letter of 'AC')extend(prefix+letter,length);}
 for(let length=1;length<=4;length++)extend('',length);
 for(const reference of words)for(const query of words){
  const result=await alignProtein(reference,query);
  assert.deepEqual(result,oracle(reference,query),`${reference} / ${query}`);assertInvariants(result);
 }
 let state=1979;
 const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 const sequence=length=>Array.from({length},()=>'ACDEFG'[next()%6]).join('');
 for(let iteration=0;iteration<80;iteration++){
  const reference=sequence(10+next()%30),query=sequence(10+next()%30);
  const result=await alignProtein(reference,query);
  assert.deepEqual(result,oracle(reference,query),`${reference} / ${query}`);assertInvariants(result);
 }
});

test('enforces the 200,000-residue and 80,000,000-cell limits',async()=>{
 await assert.rejects(alignProtein('A'.repeat(200001),'A'),/200,000/);
 await assert.rejects(alignProtein('A','A'.repeat(200001)),/200,000/);
 // 80,000,005 is the nearest larger product with both lengths <= 200,000.
 // In particular this must fail the cell guard, not the individual-length guard.
 await assert.rejects(alignProtein('A'.repeat(545),'A'.repeat(146789)),/80,000,000/);
 await assert.rejects(alignProtein('A'.repeat(9000),'A'.repeat(9000)),/80,000,000/);
});

test('completes a formerly rejected 9-million-cell alignment',async()=>{
 const result=await alignProtein('A'.repeat(3000),'A'.repeat(3000));
 assert.equal(result.score,6000);assert.equal(result.matches,3000);
 assert.deepEqual([result.referenceStart,result.referenceEnd,result.queryStart,result.queryEnd],[1,3000,1,3000]);
 assert.equal(result.identity,1);assert.equal(result.referenceCoverage,1);assert.equal(result.queryCoverage,1);
 assertInvariants(result);
});

test('accepts exactly 80 million cells, reports progress, and yields to other tasks',async()=>{
 const progress=[];
 let timerRan=false;
 const timer=setTimeout(()=>{timerRan=true;},0);
 try{
  const result=await alignProtein('C'.repeat(199600)+'A'.repeat(400),'A'.repeat(400),{onProgress:value=>progress.push(value)});
  assert.equal(result.referenceLength,200000);assert.equal(result.queryLength,400);
  assert.equal(result.score,800);assert.equal(result.matches,400);
  assert.deepEqual([result.referenceStart,result.referenceEnd,result.queryStart,result.queryEnd],[199601,200000,1,400]);
  assert.equal(result.referenceCoverage,400/200000);assert.equal(result.queryCoverage,1);assert.equal(result.identity,1);
  assertInvariants(result);
  assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
  assert.ok(progress.some(value=>value>0 && value<1),'large jobs report intermediate progress');
  assert.ok(progress.every((value,index)=>value>=0 && value<=1 && (!index || value>=progress[index-1])));
  assert.equal(timerRan,true,'large jobs let the event loop process another task before completion');
 }finally{clearTimeout(timer);}
});

test('reports monotonic progress and honors cancellation before and during computation',async()=>{
 const progress=[];
 await alignProtein('ACDE','ACDE',{onProgress:value=>progress.push(value)});
 assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
 assert.ok(progress.every((value,index)=>value>=0 && value<=1 && (!index || value>=progress[index-1])));
 const preAborted=new AbortController();preAborted.abort();
 await assert.rejects(alignProtein('AC','AC',{signal:preAborted.signal}),{name:'AbortError'});
 const callbackAbort=new AbortController();
 await assert.rejects(alignProtein('AC','AC',{signal:callbackAbort.signal,onProgress:()=>callbackAbort.abort()}),{name:'AbortError'});
 const inFlight=new AbortController();
 const cancelledProgress=[];
 const timer=setTimeout(()=>inFlight.abort(),0);
 try{
  await assert.rejects(alignProtein('A'.repeat(10000),'A'.repeat(8000),{
   signal:inFlight.signal,onProgress:value=>cancelledProgress.push(value)
  }),{name:'AbortError'});
  assert.equal(cancelledProgress[0],0);
  assert.ok(cancelledProgress.some(value=>value>0 && value<1),'an 80-million-cell job starts before cancellation');
  assert.ok(cancelledProgress.every(value=>value<1),'cancelled jobs must not report completion');
 }finally{clearTimeout(timer);}
});

test('existing translation and export helpers remain functional',()=>{
 const translated=convert('ATGGCTTGTAAGTAA');
 assert.equal(translated.protein,'MACK');assert.equal(translated.rna,'AUGGCUUGUAAGUAA');
 assert.equal(fasta('example',translated.protein),'>example\nMACK\n');
 assert.match(genpept('example',translated.protein),/1 mack\n\/\/\n$/);
});
