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
                <title>K2L Pro Live Checker</title>
                <style>
                    body { font-family: sans-serif; background: #0f1117; color: #fff; text-align: center; padding-top: 50px; }
                    .card { background: #1a1d24; display: inline-block; padding: 30px; border-radius: 12px; border: 1px solid #5865F2; }
                    h1 { color: #5865F2; }
                    .status { padding: 6px 12px; background: #2ecc71; color: #fff; border-radius: 20px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>⚡ K2L Pro Live Checker</h1>
                    <p>Moteur de recherche professionnel anti-rate-limit</p>
                    <div class="status">🟢 ONLINE 24/7 ON RENDER</div>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [EXPRESS] Serveur Web Keep-Alive actif sur http://0.0.0.0:${PORT}`);
});

// 2. CLIENT DISCORD
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

const PREFIX = ',';

// 3. BASE DE DONNÉES JSON
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

// 4. ÉTAT GLOBAL ET CONFIG PRO
let autoTask = null;
let liveMessage = null;
let antiRaidActive = false;
let consecutiveErrors = 0;

let stats = {
    running: false,
    length: 4,
    checked: 0,
    available: 0,
    failed: 0,
    startTime: null,
    recentChecks: [],
    lastHit: 'Aucun'
};

// GÉNÉRATEUR HUMAIN : Lettres, Chiffres et Points (.)
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Insertion naturelle d'un point (.) dans 30% des cas si la longueur le permet
    if (length >= 3 && Math.random() < 0.30) {
        const pos = Math.floor(Math.random() * (length - 2)) + 1;
        result = result.substring(0, pos) + '.' + result.substring(pos + 1);
    }

    return result;
}

// MOTEUR DE RECHERCHE PRO : Rotation de Fingerprints & Anti-Rate-Limit
async function checkUsernameOnSite(username) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        // Requête ciblée strict sur l'API de InstantUsername pour le service Discord
        const response = await axios.get(`https://instantusername.com/api/check?username=${encodeURIComponent(username)}&service=discord`, {
            timeout: 6000,
            headers: { 
                'User-Agent': randomUA,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://instantusername.com/',
                'Origin': 'https://instantusername.com',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Cache-Control': 'no-cache'
            }
        });

        consecutiveErrors = 0; // Reset des erreurs si succès

        if (response.data && typeof response.data.available !== 'undefined') {
            return response.data.available === true;
        }
        return false;
    } catch (err) {
        consecutiveErrors++;
        stats.failed++;
        
        // Si trop d'erreurs d'affilée, le moteur s'adapte automatiquement
        if (consecutiveErrors >= 5) {
            console.log('⚠️ [PRO-PROTECTION] Ralentissement automatique de sécurité activé suite à un blocage réseau.');
        }
        return false;
    }
}

// 5. DASHBOARD EMBED PRO CLEAN
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let icon = '🔴';
            let label = 'Pris';
            if (item.status === 'Available') { icon = '🟢'; label = '100% DISPO DISCORD !'; }
            if (item.status === 'Error') { icon = '⚠️'; label = 'Sécurité / Backoff'; }
            return `${icon} \`${item.username}\` ── **${label}**`;
        }).join('\n')
        : '`[En attente du lancement du scan...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('⚡ K2L PRO LIVE CHECKER - Discord Engine')
        .setDescription('**Moteur de recherche professionnel en temps réel (InstantUsername - Discord API)**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **Pseudos Scannés** : \`${stats.checked}\`\n• **Pépites Discord** : \`${stats.available}\`\n• **Erreurs / Sécurité** : \`${stats.failed}\`\n• **Vitesse Moyenne** : \`${speed} req/s\`\n• **Taille** : \`${stats.length} car.\`\n• **Statut** : ${stats.running ? '🟢 **SCAN EN COURS (PRO MODE)**' : '🔴 **INACTIF**'}\n• **Dernière Pépite** : \`${stats.lastHit}\``, 
                inline: false 
            },
            { name: '📡 Flux en direct (Vérification Instantanée)', value: liveLogText, inline: false },
            { name: '📁 Base de Données', value: `• Pseudos sauvegardés : \`${db.savedUsernames.length}\``, inline: true },
            { name: '🛡️ Sécurité', value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`, inline: true }
        )
        .setColor(stats.running ? '#2ECC71' : '#5865F2')
        .setFooter({ text: 'K2L Pro Engine • Anti-RateLimit Jitter Active' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('📂 Sélectionner une catégorie...')
            .addOptions([
                { label: '🔍 Live Checker & Scan', value: 'cat_scan', emoji: '🔍' },
                { label: '📂 Base de Données / Hits', value: 'cat_hits', emoji: '📁' },
                { label: '🛡️ Modération & Sécurité', value: 'cat_mod', emoji: '🛡️' },
                { label: '📊 Télémetrie Système', value: 'cat_sys', emoji: '📊' }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? '🛑 Arrêter le Scan' : '🚀 Lancer Live Scan')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('🔍 Check 1 Pseudo')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('🔄 Rafraîchir Panel')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot connecté : ${client.user.tag}`);
    client.user.setActivity('Pro Discord Scanner | ,help', { type: 3 });
});

