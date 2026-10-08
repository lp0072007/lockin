import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, SCHEDULE } = process.env;

// Prüft auch gleich, ob die Schlüssel gültig sind
webpush.setVapidDetails('mailto:lockin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

if (!PUSH_SUBSCRIPTION) {
  console.log('Noch kein Handy verbunden (Secret PUSH_SUBSCRIPTION fehlt).');
  process.exit(0);
}

// Bei geplanten Läufen nur den Lauf nehmen, der 18 Uhr in Wien entspricht
if (SCHEDULE) {
  const viennaHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', hour12: false }).format(new Date()));
  const offset = (viennaHour - new Date().getUTCHours() + 24) % 24;
  const wanted = offset === 2 ? '0 16 * * *' : '0 17 * * *';
  if (SCHEDULE !== wanted) {
    console.log(`Übersprungen: ${SCHEDULE} ist nicht 18 Uhr Wiener Zeit.`);
    process.exit(0);
  }
}

const payload = JSON.stringify({
  title: 'LockIn · Check-in',
  body: 'Wie sieht’s aus? Trag Look & Gefühl für heute ein 💪',
  url: './?tab=checkin',
});

const subs = JSON.parse(PUSH_SUBSCRIPTION);
for (const sub of Array.isArray(subs) ? subs : [subs]) {
  try {
    await webpush.sendNotification(sub, payload, { TTL: 3 * 3600 });
    console.log('Gesendet.');
  } catch (err) {
    console.error('Senden fehlgeschlagen:', err.statusCode, err.body || err.message);
    process.exitCode = 1;
  }
}
