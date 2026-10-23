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

// ==========================================
// 1. SERVEUR WEB EXPRESS (KEEP-ALIVE RENDER 24/7)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>K2L Munky Live Checker</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f0f13; color: #fff; text-align: center; padding-top: 50px; }
                    .card { background: #1a1a24; display: inline-block; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                    h1 { color: #5865F2; margin-bottom: 10px; }
                    p { color: #b9bbbe; font-size: 1.1em; }
                    .status { display: inline-block; padding: 6px 12px; background: #2ecc71; color: #fff; border-radius: 20px; font-weight: bold; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>🐒 K2L Munky Live Checker</h1>
                    <p>Système d'analyse de pseudos OG Discord en temps réel</p>
                    <div class="status">🟢 ONLINE 24/7 ON RENDER</div>
                </div>
            </body>
        </html>
    `);
});

// Écoute obligatoire sur 0.0.0.0 pour les conteneurs Cloud comme Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [EXPRESS] Serveur Web Keep-Alive actif sur http://0.0.0.0:${PORT}`);
});

// ==========================================
// 2. INITIALISATION CLIENT DISCORD
// ==========================================
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

// ==========================================
// 3. BASE DE DONNÉES LOCALE PERSISTANTE (JSON)
// ==========================================
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = { savedUsernames: [], settings: { antiRaid: false }, logs: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('⚠️ [BDD] Erreur de lecture, réinitialisation temporaire :', e.message);
        return { savedUsernames: [], settings: { antiRaid: false }, logs: [] };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('❌ [BDD] Erreur d\'écriture :', e.message);
    }
}

// ==========================================
// 4. ÉTAT GLOBAL & TÉLÉMÉTRIE DU SCANNER
// ==========================================
let autoTask = null;
let liveMessage = null; // Message Discord mis à jour automatiquement
let antiRaidActive = false;

let stats = {
    running: false,
    length: 4,
    checked: 0,
    available: 0,
    failed: 0,
    startTime: null,
    recentChecks: [], // Stocke les 8 derniers pseudos testés en direct
    lastHit: 'Aucun'
};

// Générateur de pseudonymes aléatoires
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Vérification auprès de l'API InstantUsername
async function checkUsernameOnSite(username) {
    try {
        const response = await axios.get(`https://instantusername.com/api/check?username=${encodeURIComponent(username)}&service=discord`, {
            timeout: 5000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://instantusername.com/',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.data && typeof response.data.available !== 'undefined') {
            return response.data.available === true;
        }
        return false;
    } catch (err) {
        stats.failed++;
        return null;
    }
}

// ==========================================
// 5. CONSTRUCTEUR DE L'EMBED DASHBOARD ULTRA-CLEAN
// ==========================================
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    // Formatage du flux en direct avec icônes
    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let icon = '🔴';
            let label = 'Pris / Indisponible';
            if (item.status === 'Available') { icon = '🟢'; label = 'DISPONIBLE / LIBRE !'; }
            if (item.status === 'Error') { icon = '⚠️'; label = 'Erreur Réseau/API'; }
            return `${icon} \`${item.username}\` ── **${label}**`;
        }).join('\n')
        : '`[Scan en attente de lancement...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('🐒 MUNKY CHECKER - K2L Live Dashboard')
        .setDescription('**Système de surveillance & scan de pseudos OG en temps réel**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **Pseudos Scannés** : \`${stats.checked}\`\n• **Pépites Trouvées** : \`${stats.available}\`\n• **Erreurs API** : \`${stats.failed}\`\n• **Vitesse de Scan** : \`${speed} req/s\`\n• **Taille Choisie** : \`${stats.length} car.\`\n• **Statut** : ${stats.running ? '🟢 **SCAN EN COURS EN TEMPS RÉEL**' : '🔴 **INACTIF**'}\n• **Dernier Hit** : \`${stats.lastHit}\``, 
                inline: false 
            },
            {
                name: '📡 Flux en direct (Actualisé en continu)',
                value: liveLogText,
                inline: false
            },
            {
                name: '📁 Base de Données',
                value: `• Pseudos sauvegardés : \`${db.savedUsernames.length}\``,
                inline: true
            },
            {
                name: '🛡️ Sécurité',
                value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`,
                inline: true
            }
        )
        .setColor(stats.running ? '#2ECC71' : '#5865F2')
        .setFooter({ text: 'K2L Live System • Connecté à InstantUsername API' })
        .setTimestamp();

    // Menu de sélection déroulant par catégories
    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('📂 Sélectionner une catégorie d\'options...')
            .addOptions([
                { label: '🔍 Live Checker & Scan', description: 'Gérer et surveiller le scan en direct', value: 'cat_scan', emoji: '🔍' },
                { label: '📂 Base de Données / Hits', description: 'Consulter tous les pseudos sauvegardés', value: 'cat_hits', emoji: '📁' },
                { label: '🛡️ Modération & Sécurité', description: 'Commandes de sécurité et nettoyage', value: 'cat_mod', emoji: '🛡️' },
                { label: '📊 Télémetrie Système', description: 'Performances du serveur et du bot', value: 'cat_sys', emoji: '📊' }
            ])
    );

    // Boutons de contrôle interactifs
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

// Bot prêt
client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot connecté : ${client.user.tag}`);
    client.user.setActivity('Pseudos OG | ,help', { type: 3 });
});

