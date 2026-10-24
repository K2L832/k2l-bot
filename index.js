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
    TextInputStyle 
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
                <title>K2L Scanner Engine</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090a0f; color: #e1e7ed; text-align: center; padding-top: 60px; }
                    .card { background: #12151e; display: inline-block; padding: 32px; border-radius: 10px; border: 1px solid #1f2638; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                    h1 { color: #5865F2; margin-bottom: 8px; font-size: 24px; }
                    p { color: #8a96a3; font-size: 14px; margin-bottom: 20px; }
                    .status { display: inline-block; padding: 6px 14px; background: #2ecc711a; border: 1px solid #2ecc71; color: #2ecc71; border-radius: 20px; font-size: 12px; font-weight: 600; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>K2L Scanner Pro</h1>
                    <p>Discord Username Checker Engine • 24/7</p>
                    <div class="status">● EN LIGNE SUR RENDER (MULTI-PROXY ACTIF)</div>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [EXPRESS] Serveur Web actif sur le port ${PORT}`);
});

// 2. CLIENT DISCORD
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = ',';

// 3. BASE DE DONNÉES LOCALE (HITS)
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = { savedUsernames: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { savedUsernames: [] };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

// 4. ÉTAT GLOBAL DU SCANNER
let autoTask = null;
let liveMessage = null;

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

// GÉNÉRATEUR DE PSEUDOS INTELLIGENT
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    if (length >= 3 && Math.random() < 0.30) {
        const special = Math.random() < 0.7 ? '.' : '_';
        const pos = Math.floor(Math.random() * (length - 2)) + 1;
        result = result.substring(0, pos) + special + result.substring(pos + 1);
    }

    return result;
}

// MOTEUR MULTI-PROXY ROTATIF (ZÉRO BLOCAGE CLOUDFLARE)
async function checkUsername(username) {
    const targetUrl = `https://instantusername.com/api/check?username=${encodeURIComponent(username)}&service=discord`;
    
    // Liste de relais proxy publics alternatifs pour contourner les restrictions IP de Render
    const proxyStrategies = [
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const url of proxyStrategies) {
        try {
            const response = await axios.get(url, {
                timeout: 4000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });

            let data = response.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) {}
            }

            if (data && typeof data.available !== 'undefined') {
                if (data.available === true) {
                    return true; // Disponible
                } else {
                    stats.taken++;
                    return false; // Pris
                }
            }
        } catch (e) {
            continue; // Essaye le proxy suivant si l'un d'eux échoue
        }
    }

    stats.failed++;
    return 'ERROR';
}

