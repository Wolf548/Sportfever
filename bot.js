// Fonctions liées aux messages du bot
import { jidNormalizedUser } from '@whiskeysockets/baileys';

/**
 * Retourne le "meilleur" nom pour afficher/mentionner la personne
 */
async function getDisplayName(sock, jid) {
  // Essaye d’obtenir le nom WhatsApp si dispo
  try {
    // Baileys expose parfois .getName; sinon on tente la métadonnée
    if (typeof sock.getName === 'function') {
      const name = await sock.getName(jid);
      if (name) return name;
    }
  } catch (_) {}

  try {
    const contact = sock?.store?.contacts?.[jid];
    const name = contact?.name || contact?.notify || contact?.verifiedName;
    if (name) return name;
  } catch (_) {}

  // Fallback: numéro
  return jid.split('@')[0];
}

/**
 * Envoie le message de bienvenue dans le groupe + le DM en privé
 */
export async function handleGroupParticipantsUpdate({ sock, groupId, groupName, participantJid, rulesUrl }) {
  const userJid = jidNormalizedUser(participantJid);
  const displayName = await getDisplayName(sock, userJid);

  // --- 1) Message dans le groupe (avec mention)
  const groupText =
    `👋 🎉 Bienvenue @${userJid.split('@')[0]} dans la communauté SportFever — QG des addicts de sport ! 🏅\n\n`  +
    `📌 Présente-toi à nous en répondant à ce message ! 😊\n\n`;

  await sock.sendMessage(groupId, {
    text: groupText,
    mentions: [userJid]
  });

  // --- 2) Message privé (DM)
  const dmText =
    `Bienvenue dans la communauté *SportFever* — QG des addicts de sport ! 🏅\n\n` +
    `📖 *Règles du groupe + Planning :*\n👉 ${rulesUrl}`;

  await sock.sendMessage(userJid, { text: dmText });
}
