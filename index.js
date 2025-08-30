import baileys from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = baileys;

import pino from 'pino';
import qrcode from 'qrcode-terminal';
import 'dotenv/config';
import { mkdir } from 'fs/promises';
import { handleGroupParticipantsUpdate } from './bot.js';

const logger = pino({ level: 'info' });

// Variables d'env
const GROUP_NAME = process.env.GROUP_NAME || 'Discussion générale (infos générales, accueil des participants) Sportfever 🔥';
const RULES_URL  = process.env.RULES_URL  || 'https://docs.google.com/document/d/10TfTNwd772tJlpu0unhmYlBi3-Lp4xD-mDnDwmeXG_o/edit?tab=t.0#heading=h.r3nwnnsq3h13';
const AUTH_DIR   = process.env.AUTH_DIR   || './auth'; // pour Render on utilisera /var/data/auth

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  let sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['SportFeverBot', 'Chrome', '1.0']
  });

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];

import fs from 'fs';
import path from 'path';

if (qr) {
  qrcode.generate(qr, { small: false }); // QR plus grand
  fs.writeFileSync(path.join('/tmp', 'qr.txt'), qr); // sauvegarde brute
}

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) start();
      }
      if (connection === 'open') {
        logger.info('✅ Connecté.');
      }
    }

    if (events['creds.update']) await saveCreds();

    if (events['group-participants.update']) {
      const update = events['group-participants.update'];
      try {
        const meta = await sock.groupMetadata(update.id);
        if (!meta) return;
        if (meta.subject !== GROUP_NAME) return; // filtre strict
        if (update.action !== 'add') return;

        for (const jid of update.participants || []) {
          try {
            await handleGroupParticipantsUpdate({
              sock,
              groupId: update.id,
              groupName: meta.subject,
              participantJid: jid,
              rulesUrl: RULES_URL
            });
          } catch (err) {
            logger.error({ err }, 'Erreur en envoyant le bienvenue à un participant');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Erreur group-participants.update');
      }
    }
  });
}

start().catch((e) => console.error(e));