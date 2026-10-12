#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),bad=[];
let names;
try {names=execFileSync('git',['-C',root,'ls-files','-z','--','*.md'],{stdio:['ignore','pipe','pipe']}).toString().split('\0').filter(Boolean);}
catch {console.error('check-public-docs: cannot list tracked markdown; failing closed');process.exit(1);}
if(!names.length){console.error('check-public-docs: no tracked markdown found; failing closed');process.exit(1);}
for(const relative of names) {
  const file=path.join(root,relative);let text;
  try {text=fs.readFileSync(file,'utf8');}catch{bad.push(`${relative}: tracked markdown unavailable`);continue;}
  if(/[\u2013\u2014]/.test(text))bad.push(`${relative}: banned dash`);
  for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target=match[1].split('#',1)[0].replace(/^<|>$/g,'');
    if(!target||/^(https?:\/\/|mailto:|#)/.test(target))continue;
    const resolved=path.resolve(path.dirname(file),target),rel=path.relative(root,resolved);
    if(rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))continue;
    if(!fs.existsSync(resolved))bad.push(`${relative}: missing link ${target}`);
  }
}
if(bad.length){console.error(bad.join('\n'));process.exit(1);}
console.log(`public docs ok (${names.length} tracked file(s))`);
