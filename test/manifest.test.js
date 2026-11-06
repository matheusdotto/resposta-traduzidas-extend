const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const manifest=JSON.parse(read('manifest.json'));
test('manifest MV3 mantém armazenamento e domínio do Gemini',()=>{
 assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage','scripting']);assert.ok(manifest.host_permissions.includes('https://generativelanguage.googleapis.com/*'));
});
test('painel volta para Meet e Teams no mundo isolado',()=>{
 assert.equal(manifest.content_scripts.length,2);const script=manifest.content_scripts[0];assert.equal(script.world,'ISOLATED');assert.equal(script.run_at,'document_start');assert.equal(script.all_frames,false);assert.equal(script.match_origin_as_fallback,true);
 assert.deepEqual(script.matches,['https://meet.google.com/*','https://*.teams.microsoft.com/*','https://*.teams.live.com/*','https://*.teams.cloud.microsoft/*']);
 assert.deepEqual(script.js,['src/audio-utils.js','src/capture.js','src/gemini-translate.js','src/session-manager.js','src/interview-prompt.js','src/answers.js','src/status.js','src/panel-dom.js','src/content.js']);
 for(const file of [manifest.background.service_worker,manifest.options_page,...script.js])assert.ok(fs.existsSync(path.join(root,file)),file);
});
test('Zoom carrega só no cliente web, com os mesmos scripts e sem fallback de origem',()=>{
 const [teams,zoom]=manifest.content_scripts;assert.deepEqual(zoom.matches,['https://*.zoom.us/wc/*']);assert.deepEqual(zoom.js,teams.js);assert.equal(zoom.world,'ISOLATED');assert.equal(zoom.all_frames,false);assert.equal(zoom.match_origin_as_fallback,undefined);assert.ok(manifest.host_permissions.includes('https://*.zoom.us/*'));
});
test('prompt de entrevista é carregado antes do gerador nas três plataformas',()=>{
 assert.ok(fs.existsSync(path.join(root,'src/interview-prompt.js')));
 for(const block of manifest.content_scripts)assert.ok(block.js.indexOf('src/interview-prompt.js')<block.js.indexOf('src/answers.js'));
 assert.match(read('options.html'),/src="src\/interview-prompt.js"/);
 assert.match(read('options.html'),/id="interview-prompt" maxlength="50000"/);
});
test('não cria janela nem mantém página ou atalho do painel separado',()=>{
 assert.equal(manifest.commands,undefined);assert.equal(fs.existsSync(path.join(root,'panel.html')),false);assert.ok(!read('background.js').includes('windows.create'));
});
test('captura continua usando áudio da aba sem solicitar microfone',()=>{
 const capture=read('src/capture.js');assert.ok(capture.includes('getDisplayMedia'));assert.ok(!capture.includes('getUserMedia'));assert.ok(capture.includes('selfBrowserSurface: "include"'));assert.ok(!capture.includes('apiKey'));
});
