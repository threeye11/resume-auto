function splitList(s) {
  if (!s || !String(s).trim()) return [];
  return String(s)
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 解析 "15-30K" / "20K-40K" → {min,max}；无法解析返回 null */
export function parseSalaryRange(text) {
  if (!text) return null;
  const t = String(text).toUpperCase().replace(/\s/g, '');
  if (/元\/(天|日|时)|\/天|\/日|\/H/.test(t)) return null;
  const m = t.match(/(\d+(?:\.\d+)?)[K]?[-~—](\d+(?:\.\d+)?)[K]?/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return { min, max };
}

/**
 * @returns {{pass:boolean, reason?:string}}
 */
export function matchFilter(job, cfg = {}) {
  const title = job.title || '';
  const company = job.company || '';
  const desc = job.desc || '';
  const salaryText = job.salaryText || '';

  const jobInclude = splitList(cfg.jobInclude);
  if (jobInclude.length && !jobInclude.some((k) => title.includes(k))) {
    return { pass: false, reason: 'jobInclude' };
  }

  const companyInclude = splitList(cfg.companyInclude);
  if (companyInclude.length && !companyInclude.some((k) => company.includes(k))) {
    return { pass: false, reason: 'companyInclude' };
  }

  const companyExclude = splitList(cfg.companyExclude);
  if (companyExclude.some((k) => company.includes(k))) {
    return { pass: false, reason: 'companyExclude' };
  }

  const descExclude = splitList(cfg.descExclude);
  if (desc && descExclude.some((k) => desc.includes(k))) {
    return { pass: false, reason: 'descExclude' };
  }

  const range = parseSalaryRange(salaryText);
  const sMin = Number(cfg.salaryMin) || 0;
  const sMax = Number(cfg.salaryMax) || 0;
  if (sMin > 0 || sMax > 0) {
    if (!range) {
      if (cfg.skipNoSalary) return { pass: false, reason: 'noSalary' };
    } else {
      const lo = sMin > 0 ? sMin : 0;
      const hi = sMax > 0 ? sMax : Number.POSITIVE_INFINITY;
      if (range.max < lo || range.min > hi) {
        return { pass: false, reason: 'salary' };
      }
    }
  } else if (cfg.skipNoSalary && !range) {
    return { pass: false, reason: 'noSalary' };
  }

  return { pass: true };
}