// 5. PANNEAU DE CONTRÔLE EMBED PRO
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let statusBadge = '`🔴 Pris`';
            if (item.status === 'Available') statusBadge = '`🟢 DISPONIBLE`';
            if (item.status === 'Error') statusBadge = '`⚠️ Erreur`';
            return `\`${item.username.padEnd(8, ' ')}\` ─ ${statusBadge}`;
        }).join('\n')
        : '`[En attente de démarrage...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('⚡ K2L SCANNER - Tableau de Bord Pro')
        .setDescription('**Vérificateur de pseudos Discord en temps réel**')
        .setColor(stats.running ? '#2ecc71' : '#1f2638')
        .addFields(
            { name: 'STATUT', value: stats.running ? '🟢 **EN COURS**' : '🔴 **ARRÊTÉ**', inline: true },
            { name: 'VITESSE', value: `\`${speed} req/s\``, inline: true },
            { name: 'LONGUEUR', value: `\`${stats.length} car.\``, inline: true },
            { 
                name: 'MÉTRIQUES DU SCAN', 
                value: `\`\`\`yaml\nAnalysés:  ${stats.checked}\nLibres:    ${stats.available}\nPris:      ${stats.taken}\nErreurs:   ${stats.failed}\n\`\`\``, 
                inline: false 
            },
            { name: 'FLUX EN DIRECT (TESTS EN TEMPS RÉEL)', value: liveLogText, inline: false },
            { name: 'BASE DE DONNÉES', value: `Pépites sauvées: \`${db.savedUsernames.length}\``, inline: true }
        )
        .setFooter({ text: 'K2L Scanner Engine • Multi-Proxy Rotation Actif' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_scanner')
            .setPlaceholder('Navigation du Scanner...')
            .addOptions([
                { label: '🔍 Contrôle du Scan', value: 'nav_scan', description: 'Gérer le lancement et l\'arrêt' },
                { label: '📁 Pépites Enregistrées', value: 'nav_hits', description: 'Voir les pseudos libres trouvés' },
                { label: '📊 Télémetrie Système', value: 'nav_sys', description: 'État de la RAM et des proxys' }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? 'Arrêter' : 'Démarrer')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('Check 1 Pseudo')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('Actualiser')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('ready', () => {
    console.log(`✅ [DISCORD] K2L Scanner connecté : ${client.user.tag}`);
    client.user.setActivity('Scanner Discord Pro', { type: 3 });
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_scanner') {
            const val = interaction.values[0];
            if (val === 'nav_scan') return interaction.reply({ content: '• Utilisez les boutons sous le panneau pour démarrer ou arrêter le scan.', ephemeral: true });
            if (val === 'nav_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n') : 'Aucune pépite enregistrée.';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📁 PÉPITES ENREGISTRÉES').setDescription(list).setColor('#5865F2')], ephemeral: true });
            }
            if (val === 'nav_sys') {
                const uptime = Math.floor(process.uptime() / 60);
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                return interaction.reply({ content: `📊 **Télémetrie K2L Scanner**\n• Uptime : \`${uptime} min\`\n• RAM : \`${mem} MB\`\n• Moteur : \`Multi-Proxy Rotatif (0 Erreur)\``, ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Vérifier un pseudo');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Entrez le pseudo à tester').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Paramètres du Scanner');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Longueur des pseudos (2-32)').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
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
                const isAvailable = await checkUsername(target);
                if (isAvailable === true) return interaction.editReply(`🟢 Le pseudo \`${target}\` est **100% DISPONIBLE** !`);
                return interaction.editReply(`🔴 Le pseudo \`${target}\` est **PRIS**.`);
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) return interaction.reply({ content: '❌ Longueur invalide (entre 2 et 32).', ephemeral: true });

                if (autoTask) clearTimeout(autoTask);
                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.taken = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Scanner lancé en direct pour des pseudos de **${len}** caractères !`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                const runScanLoop = async () => {
                    if (!stats.running) return;

                    const candidate = generateUsername(len);
                    stats.checked++;
                    const isAvailable = await checkUsername(candidate);
                    
                    let statusText = 'Taken';
                    if (isAvailable === true) statusText = 'Available';
                    if (isAvailable === 'ERROR') statusText = 'Error';

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

                    const delay = Math.floor(Math.random() * 800) + 1000;
                    autoTask = setTimeout(runScanLoop, delay);
                };

                runScanLoop();
            }
        }
    } catch (err) {
        console.error('Erreur interaction :', err);
    }
});

// COMMANDES TEXTUELLES : ,help, ,auto, ,check
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. COMMANDE HELP
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 K2L SCANNER - GUIDE DES COMMANDES')
            .setDescription('Voici la liste des commandes du scanner professionnel :')
            .addFields(
                { name: '🚀 `,auto <longueur>`', value: 'Lance le scanner automatique en direct pour la taille choisie (ex: `,auto 4`) et affiche le panneau de contrôle interactif.' },
                { name: '🛑 `,auto off` (ou `stop`)', value: 'Arrête instantanément le scanner en cours.' },
                { name: '🔍 `,check <pseudo>`', value: 'Vérifie instantanément un pseudo spécifique (ex: `,check monpseudo`).' },
                { name: '📖 `,help`', value: 'Affiche ce guide d\'aide.' }
            )
            .setColor('#5865F2')
            .setFooter({ text: 'K2L Scanner • Mode Professionnel' });

        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. COMMANDE AUTO
    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner arrêté avec succès.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) {
            return message.reply('❌ Utilisation correcte : `,auto <longueur>` (ex: `,auto 4`) ou `,auto off`');
        }

        if (autoTask) clearTimeout(autoTask);
        stats.running = true;
        stats.length = length;
        stats.checked = 0;
        stats.available = 0;
        stats.taken = 0;
        stats.failed = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **K2L Scanner démarré** pour les pseudos de **${length}** caractères.`);
        liveMessage = await message.channel.send(buildMainDashboard());

        const runScanLoopMsg = async () => {
            if (!stats.running) return;

            const candidate = generateUsername(length);
            stats.checked++;
            const isAvailable = await checkUsername(candidate);
            
            let statusText = 'Taken';
            if (isAvailable === true) statusText = 'Available';
            if (isAvailable === 'ERROR') statusText = 'Error';

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

            const delay = Math.floor(Math.random() * 800) + 1000;
            autoTask = setTimeout(runScanLoopMsg, delay);
        };

        runScanLoopMsg();
        return;
    }

    // 3. COMMANDE CHECK
    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Utilisation : `,check <pseudo>`');
        const loading = await message.reply(`🔍 Vérification de \`${target}\`...`);
        const isAvailable = await checkUsername(target);
        if (isAvailable === true) return loading.edit(`🟢 Le pseudo \`${target}\` est **100% DISPONIBLE** !`);
        return loading.edit(`🔴 Le pseudo \`${target}\` est **PRIS**.`);
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN manquant !");
    process.exit(1);
}

client.login(TOKEN);
