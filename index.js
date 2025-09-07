import baileys from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState } = baileys;

import 'dotenv/config';
import pino from 'pino';
import { mkdir } from 'fs/promises';

const logger = pino({ level: 'info' });
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const PHONE_NUMBER = (process.env.PHONE_NUMBER || '').trim();

logger.info(`☎️ PHONE_NUMBER détecté: ${PHONE_NUMBER || '(aucun)'}`);

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false
  });

  if (PHONE_NUMBER) {
    try {
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      logger.info('============================');
      logger.info(`📲 CODE D’APPAIRAGE WHATSAPP : ${code}`);
      logger.info('============================');
    } catch (err) {
      logger.error({ err }, '❌ Impossible de générer le code');
    }
  } else {
    logger.error('⚠️ PHONE_NUMBER non défini dans les variables Render');
  }
}

start();