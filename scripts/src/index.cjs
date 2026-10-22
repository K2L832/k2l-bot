const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVEUR WEB 24/7 (SANS VEILLE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('⚡ K2L System Online & Ready 24/7');
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Web démarré sur le port ${PORT}`);
});

// ==========================================
// 2. BASE DE DONNÉES JSON (STABLE & DURABLE)
// ==========================================
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    return { prefix: ',', foundUsernames: [] };
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { prefix: ',', foundUsernames: [] };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Erreur de sauvegarde DB:', err);
  }
}

let db = loadData();

// ==========================================
// 3. CONFIGURATION DU BOT DISCORD
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const BOT_TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

// API Discord Pomelo pour la vérification exacte en temps réel
const API_URL = 'https://discord.com/api/v9/users/pomelo/attempt';
let isGenerating = false;

const letters = 'abcdefghijklmnopqrstuvwxyz';
const digits = '0123456789';
const allowedChars = letters + digits + '_';

function getRandomChar() {
  return allowedChars[Math.floor(Math.random() * allowedChars.length)];
}

function generateRandomUsername(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += getRandomChar();
  }
  return result;
}

// Vérification robuste en temps réel alignée sur l'application officielle
async function checkUsername(username) {
  try {
    const response = await axios.post(
      API_URL,
      { username },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${BOT_TOKEN}`
        }
      }
    );
    // Si taken est explicitement false, le pseudo est libre
    return response.data && response.data.taken === false;
  } catch (error) {
    // Si l'API renvoie une erreur de validation ou de rate limit, on gère proprement
    if (error.response && error.response.data) {
      // Parfois Discord renvoie taken: true ou un objet d'erreur
      return error.response.data.taken === false;
    }
    return false;
  }
}

// ==========================================
// 4. ÉVÉNEMENT READY
// ==========================================
client.once('ready', () => {
  console.log(`👑 K2L Bot connecté avec succès en tant que : ${client.user.tag}`);
  client.user.setActivity(`${db.prefix}help | K2L System 👑`, { type: 0 });
});

