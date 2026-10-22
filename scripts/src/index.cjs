const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const Database = require('better-sqlite3');
const express = require('express');
const axios = require('axios');
const path = require('path');

// --- 1. SERVEUR EXPRESS (KEEP-ALIVE POUR RENDER) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot K2L est actif et opérationnel 24/7 ! 🚀');
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web en écoute sur le port ${PORT}`);
});

// --- 2. BASE DE DONNÉES SQLITE ---
const db = new Database('bot_database.sqlite');
db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        guild_id TEXT PRIMARY KEY,
        antiraid INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS dropped_usernames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        length INTEGER,
        dropped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// --- 3. INITIALISATION DU CLIENT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = ',';

// Fonction d'aide pour générer des pseudos aléatoires
function generateRandomUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789._';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Fonction de vérification officielle auprès de l'API Discord
async function checkDiscordUsername(username) {
    try {
        const response = await axios.post(
            'https://discord.com/api/v9/users/@me/pomelo-attempt',
            { username: username },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                }
            }
        );
        // Si taken === true, il est pris (indisponible). Si taken === false, il est libre (disponible).
        return { taken: response.data.taken, error: false };
    } catch (err) {
        return { taken: null, error: true };
    }
}

// --- 4. GESTION DES ÉVÉNEMENTS ---
client.once('ready', () => {
    console.log(`✅ Bot K2L connecté en tant que ${client.user.tag} !`);
    client.user.setActivity('les pseudos dispo | ,help', { type: 3 });
});

// Protection Anti-Raid sur l'arrivée des membres
client.on('guildMemberAdd', (member) => {
    const row = db.prepare('SELECT antiraid FROM settings WHERE guild_id = ?').get(member.guild.id);
    if (row && row.antiraid === 1) {
        member.kick('Anti-Raid Actif').catch(() => {});
    }
});

// --- 5. COMMANDES ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ──────────────────────────────────────────
    // 📚 COMMANDES UTILITAIRES & HELPER
    // ──────────────────────────────────────────

    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📜 Liste des commandes du Bot K2L')
            .setDescription('Voici toutes les commandes disponibles pour le bot :')
            .setColor('#5865F2')
            .addFields(
                {
                    name: '🔍 Checker & Générateur de Pseudos',
                    value: [
                        '`' + PREFIX + 'gen <longueur>` : Génère et vérifie officiellement des pseudos disponibles',
                        '`' + PREFIX + 'check <pseudo>` : Vérifie officiellement si un pseudo est disponible',
                        '`' + PREFIX + 'suggest <longueur>` : Propose des idées de pseudos (non vérifiés)',
                        '`' + PREFIX + 'lookup <longueur>` : Liste les pseudos libérés enregistrés avec leur temps',
                        '`' + PREFIX + 'find <2-5>` : Cherche rapidement des pseudos disponibles'
                    ].join('\n')
                },
                {
                    name: '🛠️ Utilitaires',
                    value: [
                        '`' + PREFIX + 'ping` : Affiche la latence du bot',
                        '`' + PREFIX + 'botinfo` : Informations sur le bot',
                        '`' + PREFIX + 'userinfo` : Informations sur ton profil'
                    ].join('\n')
                },
                {
                    name: '🛡️ Modération & Anti-Raid',
                    value: [
                        '`' + PREFIX + 'antiraid <on/off>` : Active ou désactive la protection anti-raid',
                        '`' + PREFIX + 'clear <1-100>` : Supprime un nombre de messages',
                        '`' + PREFIX + 'kick <@membre>` : Expulse un membre',
                        '`' + PREFIX + 'ban <@membre>` : Bannit un membre',
                        '`' + PREFIX + 'lock` : Verrouille le salon actuel',
                        '`' + PREFIX + 'unlock` : Déverrouille le salon actuel'
                    ].join('\n')
                }
            )
            .setFooter({ text: 'Bot K2L • 24/7 Live Status' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (command === 'ping') {
        const pingEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('🏓 Pong !')
            .setDescription(`⚡ **Latence du Bot** : \`${Date.now() - message.createdTimestamp}ms\`\n📡 **API Discord** : \`${Math.round(client.ws.ping)}ms\``);
        return message.reply({ embeds: [pingEmbed] });
    }

    if (command === 'botinfo') {
        const embed = new EmbedBuilder()
            .setTitle('ℹ️ Informations sur K2L Bot')
            .setColor('#0099FF')
            .addFields(
                { name: '🤖 Nom', value: client.user.username, inline: true },
                { name: '🆔 ID', value: client.user.id, inline: true },
                { name: '📊 Serveurs', value: `${client.guilds.cache.size}`, inline: true },
                { name: '⚙️ Environnement', value: 'Render.com (24/7)', inline: true },
                { name: '💾 BDD', value: 'SQLite3', inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`👤 Profil de ${user.username}`)
            .setThumbnail(user.displayAvatarURL())
            .setColor('#9B59B6')
            .addFields(
                { name: 'Tag', value: user.tag, inline: true },
                { name: 'ID', value: user.id, inline: true },
                { name: 'Compte créé le', value: user.createdAt.toLocaleDateString('fr-FR'), inline: false }
            );
        return message.reply({ embeds: [embed] });
    }

    // ──────────────────────────────────────────
    // 🎯 NOOUVELLES COMMANDES DE PSEUDOS (VERIFIÉES)
    // ──────────────────────────────────────────

    // ,gen <nombre>
    if (command === 'gen' || command === 'find') {
        const len = parseInt(args[0]);
        if (isNaN(len) || len < 2 || len > 32) {
            return message.reply('⚠️ Veuillez spécifier une longueur valide entre 2 et 32 caractères. Ex: `,gen 4`');
        }

        const msg = await message.reply(`🔍 Recherche et vérification officielle de pseudos à **${len}** caractères en cours...`);
        let found = [];
        let attempts = 0;

        while (found.length < 3 && attempts < 25) {
            attempts++;
            const testName = generateRandomUsername(len);
            const status = await checkDiscordUsername(testName);
            if (!status.error && status.taken === false) {
                found.push(testName);
            }
        }

        if (found.length === 0) {
            return msg.edit(`❌ Aucun pseudo disponible à **${len}** caractères n'a été trouvé lors de cette session.`);
        }

        // Sauvegarde dans la base SQLite pour le lookup
        const stmt = db.prepare('INSERT OR IGNORE INTO dropped_usernames (username, length) VALUES (?, ?)');
        found.forEach(u => stmt.run(u, len));

        const embed = new EmbedBuilder()
            .setTitle(`✨ Pseudos Dispo à ${len} Caractères`)
            .setColor('#57F287')
            .setDescription(`Voici des pseudos à **${len}** caractères officiellement **DISPONIBLES** sur Discord :\n\n` + found.map(u => `✅ \`${u}\``).join('\n'))
            .setFooter({ text: 'Vérifié via l\'API officielle Discord' })
            .setTimestamp();

        return msg.edit({ content: null, embeds: [embed] });
    }

    // ,check <pseudo>
    if (command === 'check' || command === 'scan') {
        const username = args[0];
        if (!username) {
            return message.reply('⚠️ Veuillez indiquer un pseudo à vérifier. Ex: `,check k2l`');
        }

        const msg = await message.reply(`⏳ Vérification officielle du pseudo \`${username}\` auprès de Discord...`);
        const status = await checkDiscordUsername(username);

        if (status.error) {
            return msg.edit(`⚠️ Erreur lors de la vérification de \`${username}\` (limite d'API ou format invalide).`);
        }

        if (status.taken === false) {
            // Sauvegarder si disponible
            db.prepare('INSERT OR IGNORE INTO dropped_usernames (username, length) VALUES (?, ?)').run(username, username.length);

            const embed = new EmbedBuilder()
                .setTitle('🔎 Résultat du Check Officiel')
                .setColor('#57F287')
                .setDescription(`🟢 Le pseudo \`${username}\` est **OFFICIELLEMENT DISPONIBLE** ! 🎉`)
                .setFooter({ text: 'Discord API Check' });
            return msg.edit({ content: null, embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🔎 Résultat du Check Officiel')
                .setColor('#ED4245')
                .setDescription(`🔴 Le pseudo \`${username}\` est **INDISPONIBLE** (déjà pris).`)
                .setFooter({ text: 'Discord API Check' });
            return msg.edit({ content: null, embeds: [embed] });
        }
    }

    // ,suggest <nombre>
    if (command === 'suggest') {
        const len = parseInt(args[0]);
        if (isNaN(len) || len < 2 || len > 32) {
            return message.reply('⚠️ Spécifiez un nombre de caractères valide. Ex: `,suggest 4`');
        }

        let suggestions = [];
        for (let i = 0; i < 5; i++) {
            suggestions.push(generateRandomUsername(len));
        }

        const embed = new EmbedBuilder()
            .setTitle(`💡 Suggestions de Pseudos (${len} car.)`)
            .setColor('#FEE75C')
            .setDescription('Voici 5 idées inventées de pseudos (*non vérifiés*) :\n\n' + suggestions.map(s => `🎲 \`${s}\``).join('\n'))
            .setFooter({ text: 'Utilisez ,check <pseudo> pour vérifier s\'ils sont libres !' });

        return message.reply({ embeds: [embed] });
    }

    // ,lookup <nombre>
    if (command === 'lookup') {
        const len = parseInt(args[0]);
        if (isNaN(len)) {
            return message.reply('⚠️ Spécifiez un nombre de caractères. Ex: `,lookup 4`');
        }

        const rows = db.prepare('SELECT username, dropped_at FROM dropped_usernames WHERE length = ? ORDER BY id DESC LIMIT 10').all(len);

        if (rows.length === 0) {
            return message.reply(`❌ Aucun pseudo à **${len}** caractères n'a été enregistré récemment dans la base de données.`);
        }

        const list = rows.map(r => `🕒 \`${r.username}\` — Découvert/Libéré le ${new Date(r.dropped_at).toLocaleString('fr-FR')}`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`📜 Pseudos récemment libérés/trouvés (${len} car.)`)
            .setColor('#EB459E')
            .setDescription(list)
            .setFooter({ text: 'Base de données K2L SQLite' });

        return message.reply({ embeds: [embed] });
    }

    // ──────────────────────────────────────────
    // 🛡️ COMMANDES DE MODÉRATION & ANTI-RAID
    // ──────────────────────────────────────────

    if (command === 'antiraid') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Tu dois être Administrateur pour utiliser cette commande.');
        }

        const option = args[0]?.toLowerCase();
        if (option === 'on') {
            db.prepare('INSERT INTO settings (guild_id, antiraid) VALUES (?, 1) ON CONFLICT(guild_id) DO UPDATE SET antiraid = 1').run(message.guild.id);
            return message.reply('🛡️ **Anti-Raid ACTIVÉ** ! Tout nouveau membre sera automatiquement expulsé.');
        } else if (option === 'off') {
            db.prepare('INSERT INTO settings (guild_id, antiraid) VALUES (?, 0) ON CONFLICT(guild_id) DO UPDATE SET antiraid = 0').run(message.guild.id);
            return message.reply('✅ **Anti-Raid DÉSACTIVÉ**.');
        } else {
            return message.reply('Usage : `,antiraid on` ou `,antiraid off`');
        }
    }

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ Permissions insuffisantes.');
        }
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 100) {
            return message.reply('⚠️ Spécifiez un nombre entre 1 et 100.');
        }
        await message.channel.bulkDelete(count, true);
        const msg = await message.channel.send(`🧹 **${count}** messages supprimés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Permissions insuffisantes.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Mentionne un membre à expulser.');
        await member.kick();
        return message.reply(`🚪 **${member.user.tag}** a été expulsé.`);
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Permissions insuffisantes.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Mentionne un membre à bannir.');
        await member.ban();
        return message.reply(`🔨 **${member.user.tag}** a été banni.`);
    }

    if (command === 'lock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ Permissions insuffisantes.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 Salon verrouillé.');
    }

    if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ Permissions insuffisantes.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 Salon déverrouillé.');
    }
});

// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