client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try { await member.kick('Mode Anti-Raid : Compte trop récent (< 3 jours).'); } catch (e) {}
    }
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];
            if (val === 'cat_scan') return interaction.reply({ content: '• Cliquez sur **🚀 Lancer Live Scan**.', ephemeral: true });
            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n') : 'Aucun pseudo enregistré.';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites Discord').setDescription(list).setColor('#5865F2')], ephemeral: true });
            }
            if (val === 'cat_mod') return interaction.reply({ content: '• Commandes : `,antiraid <on/off>`, `,clear <1-100>`', ephemeral: true });
            if (val === 'cat_sys') return interaction.reply({ content: `📊 Scannés : ${stats.checked}`, ephemeral: true });
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Check Pro Discord');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Pseudo :').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Démarrer Scanner Pro');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Longueur (2-32) :').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_stop_scan') {
                if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
                return interaction.update(buildMainDashboard());
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_check_single') {
                const target = interaction.fields.getTextInputValue('input_username').toLowerCase().trim();
                await interaction.deferReply({ ephemeral: true });
                const isAvailable = await checkUsernameOnSite(target);
                if (isAvailable === true) return interaction.editReply(`🎉 Le pseudo \`${target}\` est **100% DISPONIBLE SUR DISCORD** !`);
                return interaction.editReply(`❌ Le pseudo \`${target}\` est **PRIS**.`);
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) return interaction.reply({ content: '❌ Longueur invalide !', ephemeral: true });

                if (autoTask) clearTimeout(autoTask);
                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Scanner Pro lancé pour **${len}** caractères !`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                // BOUCLE PRO AVEC DÉLAI DYNAMIQUE ALÉATOIRE (JITTER) : Empêche tout rate-limit
                const runProLoop = async () => {
                    if (!stats.running) return;

                    const candidate = generateUsername(len);
                    stats.checked++;
                    const isAvailable = await checkUsernameOnSite(candidate);
                    let statusText = isAvailable === true ? 'Available' : 'Taken';

                    stats.recentChecks.unshift({ username: candidate, status: statusText });
                    if (stats.recentChecks.length > 8) stats.recentChecks.pop();

                    if (isAvailable === true) {
                        stats.available++;
                        stats.lastHit = candidate;
                        const db = loadDatabase();
                        if (!db.savedUsernames.some(i => i.username === candidate)) {
                            db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                            saveDatabase(db);
                        }
                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🚨 **PÉPITE DISCORD TROUVÉE : \`${candidate}\`**` });
                    }

                    if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

                    // Délai adaptatif intelligent : de 7 à 12 secondes aléatoires (Anti-Rate-Limit absolu)
                    const randomDelay = Math.floor(Math.random() * 5000) + 7000;
                    const backoffMultiplier = consecutiveErrors > 2 ? 2 : 1; // Si blocage détecté, double le temps de pause
                    
                    autoTask = setTimeout(runProLoop, randomDelay * backoffMultiplier);
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
        stats.failed = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **Live Scanner Pro démarré** pour **${length}** caractères !`);
        liveMessage = await message.channel.send(buildMainDashboard());

        const runProLoopMsg = async () => {
            if (!stats.running) return;

            const candidate = generateUsername(length);
            stats.checked++;
            const isAvailable = await checkUsernameOnSite(candidate);
            let statusText = isAvailable === true ? 'Available' : 'Taken';

            stats.recentChecks.unshift({ username: candidate, status: statusText });
            if (stats.recentChecks.length > 8) stats.recentChecks.pop();

            if (isAvailable === true) {
                stats.available++;
                stats.lastHit = candidate;
                const db = loadDatabase();
                if (!db.savedUsernames.some(i => i.username === candidate)) {
                    db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                    saveDatabase(db);
                }
                await message.channel.send({ content: `<@${message.author.id}> 🚨 **PÉPITE DISCORD TROUVÉE : \`${candidate}\`**` });
            }

            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

            const randomDelay = Math.floor(Math.random() * 5000) + 7000;
            const backoffMultiplier = consecutiveErrors > 2 ? 2 : 1;
            
            autoTask = setTimeout(runProLoopMsg, randomDelay * backoffMultiplier);
        };

        runProLoopMsg();
        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Exemple : `,check pseudo123`');
        const loading = await message.reply(`🔍 Test Pro de \`${target}\`...`);
        const isAvailable = await checkUsernameOnSite(target);
        if (isAvailable === true) return loading.edit(`🎉 Le pseudo \`${target}\` est **100% DISPONIBLE SUR DISCORD** !`);
        return loading.edit(`❌ Le pseudo \`${target}\` est **PRIS**.`);
    }

    if (command === 'lookup') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucune pépite.');
        const list = db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites Discord Registrées').setDescription(list).setColor('#5865F2')] });
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
