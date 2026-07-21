import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildParticipationCertificateMarkup,
  formatTimeForDisplay,
  getPresenceStatusClass,
  getPresenceStatusLabel,
  getRoundedParticipationHours,
  isPresenceLocked,
  normalizePresenceRecord,
} from '../src/app/presence-helpers.js';

const normalizeComparableValue = (value) => String(value || '').trim().toLowerCase();
const getTimestampMs = (value) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

test('normalizePresenceRecord applies defaults and normalizes invalid status', () => {
  assert.deepEqual(normalizePresenceRecord({ status: 'INVALID' }), {
    status: 'absent',
    checkedInAt: null,
    accreditationDeliveredAt: null,
    tshirtDeliveredAt: null,
    lunchCollectedAt: null,
    departureTime: '',
    departureRecordedAt: null,
    missionCompletedAt: null,
    missionCompletedBy: '',
  });
});

test('normalizePresenceRecord keeps valid present status and trims departure time', () => {
  const record = normalizePresenceRecord({ status: ' Present ', departureTime: ' 17:05 ' });
  assert.equal(record.status, 'present');
  assert.equal(record.departureTime, '17:05');
});

test('getPresence label and class use normalized comparator', () => {
  assert.equal(getPresenceStatusLabel(' Present ', normalizeComparableValue), 'Présent');
  assert.equal(getPresenceStatusLabel('Absent', normalizeComparableValue), 'Absent');
  assert.equal(getPresenceStatusClass('present', normalizeComparableValue), 'status-pill status-pill--ok');
  assert.equal(getPresenceStatusClass('absent', normalizeComparableValue), 'status-pill status-pill--danger');
});

test('isPresenceLocked detects completed missions', () => {
  assert.equal(isPresenceLocked({ missionCompletedAt: null }), false);
  assert.equal(isPresenceLocked({ missionCompletedAt: '2026-04-20T10:00:00Z' }), true);
});

test('formatTimeForDisplay returns fallback for empty values', () => {
  assert.equal(formatTimeForDisplay(''), 'Non renseigné');
  assert.equal(formatTimeForDisplay('08:30'), '08:30');
});

test('getRoundedParticipationHours rounds up based on departureTime', () => {
  const hours = getRoundedParticipationHours(
    { checkedInAt: '2026-04-20T08:10:00', departureTime: '10:00' },
    getTimestampMs,
  );
  assert.equal(hours, 2);
});

test('getRoundedParticipationHours can use missionCompletedAt fallback', () => {
  const hours = getRoundedParticipationHours(
    { checkedInAt: '2026-04-20T08:10:00Z', missionCompletedAt: '2026-04-20T11:01:00Z' },
    getTimestampMs,
  );
  assert.equal(hours, 3);
});

test('getRoundedParticipationHours returns 0 for incoherent timestamps', () => {
  const hours = getRoundedParticipationHours(
    { checkedInAt: '2026-04-20T08:10:00Z', departureTime: '07:00' },
    getTimestampMs,
  );
  assert.equal(hours, 0);
});

test('buildParticipationCertificateMarkup injects escaped values', () => {
  const html = buildParticipationCertificateMarkup({
    fullName: '<Ada & Bob>',
    teamName: 'Accueil',
    roleLabel: 'Chef',
    roundedHours: 5,
    signatory: 'MyCLIM Org',
  });

  assert.match(html, /Certificat de participation/);
  assert.match(html, /&lt;Ada &amp; Bob&gt;/);
  assert.match(html, /Accueil/);
  assert.match(html, /MyCLIM Org/);
});
