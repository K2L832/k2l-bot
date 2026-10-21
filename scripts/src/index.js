const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = ',';

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
      await new Promise(resolve => setTimeout(resolve, 2000));
      return checkUsername(cleanName);
    }

    const isAvailable = response.data && response.data.taken === false;
    return { username: cleanName, available: isAvailable };

  } catch (error) {
    return { username: cleanName, available: false };
  }
}

function generate4cCandidates(count = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const type = Math.floor(Math.random() * 3);
    let name = '';
    
    if (type === 0) {
      name = chars[Math.floor(Math.random() * chars.length)] + '.' + 
             chars[Math.floor(Math.random() * chars.length)] + 
             digits[Math.floor(Math.random() * digits.length)];
    } else if (type === 1) {
      name = digits[Math.floor(Math.random() * digits.length)] + '.' + 
             chars[Math.floor(Math.random() * chars.length)] + 
             chars[Math.floor(Math.random() * chars.length)];
    } else {
      name = chars[Math.floor(Math.random() * chars.length)] + 
             chars[Math.floor(Math.random() * chars.length)] + 
             digits[Math.floor(Math.random() * digits.length)] + 
             chars[Math.floor(Math.random() * chars.length)];
    }
    candidates.push(name);
  }
  return candidates;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim();
  const command = args.split(' ')[0].toLowerCase();
  const rawInput = args.slice(command.length).trim();

  if (command === 'check') {
    if (!rawInput) {
      return message.reply('❌ **Usage :** `,check pseudo1,pseudo2,pseudo3`');
    }

    const loadingMsg = await message.reply('⚡ **Vérification en cours...**');
    const usernamesToCheck = rawInput.split(',').map(u => u.trim()).filter(u => u.length > 0);

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
      let fallbackResults = [];
      let attempts = 0;

      while (fallbackResults.length < 5 && attempts < 3) {
        const candidates = generate4cCandidates(10);
        const checkedFallback = await Promise.all(candidates.map(u => checkUsername(u)));
        const free = checkedFallback.filter(r => r.available).map(r => r.username);
        
        for (const name of free) {
          if (!fallbackResults.includes(name) && fallbackResults.length < 5) {
            fallbackResults.push(name);
          }
        }
        attempts++;
      }

      let desc = `🔴 **Aucun des pseudos fournis n'est disponible.**\n\n`;
      if (fallbackResults.length > 0) {
        desc += `💡 **Voici 5 alternatives 4c actuellement LIBRES :**\n` + 
                fallbackResults.map(u => `• \`${u}\``).join('\n');
      } else {
        desc += `⚠️ Rate limit atteint, réessaie plus tard.`;
      }

      embed.setDescription(desc);
    }

    await loadingMsg.edit({ content: ' ', embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`✅ Bot K2L est en ligne !`);
});

client.login(TOKEN);
