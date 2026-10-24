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
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = ',';
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

// Vérification directe depuis l'IP de ta box
async function checkUsername(username) {
    try {
        const response = await axios.post('https://discord.com/api/v9/unique-username/username-attempt-unauthed', 
            { username: username },
            {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'fr-FR,fr;q=0.9',
                    'Origin': 'https://discord.com',
                    'Referer': 'https://discord.com/'
                }
            }
        );

        if (response.data && typeof response.data.taken !== 'undefined') {
            if (response.data.taken === false) {
                return true; // Libre
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
        return 'ERROR';
    }
}

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
            { name: 'FLUX EN DIRECT', value: liveLogText, inline: false },
            { name: 'BASE DE DONNÉES', value: `Pépites sauvées: \`${db.savedUsernames.length}\``, inline: true }
        )
        .setFooter({ text: 'K2L Scanner Engine • Mode Local Résidentiel' })
        .setTimestamp();

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

    return { embeds: [embed], components: [buttons] };
}

client.once('ready', () => {
    console.log(`✅ K2L Scanner est connecté sur ton PC : ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    try {
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

                    const delay = Math.floor(Math.random() * 1500) + 1500;
                    autoTask = setTimeout(runScanLoop, delay);
                };

                runScanLoop();
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

    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 K2L SCANNER - GUIDE DES COMMANDES')
            .setDescription('Voici les commandes disponibles :')
            .addFields(
                { name: '🚀 `,auto <longueur>`', value: 'Lance le scanner automatique et affiche le tableau de bord.' },
                { name: '🛑 `,auto off`', value: 'Arrête le scanner en cours.' },
                { name: '🔍 `,check <pseudo>`', value: 'Vérifie un pseudo spécifique.' }
            )
            .setColor('#5865F2');
        return message.reply({ embeds: [helpEmbed] });
    }

    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();
        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) { clearTimeout(autoTask); autoTask = null; stats.running = false; }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner arrêté.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) return message.reply('❌ Utilisation : `,auto <longueur>` (ex: `,auto 4`)');

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

            const delay = Math.floor(Math.random() * 1500) + 1500;
            autoTask = setTimeout(runScanLoopMsg, delay);
        };

        runScanLoopMsg();
        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Utilisation : `,check <pseudo>`');
        const loading = await message.reply(`🔍 Vérification de \`${target}\`...`);
        const isAvailable = await checkUsername(target);
        if (isAvailable === true) return loading.edit(`🟢 Le pseudo \`${target}\` est **100% DISPONIBLE** !`);
        return loading.edit(`🔴 Le pseudo \`${target}\` est **PRIS**.`);
    }
});

// Mets ton TOKEN Discord ici
client.login("TON_DISCORD_TOKEN_ICI");
