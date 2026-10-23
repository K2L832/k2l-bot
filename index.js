const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits 
} = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// 1. SERVEUR WEB EXPRESS (KEEP-ALIVE RENDER 24/7)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>K2L Pro Checker Engine</title>
                <style>
                    body { font-family: sans-serif; background: #0c0e12; color: #fff; text-align: center; padding-top: 50px; }
                    .card { background: #161922; display: inline-block; padding: 30px; border-radius: 12px; border: 1px solid #2E6DB4; }
                    h1 { color: #4A90E2; }
                    .status { padding: 6px 12px; background: #2ecc71; color: #fff; border-radius: 20px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>⚡ K2L Pro Checker Engine</h1>
                    <p>Système professionnel de vérification de pseudos Discord</p>
                    <div class="status">🟢 ONLINE 24/7 ON RENDER</div>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [EXPRESS] Serveur Web Keep-Alive actif sur le port ${PORT}`);
});

// 2. CLIENT DISCORD
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = ',';

// 3. BASE DE DONNÉES LOCALE (JSON)
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = { savedUsernames: [], settings: { antiRaid: false }, logs: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { savedUsernames: [], settings: { antiRaid: false }, logs: [] };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

// 4. ÉTAT GLOBAL & MÉTRIQUES PRO (Inspiré de Munky / OGTool)
let autoTask = null;
let liveMessage = null;
let antiRaidActive = false;
let consecutiveErrors = 0;
let systemLogs = [];

let stats = {
    running: false,
    length: 4,
    checked: 0,
    available: 0,
    taken: 0,
    failed: 0,
    startTime: null,
    recentChecks: [],
    lastHit: 'Aucun'
};

function addLog(msg) {
    systemLogs.unshift(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);
    if (systemLogs.length > 5) systemLogs.pop();
}

// SMART GENERATOR : Lettres, chiffres, et placement naturel de points (.) ou underscores (_)
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 30% de chance d'insérer un point ou un underscore de façon stratégique
    if (length >= 3 && Math.random() < 0.30) {
        const special = Math.random() < 0.7 ? '.' : '_';
        const pos = Math.floor(Math.random() * (length - 2)) + 1;
        result = result.substring(0, pos) + special + result.substring(pos + 1);
    }

    return result;
}

// MOTEUR DE VÉRIFICATION AVANCÉ (Anti-Rate-Limit & Rotation d'Headers)
async function checkUsernameOnDiscord(username) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        // Interrogation directe de l'API de validation Discord (endpoint non-authentifié)
        const response = await axios.post('https://discord.com/api/v9/unique-username/username-attempt-unauthed', 
            { username: username },
            {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': randomUA,
                    'Accept': 'application/json',
                    'Origin': 'https://discord.com',
                    'Referer': 'https://discord.com/'
                }
            }
        );

        consecutiveErrors = 0;
        // Discord renvoie { taken: false } si le pseudo est libre
        if (response.data && typeof response.data.taken !== 'undefined') {
            if (response.data.taken === false) {
                return true; // Disponible (Available)
            } else {
                stats.taken++;
                return false; // Pris (Taken)
            }
        }
        stats.taken++;
        return false;
    } catch (err) {
        consecutiveErrors++;
        stats.failed++;

        // Gestion du rate-limit (429)
        if (err.response && err.response.status === 429) {
            addLog(`Rate-Limit (429) rencontré sur ${username}`);
            return 'RATELIMIT';
        }

        if (err.response && err.response.data && err.response.data.taken === true) {
            stats.taken++;
            return false;
        }

        return false;
    }
}

// 5. DASHBOARD EMBED PROFESSIONNEL
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let icon = '🔴';
            let label = 'Taken';
            if (item.status === 'Available') { icon = '🟢'; label = 'AVAILABLE !'; }
            if (item.status === 'RateLimit') { icon = '⚠️'; label = 'Rate-Limit (Backoff)'; }
            return `${icon} \`${item.username}\` ── **${label}**`;
        }).join('\n')
        : '`[En attente du lancement du scan...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('⚡ K2L PRO CHECKER • Live Dashboard')
        .setDescription('**Système professionnel de vérification de pseudos Discord en temps réel**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **CHECKED** : \`${stats.checked}\`\n• **AVAILABLE / HITS** : \`${stats.available}\`\n• **TAKEN** : \`${stats.taken}\`\n• **FAILED / RATE-LIMIT** : \`${stats.failed}\`\n• **SPEED** : \`${speed} req/s\`\n• **Taille** : \`${stats.length} car.\`\n• **Statut** : ${stats.running ? '🟢 **RUNNING**' : '🔴 **STOPPED**'}`, 
                inline: false 
            },
            { name: '📡 Flux en direct', value: liveLogText, inline: false },
            { name: '📁 Base de Données', value: `• Hits sauvés : \`${db.savedUsernames.length}\``, inline: true },
            { name: '🛡️ Sécurité', value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`, inline: true }
        )
        .setColor(stats.running ? '#2ECC71' : '#2E6DB4')
        .setFooter({ text: 'K2L Pro Engine • Jitter & Backoff Protocole' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('📂 Sélectionner une catégorie...')
            .addOptions([
                { label: '🔍 Live Checker & Scan', value: 'cat_scan', emoji: '🔍' },
                { label: '📂 Base de Données / Hits', value: 'cat_hits', emoji: '📁' },
                { label: '🛡️ Modération & Sécurité', value: 'cat_mod', emoji: '🛡️' },
                { label: '📊 Télémetrie & Logs', value: 'cat_sys', emoji: '📊' }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? '🛑 Stop Scan' : '🚀 Start Run')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('🔍 Check 1 Pseudo')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot connecté : ${client.user.tag}`);
    client.user.setActivity('Discord Username Checker | ,help', { type: 3 });
    addLog('Bot initialisé avec succès.');
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];
            if (val === 'cat_scan') return interaction.reply({ content: '• Cliquez sur **🚀 Start Run** pour lancer le scan.', ephemeral: true });
            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n') : 'Aucun hit enregistré.';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites Discord (Hits)').setDescription(list).setColor('#2E6DB4')], ephemeral: true });
            }
            if (val === 'cat_mod') return interaction.reply({ content: '• Commandes de modération : `,antiraid <on/off>`, `,clear <1-100>`, `,kick`, `,ban`', ephemeral: true });
            if (val === 'cat_sys') {
                const uptime = Math.floor(process.uptime() / 60);
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                const logTxt = systemLogs.length > 0 ? systemLogs.join('\n') : 'Aucun log récent.';
                return interaction.reply({ content: `📊 **Télémetrie Système**\n• **Uptime** : \`${uptime} min\`\n• **RAM** : \`${mem} MB\`\n• **Logs récents** :\n\`\`\`${logTxt}\`\`\``, ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Vérifier un Pseudo');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Pseudo Discord :').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Paramètres du Scan');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Longueur (2-32) :').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_stop_scan') {
                if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
                addLog('Scan arrêté.');
                return interaction.update(buildMainDashboard());
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_check_single') {
                const target = interaction.fields.getTextInputValue('input_username').toLowerCase().trim();
                await interaction.deferReply({ ephemeral: true });
                const res = await checkUsernameOnDiscord(target);
                if (res === true) return interaction.editReply(`🎉 Le pseudo \`${target}\` est **100% DISPONIBLE (AVAILABLE)** !`);
                return interaction.editReply(`❌ Le pseudo \`${target}\` est **PRIS (TAKEN)**.`);
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) return interaction.reply({ content: '❌ Longueur invalide !', ephemeral: true });

                if (autoTask) clearTimeout(autoTask);
                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.taken = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];
                addLog(`Démarrage du scan (${len} caractères).`);

                await interaction.reply({ content: `🚀 Scanner lancé pour des pseudos de **${len}** caractères !`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                // BOUCLE PRO AVEC JITTER (Délai aléatoire anti-rate-limit) ET BACKOFF
                const runProLoop = async () => {
                    if (!stats.running) return;

                    const candidate = generateUsername(len);
                    stats.checked++;
                    const res = await checkUsernameOnDiscord(candidate);
                    
                    let statusText = 'Taken';
                    if (res === true) statusText = 'Available';
                    if (res === 'RATELIMIT') statusText = 'RateLimit';

                    stats.recentChecks.unshift({ username: candidate, status: statusText });
                    if (stats.recentChecks.length > 8) stats.recentChecks.pop();

                    // ALERTE CIBLÉE : Notification uniquement si le pseudo est 100% DISPONIBLE (Available)
                    if (res === true) {
                        stats.available++;
                        stats.lastHit = candidate;
                        addLog(`Hit trouvé : ${candidate}`);
                        
                        const db = loadDatabase();
                        if (!db.savedUsernames.some(i => i.username === candidate)) {
                            db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                            saveDatabase(db);
                        }
                        // Ping unique de l'utilisateur pour la pépite libre
                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🟢 **DISCORD USERNAME AVAILABLE : \`${candidate}\`**` });
                    }

                    if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

                    // Délai adaptatif Jitter (entre 4 et 7 secondes) + Backoff si erreur
                    const jitter = Math.floor(Math.random() * 3000) + 4000;
                    const backoffMultiplier = consecutiveErrors > 2 ? 2.5 : 1;

                    autoTask = setTimeout(runProLoop, jitter * backoffMultiplier);
                };

                runProLoop();
            }
        }
    } catch (err) {
        console.error('Erreur interaction :', err);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (['help', 'panel', 'dashboard'].includes(command)) {
        liveMessage = await message.reply(buildMainDashboard());
        return;
    }

    if (command === 'stats') {
        const uptime = Math.floor(process.uptime() / 60);
        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        return message.reply(`📊 **Statistiques Pro**\n• Uptime : \`${uptime} min\`\n• RAM : \`${mem} MB\`\n• Checked : \`${stats.checked}\` | Hits : \`${stats.available}\``);
    }

    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner arrêté.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) return message.reply('❌ Usage : `,auto <longueur>` ou `,auto off`');

        if (autoTask) clearTimeout(autoTask);
        stats.running = true;
        stats.length = length;
        stats.checked = 0;
        stats.available = 0;
        stats.taken = 0;
        stats.failed = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **Live Scanner démarré** pour **${length}** caractères !`);
        liveMessage = await message.channel.send(buildMainDashboard());

        const runProLoopMsg = async () => {
            if (!stats.running) return;

            const candidate = generateUsername(length);
            stats.checked++;
            const res = await checkUsernameOnDiscord(candidate);
            
            let statusText = 'Taken';
            if (res === true) statusText = 'Available';
            if (res === 'RATELIMIT') statusText = 'RateLimit';

            stats.recentChecks.unshift({ username: candidate, status: statusText });
            if (stats.recentChecks.length > 8) stats.recentChecks.pop();

            if (res === true) {
                stats.available++;
                stats.lastHit = candidate;
                const db = loadDatabase();
                if (!db.savedUsernames.some(i => i.username === candidate)) {
                    db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                    saveDatabase(db);
                }
                await message.channel.send({ content: `<@${message.author.id}> 🟢 **DISCORD USERNAME AVAILABLE : \`${candidate}\`**` });
            }

            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

            const jitter = Math.floor(Math.random() * 3000) + 4000;
            const backoffMultiplier = consecutiveErrors > 2 ? 2.5 : 1;

            autoTask = setTimeout(runProLoopMsg, jitter * backoffMultiplier);
        };

        runProLoopMsg();
        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Exemple : `,check pseudo123`');
        const loading = await message.reply(`🔍 Test Discord de \`${target}\`...`);
        const res = await checkUsernameOnDiscord(target);
        if (res === true) return loading.edit(`🎉 Le pseudo \`${target}\` est **100% DISPONIBLE (AVAILABLE)** !`);
        return loading.edit(`❌ Le pseudo \`${target}\` est **PRIS (TAKEN)**.`);
    }

    if (command === 'lookup' || command === 'hits') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucun hit enregistré.');
        const list = db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites Discord Enregistrées').setDescription(list).setColor('#2E6DB4')] });
    }

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply("❌ Permission requise.");
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) return message.reply("❌ Entre 1 et 100.");
        await message.channel.bulkDelete(count + 1, true).catch(() => {});
        const msg = await message.channel.send(`🧹 **${count}** messages supprimés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    if (command === 'antiraid') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Administrateur requis.");
        antiRaidActive = (args[0]?.toLowerCase() === 'on');
        return message.reply(`🛡️ Anti-Raid : **${antiRaidActive ? 'ACTIVÉ 🟢' : 'DÉSACTIVÉ 🔴'}**`);
    }

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply("❌ Permission requise.");
        const member = message.mentions.members.first();
        if (member) { await member.kick(); message.reply(`✅ **${member.user.tag}** expulsé.`); }
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply("❌ Permission requise.");
        const member = message.mentions.members.first();
        if (member) { await member.ban(); message.reply(`✅ **${member.user.tag}** banni.`); }
    }

    if (command === 'lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission requise.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply("🔒 Salon verrouillé.");
    }

    if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("❌ Permission requise.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply("🔓 Salon déverrouillé.");
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN manquant !");
    process.exit(1);
}

client.login(TOKEN);
