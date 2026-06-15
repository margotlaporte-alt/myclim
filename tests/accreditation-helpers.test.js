import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccreditationPrintHistoryMarkup,
  buildAccreditationRoleLabel,
  buildAccreditationUsers,
  buildBadgePrintMarkup,
  formatZoneLabel,
  getAccreditationFinalZoneIds,
  getAccreditationStatusClass,
  getBadgeRoleLabel,
  getConfirmedAccreditationRoleNames,
  sortAccreditationZones,
  toggleIdInList,
} from '../src/app/accreditation-helpers.js';

const normalizeComparableValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const formatDateTimeForDisplay = (value) => `fmt:${value}`;

test('sortAccreditationZones sorts by order then name', () => {
  const zones = sortAccreditationZones([
    { id: 'b', order: 2, name: 'Warmup' },
    { id: 'a2', order: 1, name: 'B' },
    { id: 'a1', order: 1, name: 'A' },
  ]);
  assert.deepEqual(zones.map((zone) => zone.id), ['a1', 'a2', 'b']);
});

test('getAccreditationFinalZoneIds merges inherited and manual overrides', () => {
  const zones = [
    { id: 'zone-a', order: 1, name: 'A' },
    { id: 'zone-b', order: 2, name: 'B' },
    { id: 'zone-c', order: 3, name: 'C' },
  ];
  const roles = [{ id: 'role-1', roleName: 'Accueil' }];
  const roleZoneAssignments = { 'role-1': ['zone-a', 'zone-b'] };
  const ids = getAccreditationFinalZoneIds({
    assignedRoles: ['Accueil'],
    roles,
    zones,
    roleZoneAssignments,
    override: { addZoneIds: ['zone-c'], removeZoneIds: ['zone-b'] },
    normalizeComparableValue,
  });

  assert.deepEqual(ids, ['zone-a', 'zone-c']);
});

test('buildAccreditationUsers merges users and assignments', () => {
  const users = [
    {
      id: 'u1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      assignedTeams: ['Accueil'],
      teamRole: 'Bénévole',
      assignmentStatus: 'Confirmé',
      userTypes: ['benevole'],
    },
  ];
  const teamAssignments = [
    {
      id: 'u2',
      firstName: 'Bob',
      lastName: 'Martin',
      email: 'bob@example.com',
      assignedRole: 'Logistique',
      teamRole: "Chef d'équipe",
    },
  ];

  const volunteers = buildAccreditationUsers(users, teamAssignments);
  assert.equal(volunteers.length, 2);
  assert.equal(volunteers[0].id, 'u1');
  assert.equal(volunteers[1].id, 'u2');
  assert.deepEqual(volunteers[1].assignedRoles, ['Logistique']);
});

test('buildAccreditationRoleLabel handles 0, 1 and many roles', () => {
  assert.equal(buildAccreditationRoleLabel([]), '');
  assert.equal(buildAccreditationRoleLabel(['Accueil']), 'Accueil');
  assert.equal(buildAccreditationRoleLabel(['Accueil', 'Logistique']), 'Accueil et Logistique');
  assert.equal(buildAccreditationRoleLabel(['A', 'B', 'C']), 'A, B et C');
});

test('getConfirmedAccreditationRoleNames returns confirmed roles only', () => {
  assert.deepEqual(
    getConfirmedAccreditationRoleNames({ assignedRoles: ['Accueil'], assignmentStatus: 'Confirmé' }, normalizeComparableValue),
    ['Accueil'],
  );
  assert.deepEqual(
    getConfirmedAccreditationRoleNames({ assignedRoles: ['Accueil'], assignmentStatus: 'En attente' }, normalizeComparableValue),
    [],
  );
});

test('getBadgeRoleLabel prefers manual label then confirmed roles then assigned roles', () => {
  assert.equal(
    getBadgeRoleLabel({ assignedRoles: ['Accueil'] }, { badgeLabel: 'VIP' }, normalizeComparableValue),
    'VIP',
  );
  assert.equal(
    getBadgeRoleLabel({ assignedRoles: ['Accueil'], assignmentStatus: 'Confirmé' }, {}, normalizeComparableValue),
    'Accueil',
  );
  assert.equal(
    getBadgeRoleLabel({ assignedRoles: ['Accueil', 'Logistique'], assignmentStatus: 'En attente' }, {}, normalizeComparableValue),
    'Accueil et Logistique',
  );
});

test('getAccreditationStatusClass maps printing states', () => {
  assert.equal(getAccreditationStatusClass('Dans la file'), 'workflow-pill workflow-pill--assigned');
  assert.equal(getAccreditationStatusClass('Imprimé'), 'workflow-pill workflow-pill--confirmed');
  assert.equal(getAccreditationStatusClass('Autre'), 'workflow-pill workflow-pill--received');
});

test('toggleIdInList adds and removes values', () => {
  assert.deepEqual(toggleIdInList(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleIdInList(['a', 'b'], 'b'), ['a']);
});

test('formatZoneLabel returns order and name', () => {
  assert.equal(formatZoneLabel({ order: 4, name: 'Mixed zone' }), '4. Mixed zone');
});

test('print markup builders include escaped content', () => {
  const items = [{
    name: '<Ada>',
    roleLabel: 'Accueil',
    zoneLabels: ['1. Call room'],
    printedAt: '2026-04-20T10:00:00Z',
    role: 'Accueil',
  }];

  const history = buildAccreditationPrintHistoryMarkup(items, formatDateTimeForDisplay);
  const badges = buildBadgePrintMarkup(items);

  assert.match(history, /&lt;Ada&gt;/);
  assert.match(history, /fmt:2026-04-20T10:00:00Z/);
  assert.match(badges, /CMCM Luxembourg Indoor Meeting 2027/);
  assert.match(badges, /Accueil/);
});
