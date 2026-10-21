const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- 1. MINI SERVEUR EXPRESS (POUR UPTIMEROBOT 24/7) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot K2L en ligne 24/7 !');
});

app.listen(PORT, () => {
    console.log(`🌍 Serveur Web en écoute sur le port ${PORT}`);
});

// --- 2. CLIENT DISCORD & INTENTS ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = ',';

let antiRaidActive = false;

function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

client.once('clientReady', () => {
    console.log(`✅ Bot K2L connecté en tant que ${client.user.tag} !`);
});

// --- 3. PROTECTION ANTIRAID ---
client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try {
            await member.kick('Mode Anti-Raid actif : Compte trop récent.');
            console.log(`[Anti-Raid] Utilisateur expulsé : ${member.user.tag}`);
        } catch (e) {
            console.error("Erreur d'expulsion antiraid :", e);
        }
    }
});

// --- 4. GESTION DES COMMANDES ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ,help
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📜 Liste des commandes du Bot K2L')
            .setDescription('Voici toutes les commandes disponibles :')
            .addFields(
                { name: '🔍 Scanner & Utilitaires', value: '`,find <2-5>` : Cherche des pseudos dispo\n`,ping` : Latence du bot\n`,botinfo` : Infos sur le bot\n`,userinfo` : Infos sur ton profil' },
                { name: '🛡️ Modération & Anti-Raid', value: '`,antiraid <on/off>` : Protection anti-raid\n`,clear <1-100>` : Supprime des messages\n`,kick <@membre>` : Expulse un membre\n`,ban <@membre>` : Bannit un membre\n`,lock` : Verrouille un salon\n`,unlock` : Déverrouille un salon' }
            )
            .setColor('#6E8561')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // ,find
    if (command === 'find') {
        const length = parseInt(args[0]);
        if (!length || isNaN(length) || length < 2 || length > 5) {
            return message.reply('❌ **Usage :** `,find <longueur>` (ex: `,find 4`).');
        }

        const loadingMsg = await message.reply(`🔍 **Scan en cours** pour des pseudos de ${length} caractères...`);

        let foundAvailable = [];
        let attempts = 0;
        const maxTests = 15;
        const tested = new Set();

        while (foundAvailable.length < 5 && attempts < maxTests) {
            attempts++;
            const candidate = generateUsername(length);
            if (tested.has(candidate)) continue;
            tested.add(candidate);

            try {
                const res = await axios({
                    method: 'post',
                    url: 'https://discord.com/api/v9/users/@me/pomelo-attempt',
                    data: { username: candidate },
                    headers: {
                        'Authorization': `Bot ${TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.data && res.data.taken === false) {
                    foundAvailable.push(candidate);
                }
            } catch (e) {
                if (e.response && (e.response.status === 429 || e.response.status === 403)) {
                    break;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 800));
        }

        const embed = new EmbedBuilder()
            .setTitle(`💡 Résultats du Scan (${length} caractères)`)
            .setColor(foundAvailable.length > 0 ? '#2ecc71' : '#e74c3c')
            .setTimestamp();

        if (foundAvailable.length > 0) {
            embed.setDescription(`🎉 **Pépites dispo :**\n\n` + foundAvailable.map(u => `\`${u}\``).join('\n') + `\n\n💡 *Copie l'un d'eux sur ton compte !*`);
        } else {
            embed.setDescription(`⚠️ **Aucun pseudo libre trouvé** sur cette session. Réessaie plus tard !`);
        }

        await loadingMsg.edit({ content: '', embeds: [embed] });
    }

    // ,ping
    if (command === 'ping') {
        return message.reply(`🏓 Pong ! Latence : **${client.ws.ping}ms**.`);
    }

    // ,botinfo
    if (command === 'botinfo') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Informations sur K2L Bot')
            .setDescription('Bot de recherche de pseudos et de gestion de serveur 24/7.')
            .addFields(
                { name: 'Hébergement', value: 'Replit + UptimeRobot', inline: true },
                { name: 'Développeur', value: 'Noé', inline: true }
            )
            .setColor('#9cb4cd');
        return message.reply({ embeds: [embed] });
    }

    // ,userinfo
    if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        return message.reply(`👤 Informations sur **${user.tag}** (ID: ${user.id})`);
    }

    // ,antiraid
    if (command === 'antiraid') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Tu n'as pas la permission d'utiliser le mode Anti-Raid.");
        }
        const action = args[0] ? args[0].toLowerCase() : '';
        if (action === 'on') {
            antiRaidActive = true;
            return message.reply("🛡️ **Mode Anti-Raid ACTIVÉ** : Les comptes de moins de 3 jours seront expulsés à leur arrivée.");
        } else if (action === 'off') {
            antiRaidActive = false;
            return message.reply("🛡️ **Mode Anti-Raid DÉSACTIVÉ**.");
        } else {
            return message.reply(`ℹ️ Statut Anti-Raid : **${antiRaidActive ? 'ACTIVÉ 🟢' : 'DÉSACTIVÉ 🔴'}**\nUtilise \`,antiraid on\` ou \`,antiraid off\`.`);
        }
    }

    // ,clear
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Tu n'as pas la permission de gérer les messages.");
        }
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) {
            return message.reply("❌ Précise un nombre entre 1 et 100.");
        }
        try {
            await message.channel.bulkDelete(count + 1, true);
            const confirmation = await message.channel.send(`🧹 **${count}** messages supprimés !`);
            setTimeout(() => confirmation.delete().catch(() => {}), 4000);
        } catch (e) {
            message.reply("❌ Erreur lors de la suppression.");
        }
    }

    // ,kick
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply("❌ Tu n'as pas la permission d'expulser des membres.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Mentionne le membre à expulser.");
        try {
            await member.kick();
            return message.reply(`✅ **${member.user.tag}** a été expulsé.`);
        } catch (e) {
            return message.reply("❌ Impossible d'expulser ce membre.");
        }
    }

    // ,ban
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Tu n'as pas la permission de bannir des membres.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Mentionne le membre à bannir.");
        try {
            await member.ban();
            return message.reply(`✅ **${member.user.tag}** a été banni.`);
        } catch (e) {
            return message.reply("❌ Impossible de bannir ce membre.");
        }
    }

    // ,lock
    if (command === 'lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Tu n'as pas la permission de gérer les salons.");
        }
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.reply("🔒 **Salon verrouillé**.");
        } catch (e) {
            return message.reply("❌ Erreur de verrouillage.");
        }
    }

    // ,unlock
    if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Tu n'as pas la permission de gérer les salons.");
        }
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.reply("🔓 **Salon déverrouillé**.");
        } catch (e) {
            return message.reply("❌ Erreur de déverrouillage.");
        }
    }
});

process.on('unhandledRejection', error => {
    console.error('Erreur non gérée :', error);
});

if (!TOKEN) {
    console.error("❌ ERREUR : La variable DISCORD_TOKEN n'est pas définie dans les Secrets Replit !");
} else {
    client.login(TOKEN);
}
