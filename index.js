// index.js — affichage forcé + code d’appairage
import baileys from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;

import 'dotenv/config';
import pino from 'pino';
import { mkdir } from 'fs/promises';

const logger = pino({ level: 'info' });

const AUTH_DIR = process.env.AUTH_DIR || './auth';
const PHONE_NUMBER_RAW = (process.env.PHONE_NUMBER || '').trim();
const PHONE_NUMBER = PHONE_NUMBER_RAW.replace(/[^\d+]/g, '');

logger.info('================ BOOT =================');
logger.info(`AUTH_DIR: ${AUTH_DIR}`);
logger.info(`PHONE_NUMBER raw: "${PHONE_NUMBER_RAW}" -> used: "${PHONE_NUMBER}"`);
logger.info('========================================');

async function main() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  logger.info(`Using WA version: ${version.join('.')}`);

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false, // jamais d’ASCII
    browser: ['SportFeverBot', 'Chrome', '1.0']
  });

  // 1) Si on a un numéro → on demande IMMÉDIATEMENT le code
  if (PHONE_NUMBER) {
    try {
      logger.info('Requesting pairing code from WhatsApp...');
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      logger.info('================ PAIRING CODE ================');
      logger.info(`📲 CODE D’APPAIRAGE WHATSAPP : ${code}`);
      logger.info('Dans WhatsApp: Réglages → Appareils connectés → Lier un appareil → Lier avec un numéro de téléphone, puis saisis ce code.');
      logger.info('=============================================');
    } catch (err) {
      logger.error({ err }, '❌ Échec génération du code (requestPairingCode)');
    }
  } else {
    logger.warn('⚠️ PHONE_NUMBER absent -> pas de code. Ajoute PHONE_NUMBER dans les Env Vars.');
  }

  // 2) Sauvegarde des creds
  sock.ev.on('creds.update', saveCreds);

  // 3) Juste un log quand c’est connecté (au cas où)
  sock.ev.on('connection.update', ({ connection }) => {
    if (connection) logger.info(`connection.update: ${connection}`);
  });
}

main().catch((e) => logger.error(e));