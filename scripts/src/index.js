import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import axios from 'axios';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = ',';

// Compteurs de stats en direct
let statsChecks = 0;
let statsSuggestions = 0;

// Fonction de vérification via l'endpoint Pomelo
async function checkUsername(username) {
  const cleanName = username.trim().toLowerCase();
  
  if (cleanName.length < 2 || cleanName.length > 32) {
    return { username: cleanName, available: false };
  }

  try {
    const response = await axios.post(
      'https://discord.com/api/v10/users/@me/pomelo-attempt',
      { username: cleanName },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        validateStatus: false
      }
    );

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return checkUsername(cleanName);
    }

    const isAvailable = response.data && response.data.taken === false;
    return { username: cleanName, available: isAvailable };

  } catch (error) {
    return { username: cleanName, available: false };
  }
}

// Générateur de pseudos aléatoires
function generateUsername(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const allowedInMiddle = chars + digits + '._';
  
  let result = '';
  for (let i = 0; i < length; i++) {
    if (i === 0 || i === length - 1) {
      result += chars[Math.floor(Math.random() * chars.length)];
    } else {
      result += allowedInMiddle[Math.floor(Math.random() * allowedInMiddle.length)];
    }
  }
  return result;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // === COMMANDE HELP ===
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📚 Menu Complet — Bot K2L Username')
      .setColor(0x3498db)
      .setDescription('Voici l\'ensemble des commandes intégrées :')
      .addFields(
        { name: '🔍 `,check <pseudos>`', value: 'Vérifie la disponibilité de pseudos précis (séparés par des virgules).' },
        { name: '🎲 `,suggest <2-5>`', value: 'Cherche et trouve automatiquement des pseudos libres de la longueur choisie.' },
        { name: '⚡ `,gen <2-5>`', value: 'Génère instantanément une liste brute de 10 idées de pseudos.' },
        { name: '📊 `,stats`', value: 'Affiche les statistiques d\'utilisation du bot depuis son démarrage.' },
        { name: '🤖 `,bot`', value: 'Affiche la latence et les infos techniques du bot.' }
      )
      .setFooter({ text: 'K2L Bot — Tous droits réservés' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === COMMANDE STATS ===
  if (command === 'stats') {
    const embed = new EmbedBuilder()
      .setTitle('📊 Statistiques du Bot')
      .setColor(0xe67e22)
      .addFields(
        { name: 'Pseudos vérifiés (`,check`)', value: `\`${statsChecks}\``, inline: true },
        { name: 'Recherches de suggestions', value: `\`${statsSuggestions}\``, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === COMMANDE BOT ===
  if (command === 'bot') {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Statut Technique')
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Connecté en tant que', value: `\`${client.user.tag}\``, inline: true },
        { name: 'Latence API', value: `\`${Math.round(client.ws.ping)} ms\``, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === COMMANDE GEN (Génération brute sans test API) ===
  if (command === 'gen') {
    const length = parseInt(args[0]);
    if (!length || isNaN(length) || length < 2 || length > 5) {
      return message.reply('❌ **Usage :** `,gen <longueur>` (entre 2 et 5)');
    }

    const ideas = [];
    for (let i = 0; i < 10; i++) {
      ideas.push(`• \`${generateUsername(length)}\``);
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚡ Idées brutes (${length} caractères)`)
      .setColor(0xf1c40f)
      .setDescription(ideas.join('\n') + `\n\n*(Vérifie-les avec \`,check\` ensuite !)*`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === COMMANDE CHECK ===
  if (command === 'check') {
    const rawInput = args.join(' ');
    if (!rawInput) {
      return message.reply('❌ **Usage :** `,check pseudo1,pseudo2,pseudo3`');
    }

    const loadingMsg = await message.reply('⚡ **Vérification en cours...**');
    const usernamesToCheck = rawInput.split(',').map(u => u.trim()).filter(u => u.length > 0);
    
    statsChecks += usernamesToCheck.length;

    const results = await Promise.all(usernamesToCheck.map(u => checkUsername(u)));
    const availableUsernames = results.filter(r => r.available).map(r => r.username);

    const embed = new EmbedBuilder()
      .setTitle('🔍 Résultat de la vérification')
      .setColor(availableUsernames.length > 0 ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();

    if (availableUsernames.length > 0) {
      embed.setDescription(`🟢 **Pseudos DISPONIBLES trouvés (${availableUsernames.length}) :**\n\n` + 
        availableUsernames.map(u => `• \`${u}\``).join('\n'));
    } else {
      embed.setDescription(`🔴 **Aucun des pseudos fournis n'est disponible.**\n\n💡 Teste la commande \`,suggest 4\` pour trouver des pépites libres !`);
    }

    await loadingMsg.edit({ content: ' ', embeds: [embed] });
  }

  // === COMMANDE SUGGEST ===
  if (command === 'suggest') {
    const length = parseInt(args[0]);

    if (!length || isNaN(length) || length < 2 || length > 5) {
      return message.reply('❌ **Usage :** `,suggest <longueur>` (ex: `,suggest 3` ou `,suggest 4`)');
    }

    statsSuggestions++;
    const loadingMsg = await message.reply(`🎲 **Recherche active de pseudos à ${length} caractères libres...**`);

    const foundAvailable = [];
    const tested = new Set();
    let attempts = 0;
    const maxAttempts = 30;

    while (foundAvailable.length < 3 && attempts < maxAttempts) {
      attempts++;
      const candidate = generateUsername(length);
      
      if (tested.has(candidate)) continue;
      tested.add(candidate);

      const res = await checkUsername(candidate);
      if (res.available) {
        foundAvailable.push(candidate);
      }
      
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    const embed = new EmbedBuilder()
      .setTitle(`💡 Suggestions libres (${length} caractères)`)
      .setColor(foundAvailable.length > 0 ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();

    if (foundAvailable.length > 0) {
      embed.setDescription(`🎉 **Voici des pépites dispos à ${length} caractères :**\n\n` + 
        foundAvailable.map(u => `• \`${u}\``).join('\n'));
    } else {
      embed.setDescription(`⚠️ **Délai dépassé / Rate limit Discord.** Réessaie dans une minute !`);
    }

    await loadingMsg.edit({ content: ' ', embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`✅ Bot K2L ultra-complet en ligne (check, suggest, gen, stats, help, bot) !`);
});

client.login(TOKEN);
