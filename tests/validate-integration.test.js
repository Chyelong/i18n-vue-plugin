const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('node:path');
const fs = require('node:fs');

const SCRIPT = 'skills/i18n-replace/i18n-validate.js';
const VUE_FIXTURE = 'tests/fixtures/validate-phase1/vue-project';

function runValidate(args) {
  try {
    const out = execSync(`node ${SCRIPT} ${args}`, { encoding: 'utf-8', cwd: process.cwd() });
    return { stdout: out, code: 0 };
  } catch (e) {
    return {
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : '',
      code: e.status
    };
  }
}

describe('validate-integration', () => {
  it('exits 1 for 🔴 critical issues', () => {
    const r = runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n`);
    assert.equal(r.code, 1, 'should exit 1 when 🔴 issues present');
  });

  it('outputs JSON with --format json', () => {
    const r = runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n --format json`);
    // Extract JSON block from stdout (the JSON may have non-JSON lines before/after)
    const jsonStart = r.stdout.indexOf('{');
    const jsonEnd = r.stdout.lastIndexOf('}');
    assert.ok(jsonStart >= 0 && jsonEnd > jsonStart, 'stdout should contain a JSON block');
    const jsonStr = r.stdout.substring(jsonStart, jsonEnd + 1);
    const json = JSON.parse(jsonStr);
    assert.ok(Array.isArray(json.issues), 'issues should be array');
    assert.ok(json.stats, 'stats object should exist');
    assert.ok(json.issues.length > 0, 'should detect at least one issue in fixture');
    const ids = json.issues.map(i => i.id).filter(Boolean);
    assert.ok(ids.some(id => id === 'V01'), 'should detect V01 switch case');
    assert.ok(ids.some(id => id === 'V02'), 'should detect V02 equality');
  });

  it('writes JSON to file with --out', () => {
    const outFile = 'tests/fixtures/validate-phase1/vue-project/.tmp-issues.json';
    runValidate(`${VUE_FIXTURE} --type vue --i18n-dir ${VUE_FIXTURE}/src/i18n --format json --out ${outFile}`);
    assert.ok(fs.existsSync(outFile), 'out file should be created');
    const json = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    assert.ok(Array.isArray(json.issues));
    fs.unlinkSync(outFile);
  });
});
