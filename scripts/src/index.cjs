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

// --- 1. SERVEUR WEB (KEEP-ALIVE RENDER 24/7) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot K2L Munky Live Checker 24/7'));
app.listen(PORT, () => console.log(`🌐 Serveur Web actif sur le port ${PORT}`));

// --- 2. DISCORD CLIENT ---
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

// --- 3. BASE DE DONNÉES LOCALE JSON ---
const DB_FILE = path.join(__dirname, 'k2l_database.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ savedUsernames: [] }, null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { savedUsernames: [] };
    }
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// État & Télémetrie Live (Inspiré de Munky Checker)
let autoTask = null;
let liveMessage = null; // Message Discord qui s'actualise en direct
let antiRaidActive = false;

let stats = {
    running: false,
    length: 4,
    checked: 0,
    available: 0,
    failed: 0,
    startTime: null,
    recentChecks: [], // Liste des 6 derniers pseudos testés avec statut
    lastHit: 'Aucun'
};

// Générateur de pseudos aléatoires
function generateUsername(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Requête réelle vers l'API d'InstantUsername
async function checkUsernameOnSite(username) {
    try {
        const response = await axios.get(`https://instantusername.com/api/check?username=${username}&service=discord`, {
            timeout: 6000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://instantusername.com/'
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

// --- 4. CONSTRUCTEUR DU DASHBOARD INTERACTIF ---
function buildMainDashboard() {
    const elapsedSeconds = stats.startTime ? Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000)) : 1;
    const speed = (stats.checked / elapsedSeconds).toFixed(2);

    // Formatage de la liste "LIVE" style Munky Checker
    let liveLogText = stats.recentChecks.length > 0 
        ? stats.recentChecks.map(item => `${item.status === 'Available' ? '🟢' : '🔴'} \`${item.username}\` ── **${item.status}**`).join('\n')
        : '`Attente du premier test...`';

    const embed = new EmbedBuilder()
        .setTitle('🐒 MUNKY CHECKER - K2L Live Dashboard')
        .setDescription('**Système de recherche & vérification en temps réel via InstantUsername**')
        .addFields(
            { 
                name: '📊 Métriques Live', 
                value: `• **CHECKED** : \`${stats.checked}\` | **AVAILABLE** : \`${stats.available}\` | **SPEED** : \`${speed}/s\`\n• **STATUT** : ${stats.running ? '🟢 **LIVE**' : '🔴 **INACTIF**'}\n• **Dernière Pépite** : \`${stats.lastHit}\``, 
                inline: false 
            },
            {
                name: '📡 Flux en direct (Derniers Pseudos Testés sur le Site)',
                value: liveLogText,
                inline: false
            },
            {
                name: '📁 Base de Données',
                value: `• Pseudos sauvegardés : \`${loadDatabase().savedUsernames.length}\``,
                inline: true
            },
            {
                name: '🛡️ Protection',
                value: `• Anti-Raid : ${antiRaidActive ? '🟢 **Actif**' : '🔴 **Inactif**'}`,
                inline: true
            }
        )
        .setColor(stats.running ? '#2ECC71' : '#5865F2')
        .setFooter({ text: 'K2L Live System • Direct InstantUsername API' })
        .setTimestamp();

    // Menu déroulant par catégories
    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_category')
            .setPlaceholder('📂 Choisir une catégorie d\'options...')
            .addOptions([
                { label: '🔍 Live Checker & Scan', description: 'Gérer le scan et le flux en direct', value: 'cat_scan', emoji: '🔍' },
                { label: '📂 Base de Données / Hits', description: 'Voir la liste des pseudos trouvés', value: 'cat_hits', emoji: '📁' },
                { label: '🛡️ Modération & Sécurité', description: 'Anti-raid, purge, kick, ban, lock', value: 'cat_mod', emoji: '🛡️' },
                { label: '📊 Télémetrie Système', description: 'Statistiques détaillées', value: 'cat_sys', emoji: '📊' }
            ])
    );

    // Boutons
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(stats.running ? 'btn_stop_scan' : 'btn_start_scan')
            .setLabel(stats.running ? '🛑 Stop Scan' : '🚀 Démarrer Live Scan')
            .setStyle(stats.running ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_check_modal')
            .setLabel('🔍 Check 1 Pseudo')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_refresh_panel')
            .setLabel('🔄 Rafraîchir')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectMenu, buttons] };
}

client.once('clientReady', () => {
    console.log(`✅ BOT CONNECTÉ : ${client.user.tag}`);
});

// --- 5. PROTECTION ANTI-RAID ---
client.on('guildMemberAdd', async (member) => {
    if (!antiRaidActive) return;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        try {
            await member.kick('Mode Anti-Raid actif : Compte trop récent.');
        } catch (e) {}
    }
});

