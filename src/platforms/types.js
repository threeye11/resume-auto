/**
 * @typedef {Object} JobCard
 * @property {string} id
 * @property {string} title
 * @property {string} company
 * @property {string} salaryText
 * @property {string} [city]
 * @property {string} [desc]
 * @property {Element} [el]
 */

/**
 * @typedef {Object} JobAdapter
 * @property {() => string} id
 * @property {() => boolean} matchHost
 * @property {() => JobCard[]} extractList
 * @property {(job: JobCard) => Promise<'ok'|'skip'|'fail'>} apply
 * @property {(job: JobCard, greeting: string) => Promise<'ok'|'fail'>} sendGreeting
 * @property {(job: JobCard) => boolean} isApplied
 */

export {};
