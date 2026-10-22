const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- 1. SERVEUR WEB (POUR UPTIMEROBOT 24/7) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot K2L opérationnel 24/7 via InstantUsername');
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web en écoute sur le port ${PORT}`);
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

// --- 3. GESTION DE LA BASE DE DONNÉES LOCALE (JSON) ---
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ savedUsernames: [] }, null, 2));
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { savedUsernames: [] };
    }
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Variables globales pour la commande ,auto
let autoTask = null;
let antiRaidActive = false;

// Générateur de pseudos aléatoires
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Fonction centralisée pour interroger le site InstantUsername de manière fiable
async function checkUsernameOnSite(username) {
    try {
        const response = await axios.get(`https://instantusername.com/api/check?username=${username}&service=discord`, {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (response.data && typeof response.data.available !== 'undefined') {
            return response.data.available === true;
        }
        return false;
    } catch (err) {
        console.error(`[Erreur API Site] Impossible de vérifier ${username} :`, err.message);
        return null; // En cas de souci réseau avec le site
    }
}

client.once('clientReady', () => {
    console.log(`✅ BOT CONNECTÉ : ${client.user.tag}`);
});

// --- 4. PROTECTION ANTI-RAID ---
client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try {
            await member.kick('Mode Anti-Raid actif : Compte trop récent.');
            console.log(`[Anti-Raid] Expulsé : ${member.user.tag}`);
        } catch (e) {
            console.error('[Anti-Raid Erreur]', e.message);
        }
    }
});

