import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSalaryRange, matchFilter } from '../src/core/filter.js';

test('parseSalaryRange 常见文案', () => {
  assert.deepEqual(parseSalaryRange('15-30K'), { min: 15, max: 30 });
  assert.deepEqual(parseSalaryRange('15-30k'), { min: 15, max: 30 });
  assert.deepEqual(parseSalaryRange('20K-40K'), { min: 20, max: 40 });
  assert.deepEqual(parseSalaryRange('薪资面议'), null);
  assert.deepEqual(parseSalaryRange('100-150元/天'), null);
});

test('职位名包含（任一命中）', () => {
  const job = { id: '1', title: '资深前端工程师', company: '某厂', salaryText: '20-40K' };
  const cfg = { jobInclude: 'Java, 前端', companyInclude: '', companyExclude: '', descExclude: '', salaryMin: 0, salaryMax: 0, skipNoSalary: false };
  assert.equal(matchFilter(job, cfg).pass, true);
});

test('公司排除优先', () => {
  const job = { id: '2', title: '前端', company: '某某人力资源外包', salaryText: '20-40K' };
  const cfg = { jobInclude: '前端', companyExclude: '外包,人力', descExclude: '' };
  assert.equal(matchFilter(job, cfg).pass, false);
  assert.equal(matchFilter(job, cfg).reason, 'companyExclude');
});

test('薪资区间求交', () => {
  const job = { id: '3', title: '前端', company: 'A', salaryText: '8-12K' };
  const ok = matchFilter(job, { salaryMin: 15, salaryMax: 40 });
  assert.equal(ok.pass, false);
  const ok2 = matchFilter(job, { salaryMin: 10, salaryMax: 20 });
  assert.equal(ok2.pass, true);
});

test('无薪资且 skipNoSalary', () => {
  const job = { id: '4', title: '前端', company: 'A', salaryText: '面议' };
  assert.equal(matchFilter(job, { skipNoSalary: true }).pass, false);
  assert.equal(matchFilter(job, { skipNoSalary: false }).pass, true);
});
