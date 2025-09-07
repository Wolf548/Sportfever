// index.js
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
const AUTH_DIR   = process.env.AUTH_DIR   || './auth'; // Render: /var/data/auth
const PHONE_NUMBER = process.env.PHONE_NUMBER || '';   // ex: +33695980132

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false, // on n'affiche plus l'ASCII
    auth: state,
    browser: ['SportFeverBot', 'Chrome', '1.0']
  });

  let pairingTried = false;

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];

      // ✅ 1) Tenter l'appairage par CODE si un numéro est fourni
      if (!pairingTried && PHONE_NUMBER && (qr || connection === 'close')) {
        pairingTried = true;
        try {
          const phone = PHONE_NUMBER.replace(/[^\d+]/g, '');
          const code = await sock.requestPairingCode(phone);
          logger.info('============================');
          logger.info(`📲 CODE D’APPAIRAGE WHATSAPP : ${code}`);
          logger.info('Dans WhatsApp > Appareils connectés > Lier un appareil > Lier avec un numéro de téléphone.');
          logger.info('============================');
        } catch (err) {
          logger.error({ err }, 'Échec génération du code d’appairage');
        }
      }

      // 🔁 2) Secours : lien QR compact (si pas de numéro / si pairing indisponible)
      if (qr && !PHONE_NUMBER) {
        const link = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`;
        logger.info('============================');
        logger.info(`🔗 SCANNE LE QR (compact) : ${link}`);
        logger.info('============================');
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

    // Accueil automatique
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