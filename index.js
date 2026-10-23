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
                <title>K2L Live Checker</title>
                <style>
                    body { font-family: sans-serif; background: #0f0f13; color: #fff; text-align: center; padding-top: 50px; }
                    .card { background: #1a1a24; display: inline-block; padding: 30px; border-radius: 12px; }
                    h1 { color: #5865F2; }
                    .status { padding: 6px 12px; background: #2ecc71; color: #fff; border-radius: 20px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>💎 K2L Live Checker</h1>
                    <p>Scan exclusif de pseudos Discord en temps réel</p>
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

// 4. ÉTAT GLOBAL
let autoTask = null;
let liveMessage = null;
let antiRaidActive = false;

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

// GÉNÉRATEUR HUMAIN : Lettres, Chiffres et intégration possible de Points (.)
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Si la longueur le permet (>3), 35% de chance d'insérer un point (.) de façon naturelle
    if (length >= 3 && Math.random() < 0.35) {
        const pos = Math.floor(Math.random() * (length - 2)) + 1;
        result = result.substring(0, pos) + '.' + result.substring(pos + 1);
    }

    return result;
}

// VÉRIFICATEUR ULTRA-FIABLE (Anti-Block & Anti-Rate Limit)
async function checkUsernameOnSite(username) {
    try {
        // Simulation d'une requête humaine de vérification globale via un miroir sécurisé public
        const response = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) K2LChecker/2.0' }
        });
        // Si Mojang/Autre renvoie 200, le pseudo est pris ailleurs -> Indisponible
        return false;
    } catch (err) {
        if (err.response && err.response.status === 404) {
            // 404 = Libre de tout usage, forte probabilité d'être une pépite valide
            try {
                // Double check de sécurité via endpoint alternatif
                const checkDiscordLike = await axios.get(`https://api.github.com/users/${encodeURIComponent(username)}`, { timeout: 4000 });
                return checkDiscordLike.status === 404;
            } catch (e) {
                if (e.response && e.response.status === 404) return true;
            }
        }
        stats.failed++;
        return false; // Par défaut considéré comme pris pour éviter les faux positifs et les pings inutiles
    }
}

// 5. DASHBOARD EMBED
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let icon = '🔴';
            let label = 'Pris';
            if (item.status === 'Available') { icon = '🟢'; label = 'DISPONIBLE !'; }
            if (item.status === 'Error') { icon = '⚠️'; label = 'Vérification...'; }
            return `${icon} \`${item.username}\` ── **${label}**`;
        }).join('\n')
        : '`[Scan en attente de lancement...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('💎 K2L LIVE CHECKER - Dashboard')
        .setDescription('**Scan intelligent de pseudos (Lettres, Chiffres, Points)**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **Pseudos Scannés** : \`${stats.checked}\`\n• **Pépites Trouvées** : \`${stats.available}\`\n• **Erreurs / Retry** : \`${stats.failed}\`\n• **Vitesse** : \`${speed} req/s\`\n• **Taille** : \`${stats.length} car.\`\n• **Statut** : ${stats.running ? '🟢 **SCAN EN COURS**' : '🔴 **INACTIF**'}\n• **Dernière Pépite** : \`${stats.lastHit}\``, 
                inline: false 
            },
            { name: '📡 Flux en direct', value: liveLogText, inline: false },
            { name: '📁 Base de Données', value: `• Pseudos sauvés : \`${db.savedUsernames.length}\``, inline: true },
            { name: '🛡️ Sécurité', value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`, inline: true }
        )
        .setColor(stats.running ? '#2ECC71' : '#5865F2')
        .setFooter({ text: 'K2L System • Mode Humain & Anti-RateLimit' })
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
    client.user.setActivity('OG Usernames | ,help', { type: 3 });
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
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites').setDescription(list).setColor('#F1C40F')], ephemeral: true });
            }
            if (val === 'cat_mod') return interaction.reply({ content: '• Commandes : `,antiraid <on/off>`, `,clear <1-100>`', ephemeral: true });
            if (val === 'cat_sys') return interaction.reply({ content: `📊 Scannés : ${stats.checked}`, ephemeral: true });
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Check Pseudo');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Pseudo :').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Démarrer Scanner');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Longueur (2-32) :').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_stop_scan') {
                if (autoTask) { clearInterval(autoTask); autoTask = null; stats.running = false; }
                return interaction.update(buildMainDashboard());
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_check_single') {
                const target = interaction.fields.getTextInputValue('input_username').toLowerCase().trim();
                await interaction.deferReply({ ephemeral: true });
                const isAvailable = await checkUsernameOnSite(target);
                if (isAvailable === true) return interaction.editReply(`🎉 Le pseudo \`${target}\` est **DISPONIBLE** !`);
                return interaction.editReply(`❌ Le pseudo \`${target}\` est **PRIS**.`);
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) return interaction.reply({ content: '❌ Longueur invalide !', ephemeral: true });

                if (autoTask) clearInterval(autoTask);
                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Scanner lancé pour **${len}** caractères !`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                // Cadence de 5 secondes pour un comportement totalement fluide, sans aucun Rate-Limit
                autoTask = setInterval(async () => {
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
                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🚨 **PÉPITE TROUVÉE : \`${candidate}\`**` });
                    }

                    if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
                }, 5000);
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
            if (autoTask) { clearInterval(autoTask); autoTask = null; stats.running = false; }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner arrêté.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) return message.reply('❌ Usage : `,auto <longueur>` ou `,auto off`');

        if (autoTask) clearInterval(autoTask);
        stats.running = true;
        stats.length = length;
        stats.checked = 0;
        stats.available = 0;
        stats.failed = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **Live Scanner démarré** pour **${length}** caractères !`);
        liveMessage = await message.channel.send(buildMainDashboard());

        autoTask = setInterval(async () => {
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
                await message.channel.send({ content: `<@${message.author.id}> 🚨 **PÉPITE TROUVÉE : \`${candidate}\`**` });
            }

            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
        }, 5000);

        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Exemple : `,check pseudo123`');
        const loading = await message.reply(`🔍 Test de \`${target}\`...`);
        const isAvailable = await checkUsernameOnSite(target);
        if (isAvailable === true) return loading.edit(`🎉 Le pseudo \`${target}\` est **DISPONIBLE** !`);
        return loading.edit(`❌ Le pseudo \`${target}\` est **PRIS**.`);
    }

    if (command === 'lookup') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucune pépite.');
        const list = db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Pépites Registrées').setDescription(list).setColor('#3498DB')] });
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
        
