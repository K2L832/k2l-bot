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
const { HttpsProxyAgent } = require('https-proxy-agent');

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
                    <p>Discord Username Checker • 24/7 Service</p>
                    <div class="status">● ONLINE ON RENDER</div>
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

// 4. MOTEUR DE PROXIES
let proxyList = [];
let currentProxyIndex = 0;

async function fetchFreeProxies() {
    try {
        const res = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all');
        if (res.data) {
            const raw = res.data.split('\r\n').filter(p => p.trim() !== '');
            if (raw.length > 0) {
                proxyList = raw;
            }
        }
    } catch (err) {}
}

function getNextProxyAgent() {
    if (proxyList.length === 0) return null;
    const proxyUrl = `http://${proxyList[currentProxyIndex]}`;
    currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
    try {
        return new HttpsProxyAgent(proxyUrl);
    } catch (e) {
        return null;
    }
}

fetchFreeProxies();
setInterval(fetchFreeProxies, 15 * 60 * 1000);

// 5. ÉTAT GLOBAL
let autoTask = null;
let liveMessage = null;
let antiRaidActive = false;
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

async function checkUsernameWithProxy(username) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15'
    ];
    const agent = getNextProxyAgent();

    const config = {
        timeout: 4000,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
            'Accept': 'application/json'
        }
    };

    if (agent) {
        config.httpsAgent = agent;
        config.httpAgent = agent;
    }

    try {
        const response = await axios.post('https://discord.com/api/v9/unique-username/username-attempt-unauthed', 
            { username: username },
            config
        );

        if (response.data && typeof response.data.taken !== 'undefined') {
            if (response.data.taken === false) {
                return true;
            } else {
                stats.taken++;
                return false;
            }
        }
        stats.taken++;
        return false;
    } catch (err) {
        try {
            const fallbackResponse = await axios.post('https://discord.com/api/v9/unique-username/username-attempt-unauthed', 
                { username: username },
                { timeout: 3000 }
            );
            if (fallbackResponse.data && fallbackResponse.data.taken === false) return true;
            stats.taken++;
            return false;
        } catch (e) {
            stats.failed++;
            return 'RATELIMIT';
        }
    }
}

