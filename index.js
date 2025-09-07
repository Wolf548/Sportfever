// index.js — diagnostic verbeux + code d’appairage
import 'dotenv/config';
import pino from 'pino';
import baileys from '@whiskeysockets/baileys';
import { mkdir } from 'fs/promises';

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;
const log = pino({ level: 'info' });

// ====== DIAGNOSTIC DÉMARRAGE ======
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const PHONE_NUMBER_RAW = (process.env.PHONE_NUMBER || '').trim();
const PHONE_NUMBER = PHONE_NUMBER_RAW.replace(/[^\d+]/g, '');

console.log('================ BOOT ================');
console.log('Node:', process.version);
console.log('PWD :', process.cwd());
console.log('AUTH_DIR:', AUTH_DIR);
console.log('PHONE_NUMBER raw:', JSON.stringify(PHONE_NUMBER_RAW));
console.log('PHONE_NUMBER used:', JSON.stringify(PHONE_NUMBER));
console.log('======================================');

// petit heartbeat pour prouver que le process tourne
setInterval(() => console.log('⏱️ alive', new Date().toISOString()), 5000);

async function main() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log('WA web version:', version.join('.'));

  const sock = makeWASocket({
    auth: state,
    logger: log,
    browser: ['SportFeverBot', 'Chrome', '1.0'],
    printQRInTerminal: false, // jamais d’ASCII dans les logs Render
  });

  // logs de connexion
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    console.log('connection.update:', connection || '(none)');
    if (lastDisconnect?.error) console.log('lastDisconnect error:', lastDisconnect.error?.message);
  });

  sock.ev.on('creds.update', saveCreds);

  // ➜ Demande le CODE d’appairage (sans scan) si un numéro est fourni
  if (PHONE_NUMBER) {
    try {
      console.log('Requesting pairing code for:', PHONE_NUMBER);
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      console.log('======================================');
      console.log('📲 CODE D’APPAIRAGE WHATSAPP :', code);
      console.log('WhatsApp → Réglages → Appareils connectés → Lier un appareil → Lier avec un numéro de téléphone → saisir ce code.');
      console.log('======================================');
    } catch (err) {
      console.error('❌ Échec requestPairingCode:', err?.message || err);
    }
  } else {
    console.warn('⚠️ PHONE_NUMBER manquant → aucun code ne peut être généré.');
  }
}

main().catch((e) => console.error('FATAL:', e));