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
const https = require('https');

// 1. SERVEUR WEB EXPRESS (KEEP-ALIVE RENDER 24/7)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>K2L Checker Engine</title>
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
                    <h1>K2L Pro Engine</h1>
                    <p>Discord Username Checker • Service 24/7</p>
                    <div class="status">● EN LIGNE SUR RENDER</div>
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
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

// 4. AGENT HTTPS & HEADERS DISCORD LÉGITIMES
const customHttpsAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false
});

// 5. ÉTAT GLOBAL
let autoTask = null;
let liveMessage = null;
let antiRaidActive = false;

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

// VÉRIFICATION VIA L'API OFFICIELLE AVEC FINGERPRINTING DISCORD
async function checkUsernameOnDiscord(username) {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    
    // Génération des propriétés de super-client pour éviter le blocage Cloudflare/API
    const superProperties = Buffer.from(JSON.stringify({
        os: "Windows",
        browser: "Chrome",
        device: "",
        system_locale: "fr-FR",
        browser_user_agent: userAgent,
        browser_version: "124.0.0.0",
        os_version: "10",
        release_channel: "stable",
        client_build_number: 284459,
        client_event_source: null
    })).toString('base64');

    try {
        const response = await axios.post('https://discord.com/api/v9/unique-username/username-attempt-unauthed', 
            { username: username },
            {
                timeout: 5000,
                httpsAgent: customHttpsAgent,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': userAgent,
                    'Accept': '*/*',
                    'Accept-Language': 'fr-FR,fr;q=0.9',
                    'Origin': 'https://discord.com',
                    'Referer': 'https://discord.com/',
                    'X-Super-Properties': superProperties,
                    'X-Discord-Locale': 'fr'
                }
            }
        );

        if (response.data && typeof response.data.taken !== 'undefined') {
            if (response.data.taken === false) {
                return true; // Disponible
            } else {
                stats.taken++;
                return false; // Pris
            }
        }
        stats.taken++;
        return false;
    } catch (err) {
        if (err.response && err.response.data && err.response.data.taken === true) {
            stats.taken++;
            return false;
        }
        stats.failed++;
        return 'RATELIMIT';
    }
}