// --- 5. GESTION DES COMMANDES ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 📜 COMMANDE ,help
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📜 Commandes du Bot K2L (Mode InstantUsername)')
            .setDescription('Toutes les vérifications passent directement par le site en temps réel :')
            .addFields(
                { name: '🔍 Recherche & Scan', value: '`,`auto <2-32> ou off` : Lance/Stoppe le scan automatique via le site\n`,`check <pseudo>` : Teste un pseudo précis directement sur le site\n`,`suggest` : Génère une idée de pseudo\n`,`lookup` : Affiche les pseudos sauvegardés' },
                { name: '🛡️ Modération & Sécurité', value: '`,`antiraid <on/off>` : Active/désactive le filtre d\'entrée\n`,`clear <1-100>` : Supprime des messages\n`,`kick <@membre>` : Expulse un membre\n`,`ban <@membre>` : Bannit un membre\n`,`lock` / `,unlock` : Verrouille/Déverrouille le salon' },
                { name: '📊 Système', value: '`,`ping` : Latence du bot\n`,`botinfo` : Infos techniques\n`,`userinfo` : Infos sur un profil' }
            )
            .setColor('#5865F2')
            .setTimestamp();
        return message.reply({ embeds: [embed] }).catch(() => {});
    }

    // 🤖 COMMANDE ,auto (Scan automatique via le site)
    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off') {
            if (!autoTask) {
                return message.reply('❌ Aucun scan automatique n\'est actuellement en cours.');
            }
            clearInterval(autoTask);
            autoTask = null;
            return message.reply('🛑 **Scan automatique ARRÊTÉ** avec succès.');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) {
            return message.reply('❌ **Usage :** `,auto <longueur>` (ex: `,auto 4`) ou `,auto off` pour l\'arrêter.');
        }

        if (autoTask) {
            return message.reply('⚠️ Un scan automatique est **déjà en cours** ! Tape `,auto off` pour l\'arrêter avant d\'en lancer un nouveau.');
        }

        await message.reply(`🚀 **Scan automatique démarré** via le site pour des pseudos de **${length} caractères** (toutes les 4 secondes).`);
        console.log(`[Auto Scan] Démarrage de la tâche pour ${length} caractères.`);

        autoTask = setInterval(async () => {
            const candidate = generateUsername(length);
            const isAvailable = await checkUsernameOnSite(candidate);

            if (isAvailable === true) {
                console.log(`[PÉPITE TROUVÉE VIA LE SITE] ${candidate} est DISPONIBLE !`);

                const db = loadDatabase();
                if (!db.savedUsernames.some(item => item.username === candidate)) {
                    db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                    saveDatabase(db);
                }

                const alertEmbed = new EmbedBuilder()
                    .setTitle('🎉 PÉPITE DISPONIBLE DÉTECTÉE !')
                    .setDescription(`Le scanner a interrogé le site et trouvé un pseudo libre !\n\n✨ Pseudo : \`${candidate}\``)
                    .setColor('#2ECC71')
                    .setTimestamp();

                await message.channel.send({ content: `<@${message.author.id}> Regarde ça ! 🚨`, embeds: [alertEmbed] });
            } else {
                console.log(`[Scan Site] ${candidate} -> Pris ou indisponible.`);
            }
        }, 4000);

        return;
    }

    // 🔍 COMMANDE ,check <pseudo> (Vérification directe et 100% connectée au site)
    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Précise un pseudo à vérifier. Exemple : `,check pbavq0dfhb`');

        const loading = await message.reply(`🔍 Interrogation du site pour \`${target}\`...`);

        const isAvailable = await checkUsernameOnSite(target);

        if (isAvailable === true) {
            return loading.edit(`🎉 Résultat du site pour \`${target}\` : Il est **DISPONIBLE** sur Discord !`);
        } else if (isAvailable === false) {
            return loading.edit(`❌ Résultat du site pour \`${target}\` : Il est **DÉJÀ PRIS**.`);
        } else {
            return loading.edit(`⚠️ Le site n'a pas pu répondre ou est momentanément indisponible pour \`${target}\`.`);
        }
    }

    // 💡 COMMANDE ,suggest
    if (command === 'suggest') {
        const length = Math.floor(Math.random() * 3) + 3;
        const name = generateUsername(length);
        return message.reply(`💡 Idée de pseudo : \`${name}\``);
    }

    // 📂 COMMANDE ,lookup (Voir les pépites sauvegardées)
    if (command === 'lookup') {
        const db = loadDatabase();
        if (!db.savedUsernames || db.savedUsernames.length === 0) {
            return message.reply('📂 Aucun pseudo n\'a encore été enregistré dans la base de données.');
        }

        const list = db.savedUsernames.slice(-10).map(item => `• \`${item.username}\` *(trouvé le ${new Date(item.timestamp).toLocaleDateString()})*`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('📂 Derniers pseudos sauvegardés')
            .setDescription(list)
            .setColor('#3498DB');
        return message.reply({ embeds: [embed] });
    }

    // 🏓 COMMANDE ,ping
    if (command === 'ping') {
        return message.reply(`🏓 Latence : **${client.ws.ping}ms**`);
    }

    // 🤖 COMMANDE ,botinfo
    if (command === 'botinfo') {
        return message.reply(`🤖 **Bot K2L** | En ligne 24/7 | Serveurs connectés : \`${client.guilds.cache.size}\``);
    }

    // 👤 COMMANDE ,userinfo
    if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        return message.reply(`👤 Profil de **${user.tag}** | ID : \`${user.id}\``);
    }

    // 🛡️ COMMANDE ,antiraid
    if (command === 'antiraid') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Permission Administrateur requise.");
        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            antiRaidActive = true;
            return message.reply("🛡️ Anti-Raid **ACTIVÉ**.");
        } else if (action === 'off') {
            antiRaidActive = false;
            return message.reply("🛡️ Anti-Raid **DÉSACTIVÉ**.");
        } else {
            return message.reply(`Statut Anti-Raid : **${antiRaidActive ? 'ACTIVÉ 🟢' : 'DÉSACTIVÉ 🔴'}**. Utilise \`,antiraid on\` ou \`,antiraid off\`.`);
        }
    }

    // 🧹 COMMANDE ,clear
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply("❌ Permission requise : Gérer les messages.");
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) return message.reply("❌ Précise un nombre entre 1 et 100.");
        try {
            await message.channel.bulkDelete(count + 1, true);
            const msg = await message.channel.send(`🧹 **${count}** messages supprimés.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (e) {
            message.reply("❌ Erreur lors de la suppression (messages de plus de 14 jours).");
        }
    }

    // 👢 COMMANDE ,kick
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply("❌ Permission requise : Expulser des membres.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Mentionne un membre à expulser.");
        try {
            await member.kick();
            return message.reply(`✅ **${member.user.tag}** a été expulsé.`);
        } catch (e) {
            return message.reply("❌ Impossible d'expulser ce membre.");
        }
    }

    // 🔨 COMMANDE ,ban
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission requise : Bannir des membres.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Mentionne un membre à bannir.");
        try {
            await member.ban();
            return message.reply(`✅ **${member.user.tag}** a été banni.`);
        } catch (e) {
            return message.reply("❌ Impossible de bannir ce membre.");
        }
    }

    // 🔒 COMMANDE ,lock
    if (command === 'lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission requise : Gérer les salons.");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            return message.reply("🔒 Salon verrouillé.");
        } catch (e) {
            return message.reply("❌ Erreur de verrouillage.");
        }
    }

    // 🔓 COMMANDE ,unlock
    if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission requise : Gérer les salons.");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            return message.reply("🔓 Salon déverrouillé.");
        } catch (e) {
            return message.reply("❌ Erreur de déverrouillage.");
        }
    }
});

// Anti-crash global
process.on('unhandledRejection', (err) => {
    console.error('[Anti-Crash Global]', err.message || err);
});

if (TOKEN) {
    client.login(TOKEN);
} else {
    console.error("❌ TOKEN MANQUANT : Assure-toi d'avoir configuré DISCORD_TOKEN dans Secrets.");
}
