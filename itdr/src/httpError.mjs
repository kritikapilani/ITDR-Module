export function fail(statusCode, message, code = "ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  throw err;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function addMonths(date, months) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function newId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