// ==========================================
// 6. SYSTÈME ANTI-RAID
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try {
            await member.send(`⚠️ Tu as été expulsé de **${member.guild.name}** car le mode Anti-Raid est actif (Compte < 3 jours).`);
        } catch (e) {}
        try {
            await member.kick('Mode Anti-Raid : Compte trop récents (< 3 jours).');
        } catch (e) {
            console.error('Erreur expulsion Anti-Raid :', e.message);
        }
    }
});

// ==========================================
// 7. GESTION DES INTERACTIONS (BOUTONS / MENUS / MODALS)
// ==========================================
client.on('interactionCreate', async (interaction) => {
    try {
        // A. MENUS DÉROULANTS
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];

            if (val === 'cat_scan') {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Contrôle du Scanner')
                    .setDescription('• **🚀 Lancer Live Scan** : Démarre la recherche automatique.\n• **🔍 Check 1 Pseudo** : Teste un nom d\'utilisateur précis.\n• **🛑 Arrêter le Scan** : Stoppe la boucle en cours.')
                    .setColor('#3498DB');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 
                    ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\` ── *(détecté le ${new Date(i.timestamp).toLocaleDateString()} à ${new Date(i.timestamp).toLocaleTimeString()})*`).join('\n')
                    : 'Aucun pseudo enregistré dans la base de données pour le moment.';

                const embed = new EmbedBuilder()
                    .setTitle('📂 Base de Données - Pépites Sauvées')
                    .setDescription(list)
                    .setColor('#F1C40F');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_mod') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Commandes de Modération')
                    .setDescription('• `,antiraid <on/off>` : Active/désactive l\'expulsion automatique.\n• `,clear <1-100>` : Supprime des messages dans le salon.\n• `,kick <@membre>` : Expulse un utilisateur.\n• `,ban <@membre>` : Bannit un utilisateur.\n• `,lock` / `,unlock` : Verrouille ou déverrouille le salon.')
                    .setColor('#E74C3C');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_sys') {
                const uptime = Math.floor(client.uptime / 1000);
                const embed = new EmbedBuilder()
                    .setTitle('📊 Télémetrie Système')
                    .addFields(
                        { name: 'Uptime', value: `\`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s\``, inline: true },
                        { name: 'Total Scannés', value: `\`${stats.checked}\``, inline: true },
                        { name: 'Pépites Trouvées', value: `\`${stats.available}\``, inline: true },
                        { name: 'Erreurs API', value: `\`${stats.failed}\``, inline: true },
                        { name: 'RAM Utilisée', value: `\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\``, inline: true }
                    )
                    .setColor('#9B59B6');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // B. BOUTONS
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_refresh_panel') {
                return interaction.update(buildMainDashboard());
            }

            if (interaction.customId === 'btn_check_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_check_single')
                    .setTitle('Check Rapide de Pseudo');

                const input = new TextInputBuilder()
                    .setCustomId('input_username')
                    .setLabel('Pseudo à vérifier :')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: dark_master')
                    .setRequired(true)
                    .setMaxLength(32);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_start_scan')
                    .setTitle('Démarrer le Scanner Live');

                const input = new TextInputBuilder()
                    .setCustomId('input_length')
                    .setLabel('Longueur des pseudos (2 à 32) :')
                    .setStyle(TextInputStyle.Short)
                    .setValue('4')
                    .setRequired(true)
                    .setMaxLength(2);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_stop_scan') {
                if (autoTask) {
                    clearInterval(autoTask);
                    autoTask = null;
                    stats.running = false;
                }
                return interaction.update(buildMainDashboard());
            }
        }

        // C. SOUMISSION DES FORMULAIRES (MODALS)
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_check_single') {
                const target = interaction.fields.getTextInputValue('input_username').toLowerCase().trim();
                await interaction.deferReply({ ephemeral: true });

                const isAvailable = await checkUsernameOnSite(target);

                if (isAvailable === true) {
                    return interaction.editReply(`🎉 Le pseudo \`${target}\` est **DISPONIBLE / OG DISCORD** !`);
                } else if (isAvailable === false) {
                    return interaction.editReply(`❌ Le pseudo \`${target}\` est **DÉJÀ PRIS**.`);
                } else {
                    return interaction.editReply(`⚠️ Impossible de vérifier \`${target}\` (Erreur d'accès à l'API).`);
                }
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) {
                    return interaction.reply({ content: '❌ Longueur invalide ! Choisissez entre 2 et 32.', ephemeral: true });
                }

                if (autoTask) clearInterval(autoTask);

                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Live Scanner démarré pour des pseudos de **${len}** caractères !`, ephemeral: true });

                liveMessage = await interaction.channel.send(buildMainDashboard());

                // SCANNE ET MET À JOUR LE MESSAGE TOUTES LES 2 SECONDES !
                autoTask = setInterval(async () => {
                    const candidate = generateUsername(len);
                    stats.checked++;

                    const isAvailable = await checkUsernameOnSite(candidate);
                    let statusText = 'Taken';
                    if (isAvailable === true) statusText = 'Available';
                    if (isAvailable === null) statusText = 'Error';

                    // Empile le dernier résultat en haut
                    stats.recentChecks.unshift({ username: candidate, status: statusText });
                    if (stats.recentChecks.length > 8) stats.recentChecks.pop();

                    // Si on trouve un pseudo libre !
                    if (isAvailable === true) {
                        stats.available++;
                        stats.lastHit = candidate;

                        const db = loadDatabase();
                        if (!db.savedUsernames.some(i => i.username === candidate)) {
                            db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                            saveDatabase(db);
                        }

                        const alertEmbed = new EmbedBuilder()
                            .setTitle('🎉 PÉPITE OG DISPONIBLE DÉTECTÉE !')
                            .setDescription(`Un pseudo libre a été identifié en direct !\n\n✨ Pseudo : \`${candidate}\``)
                            .setColor('#2ECC71')
                            .setTimestamp();

                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🚨 **HIT DÉTECTÉ EN DIRECT !**`, embeds: [alertEmbed] });
                    }

                    // Édition continue de l'embed principal
                    if (liveMessage) {
                        liveMessage.edit(buildMainDashboard()).catch(() => {});
                    }
                }, 2000);
            }
        }
    } catch (err) {
        console.error('❌ Erreur interaction :', err);
    }
});

// ==========================================
// 8. COMMANDES TEXTE (PREFIX ,)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Commandes HELP / PANEL / DASHBOARD
    if (command === 'help' || command === 'panel' || command === 'dashboard') {
        liveMessage = await message.reply(buildMainDashboard());
        return;
    }

    // Commande AUTO (Exemple: ,auto 4)
    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) {
                clearInterval(autoTask);
                autoTask = null;
                stats.running = false;
            }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            re
