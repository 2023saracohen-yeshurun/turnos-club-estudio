'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  timeToMinutes,
  intervalsOverlap,
  validateAppointment,
  sortAppointments,
  readAppointments,
  saveAppointments,
} = require('../script.js');

const base = {
  name: 'Sara Cohen',
  date: '2026-11-25',
  start: '10:00',
  end: '11:00',
  resource: 'Lectura',
  reason: 'Lectura compartida',
};

test('convierte horas válidas a minutos y rechaza entradas mal formadas', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes('9:30'), null);
  assert.equal(timeToMinutes('10:60'), null);
});

test('detecta intervalos idénticos y solapamientos parciales', () => {
  assert.equal(intervalsOverlap({ ...base, start: '10:00', end: '11:00' }, { ...base, start: '10:00', end: '11:00' }), true);
  assert.equal(intervalsOverlap({ ...base, start: '10:30', end: '11:30' }, base), true);
});

test('detecta intervalos contenidos en ambos sentidos', () => {
  assert.equal(intervalsOverlap({ ...base, start: '10:15', end: '10:45' }, base), true);
  assert.equal(intervalsOverlap(base, { ...base, start: '10:15', end: '10:45' }), true);
});

test('permite turnos adyacentes, en otra fecha o en otro recurso', () => {
  assert.equal(intervalsOverlap({ ...base, start: '11:00', end: '12:00' }, base), false);
  assert.equal(intervalsOverlap({ ...base, date: '2026-11-26' }, base), false);
  assert.equal(intervalsOverlap({ ...base, resource: 'Repaso' }, base), false);
});

test('valida campos requeridos, fecha, horas y fin posterior al inicio', () => {
  assert.equal(validateAppointment(base), null);
  for (const patch of [
    { name: ' ' }, { date: '' }, { date: '2026-02-30' }, { start: '9:00' },
    { end: '10:00' }, { end: '09:59' }, { resource: 'Otra mesa' }, { reason: '  ' },
  ]) {
    assert.ok(validateAppointment({ ...base, ...patch }), `debe rechazar ${JSON.stringify(patch)}`);
  }
});

test('ordena reservas cronológicamente sin mutar el arreglo de entrada', () => {
  const later = { ...base, id: 'later', date: '2026-11-27', start: '08:00' };
  const earlier = { ...base, id: 'earlier', date: '2026-11-25', start: '09:00' };
  const input = [later, earlier];
  assert.deepEqual(sortAppointments(input).map((item) => item.id), ['earlier', 'later']);
  assert.deepEqual(input.map((item) => item.id), ['later', 'earlier']);
});

test('recupera un arreglo desde almacenamiento y tolera datos corruptos o fallos', () => {
  assert.deepEqual(readAppointments({ getItem: () => JSON.stringify([{ ...base, id: 'a' }]) }), [{ ...base, id: 'a' }]);
  assert.deepEqual(readAppointments({ getItem: () => '[{"id":"broken"}]' }), []);
  assert.deepEqual(readAppointments({ getItem: () => '{mal' }), []);
  assert.deepEqual(readAppointments({ getItem: () => 'null' }), []);
  assert.deepEqual(readAppointments({ getItem() { throw new Error('blocked'); } }), []);
});

test('reporta fallos de almacenamiento sin lanzar excepciones', () => {
  assert.equal(saveAppointments({ setItem() {} }, []), true);
  assert.equal(saveAppointments({ setItem() { throw new Error('quota'); } }, []), false);
});