// 6. DASHBOARD EMBED ULTRA CLEAN (DESIGN SOBRE ET PRO)
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let statusBadge = '`🔴 Taken`';
            if (item.status === 'Available') statusBadge = '`🟢 AVAILABLE`';
            if (item.status === 'RateLimit') statusBadge = '`⚠️ Retry`';
            return `\`${item.username.padEnd(8, ' ')}\` ─ ${statusBadge}`;
        }).join('\n')
        : '`[En attente de démarrage]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('USERNAME CHECKER')
        .setColor(stats.running ? '#2ecc71' : '#1f2638')
        .addFields(
            { 
                name: 'STATUT', 
                value: stats.running ? '🟢 **RUNNING**' : '🔴 **STOPPED**', 
                inline: true 
            },
            { 
                name: 'VITESSE', 
                value: `\`${speed} req/s\``, 
                inline: true 
            },
            { 
                name: 'TAILLE', 
                value: `\`${stats.length} car.\``, 
                inline: true 
            },
            { 
                name: 'MÉTRIQUES SCAN', 
                value: `\`\`\`yaml\nChecked:   ${stats.checked}\nHits:      ${stats.available}\nTaken:     ${stats.taken}\nFailed:    ${stats.failed}\n\`\`\``, 
                inline: false 
            },
            { 
                name: 'LIVE STREAM', 
                value: liveLogText, 
                inline: false 
            },
            { 
                name: 'BASE DE DONNÉES', 
                value: `Hits enregistrés: \`${db.savedUsernames.length}\``, 
                inline: true 
            },
            { 
                name: 'ANTI-RAID', 
                value: antiRaidActive ? '`ENABLED`' : '`DISABLED`', 
                inline: true 
            }
        )
        .setFooter({ text: 'K2L Engine • Discord Scanner' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('Navigation...')
            .addOptions([
                { label: 'Scanner & Control', value: 'cat_scan' },
                { label: 'Saved Hits', value: 'cat_hits' },
                { label: 'Security & Anti-Raid', value: 'cat_mod' },
                { label: 'System Telemetry', value: 'cat_sys' }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? 'Stop' : 'Start')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('Check 1')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot prêt : ${client.user.tag}`);
    client.user.setActivity('OG Usernames', { type: 3 });
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];
            if (val === 'cat_scan') return interaction.reply({ content: '• Cliquez sur **Start** pour lancer la session de scan.', ephemeral: true });
            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n') : 'Aucun hit enregistré.';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('SAVED HITS').setDescription(list).setColor('#1f2638')], ephemeral: true });
            }
            if (val === 'cat_mod') return interaction.reply({ content: '• Commandes : `,antiraid <on/off>`, `,clear <1-100>`', ephemeral: true });
            if (val === 'cat_sys') {
                const uptime = Math.floor(process.uptime() / 60);
                const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                return interaction.reply({ content: `\`\`\`yaml\nUptime:  ${uptime} min\nRAM:     ${mem} MB\nProxies: ${proxyList.length}\n\`\`\``, ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') return interaction.update(buildMainDashboard());
            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder().setCustomId('modal_check_single').setTitle('Check Target');
                const input = new TextInputBuilder().setCustomId('input_username').setLabel('Username').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder().setCustomId('modal_start_scan').setTitle('Start Run');
                const input = new TextInputBuilder().setCustomId('input_length').setLabel('Length (2-32)').setStyle(TextInputStyle.Short).setValue('4').setRequired(true);
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
                const res = await checkUsernameWithProxy(target);
                if (res === true) return interaction.editReply(`🟢 \`${target}\` est **AVAILABLE** !`);
                return interaction.editReply(`🔴 \`${target}\` est **TAKEN**.`);
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

                await interaction.reply({ content: `🚀 Scanner démarré pour **${len}** caractères.`, ephemeral: true });
                liveMessage = await interaction.channel.send(buildMainDashboard());

                const runProxyLoop = async () => {
                    if (!stats.running) return;

                    const candidate = generateUsername(len);
                    stats.checked++;
                    const res = await checkUsernameWithProxy(candidate);
                    
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
                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🟢 **HIT FOUND: \`${candidate}\`**` });
                    }

                    if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

                    const delay = Math.floor(Math.random() * 2000) + 2500;
                    autoTask = setTimeout(runProxyLoop, delay);
                };

                runProxyLoop();
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
        stats.taken = 0;
        stats.failed = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **Scanner démarré** (${length} caractères).`);
        liveMessage = await message.channel.send(buildMainDashboard());

        const runProxyLoopMsg = async () => {
            if (!stats.running) return;

            const candidate = generateUsername(length);
            stats.checked++;
            const res = await checkUsernameWithProxy(candidate);
            
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
                await message.channel.send({ content: `<@${message.author.id}> 🟢 **HIT FOUND: \`${candidate}\`**` });
            }

            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});

            const delay = Math.floor(Math.random() * 2000) + 2500;
            autoTask = setTimeout(runProxyLoopMsg, delay);
        };

        runProxyLoopMsg();
        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Usage : `,check pseudo`');
        const loading = await message.reply(`🔍 Verification...`);
        const res = await checkUsernameWithProxy(target);
        if (res === true) return loading.edit(`🟢 \`${target}\` est **AVAILABLE** !`);
        return loading.edit(`🔴 \`${target}\` est **TAKEN**.`);
    }

    if (command === 'lookup' || command === 'hits') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucun hit.');
        const list = db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('SAVED HITS').setDescription(list).setColor('#1f2638')] });
    }

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply("❌ Permission requise.");
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) return message.reply("❌ Entre 1 et 100.");
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
