const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s().-]{6,19}$/;
function clean(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function validEmail(value) { return EMAIL_REGEX.test(clean(value, 254).toLowerCase()); }
function validPhone(value) { return !value || PHONE_REGEX.test(clean(value, 20)); }
function validDate(value) { const d = new Date(value); return !Number.isNaN(d.getTime()); }
function validMoney(value) { const n = Number(value); return Number.isFinite(n) && n >= 0; }
function validCoordinates(lat, lng) { const a = Number(lat), b = Number(lng); return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(b) && b >= -180 && b <= 180; }
module.exports = { clean, validEmail, validPhone, validDate, validMoney, validCoordinates };
