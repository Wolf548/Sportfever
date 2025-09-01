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
const GROUP_NAME = process.env.GROUP_NAME || `Discussion générale (infos générales, accueil des participants) Sportfever 🔥`;
const RULES_URL  = process.env.RULES_URL  || `https://docs.google.com/document/d/10TfTNwd772tJlpu0unhmYlBi3-Lp4xD-mDnDwmeXG_o/edit?tab=t.0#heading=h.r3nwnnsq3h13`;
const AUTH_DIR   = process.env.AUTH_DIR   || `./auth`; // Sur Render: /var/data/auth
const PAIRING_PHONE = (process.env.PAIRING_PHONE || ``).replace(/\D/g, ``); // ex: 33612345678

async function start() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false, // pas d'ASCII tronqué
    auth: state,
    browser: [`SportFeverBot`, `Chrome`, `1.0`]
  });

  // --- Étape 1 : tenter l'appairage par code si possible
  try {
    const alreadyRegistered = Boolean(state?.creds?.me?.id || state?.creds?.registered);
    logger.info(`PAIR: registered=${alreadyRegistered} phone=${PAIRING_PHONE ? `ok` : `missing`}`);

    if (!alreadyRegistered && PAIRING_PHONE) {
      const code = await sock.requestPairingCode(PAIRING_PHONE);
      logger.info(`============================`);
      logger.info(`🔢 CODE D’APPAIRAGE (à saisir sur le téléphone) : ${code}`);
      logger.info(`Chemin téléphone : WhatsApp → Appareils connectés → Lier avec numéro de téléphone → entre ton numéro → saisis ce code.`);
      logger.info(`============================`);
    } else if (!alreadyRegistered && !PAIRING_PHONE) {
      logger.info(`PAIR: PAIRING_PHONE manquant → je fournirai un lien QR compact si WhatsApp en génère un.`);
    }
  } catch (err) {
    logger.error({ err }, `PAIR: impossible de générer le code (souvent: session déjà existante ou numéro mal formaté). Un QR compact sera proposé si disponible.`);
  }

  // --- Événements
  sock.ev.process(async (events) => {
    if (events[`connection.update`]) {
      const { connection, lastDisconnect, qr } = events[`connection.update`];

      // Fallback QR compact même si PAIRING_PHONE est défini, tant que la session n'est pas établie
      const notPairedYet = !(state?.creds?.me?.id);
      if (qr && notPairedYet) {
        const link = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`;
        logger.info(`============================`);
        logger.info(`🔗 QR (compact 250x250) : ${link}`);
        logger.info(`Ouvre ce lien dans le navigateur puis scanne avec WhatsApp → Appareils connectés → Lier un appareil.`);
        logger.info(`============================`);
      }

      if (connection === `close`) {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) start();
      }
      if (connection === `open`) {
        logger.info(`✅ Connecté.`);
      }
    }

    if (events[`creds.update`]) await saveCreds();

    // Accueil auto
    if (events[`group-participants.update`]) {
      const update = events[`group-participants.update`];
      try {
        const meta = await sock.groupMetadata(update.id);
        if (!meta) return;
        if (meta.subject !== GROUP_NAME) return;
        if (update.action !== `add`) return;

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
            logger.error({ err }, `Erreur en envoyant le bienvenue à un participant`);
          }
        }
      } catch (err) {
        logger.error({ err }, `Erreur group-participants.update`);
      }
    }
  });
}

start().catch((e) => console.error(e));