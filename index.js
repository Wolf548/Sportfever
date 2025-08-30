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
import { handleGroupParticipantsUpdate } from './bot.js';

const logger = pino({ level: 'info' });

// Chargement des variables d’env.
const GROUP_NAME = process.env.GROUP_NAME || 'Discussion générale (infos générales, accueil des participants) Sportfever 🔥';
const RULES_URL = process.env.RULES_URL || 'https://docs.google.com/document/d/10TfTNwd772tJlpu0unhmYlBi3-Lp4xD-mDnDwmeXG_o/edit?tab=t.0#heading=h.r3nwnnsq3h13';

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  let sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['SportFeverBot', 'Chrome', '1.0']
  });

  sock.ev.process(async (events) => {
    // QR visible en terminal si jamais
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];
      if (qr) qrcode.generate(qr, { small: true });
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) start();
      }
      if (connection === 'open') {
        logger.info('✅ Connecté.');
      }
    }

    if (events['creds.update']) await saveCreds();

    // Réception des mises à jour participants (join/leave/promote/demote)
    if (events['group-participants.update']) {
      const update = events['group-participants.update'];
      // On ne souhaite répondre QUE dans le bon sous-groupe
      try {
        // Récup métadonnées du groupe pour vérifier le nom
        const meta = await sock.groupMetadata(update.id);
        if (!meta) return;

        // Filtre strict: nom du groupe = GROUP_NAME
        if (meta.subject !== GROUP_NAME) return;

        // S’assurer qu’on ne traite que les ajouts
        if (update.action !== 'add') return;

        // Traiter chaque nouveau participant
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
