import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const helper = new URL('./blackglass-cartridge.py', import.meta.url).pathname;
test('deployment cartridge is external, pinned, validated and recorded without a source path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gosx-private-cartridge-'));
  try {
    const rom = Buffer.alloc(32768); let checksum = 0; for (let i=0x134; i<0x14d; i++) checksum=(checksum-1)&255; rom[0x14d]=checksum;
    const source=join(dir,'private.gbc'),root=join(dir,'dist');writeFileSync(source,rom);
    const hash=createHash('sha256').update(rom).digest('hex');
    const stage=expected=>spawnSync('python3',[helper,'--root',root,'--source',source,'--sha256',expected],{encoding:'utf8'});
    assert.notEqual(stage('0'.repeat(64)).status,0);assert.equal(existsSync(join(root,'runtime-assets/blackglass-cartridge.gbc')),false);
    const valid=stage(hash);assert.equal(valid.status,0,valid.stderr);
    assert.deepEqual(readFileSync(join(root,'runtime-assets/blackglass-cartridge.gbc')),rom);
    const receipt=readFileSync(join(root,'runtime-assets/blackglass-cartridge.json'),'utf8');assert.equal(receipt.includes(source),false);
    assert.deepEqual(JSON.parse(receipt),{sha256:hash,bytes:32768});
    rom[0x14d]^=1;writeFileSync(source,rom);const invalid=stage(createHash('sha256').update(rom).digest('hex'));assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/checksum/);
    const inRepo=spawnSync('python3',[helper,'--root',root,'--source',helper,'--sha256',hash],{encoding:'utf8'});assert.notEqual(inRepo.status,0);assert.match(inRepo.stderr,/outside the repository/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
