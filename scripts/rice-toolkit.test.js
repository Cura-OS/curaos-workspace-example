'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const toolkit=require('./rice-toolkit.js'),script=path.join(__dirname,'rice-toolkit.js');
function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rice-template-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'owning-workspace'),bin=path.join(directory,'bin'),profile=path.join(directory,'user','toolkit.json'),clientConfig=path.join(directory,'client.json');
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.mkdirSync(bin);
  execFileSync('git',['init','-q',root],{env:toolkit.cleanGitEnvironment(),stdio:['ignore','pipe','pipe']});
  fs.writeFileSync(path.join(root,'scripts/rice-execution.json'),JSON.stringify({version:1,source:'fixture-kb',prefix:'runtime',scope:'project:fixture',policyDocument:'fixture-kb:runtime/policy/orchestration.md'}));
  const command="const fs=require('node:fs');console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),profile:process.env.RICE_CLIENT_CONFIG,gitEnv:process.env.GIT_DIR||'',stdin:process.argv.includes('--answers-file')?fs.readFileSync(0,'utf8'):''}));\n";
  for(const name of ['rice-work.js','execute-workflow.js'])fs.writeFileSync(path.join(root,'scripts',name),command);
  const client=path.join(bin,'rice-client');fs.writeFileSync(client,`#!/usr/bin/env node\n${command}`,{mode:0o755});fs.writeFileSync(clientConfig,'{"referencesOnly":true}\n');
  return {directory,root:fs.realpathSync(root),profile,values:{workspaceRoot:root,client,clientConfig}};
}
test('persistent configure survives a fresh process and routes native work arguments in the owning cwd',t=>{
  const f=fixture(t);toolkit.configure(f.values,f.profile);
  assert.equal(fs.statSync(f.profile).mode&0o777,0o600);
  const output=execFileSync(process.execPath,[script,'work','list','--json'],{encoding:'utf8',env:{...process.env,RICE_TOOLKIT_CONFIG:f.profile,GIT_DIR:'/invalid/inherited/git'}});
  const actual=JSON.parse(output);assert.equal(actual.cwd,f.root);assert.deepEqual(actual.args,['list','--json']);assert.equal(actual.profile,f.values.clientConfig);assert.equal(actual.gitEnv,'');
});
test('workflow answers stay exact JSON stdin across the native process boundary',t=>{
  const f=fixture(t);toolkit.configure(f.values,f.profile);const answer='{"request-1":{"verdict":"pass"}}\n';
  const actual=JSON.parse(execFileSync(process.execPath,[script,'workflow','context-load','--run','run-1','--answers-file','-','--json'],{input:answer,encoding:'utf8',env:{...process.env,RICE_TOOLKIT_CONFIG:f.profile}}));
  assert.equal(actual.stdin,answer);assert.deepEqual(actual.args,['context-load','--run','run-1','--answers-file','-','--json']);assert.equal(actual.cwd,f.root);
});
test('native client and maintained work context preserve selected executable/profile and arguments',t=>{
  const f=fixture(t);toolkit.configure(f.values,f.profile);
  for(const [command,args] of [['rice',['context','--id','fixture-kb:issues/TASK']],['work',['context','--id','fixture-kb:issues/TASK']],['check',['--version']]]){
    const result=toolkit.run([command,...(command==='check'?[]:args)],{profilePath:f.profile,stdio:'pipe'});assert.equal(result.status,0);const actual=JSON.parse(result.stdout);assert.deepEqual(actual.args,args);assert.equal(actual.profile,f.values.clientConfig);assert.equal(actual.cwd,f.root);
  }
});
test('missing malformed self-referencing and non-owning configuration refuses before execution',t=>{
  const f=fixture(t);
  assert.throws(()=>toolkit.run(['work','list'],{profilePath:f.profile,stdio:'pipe'}),/missing or invalid/);
  fs.mkdirSync(path.dirname(f.profile));fs.writeFileSync(f.profile,'{"version":2}');assert.throws(()=>toolkit.run(['work'],{profilePath:f.profile}),/unsupported/);
  assert.throws(()=>toolkit.validate({...f.values,version:1,workspaceRoot:path.resolve(__dirname,'..')}),/own runtime fallback/);
  assert.throws(()=>toolkit.validate({...f.values,version:1,workspaceRoot:path.join(f.root,'scripts')}),/owning Git root/);
  assert.throws(()=>toolkit.validate({...f.values,version:1,clientConfig:path.join(f.directory,'missing')}));
  assert.throws(()=>toolkit.run(['work'],{profilePath:'relative.json'}),/must be absolute/);
});
test('configuration preserves unrelated profile fields and refuses arbitrary script commands',t=>{
  const f=fixture(t);fs.mkdirSync(path.dirname(f.profile));fs.writeFileSync(f.profile,JSON.stringify({version:1,ownerSetting:'preserved'}));
  toolkit.configure(f.values,f.profile);assert.equal(JSON.parse(fs.readFileSync(f.profile)).ownerSetting,'preserved');
  assert.throws(()=>toolkit.run(['../../other-script'],{profilePath:f.profile}),/supported toolkit commands/);
});
