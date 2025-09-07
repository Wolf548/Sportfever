// index.js — pairing code robuste
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

const GROUP_NAME = process.env.GROUP_NAME || 'Discussion générale (infos générales, accueil des participants) Sportfever 🔥';
const RULES_URL  = process.env.RULES_URL  || 'https://docs.google.com/document/d/10TfTNwd772tJlpu0unhmYlBi3-Lp4xD-mDnDwmeXG_o/edit?tab=t.0#heading=h.r3nwnnsq3h13';
const AUTH_DIR   = process.env.AUTH_DIR   || './auth'; // sur Render: /var/data/auth
const PHONE_NUMBER_RAW = (process.env.PHONE_NUMBER || '').trim();
const PHONE_NUMBER = PHONE_NUMBER_RAW.replace(/[^\d+]/g, '');

logger.info('🚀 Démarrage SportFeverBot');
logger.info(`📂 AUTH_DIR: ${AUTH_DIR}`);
logger.info(`☎️ PHONE_NUMBER détecté: ${PHONE_NUMBER || '(absent)'}`);

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  logger.info(`🧩 Baileys version WA: ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,      // pas d'ASCII
    auth: state,
    browser: ['SportFeverBot', 'Chrome', '1.0'],
    markOnlineOnConnect: false
  });

  let pairingTried = false;

  // 🔁 tente un appairage toutes les 10s tant que non connecté
  const tryPairing = async () => {
    if (pairingTried || !PHONE_NUMBER) return;
    pairingTried = true;
    try {
      logger.info('🗝️ Demande de CODE d’appairage à WhatsApp…');
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      logger.info('============================');
      logger.info(`📲 CODE D’APPAIRAGE WHATSAPP : ${code}`);
      logger.info('WhatsApp → Réglages → Appareils connectés → Lier un appareil → Lier avec un numéro de téléphone, puis saisis ce code.');
      logger.info('============================');
    } catch (err) {
      pairingTried = false; // autorise un retry
      logger.error({ err }, '❌ Échec génération du code. Nouveau test dans 10s…');
      setTimeout(tryPairing, 10_000);
    }
  };

  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];
      logger.info(`🔌 connection.update: ${connection || 'unknown'}`);

      // si pas de numéro, on donne un QR image (compact)
      if (qr && !PHONE_NUMBER) {
        const link = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`;
        logger.info('============================');
        logger.info(`🔗 SCANNE LE QR (compact) : ${link}`);
        logger.info('============================');
      }

      if (connection !== 'open') {
        // force l’appairage par code si possible
        if (PHONE_NUMBER) tryPairing();
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`⚠️ Connection close (status ${statusCode ?? 'n/a'})`);
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          logger.info('🔁 Reconnexion…');
          start();
        } else {
          logger.error('🚪 Déconnecté (logged out). Supprime la session et recommence.');
        }
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