// index.js (pairing code)
import baileys from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = baileys;

import pino from 'pino';
import 'dotenv/config';
import { mkdir } from 'fs/promises';
import { handleGroupParticipantsUpdate } from './bot.js';

const logger = pino({ level: 'info' });

// ENV
const GROUP_NAME = process.env.GROUP_NAME || 'Discussion générale (infos générales, accueil des participants) Sportfever 🔥';
const RULES_URL  = process.env.RULES_URL  || 'https://docs.google.com/document/d/10TfTNwd772tJlpu0unhmYlBi3-Lp4xD-mDnDwmeXG_o/edit?tab=t.0#heading=h.r3nwnnsq3h13';
const AUTH_DIR   = process.env.AUTH_DIR   || './auth'; // sur Render: /var/data/auth
const PHONE_NUMBER = (process.env.PHONE_NUMBER || '').trim(); // ex: +33695980132

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,   // on ne veut plus d'ASCII
    auth: state,
    browser: ['SportFeverBot', 'Chrome', '1.0']
  });

  let pairingRequested = false;

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const { connection, lastDisconnect } = events['connection.update'];

      // ➜ Demande le code d’appairage dès que possible
      if (!pairingRequested && PHONE_NUMBER && connection !== 'open') {
        pairingRequested = true;
        try {
          const phone = PHONE_NUMBER.replace(/[^\d+]/g, '');
          const code = await sock.requestPairingCode(phone);
          logger.info('============================');
          logger.info(`📲 CODE D’APPAIRAGE WHATSAPP : ${code}`);
          logger.info('Dans WhatsApp: Réglages → Appareils connectés → Lier un appareil → Lier avec un numéro de téléphone, puis saisis ce code.');
          logger.info('============================');
        } catch (err) {
          logger.error({ err }, 'Échec génération du code d’appairage. Vérifie PHONE_NUMBER et la version de WhatsApp.');
        }
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

    // Accueil auto des nouveaux
    if (events['group-participants.update']) {
      const update = events['group-participants.update'];
      try {
        const meta = await sock.groupMetadata(update.id);
        if (!meta) return;
        if (meta.subject !== GROUP_NAME) return;
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