// 6. TABLEAU DE BORD EMBED EN FRANÇAIS
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let statusBadge = '`🔴 Pris`';
            if (item.status === 'Available') statusBadge = '`🟢 DISPONIBLE`';
            if (item.status === 'RateLimit') statusBadge = '`⚠️ Erreur`';
            return `\`${item.username.padEnd(8, ' ')}\` ─ ${statusBadge}`;
        }).join('\n')
        : '`[En attente de démarrage...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('VÉRIFICATEUR DE PSEUDOS')
        .setColor(stats.running ? '#2ecc71' : '#1f2638')
        .addFields(
            { 
                name: 'STATUT', 
                value: stats.running ? '🟢 **EN COURS**' : '🔴 **ARRÊTÉ**', 
                inline: true 
            },
            { 
                name: 'VITESSE', 
                value: `\`${speed} req/s\``, 
                inline: true 
            },
            { 
                name: 'LONGUEUR', 
                value: `\`${stats.length} car.\``, 
                inline: true 
            },
            { 
                name: 'MÉTRIQUES DU SCAN', 
                value: `\`\`\`yaml\nAnalysés:  ${stats.checked}\nLibres:    ${stats.available}\nPris:      ${stats.taken}\nErreurs:   ${stats.failed}\n\`\`\``, 
                inline: false 
            },
            { 
                name: 'FLUX EN DIRECT', 
                value: liveLogText, 
                inline: false 
            },
            { 
                name: 'BASE DE DONNÉES', 
                value: `Pépites sauvées: \`${db.savedUsernames.length}\``, 
                inline: true 
            },
            { 
                name: 'ANTI-RAID', 
                value: antiRaidActive ? '`ACTIVÉ`' : '`DÉSACTIVÉ`', 
                inline: true 
            }
        )
        .setFooter({ text: 'K2L Engine • Scanner Discord Pro' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('Navigation...')
            .addOptions([
                { label: 'Scanner & Contrôle', value: 'cat_scan' },
                { label: 'Pépites Enregistrées', value: 'cat_hits' },
                { label: 'Sécurité & Anti-Raid', value: 'cat_mod' },
                { label: 'Télémetrie Système', value: 'cat_sys' }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? 'Arrêter' : 'Démarrer')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('Check 1')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('Actualiser')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot prêt : ${client.user.tag}`);
    client.user.setActivity('Scanner de Pseudos', { type: 3 });
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];
            if (val === 'cat_scan') return interaction.reply({ content: '• Cliquez sur **Démarrer** pour lancer le scan.', ephemeral: true });
            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n') : 'Aucune pépite enregistrée.';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('PÉPITES DISCORD').setDescription(list).setColor('#1f2638')], ephemeral: true });
            }
            if (val === 'cat_mod') return interaction.reply({ content: '• Commandes : `,antiraid <on/off>`, `,clear <1-100>`', ephemeral: true });
            if (val === 'cat_sys') {
                const uptime = Math.floor(process.uptime() / 60);
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                return interaction.reply({ content: `\`\`\`yaml\nUptime:  ${uptime} min\nRAM:     ${mem} MB\n\`\`\``, ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Vérifier un pseudo');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Pseudo Discord').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Paramètres du Scanner');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Longueur (2-32)').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
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
                const res = await checkUsernameOnDiscord(target);
                if (res === true) return interaction.editReply(`🟢 Le pseudo \`${target}\` est **DISPONIBLE** !`);
                return interaction.editReply(`🔴 Le pseudo \`${target}\` est **PRIS**.`);
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) return interaction.reply({ content: '❌ Longueur invalide.', ephemeral: true });

                if (autoTask) clearTimeout(autoTask);
                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.taken = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Scanner démarré pour des pseudos de **${len}** caractères.`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                const runLoop = async () => {
                    if (!stats.running) return;

                    const candidate = generateUsername(len);
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
                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🟢 **PÉPITE TROUVÉE : \`${candidate}\`**` });
                    }

                    if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

                    const delay = Math.floor(Math.random() * 2000) + 3000;
                    autoTask = setTimeout(runLoop, delay);
                };

                runLoop();
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

    // COMMANDE HELP : Affiche la liste complète des commandes en français
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 LISTE DES COMMANDES - K2L BOT')
            .setDescription('Voici la liste de toutes les commandes disponibles :')
            .addFields(
                { name: '🔍 Scanner & Pseudos', value: '`,auto <longueur>` : Lance le scanner automatique et affiche le tableau de bord.\n`,auto off` : Arrête le scanner en cours.\n`,check <pseudo>` : Vérifie un pseudo spécifique instantanément.\n`,hits` (ou `,lookup`) : Affiche la liste des pépites enregistrées.' },
                { name: '🛡️ Modération & Utilitaires', value: '`,clear <1-100>` : Supprime un nombre de messages.\n`,antiraid <on/off>` : Active ou désactive l\'anti-raid (kick les comptes de moins de 3 jours).\n`,kick <@membre>` : Expulse un membre.\n`,ban <@membre>` : Banni un membre.\n`,lock` / `,unlock` : Verrouille ou déverrouille le salon.' },
                { name: '📊 Système', value: '`,help` : Affiche ce message d\'aide.' }
            )
            .setColor('#5865F2')
            .setFooter({ text: 'K2L System • Aide' });

        return message.reply({ embeds: [helpEmbed] });
    }

    // COMMANDE AUTO : Lance le scanner et affiche le panel
    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner arrêté.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) {
            return message.reply('❌ Utilisation : `,auto <longueur>` (ex: `,auto 4`) ou `,auto off`');
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

        await message.reply(`🚀 **Scanner démarré** pour des pseudos de **${length}** caractères.`);
        liveMessage = await message.channel.send(buildMainDashboard());

        const runLoopMsg = async () => {
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
                await message.channel.send({ content: `<@${message.author.id}> 🟢 **PÉPITE TROUVÉE : \`${candidate}\`**` });
            }

            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

            const delay = Math.floor(Math.random() * 2000) + 3000;
            autoTask = setTimeout(runLoopMsg, delay);
        };

        runLoopMsg();
        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Utilisation : `,check <pseudo>`');
        const loading = await message.reply(`🔍 Vérification en cours...`);
        const res = await checkUsernameOnDiscord(target);
        if (res === true) return loading.edit(`🟢 Le pseudo \`${target}\` est **DISPONIBLE** !`);
        return loading.edit(`🔴 Le pseudo \`${target}\` est **PRIS**.`);
    }

    if (command === 'lookup' || command === 'hits') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucune pépite enregistrée.');
        const list = db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('PÉPITES ENREGISTRÉES').setDescription(list).setColor('#1f2638')] });
    }

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply("❌ Permission requise.");
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) return message.reply("❌ Entrez un nombre entre 1 et 100.");
        await message.channel.bulkDelete(count + 1, true).catch(() => {});
        const msg = await message.channel.send(`🧹 **${count}** messages supprimés.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN manquant.");
    process.exit(1);
}

client.login(TOKEN);
