'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {parse,joinRecords,convert,fasta,genpept,normalizeProtein}=require('../core.js');

function parseText(text){return parse(new TextEncoder().encode(text).buffer);}
function snapGene(dna,{circular=false}={}){
 const cookie=new Uint8Array(14);cookie.set(new TextEncoder().encode('SnapGene'));
 const sequence=new Uint8Array(dna.length+1);sequence[0]=circular?1:0;sequence.set(new TextEncoder().encode(dna),1);
 const bytes=new Uint8Array(5+cookie.length+5+sequence.length),view=new DataView(bytes.buffer);
 bytes[0]=9;view.setUint32(1,cookie.length,false);bytes.set(cookie,5);
 const offset=5+cookie.length;bytes[offset]=0;view.setUint32(offset+1,sequence.length,false);bytes.set(sequence,offset+5);
 return bytes.buffer;
}

test('parses ordered multi-record FASTA with independent DNA and complete metadata',()=>{
 const parsed=parseText('>alpha first gene\nATG GCT\n>beta second gene\nTGTTAA\n>gamma\nCCCAAA');
 assert.deepEqual(parsed.records,[
  {id:'alpha',description:'first gene',header:'alpha first gene',dna:'ATGGCT',circular:false,format:'FASTA'},
  {id:'beta',description:'second gene',header:'beta second gene',dna:'TGTTAA',circular:false,format:'FASTA'},
  {id:'gamma',description:'',header:'gamma',dna:'CCCAAA',circular:false,format:'FASTA'}
 ]);
 assert.equal(parsed.dna,'ATGGCT');assert.equal(parsed.circular,false);assert.equal(parsed.format,'FASTA');
 assert.deepEqual(parsed.records.map(record=>convert(record.dna).protein),['MA','C','PK']);
});

test('accepts UTF-8 BOM, CRLF/CR/LF, lowercase, indentation, blank lines, tabs and IUPAC DNA',()=>{
 const parsed=parseText('\uFEFF\r\n \t >one\t first description \r\n a t g \r\n\t gcT\t\r\r  >two\r ryswkmbdhvn \n\n');
 assert.equal(parsed.records.length,2);
 assert.deepEqual(parsed.records[0],{id:'one',description:'first description',header:'one\t first description',dna:'ATGGCT',circular:false,format:'FASTA'});
 assert.equal(parsed.records[1].dna,'RYSWKMBDHVN');
 assert.equal(parseText('\t >tab\nATG').records[0].dna,'ATG');
 assert.equal(parseText('\t atg\n gcT ').records[0].dna,'ATGGCT');
});

test('preserves duplicate IDs as separate records and treats header contents as metadata',()=>{
 const records=parseText('>same description one\nATG\n>same description two\nGCT\n>gene|1 <tag> β\nTGT').records;
 assert.deepEqual(records.map(record=>record.id),['same','same','gene|1']);
 assert.deepEqual(records.map(record=>record.dna),['ATG','GCT','TGT']);
 assert.equal(records[1].description,'description two');assert.equal(records[2].header,'gene|1 <tag> β');
});

test('joins DNA records before translation so codons span record boundaries',()=>{
 const records=parseText('>left first fragment\nAT\n>middle\nGGCT\n>right last fragment\nTAA').records;
 const original=structuredClone(records),source=joinRecords(records);
 assert.deepEqual(source,{dna:'ATGGCTTAA',id:'',description:'',header:'',format:'FASTA',circular:false});
 assert.deepEqual(records,original);
 const translated=convert(source.dna);
 assert.equal(translated.rna,'AUGGCUUAA');assert.equal(translated.protein,'MA');
 assert.equal(translated.remainder,0);assert.equal(translated.stoppedAt,3);
 assert.equal(convert(source.dna,{stop:false}).protein,'MA*');
});

test('reading frame is applied once after joining DNA of different lengths',()=>{
 const source=joinRecords(parseText('>one\nAAT\n>two\nGGCT\n>three\nTAA').records);
 const translated=convert(source.dna,{frame:1,stop:false});
 assert.equal(translated.rna,'AAUGGCUUAA');assert.equal(translated.protein,'MA*');
 assert.equal(translated.remainder,0);
 assert.equal(convert(source.dna,{frame:2,stop:false}).protein,'WL');
});

test('reverse complement applies to the complete joined DNA including boundary codons',()=>{
 const source=joinRecords(parseText('>one\nTT\n>two\nAAG\n>three\nCCAT').records);
 assert.equal(source.dna,'TTAAGCCAT');
 const translated=convert(source.dna,{reverse:true,stop:false});
 assert.equal(translated.rna,'AUGGCUUAA');assert.equal(translated.protein,'MA*');
 assert.equal(convert(source.dna,{reverse:true}).protein,'MA');
});

test('interval coordinates span records and are validated against the total DNA length',()=>{
 const source=joinRecords(parseText('>one\nCCA\n>two\nTG\n>three\nGCTGG').records);
 assert.equal(source.dna,'CCATGGCTGG');
 const translated=convert(source.dna,{start:3,end:8});
 assert.equal(translated.rna,'AUGGCU');assert.equal(translated.protein,'MA');
 assert.equal(convert(source.dna,{start:3,end:8,reverse:true}).protein,'SH');
 assert.throws(()=>convert(source.dna,{start:3,end:11}),/valid 1-based interval/);
});

test('first-stop handling applies once across the entire joined sequence',()=>{
 const source=joinRecords(parseText('>one\nATGTA\n>two\nAGCT\n>three\nGCTAAA').records);
 const stopped=convert(source.dna);
 assert.equal(stopped.protein,'M');assert.equal(stopped.stoppedAt,2);assert.equal(stopped.stops,1);
 assert.equal(stopped.rna,'AUGUAAGCUGCUAAA');
 const retained=convert(source.dna,{stop:false});
 assert.equal(retained.protein,'M*AAK');assert.equal(retained.stoppedAt,null);assert.equal(retained.stops,1);
});

