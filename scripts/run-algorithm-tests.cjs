const assert = require('node:assert/strict');
const { parseEfastCsv } = require('../.tmp-test/src/ingest/efast.js');
const { chooseMatch, inferDocumentSignals } = require('../.tmp-test/src/matching/matchPdf.js');
const { extractScheduleH1c9 } = require('../.tmp-test/src/pdf/scheduleH1c9.js');

const csv = 'PN,Plan Name,Date Received,Plan Year,Participants,Participants EOY,Assets BOY,Assets,Link\r\n' +
  '2,"Example, Pension Plan",01/15/2025,2024,100,96,2500000,2375000,https://example.invalid/20250115093000NAL0000000000001.pdf\r\n';
const [row] = parseEfastCsv(csv);
assert.equal(row.planName, 'Example, Pension Plan');
assert.equal(row.planYear, 2024);
assert.equal(row.assetsBoy, 2500000);
assert.equal(row.rawRecordText.includes('"Example, Pension Plan"'), true);

const page = {
  pageNumber: 7, width: 1000, height: 1200,
  text: 'Schedule H Part I 1c(9) Common/collective trusts Filing date: 01/15/2025 Plan number 2 Plan year 2024',
  tokens: [
    { text:'1c(9)', x:40, y:500, width:30, height:10 },
    { text:'Common/collective', x:110, y:500, width:100, height:10 },
    { text:'trusts', x:250, y:500, width:40, height:10 },
    { text:'1,250,000', x:650, y:500, width:70, height:10 },
    { text:'1,175,000', x:840, y:500, width:60, height:10 },
  ]
};
const values = extractScheduleH1c9([page]);
assert.deepEqual(values.map(v => [v.subfield, v.normalizedNumber]), [['BOY', 1250000], ['EOY', 1175000]]);
assert.equal(values[0].sourcePage, 7);

const signals = inferDocumentSignals('20250115093000NAL0000000000001.pdf', [page]);
assert.equal(signals.filingId, '20250115093000NAL0000000000001');
assert.equal(signals.planYear, 2024);
assert.equal(signals.filingDate, '2025-01-15');
const match = chooseMatch(signals, [{
  importRowId: 1, planNumber: '2', planName: 'Example Pension Plan', planYear: 2024,
  dateReceived: '2025-01-15', sourceUrl: 'https://example.invalid/20250115093000NAL0000000000001.pdf',
  efastFilingId: '20250115093000NAL0000000000001', sponsorEin: null,
}]);
assert.equal(match.status, 'AUTO_ACCEPTED');
assert.equal(match.score, 1);

const missing = extractScheduleH1c9([{ ...page, tokens: page.tokens.filter(t => t.text !== '1,250,000') }]);
assert.deepEqual(missing, []);
console.log('CSV / MATCHING / H-1C9 ALGORITHM TESTS: PASS');