// --- 6. INTERACTIONS (MENUS, BOUTONS, MODALS) ---
client.on('interactionCreate', async (interaction) => {
    // A. MENUS DÉROULANTS
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_category') {
        const val = interaction.values[0];

        if (val === 'cat_scan') {
            const embed = new EmbedBuilder()
                .setTitle('🔍 Options de Vérification')
                .setDescription('• Le mode **Live Scan** teste en boucle les pseudos auprès du site et met à jour l\'embed en direct[span_5](start_span)[span_5](end_span)[span_6](start_span)[span_6](end_span).\n• Le bouton **Check 1 Pseudo** permet de tester un nom spécifique immédiatement[span_7](start_span)[span_7](end_span)[span_8](start_span)[span_8](end_span).')
                .setColor('#3498DB');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (val === 'cat_hits') {
            const db = loadDatabase();
            const list = db.savedUsernames.length > 0 
                ? db.savedUsernames.slice(-10).map(i => `• \`${i.username}\` *(trouvé le ${new Date(i.timestamp).toLocaleDateString()})*`).join('\n')
                : 'Aucun pseudo trouvé pour l\'instant.';

            const embed = new EmbedBuilder()
                .setTitle('📂 Base de Données - Pépites Sauvées')
                .setDescription(list)
                .setColor('#F1C40F');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (val === 'cat_mod') {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Commandes de Modération')
                .setDescription('• `,antiraid <on/off>`\n• `,clear <1-100>`\n• `,kick <@membre>`\n• `,ban <@membre>`\n• `,lock` / `,unlock`')
                .setColor('#E74C3C');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (val === 'cat_sys') {
            const embed = new EmbedBuilder()
                .setTitle('📊 Métriques Live')
                .addFields(
                    { name: 'Pseudos Vérifiés', value: `\`${stats.checked}\``, inline: true },
                    { name: 'Pépites Libres', value: `\`${stats.available}\``, inline: true },
                    { name: 'Erreurs API', value: `\`${stats.failed}\``, inline: true }
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
                .setTitle('Vérifier un pseudo sur le site');

            const input = new TextInputBuilder()
                .setCustomId('input_username')
                .setLabel('Pseudo à tester')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: pbavq0dfhb')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_start_scan') {
            const modal = new ModalBuilder()
                .setCustomId('modal_start_scan')
                .setTitle('Démarrer le Scanner Live');

            const input = new TextInputBuilder()
                .setCustomId('input_length')
                .setLabel('Taille des pseudos (2 à 32)')
                .setStyle(TextInputStyle.Short)
                .setValue('4')
                .setRequired(true);

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

    // C. MODALS
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_check_single') {
            const target = interaction.fields.getTextInputValue('input_username').toLowerCase();
            await interaction.deferReply({ ephemeral: true });

            const isAvailable = await checkUsernameOnSite(target);
            if (isAvailable === true) {
                return interaction.editReply(`🎉 Résultat du site pour \`${target}\` : **DISPONIBLE** sur Discord !`);
            } else if (isAvailable === false) {
                return interaction.editReply(`❌ Résultat du site pour \`${target}\` : **DÉJÀ PRIS**.`);
            } else {
                return interaction.editReply(`⚠️ Erreur lors du test auprès du site.`);
            }
        }

        if (interaction.customId === 'modal_start_scan') {
            const len = parseInt(interaction.fields.getTextInputValue('input_length'));
            if (!len || isNaN(len) || len < 2 || len > 32) {
                return interaction.reply({ content: '❌ Entrez un nombre valide entre 2 et 32.', ephemeral: true });
            }

            if (autoTask) clearInterval(autoTask);

            stats.running = true;
            stats.length = len;
            stats.checked = 0;
            stats.available = 0;
            stats.failed = 0;
            stats.startTime = Date.now();
            stats.recentChecks = [];

            await interaction.reply({ content: `🚀 Scanner Live démarré pour des pseudos de **${len}** caractères !`, ephemeral: true });

            // Envoie le message de dashboard initial qui sera édité en temps réel
            liveMessage = await interaction.channel.send(buildMainDashboard());

            autoTask = setInterval(async () => {
                const candidate = generateUsername(len);
                stats.checked++;

                const isAvailable = await checkUsernameOnSite(candidate);
                const statusText = isAvailable === true ? 'Available' : (isAvailable === false ? 'Taken' : 'Error');

                // Met à jour la liste des 6 derniers pseudos
                stats.recentChecks.unshift({ username: candidate, status: statusText });
                if (stats.recentChecks.length > 6) stats.recentChecks.pop();

                if (isAvailable === true) {
                    stats.available++;
                    stats.lastHit = candidate;

                    const db = loadDatabase();
                    if (!db.savedUsernames.some(i => i.username === candidate)) {
                        db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                        saveDatabase(db);
                    }

                    const alertEmbed = new EmbedBuilder()
                        .setTitle('🎉 PÉPITE DISPONIBLE DÉTECTÉE !')
                        .setDescription(`Un pseudo libre a été validé sur le site !\n\n✨ Pseudo : \`${candidate}\``)
                        .setColor('#2ECC71')
                        .setTimestamp();

                    await interaction.channel.send({ content: `<@${interaction.user.id}> 🚨 **PÉPITE TROUVÉE !**`, embeds: [alertEmbed] });
                }

                // Édition dynamique du message Dashboard en direct (Toutes les 4 secondes)
                if (liveMessage) {
                    liveMessage.edit(buildMainDashboard()).catch(() => {});
                }
            }, 4000);
        }
    }
});

// --- 7. COMMANDES TEXTE (PREFIX ,) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'help' || command === 'panel' || command === 'dashboard') {
        liveMessage = await message.reply(buildMainDashboard());
        return;
    }

    if (command === 'auto') {
        const subAction = args[0]?.toLowerCase();

        if (subAction === 'off') {
            if (autoTask) {
                clearInterval(autoTask);
                autoTask = null;
                stats.running = false;
            }
            if (liveMessage) liveMessage.edit(buildMainDashboard()).catch(() => {});
            return message.reply('🛑 **Scan automatique ARRÊTÉ**.');
        }

        const length = parseInt(subAction);
        if (!length || isNaN(length) || length < 2 || length > 32) {
            return message.reply('❌ **Usage :** `,auto <longueur>` ou `,auto off`');
        }

        if (autoTask) clearInterval(autoTask);

        stats.running = true;
        stats.length = length;
        stats.checked = 0;
        stats.available = 0;
        stats.startTime = Date.now();
        stats.recentChecks = [];

        await message.reply(`🚀 **Live Scanner démarré** pour **${length}** caractères.`);
        liveMessage = await message.channel.send(buildMainDashboard());

        autoTask = setInterval(async () => {
            const candidate = generateUsername(length);
            stats.checked++;

            const isAvailable = await checkUsernameOnSite(candidate);
            const statusText = isAvailable === true ? 'Available' : (isAvailable === false ? 'Taken' : 'Error');

            stats.recentChecks.unshift({ username: candidate, status: statusText });
            if (stats.recentChecks.length > 6) stats.recentChecks.pop();

            if (isAvailable === true) {
                stats.available++;
                stats.lastHit = candidate;

                const db = loadDatabase();
                if (!db.savedUsernames.some(i => i.username === candidate)) {
                    db.savedUsernames.push({ username: candidate, timestamp: new Date().toISOString() });
                    saveDatabase(db);
                }

                const alertEmbed = new EmbedBuilder()
                    .setTitle('🎉 PÉPITE DISPONIBLE DÉTECTÉE !')
                    .setDescription(`✨ Pseudo libre : \`${candidate}\``)
                    .setColor('#2ECC71')
                    .setTimestamp();

                await message.channel.send({ content: `<@${message.author.id}> 🚨 **HIT TROUVÉ !**`, embeds: [alertEmbed] });
            }

            if (liveMessage) {
                liveMessage.edit(buildMainDashboard()).catch(() => {});
            }
        }, 4000);

        return;
    }

    if (command === 'check') {
        const target = args[0]?.toLowerCase();
        if (!target) return message.reply('❌ Exemple : `,check pbavq0dfhb`');

        const loading = await message.reply(`🔍 Test de \`${target}\` sur le site...`);
        const isAvailable = await checkUsernameOnSite(target);

        if (isAvailable === true) return loading.edit(`🎉 Résultat : \`${target}\` est **DISPONIBLE** !`);
        if (isAvailable === false) return loading.edit(`❌ Résultat : \`${target}\` est **DÉJÀ PRIS**.`);
        return loading.edit(`⚠️ Erreur du site.`);
    }

    if (command === 'lookup') {
        const db = loadDatabase();
        if (!db.savedUsernames.length) return message.reply('📂 Aucun pseudo trouvé.');
        const list = db.savedUsernames.slice(-10).map(i => `• \`${i.username}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Dernières Pépites').setDescription(list).setColor('#3498DB')] });
    }

    // MODÉRATION
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply("❌ Permission requise.");
        const count = parseInt(args[0]);
        if (!count || count < 1 || count > 100) return message.reply("❌ Nombre entre 1 et 100.");
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
        if (!mes