test('joining one source preserves its metadata and circular topology without mutation',()=>{
 for(const records of [parseText('>single original description\nATGGCT').records,parse(snapGene('ATGGCT',{circular:true})).records,parseText('ATGGCT').records]){
  const source=joinRecords(records);
  assert.deepEqual(source,records[0]);assert.notEqual(source,records[0]);
 }
 const circular=parse(snapGene('ATG',{circular:true})).records[0];
 assert.equal(joinRecords([circular,circular]).circular,false);
 assert.equal(circular.circular,true);
});

test('joining requires nonempty DNA records and normalizes sequence text',()=>{
 for(const input of [undefined,null,{},[]])assert.throws(()=>joinRecords(input),/At least one DNA record/);
 assert.throws(()=>joinRecords([null]),/record 1.*missing a DNA sequence/);
 assert.throws(()=>joinRecords([{dna:'ATG'},{dna:123}]),/record 2.*missing a DNA sequence/);
 for(const dna of ['', ' \n', 'AUG'])assert.throws(()=>joinRecords([{dna:'ATG'},{dna}]),/record 2.*IUPAC/);
 const record={id:'lowercase',dna:' atg\n gcT ',format:'Text DNA',circular:false};
 assert.equal(joinRecords([record]).dna,'ATGGCT');assert.equal(record.dna,' atg\n gcT ');
});

test('empty headers and empty records fail with record and original line context',()=>{
 for(const [input,expected] of [
  ['>\nATG',/record 1.*empty header.*line 1/i],
  ['> \t\nATG',/record 1.*empty header.*line 1/i],
  ['\n>one\nATG\n>\nGCT',/record 2.*empty header.*line 4/i],
  ['>empty',/record 1 \("empty"\).*no DNA sequence.*line 1/i],
  ['>empty\n \n>next\nATG',/record 1 \("empty"\).*no DNA sequence.*line 1/i],
  ['>one\nATG\n>empty\n \n',/record 2 \("empty"\).*no DNA sequence.*line 3/i]
 ])assert.throws(()=>parseText(input),expected);
});

test('invalid DNA in any record rejects the whole file and identifies the record and line',()=>{
 for(const invalid of ['AUG','AT1','AT-','AT.','AT>next','AT;comment','ATZ']){
  assert.throws(()=>parseText('>valid\nATG\n>bad description\n'+invalid),/record 2 \("bad"\), line 4: Use IUPAC DNA/i);
 }
 assert.throws(()=>parseText('\r\n>valid\r\nATG\r\n>bad\r\nAUU'),/record 2 \("bad"\), line 5/i);
});

test('rejects sequence text before FASTA headers instead of silently mixing formats',()=>{
 assert.throws(()=>parseText('ATG\n>next\nGCT'),/sequence data at line 1.*first record header \(line 2\)/i);
 assert.throws(()=>parseText('\nAC\n\n >next\nGCT'),/sequence data at line 2.*first record header \(line 4\)/i);
 assert.throws(()=>parseText('>one\nATG\nthis is not DNA\n>two\nGCT'),/record 1 \("one"\), line 3/i);
});

test('single FASTA and plain DNA retain top-level sequence access and expose one record',()=>{
 const single=parseText('>example annotated\nATGGCTTGTAAGTAA');
 assert.equal(single.dna,'ATGGCTTGTAAGTAA');assert.equal(single.records.length,1);
 assert.equal(convert(single.dna).protein,'MACK');
 const plain=parseText('atg\r\ngct\rTGT AAG TAA');
 assert.deepEqual(plain,{dna:'ATGGCTTGTAAGTAA',circular:false,format:'Text DNA',records:[{id:'',description:'',header:'',dna:'ATGGCTTGTAAGTAA',circular:false,format:'Text DNA'}]});
 for(const input of ['', ' \r\n\t', 'AUG', 'ATG123'])assert.throws(()=>parseText(input));
 assert.throws(()=>parse(new Uint8Array([0xff,0xfe,0xfd]).buffer),/Unrecognized file/);
});

test('SnapGene input retains DNA, topology and format and exposes one record',()=>{
 for(const circular of [false,true]){
  const parsed=parse(snapGene('ATGGCTTGTAAGTAA',{circular}));
  assert.deepEqual(parsed,{dna:'ATGGCTTGTAAGTAA',circular,format:'SnapGene',records:[{id:'',description:'',header:'',dna:'ATGGCTTGTAAGTAA',circular,format:'SnapGene'}]});
  assert.equal(convert(parsed.records[0].dna).protein,'MACK');
 }
 assert.throws(()=>parse(snapGene('ATG').slice(0,-1)),/truncated/);
 assert.throws(()=>parse(snapGene('AUG')),/IUPAC/);
 assert.throws(()=>parse(new Uint8Array([9,0,0,0]).buffer),/Incomplete SnapGene/);
});

test('joined protein exports as one sequence while protein FASTA input remains single-record',()=>{
 const source=joinRecords(parseText('>one first\nAT\n>two second\nGGCT').records);
 const protein=convert(source.dna).protein;
 assert.equal(fasta('joined',protein,'Combined DNA translation'),'>joined Combined DNA translation\nMA\n');
 assert.match(genpept('joined',protein),/1 ma\n\/\/\n$/);
 assert.throws(()=>normalizeProtein('>one\nM\n>two\nA'),/one protein sequence at a time/i);
 assert.equal(normalizeProtein('>one first\nMACK'),'MACK');
});
