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
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVEUR WEB EXPRESS (RENDER KEEP-ALIVE)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send(`
        <html>
            <head><title>K2L Munky Live Checker</title></head>
            <body style="font-family: sans-serif; background: #0f0f13; color: #fff; text-align: center; padding-top: 50px;">
                <h1>🐒 K2L Munky Live Checker is ONLINE</h1>
                <p>Status: Running 24/7 on Render</p>
            </body>
        </html>
    `);
});

// Important : Écoute explicite sur 0.0.0.0 pour Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [EXPRESS] Serveur Web Keep-Alive actif sur le port ${PORT}`);
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
// 3. GESTION DE LA BASE DE DONNÉES LOCALE
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
        console.error('⚠️ Erreur lecture BDD, réinitialisation temporaire :', e.message);
        return { savedUsernames: [], settings: { antiRaid: false }, logs: [] };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('❌ Erreur écriture BDD :', e.message);
    }
}

// ==========================================
// 4. ÉTAT GLOBAL ET TÉLÉMÉTRIE LIVE
// ==========================================
let autoTask = null;
let liveMessage = null; // Référence vers l'embed Discord qui s'actualise en direct
let antiRaidActive = false;

let stats = {
    running: false,
    length: 4,
    checked: 0,
    available: 0,
    failed: 0,
    startTime: null,
    recentChecks: [], // Garde les 6 derniers pseudos testés
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

// Requête directe vers l'API d'InstantUsername
async function checkUsernameOnSite(username) {
    try {
        const response = await axios.get(`https://instantusername.com/api/check?username=${encodeURIComponent(username)}&service=discord`, {
            timeout: 6000,
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
        return null; // Null indique une erreur de réseau ou de timeout
    }
}

// ==========================================
// 5. CONSTRUCTEUR DU DASHBOARD DYNAMIQUE
// ==========================================
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    // Formatage de la liste de télémesure en temps réel
    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => {
            let icon = '🔴';
            if (item.status === 'Available') icon = '🟢';
            if (item.status === 'Error') icon = '⚠️';
            return `${icon} \`${item.username}\` ── **${item.status}**`;
        }).join('\n')
        : '`[Attente du lancement du scan...]`';

    const db = loadDatabase();

    const embed = new EmbedBuilder()
        .setTitle('🐒 MUNKY CHECKER - K2L Live Dashboard')
        .setDescription('**Système de vérification & scan de pseudos OG en temps réel**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **CHECKED** : \`${stats.checked}\` | **AVAILABLE** : \`${stats.available}\` | **ERRORS** : \`${stats.failed}\`\n• **VITESSE** : \`${speed} req/s\` | **TAILLE** : \`${stats.length} car.\`\n• **STATUT** : ${stats.running ? '🟢 **SCAN EN COURS**' : '🔴 **INACTIF**'}\n• **Dernière Pépite** : \`${stats.lastHit}\``, 
                inline: false 
            },
            {
                name: '📡 Flux en direct (Dernières requêtes instantusername.com)',
                value: liveLogText,
                inline: false
            },
            {
                name: '📁 Base de Données',
                value: `• Pseudos sauvegardés : \`${db.savedUsernames.length}\``,
                inline: true
            },
            {
                name: '🛡️ Protection',
                value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`,
                inline: true
            }
        )
        .setColor(stats.running ? '#2ECC71' : '#5865F2')
        .setFooter({ text: 'K2L Live System • Direct InstantUsername API Connection' })
        .setTimestamp();

    // Menu déroulant par catégories
    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('📂 Choisir une catégorie d\'options...')
            .addOptions([
                { label: '🔍 Live Checker & Scan', description: 'Gérer le scan et le flux en direct', value: 'cat_scan', emoji: '🔍' },
                { label: '📂 Base de Données / Hits', description: 'Voir la liste des pseudos trouvés et enregistrés', value: 'cat_hits', emoji: '📁' },
                { label: '🛡️ Modération & Sécurité', description: 'Anti-raid, purge, kick, ban, lock/unlock', value: 'cat_mod', emoji: '🛡️' },
                { label: '📊 Télémetrie Système', description: 'Statistiques avancées du serveur et du bot', value: 'cat_sys', emoji: '📊' }
            ])
    );

    // Boutons de contrôle rapide
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

// Événement Démarrage du Bot
client.once('ready', () => {
    console.log(`✅ [DISCORD] Bot connecté avec succès sous le nom : ${client.user.tag}`);
    client.user.setActivity('OG Usernames | ,help', { type: 3 }); // Watching
});

// ==========================================
// 6. SÉCURITÉ ANTI-RAID
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    
    // Détecte les comptes créés il y a moins de 3 jours
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try {
            await member.send(`⚠️ Tu as été expulsé de **${member.guild.name}** car le mode Anti-Raid est actif et ton compte est trop récent.`);
        } catch (e) {}
        try {
            await member.kick('Mode Anti-Raid actif : Compte trop récent (< 3 jours).');
            console.log(`🛡️ [ANTI-RAID] Membre expulsé : ${member.user.tag}`);
        } catch (e) {
            console.error(`❌ Erreur expulsion Anti-Raid :`, e.message);
        }
    }
});

// ==========================================
// 7. GESTION DES INTERACTIONS (BOUTONS, MENUS, MODALS)
// ==========================================
client.on('interactionCreate', async (interaction) => {
    try {
        // A. MENUS DÉROULANTS
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
            const val = interaction.values[0];

            if (val === 'cat_scan') {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Mode Scanner en direct')
                    .setDescription('• Cliquez sur **🚀 Lancer Live Scan** pour ouvrir un formulaire et définir la taille des pseudos à scanner en boucle.\n• Cliquez sur **🔍 Check 1 Pseudo** pour tester un nom d\'utilisateur immédiatement.')
                    .setColor('#3498DB');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_hits') {
                const db = loadDatabase();
                const list = db.savedUsernames.length > 0 
                    ? db.savedUsernames.slice(-15).reverse().map(i => `• \`${i.username}\` ── *(enregistré le ${new Date(i.timestamp).toLocaleDateString()} à ${new Date(i.timestamp).toLocaleTimeString()})*`).join('\n')
                    : 'Aucun pseudo disponible sauvegardé pour le moment.';

                const embed = new EmbedBuilder()
                    .setTitle('📂 Base de Données - Pépites Détectées')
                    .setDescription(list)
                    .setColor('#F1C40F');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_mod') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Panneau de Modération')
                    .setDescription('Commandes d\'administration à saisir dans le tchat :\n\n• `,antiraid <on/off>` : Active ou désactive l\'éjection des comptes récents.\n• `,clear <1-100>` : Supprime un paquet de messages.\n• `,kick <@membre>` : Expulse un membre.\n• `,ban <@membre>` : Bannit un membre.\n• `,lock` / `,unlock` : Verrouille ou déverrouille le salon actuel.')
                    .setColor('#E74C3C');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (val === 'cat_sys') {
                const uptime = Math.floor(client.uptime / 1000);
                const embed = new EmbedBuilder()
                    .setTitle('📊 Télémetrie & Performances')
                    .addFields(
                        { name: 'Uptime Bot', value: `\`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s\``, inline: true },
                        { name: 'Total Scannés', value: `\`${stats.checked}\``, inline: true },
                        { name: 'Hits Réussis', value: `\`${stats.available}\``, inline: true },
                        { name: 'Erreurs API Network', value: `\`${stats.failed}\``, inline: true },
                        { name: 'Serveurs', value: `\`${client.guilds.cache.size}\``, inline: true },
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
                    .setTitle('Check rapide de pseudo');

                const input = new TextInputBuilder()
                    .setCustomId('input_username')
                    .setLabel('Entrez le pseudo à vérifier :')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: k2l_master')
                    .setRequired(true)
                    .setMaxLength(32);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_start_scan') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_start_scan')
                    .setTitle('Démarrer le Live Scanner');

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

        // C. SOUMISSION DES MODALS (FORMULAIRES)
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_check_single') {
                const target = interaction.fields.getTextInputValue('input_username').toLowerCase().trim();
                await interaction.deferReply({ ephemeral: true });

                const isAvailable = await checkUsernameOnSite(target);

                if (isAvailable === true) {
                    return interaction.editReply(`🎉 Le pseudo \`${target}\` est **DISPONIBLE / DISCORD OG** !`);
                } else if (isAvailable === false) {
                    return interaction.editReply(`❌ Le pseudo \`${target}\` est **DÉJÀ PRIS**.`);
                } else {
                    return interaction.editReply(`⚠️ Impossible de vérifier \`${target}\` pour le moment (Erreur réseau/API).`);
                }
            }

            if (interaction.customId === 'modal_start_scan') {
                const len = parseInt(interaction.fields.getTextInputValue('input_length'));
                if (!len || isNaN(len) || len < 2 || len > 32) {
                    return interaction.reply({ content: '❌ Longueur invalide ! Choisissez un chiffre entre 2 et 32.', ephemeral: true });
                }

                if (autoTask) clearInterval(autoTask);

                stats.running = true;
                stats.length = len;
                stats.checked = 0;
                stats.available = 0;
                stats.failed = 0;
                stats.startTime = Date.now();
                stats.recentChecks = [];

                await interaction.reply({ content: `🚀 Scanner Live lancé pour des pseudos de **${len}** caractères !`, ephemeral: true });

                // Création du message qui servira de Dashboard dynamique mis à jour en direct
                liveMessage = await interaction.channel.send(buildMainDashboard());

                autoTask = setInterval(async () => {
                    const candidate = generateUsername(len);
                    stats.checked++;

                    const isAvailable = await checkUsernameOnSite(candidate);
                    let statusText = 'Taken';
                    if (isAvailable === true) statusText = 'Available';
                    if (isAvailable === null) statusText = 'Error';

                    // Met à jour la pile des 6 derniers pseudos testés
                    stats.recentChecks.unshift({ username: candidate, status: statusText });
                    if (stats.recentChecks.length > 6) stats.recentChecks.pop();

                    // Si une pépite est trouvée !
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
                            .setDescription(`Un pseudo libre a été trouvé en direct !\n\n✨ Pseudo : \`${candidate}\``)
                            .setColor('#2ECC71')
                            .setTimestamp();

                        await interaction.channel.send({ content: `<@${interaction.user.id}> 🚨 **HIT DÉTECTÉ !**`, embeds: [alertEmbed] });
                    }

                    // Mise à jour continue de l'embed principal
                    if (liveMessage) {
                        liveMessage.edit(buildMainDashboard()).catch(() => {});
                    }
                }, 3500); // Exécution toutes les 3.5 secondes pour respecter les limites de rate-limit
            }
        }
    } catch (err) {
        console.error('❌ Erreur lors du traitement d\'une interaction :', err);
    }
});

// ==========================================
// 8. COMMANDES TEXTE (PREFIX ,)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Commande HELP / PANEL / DASHBOARD
    if (command === 'help' || command === 'panel' || command === 'dashboard') {
        liveMessage = await message.reply(buildMainDashboard());
        return;
    }

    // Commande AUTO (Lancement direct en mode texte)
    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off' || subAction === 'stop') {
            if (autoTask) {
                clearInterval(autoTask);
                autoTask = null;
                stats.running = false;
            }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scanner automatique arrêté avec succès.**');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) {
            return message.reply('❌ **Usage correct :** `,auto <longueur (2-32)>` ou `,auto off`');
        }

        if (autoTask) clearInterva
