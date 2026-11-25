'use strict';

(function (root) {
  const STORAGE_KEY = 'entre-lineas-reservas-v1';
  const RESOURCES = ['Lectura', 'Repaso'];

  function timeToMinutes(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function intervalsOverlap(first, second) {
    if (!first || !second || first.date !== second.date || first.resource !== second.resource) return false;
    const firstStart = timeToMinutes(first.start);
    const firstEnd = timeToMinutes(first.end);
    const secondStart = timeToMinutes(second.start);
    const secondEnd = timeToMinutes(second.end);
    if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => value === null)) return false;
    return firstStart < secondEnd && firstEnd > secondStart;
  }

  function validateAppointment(appointment) {
    if (!appointment || typeof appointment !== 'object') return 'Completá todos los campos.';
    if (typeof appointment.name !== 'string' || !appointment.name.trim()) return 'Escribí tu nombre.';
    if (typeof appointment.reason !== 'string' || !appointment.reason.trim()) return 'Contanos la materia o el motivo.';
    if (typeof appointment.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.date)) return 'Elegí una fecha válida.';
    const [year, month, day] = appointment.date.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'Elegí una fecha válida.';
    const start = timeToMinutes(appointment.start);
    const end = timeToMinutes(appointment.end);
    if (start === null || end === null) return 'Ingresá horarios válidos.';
    if (end <= start) return 'La hora de fin debe ser posterior al inicio.';
    if (!RESOURCES.includes(appointment.resource)) return 'Elegí una mesa disponible.';
    return null;
  }

  function sortAppointments(appointments) {
    return [...appointments].sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  }

  function readAppointments(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && validateAppointment(item) === null) : [];
    } catch (_) {
      return [];
    }
  }

  function saveAppointments(storage, appointments) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(appointments));
      return true;
    } catch (_) {
      return false;
    }
  }

  const logic = { timeToMinutes, intervalsOverlap, validateAppointment, sortAppointments, readAppointments, saveAppointments };
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined') return;

  const form = document.querySelector('#booking-form');
  const list = document.querySelector('#appointment-list');
  const receipt = document.querySelector('#receipt');
  const status = document.querySelector('#form-status');
  const receiptStatus = document.querySelector('#receipt-status');
  const storage = {
    getItem(key) { return root.localStorage.getItem(key); },
    setItem(key, value) { return root.localStorage.setItem(key, value); },
  };
  let appointments = readAppointments(storage);
  let latestReceiptId = null;

  function formatDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function renderReceipt() {
    const item = appointments.find((appointment) => appointment.id === latestReceiptId);
    receipt.querySelector('.receipt-content').replaceChildren();
    if (!item) {
      receipt.hidden = true;
      receiptStatus.textContent = '';
      return;
    }
    receipt.hidden = false;
    const details = document.createElement('dl');
    for (const [label, value] of [
      ['Nombre', item.name], ['Fecha', formatDate(item.date)], ['Horario', `${item.start} a ${item.end}`],
      ['Mesa', item.resource], ['Materia o motivo', item.reason],
    ]) {
      details.append(textElement('dt', '', label), textElement('dd', '', value));
    }
    receipt.querySelector('.receipt-content').replaceChildren(details);
    receiptStatus.textContent = 'Guardá este comprobante o imprimilo para tenerlo a mano.';
  }

  function renderAppointments() {
    list.replaceChildren();
    const sorted = sortAppointments(appointments);
    if (!sorted.length) {
      list.append(textElement('p', 'empty-state', 'Todavía no hay encuentros. Este espacio espera tu próxima lectura.'));
      return;
    }
    sorted.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'appointment-card';
      const heading = textElement('h3', '', item.name);
      const meta = textElement('p', 'appointment-meta', `${formatDate(item.date)} · ${item.start}–${item.end} · Mesa ${item.resource}`);
      const reason = textElement('p', 'appointment-reason', item.reason);
      const cancel = textElement('button', 'button button-small button-quiet', 'Cancelar reserva');
      cancel.type = 'button';
      cancel.setAttribute('aria-label', `Cancelar reserva de ${item.name}, ${formatDate(item.date)} a las ${item.start}`);
      cancel.addEventListener('click', () => cancelAppointment(item.id));
      card.append(heading, meta, reason, cancel);
      list.append(card);
    });
  }

  function persist() {
    if (saveAppointments(storage, appointments)) return true;
    status.textContent = 'No pudimos guardar los cambios en este dispositivo. Revisá el espacio disponible del navegador.';
    status.className = 'form-status error';
    return false;
  }

  function cancelAppointment(id) {
    const previousAppointments = appointments;
    appointments = appointments.filter((item) => item.id !== id);
    if (!persist()) {
      appointments = previousAppointments;
      renderAppointments();
      return;
    }
    if (latestReceiptId === id) {
      latestReceiptId = null;
      status.textContent = 'La reserva se canceló y su comprobante dejó de estar vigente.';
      status.className = 'form-status success';
    }
    renderAppointments();
    renderReceipt();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const appointment = Object.fromEntries(['name', 'date', 'start', 'end', 'resource', 'reason'].map((key) => [key, String(data.get(key) || '').trim()]));
    const validationError = validateAppointment(appointment);
    if (validationError) {
      latestReceiptId = null;
      renderReceipt();
      status.textContent = validationError;
      status.className = 'form-status error';
      return;
    }
    if (appointments.some((existing) => intervalsOverlap(appointment, existing))) {
      latestReceiptId = null;
      renderReceipt();
      status.textContent = 'Ese horario ya está reservado para esta mesa. Probá otro intervalo.';
      status.className = 'form-status error';
      return;
    }
    appointment.id = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    appointments = sortAppointments([...appointments, appointment]);
    if (!persist()) {
      appointments = appointments.filter((item) => item.id !== appointment.id);
      latestReceiptId = null;
      renderAppointments();
      renderReceipt();
      return;
    }
    latestReceiptId = appointment.id;
    form.reset();
    status.textContent = 'Encuentro reservado. Tu comprobante está listo.';
    status.className = 'form-status success';
    renderAppointments();
    renderReceipt();
    receipt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.querySelector('#print-receipt').addEventListener('click', () => root.print());
  renderAppointments();
  renderReceipt();
})(typeof window !== 'undefined' ? window : globalThis);
