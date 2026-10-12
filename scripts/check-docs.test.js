'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('template docs gate executes all native template checks and stops on a failing check',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'template-doc-checks-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temp,'scripts'));fs.mkdirSync(path.join(temp,'bin'));fs.copyFileSync(path.join(__dirname,'check-docs.sh'),path.join(temp,'scripts/check-docs.sh'));
  const ledger=path.join(temp,'events');for(const command of ['node','bun'])fs.writeFileSync(path.join(temp,'bin',command),'#!/bin/sh\nprintf "%s %s\\n" "'+command+'" "$*" >> "$CHECK_LEDGER"\n[ "$1" != "$FAIL_CHECK" ]\n',{mode:0o755});
  const expected=['node scripts/check-public-docs.js','bun scripts/check-doc-graph.js','node scripts/check-agents-schema.js --mode=fail','node scripts/generate-rule-index.js'];
  const invoke=failed=>spawnSync('bash',[path.join(temp,'scripts/check-docs.sh')],{encoding:'utf8',env:{...process.env,PATH:path.join(temp,'bin')+path.delimiter+process.env.PATH,CHECK_LEDGER:ledger,FAIL_CHECK:failed}});
  let run=invoke('');assert.equal(run.status,0);assert.deepEqual(fs.readFileSync(ledger,'utf8').trim().split('\n'),expected);
  for(let i=0;i<expected.length;i++){fs.writeFileSync(ledger,'');run=invoke(expected[i].split(' ')[1]);assert.notEqual(run.status,0);assert.deepEqual(fs.readFileSync(ledger,'utf8').trim().split('\n'),expected.slice(0,i+1));}
});
