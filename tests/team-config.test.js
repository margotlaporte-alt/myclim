import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDefaultTeamRoles,
  getAvailableTeamRoles,
  getVolunteerStableId,
  isLegacySeedAssignment,
  normalizeSubRoles,
  normalizeTeamAssignment,
  normalizeTeamConfigurationPayload,
} from '../src/app/team-config.js';

test('normalizeSubRoles trims, deduplicates and removes empties', () => {
  assert.deepEqual(normalizeSubRoles([' Chef ', 'chef', '', null, 'Bénévole']), ['Chef', 'Bénévole']);
});

test('buildDefaultTeamRoles returns seeded roles with ids', () => {
  const roles = buildDefaultTeamRoles();
  assert.ok(Array.isArray(roles));
  assert.ok(roles.length > 0);
  assert.ok(roles[0].id);
});

test('normalizeTeamAssignment resolves role id and default team role', () => {
  const roles = [{ id: 'role-1', roleName: 'Accueil' }];
  const assignment = normalizeTeamAssignment({
    id: 'u1',
    firstName: 'Ada',
    assignedRole: 'Accueil',
  }, roles);

  assert.equal(assignment.assignedRoleId, 'role-1');
  assert.equal(assignment.assignedRole, 'Accueil');
  assert.equal(assignment.teamRole, 'Bénévole');
});

test('normalizeTeamConfigurationPayload returns consistent structure', () => {
  const payload = normalizeTeamConfigurationPayload({
    roles: [{ id: 'r1', roleName: 'Accueil', neededCount: 3 }],
    teamAssignments: [{ id: 'u1', assignedRoleId: 'r1', teamRole: 'Bénévole' }],
    supportTasks: [{ id: 't1', day: 'Vendredi', startTime: '08:00', endTime: '10:00', taskLabel: 'Montage' }],
  });

  assert.equal(payload.roles.length, 1);
  assert.equal(payload.teamAssignments.length, 1);
  assert.equal(payload.supportTasks.length, 1);
});

test('getAvailableTeamRoles merges defaults, subroles and extra roles', () => {
  const roles = getAvailableTeamRoles({ subRoles: ['Speaker'] }, ['Runner']);
  assert.equal(roles.includes('Speaker'), true);
  assert.equal(roles.includes('Runner'), true);
  assert.equal(roles.includes('Bénévole'), true);
});

test('getVolunteerStableId prefers uid then id', () => {
  assert.equal(getVolunteerStableId({ uid: 'uid-1', id: 'id-1' }), 'uid-1');
  assert.equal(getVolunteerStableId({ id: 'id-2' }), 'id-2');
});

test('isLegacySeedAssignment detects fake seeded records', () => {
  assert.equal(isLegacySeedAssignment({ id: 'vol-12', email: 'seed@email.com' }), true);
  assert.equal(isLegacySeedAssignment({ id: 'user-1', email: 'real@example.com' }), false);
});