// ==========================================
// 5. GESTION DES COMMANDES
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(db.prefix)) return;

  const args = message.content.slice(db.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ------------------------------------------
  // COMMANDE : HELP
  // ------------------------------------------
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('👑 K2L SYSTEM — PANNEAU DE COMMANDES')
      .setDescription(`Préfixe actuel : \`${db.prefix}\` • Statut : **En Ligne 24/7** ⚡`)
      .addFields(
        {
          name: '🎯 **Outils Pseudos Discord**',
          value: 
            `\`${db.prefix}gen <taille>\` — Cherche et teste des pseudos en direct\n` +
            `\`${db.prefix}check <pseudo>\` — Analyse la disponibilité d'un pseudo précis\n` +
            `\`${db.prefix}suggest <taille>\` — Génère 5 idées de pseudos aléatoires\n` +
            `\`${db.prefix}lookup\` — Affiche les derniers pseudos disponibles dénichés`
        },
        {
          name: '⚙️ **Administration & Modération**',
          value: 
            `\`${db.prefix}setprefix <nouveau>\` — Modifie le préfixe du bot\n` +
            `\`${db.prefix}clear <1-100>\` — Purge rapidement les messages du salon`
        },
        {
          name: '📊 **Informations & Utilitaires**',
          value: 
            `\`${db.prefix}ping\` — Affiche la latence du bot en ms\n` +
            `\`${db.prefix}botinfo\` — Statistiques et détails techniques du bot\n` +
            `\`${db.prefix}userinfo [@membre]\` — Obtenir les infos d'un membre`
        }
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: 'K2L System • Version Ultime 24/7', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : SETPREFIX
  // ------------------------------------------
  if (command === 'setprefix') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setDescription('❌ **Erreur :** Tu dois être **Administrateur** pour modifier le préfixe.');
      return message.reply({ embeds: [errEmbed] });
    }

    const newPrefix = args[0];
    if (!newPrefix) {
      const warnEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription(`⚠️ **Usage :** \`${db.prefix}setprefix <nouveau_prefixe>\``);
      return message.reply({ embeds: [warnEmbed] });
    }

    db.prefix = newPrefix;
    saveData(db);
    client.user.setActivity(`${db.prefix}help | K2L System 👑`, { type: 0 });

    const successEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('⚙️ Préfixe Mis à Jour')
      .setDescription(`Le nouveau préfixe du bot est désormais : \`${newPrefix}\``);

    return message.reply({ embeds: [successEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : CLEAR
  // ------------------------------------------
  if (command === 'clear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setDescription('❌ **Erreur :** Tu as besoin de la permission **Gérer les messages**.');
      return message.reply({ embeds: [errEmbed] });
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      const warnEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription('⚠️ Indique un nombre valide entre **1** et **100** messages à supprimer.');
      return message.reply({ embeds: [warnEmbed] });
    }

    await message.channel.bulkDelete(amount, true);

    const clearEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setDescription(`🧹 **Nettoyage Réussi :** \`${amount}\` messages ont été supprimés par <@${message.author.id}>.`);

    const msg = await message.channel.send({ embeds: [clearEmbed] });
    setTimeout(() => msg.delete().catch(() => {}), 4000);
  }

  // ------------------------------------------
  // COMMANDE : CHECK
  // ------------------------------------------
  if (command === 'check') {
    const target = args[0];
    if (!target) {
      const warnEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription(`⚠️ **Usage :** \`${db.prefix}check <pseudo>\``);
      return message.reply({ embeds: [warnEmbed] });
    }

    const loadingEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setDescription(`🔍 **Analyse en cours :** Vérification du pseudo \`${target}\` auprès des serveurs Discord...`);

    const msg = await message.reply({ embeds: [loadingEmbed] });
    const isAvailable = await checkUsername(target);

    if (isAvailable) {
      const resultEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🎉 Pseudo Disponible !')
        .setDescription(`Le pseudo \`${target}\` est **libre d'utilisation** sur Discord !`)
        .setFooter({ text: 'K2L System • Checker Temps Réel' });
      return msg.edit({ embeds: [resultEmbed] });
    } else {
      const resultEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('❌ Pseudo Indisponible')
        .setDescription(`Le pseudo \`${target}\` est **déjà pris** ou restreint par Discord.`)
        .setFooter({ text: 'K2L System • Checker Temps Réel' });
      return msg.edit({ embeds: [resultEmbed] });
    }
  }

  // ------------------------------------------
  // COMMANDE : GEN
  // ------------------------------------------
  if (command === 'gen') {
    const length = parseInt(args[0]) || 4;
    if (length < 2 || length > 32) {
      const warnEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription('⚠️ La taille du pseudo doit être comprise entre **2** et **32** caractères.');
      return message.reply({ embeds: [warnEmbed] });
    }

    if (isGenerating) {
      const warnEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription('⚠️ **Patiente !** Une recherche de pseudos est déjà en cours dans le bot.');
      return message.reply({ embeds: [warnEmbed] });
    }

    isGenerating = true;

    const startEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🚀 Génération & Scan en Direct')
      .setDescription(`Recherche d'un pseudo libre de **${length}** caractères...\n*Scan automatique sur l'API Discord en cours.*`);

    const statusMsg = await message.reply({ embeds: [startEmbed] });

    let attempts = 0;
    let found = null;

    while (isGenerating && attempts < 25) {
      attempts++;
      const candidate = generateRandomUsername(length);
      const available = await checkUsername(candidate);

      if (available) {
        found = candidate;
        db.foundUsernames.unshift({ name: candidate, date: new Date().toLocaleString('fr-FR') });
        if (db.foundUsernames.length > 15) db.foundUsernames.pop();
        saveData(db);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    isGenerating = false;

    if (found) {
      const successEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('👑 PSEUDO VALIDE TROUVÉ !')
        .setDescription(`🎉 **Pseudo disponible :** \`${found}\`\n\n*Essais effectués :* \`${attempts}\`\n*Ce pseudo a été enregistré dans l'historique !*`)
        .setFooter({ text: 'K2L Generator • Pomelo API' });
      return statusMsg.edit({ embeds: [successEmbed] });
    } else {
      const failEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('❌ Aucun Pseudo Libéré')
        .setDescription(`Après **${attempts}** essais, aucun pseudo disponible de **${length}** caractères n'a été trouvé.\n\n💡 *Astuce : Relance la commande pour tester une autre série !*`);
      return statusMsg.edit({ embeds: [failEmbed] });
    }
  }

  // ------------------------------------------
  // COMMANDE : SUGGEST
  // ------------------------------------------
  if (command === 'suggest') {
    const length = parseInt(args[0]) || 4;
    let suggestions = [];
    for (let i = 0; i < 5; i++) {
      suggestions.push(generateRandomUsername(length));
    }

    const suggestEmbed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle(`💡 Suggestions de Pseudos (${length} car.)`)
      .setDescription(suggestions.map((s, idx) => `**${idx + 1}.** \`${s}\``).join('\n'))
      .setFooter({ text: 'Utilise la commande check pour tester leur disponibilité !' });

    return message.reply({ embeds: [suggestEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : LOOKUP
  // ------------------------------------------
  if (command === 'lookup') {
    if (!db.foundUsernames || db.foundUsernames.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setDescription('📜 Aucun pseudo disponible n\'a encore été enregistré.');
      return message.reply({ embeds: [emptyEmbed] });
    }

    const list = db.foundUsernames
      .map((item, idx) => `\`${idx + 1}.\` **\`${item.name}\`** — *Trouvé le ${item.date || 'Récemment'}*`)
      .join('\n');

    const lookupEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📜 Historique des Pseudos Valides Trouvés')
      .setDescription(list)
      .setFooter({ text: `Total sauvegardé : ${db.foundUsernames.length}` });

    return message.reply({ embeds: [lookupEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : PING
  // ------------------------------------------
  if (command === 'ping') {
    const pingEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setDescription(`🏓 **Pong !** Latence de l'API : \`${client.ws.ping} ms\``);
    return message.reply({ embeds: [pingEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : BOTINFO
  // ------------------------------------------
  if (command === 'botinfo') {
    const infoEmbed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🤖 Informations sur le Bot K2L')
      .addFields(
        { name: '👑 Nom du Bot', value: `\`${client.user.tag}\``, inline: true },
        { name: '🌐 Serveurs', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: '👥 Utilisateurs', value: `\`${client.users.cache.size}\``, inline: true },
        { name: '⚡ Système', value: '`Node.js v24 • Render Cloud 24/7`', inline: false }
      )
      .setThumbnail(client.user.displayAvatarURL());
    return message.reply({ embeds: [infoEmbed] });
  }

  // ------------------------------------------
  // COMMANDE : USERINFO
  // ------------------------------------------
  if (command === 'userinfo') {
    const targetMember = message.mentions.members.first() || message.member;
    const userEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`👤 Infos sur ${targetMember.user.username}`)
      .setThumbnail(targetMember.user.displayAvatarURL())
      .addFields(
        { name: '🆔 ID', value: `\`${targetMember.id}\``, inline: true },
        { name: '📅 Compte créé le', value: `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📥 A rejoint le', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true }
      );
    return message.reply({ embeds: [userEmbed] });
  }
});

client.login(BOT_TOKEN);
