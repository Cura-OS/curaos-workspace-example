#!/usr/bin/env node
'use strict';
// Template-only reference adapter. Runtime/task/policy implementation is owned by
// the configured maintained workspace and the installed native Rice client.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const DEFAULT_PROFILE = () => path.join(os.homedir(), '.config/rice-observe/toolkits/cura-workspace.json');
const GIT_ENV = ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_PREFIX','GIT_QUARANTINE_PATH'];
function cleanGitEnvironment(environment = process.env) {
  const result = {...environment};
  for (const name of GIT_ENV) delete result[name];
  return result;
}
function absoluteFile(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(`${label} must be an absolute file reference`);
  if (!fs.statSync(value).isFile()) throw Error(`${label} is not a regular file`);
  fs.accessSync(value, fs.constants.R_OK);
  return value;
}
function validate(profile) {
  if (profile?.version !== 1) throw Error('unsupported Rice toolkit profile version');
  if (typeof profile.workspaceRoot !== 'string' || !path.isAbsolute(profile.workspaceRoot)) throw Error('workspaceRoot must be absolute');
  const root = fs.realpathSync(profile.workspaceRoot);
  if (root === path.resolve(__dirname, '..')) throw Error('the template cannot be its own runtime fallback');
  let gitRoot;
  try { gitRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {encoding:'utf8',env:cleanGitEnvironment(),stdio:['ignore','pipe','pipe']}).trim(); }
  catch { throw Error('configured toolkit is not an owning Git workspace'); }
  if (fs.realpathSync(gitRoot) !== root) throw Error('toolkit reference must select the owning Git root');
  for (const relative of ['scripts/rice-work.js','scripts/execute-workflow.js','scripts/rice-execution.json']) absoluteFile(path.join(root,relative),'maintained toolkit source');
  const binding = JSON.parse(fs.readFileSync(path.join(root,'scripts/rice-execution.json'),'utf8'));
  if (binding.version !== 1 || typeof binding.source !== 'string' || typeof binding.policyDocument !== 'string' || !binding.policyDocument.startsWith(`${binding.source}:`) || typeof binding.scope !== 'string' || !binding.scope) throw Error('maintained workspace lacks its explicit Rice authority binding');
  absoluteFile(profile.client,'native Rice executable');
  if (path.basename(profile.client) !== 'rice-client') throw Error('selected executable must be named rice-client');
  fs.accessSync(profile.client,fs.constants.X_OK);
  absoluteFile(profile.clientConfig,'native Rice client configuration');
  return {...profile,workspaceRoot:root};
}
function configure(values, profilePath) {
  const profile = validate({version:1,...values});
  if (!path.isAbsolute(profilePath)) throw Error('profile reference must be absolute');
  let previous = {};
  if (fs.existsSync(profilePath)) {
    if (!fs.lstatSync(profilePath).isFile()) throw Error('profile is not an owned regular file');
    previous = JSON.parse(fs.readFileSync(profilePath,'utf8'));
    if (previous.version !== 1) throw Error('existing profile version refused');
  }
  const directory = path.dirname(profilePath);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const temporary = `${profilePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary,JSON.stringify({...previous,...profile},null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temporary,profilePath);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return {configured:true,profile:profilePath,workspaceRoot:profile.workspaceRoot};
}
function parseConfigure(args) {
  const names = {'--workspace-root':'workspaceRoot','--client':'client','--client-config':'clientConfig'},values={};
  for(let i=0;i<args.length;i+=2) { if(!names[args[i]] || !args[i+1] || values[names[args[i]]]) throw Error('configure requires explicit workspace/client/client-config references');values[names[args[i]]]=args[i+1]; }
  return values;
}
function run(argv, {profilePath=process.env.RICE_TOOLKIT_CONFIG || DEFAULT_PROFILE(),stdio='inherit',environment=process.env}={}) {
  const [command,...args]=argv;
  if(command==='configure')return configure(parseConfigure(args),profilePath);
  if(!path.isAbsolute(profilePath))throw Error('profile reference must be absolute');
  let profile;
  try { profile=JSON.parse(fs.readFileSync(profilePath,'utf8')); }
  catch { throw Error('persistent Rice toolkit profile is missing or invalid; run configure with explicit references'); }
  profile=validate(profile);
  const entries={work:'scripts/rice-work.js',workflow:'scripts/execute-workflow.js'};
  let executable,childArgs;
  if(command==='rice') {executable=profile.client;childArgs=args;}
  else if(command==='check') {executable=profile.client;childArgs=['--version'];}
  else if(entries[command]) {executable=process.execPath;childArgs=[path.join(profile.workspaceRoot,entries[command]),...args];}
  else throw Error('supported toolkit commands: configure, check, rice, work, workflow');
  const env=cleanGitEnvironment(environment);
  env.RICE_CLIENT_CONFIG=profile.clientConfig;
  env.PATH=`${path.dirname(profile.client)}${path.delimiter}${env.PATH||''}`;
  const result=spawnSync(executable,childArgs,{cwd:profile.workspaceRoot,env,stdio,encoding:'utf8'});
  if(result.error)throw Error(`native toolkit startup failed (${result.error.code||'transport'})`);
  return result;
}
if(require.main===module) {
  try {const result=run(process.argv.slice(2));if(result.configured)console.log(JSON.stringify(result));else process.exitCode=Number.isInteger(result.status)?result.status:1;}
  catch(error){console.error(`rice-toolkit: ${error.message}`);process.exitCode=1;}
}
module.exports={run,configure,validate,cleanGitEnvironment};
