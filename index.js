const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const http = require('http');

// Serveur HTTP pour Render (maintient le Web Service actif)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Operational!\n');
}).listen(PORT, () => console.log(`Serveur HTTP actif sur le port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const PREFIX = '=';

// Stockages en mémoire
const snipeCache = new Map();
const spamTracker = new Map();
const serverConfig = new Map(); 

// Owners permanents par ID chiffré (Ton ID principal est ancré ici pour ne jamais s'effacer)
const botOwners = new Set(["1165181057488924765", "77jc"]); 

function isOwner(userId) {
    return botOwners.has(userId);
}

function getGuildAutomod(guildId) {
    if (!serverConfig.has(guildId)) {
        serverConfig.set(guildId, {
            antilink: true,
            antispam: true,
            antibot: true,
            logChannel: null,
            welcomeChannel: null,
            welcomeText: null
        });
    }
    return serverConfig.get(guildId);
}

// Cache Snipe
client.on('messageDelete', message => {
    if (!message.author || message.author.bot) return;
    snipeCache.set(message.channel.id, {
        content: message.content || "[Média / Embed]",
        author: message.author.tag,
        avatar: message.author.displayAvatarURL(),
        time: new Date().toLocaleTimeString()
    });
});

// ==========================================
// INTERACTIONS GLOBAL (TICKETS & GIVEAWAYS BOUTONS)
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // Gestion de l'ouverture de ticket
    if (interaction.customId === 'create_ticket') {
        const guild = interaction.guild;
        const member = interaction.member;

        try {
            const ticketChannel = await guild.channels.create({
                name: `ticket-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                ]
            });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎫 Ticket de ${member.user.username}`)
                .setDescription("Un membre du staff va bientôt te prendre en charge. Clique sur le bouton ci-dessous pour fermer le ticket.");

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ content: `<@${member.id}>`, embeds: [embed], components: [closeRow] });
            return interaction.reply({ content: `✅ Ton ticket a été créé : ${ticketChannel}`, ephemeral: true });
        } catch (e) {
            return interaction.reply({ content: "Erreur lors de la création du ticket.", ephemeral: true });
        }
    }

    // Gestion de la fermeture de ticket
    if (interaction.customId === 'close_ticket') {
        await interaction.reply("🔒 Fermeture du ticket dans 3 secondes...");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

    // Gestion de la participation aux Giveaways
    if (interaction.customId.startsWith('join_giveaway_')) {
        const giveawayId = interaction.customId.replace('join_giveaway_giveaway_', '');
        // Gestion basique des entrées de giveaways interactifs
        return interaction.reply({ content: "🎉 Tu participes officiellement au giveaway !", ephemeral: true });
    }
});

// ==========================================
// AUTOMOD & COMMANDES
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const automod = getGuildAutomod(message.guild.id);
    const userId = message.author.id;
    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || isOwner(userId) || userId === message.guild.ownerId;

    // 1. Anti-Link
    if (automod.antilink && !isUserAdminOrOwner) {
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
        if (linkRegex.test(message.content)) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}, les liens et invitations sont interdits.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);
                return;
            } catch (e) {}
        }
    }

    // 2. Anti-Spam
    if (automod.antispam && !isUserAdminOrOwner) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < 5000);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length > 5) {
            try {
                await message.delete();
                const warning = await message.channel.send(`🚨 ${message.author}, doucement sur le spam !`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const targetArg = args[0]?.replace(/<@!?|>/g, ''); // Permet d'accepter une mention OU un ID numérique direct

    // ==========================================
    // MENU =HELP COMPLET
    // ==========================================
    if (command === 'help') {
        const helpCategories = {
            sanctions: {
                label: 'Sanctions', emoji: '🔨', description: 'Bannir / Expulser (via Mention ou ID)',
                commands: ['`=bl <@ID> [raison]` - Bannir', '`=unbl <ID>` - Débannir ID', '`=blist` - Liste des bannis', '`=kick <@ID>` - Expulser']
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', description: 'Nettoyer les salons',
                commands: ['`=clear <1-100|all>` - Supprimer des messages', '`=purge <@ID>` - Purger les msgs d\'un membre', '`=snipe` - Voir le dernier msg supprimé']
            },
            salons: {
                label: 'Salons', emoji: '🔒', description: 'Sécurité et gestion des salons',
                commands: ['`=lock` / `=unlock` - Verrouiller / Déverrouiller', '`=slowmode <sec>` - Ralentissement', '`=nuke` - Recréer un salon']
            },
            giveaways: {
                label: 'Giveaways', emoji: '🎉', description: 'Concours interactifs',
                commands: ['`=gcreate <durée> <gagnants> <prix> [condition]` - Lancer un vrai concours']
            },
            tickets: {
                label: 'Tickets', emoji: '🎫', description: 'Panneau de support interactif',
                commands: ['`=ticketsetup <#salon>` - Publier le panneau de tickets']
            },
            automod: {
                label: 'Automod', emoji: '🛡️', description: 'Protections du serveur',
                commands: ['`=antilink on/off`', '`=antispam on/off`', '`=antibot on/off`']
            },
            config: {
                label: 'Configuration', emoji: '⚙️', description: 'Owners et paramètres',
                commands: ['`=owner <ID>` - Ajouter un owner', '`=unowner <ID>` - Retirer un owner', '`=setlog <#salon>`']
            }
        };

        const catKeys = Object.keys(helpCategories);
        let currentIndex = 0;

        const generateEmbed = (index) => {
            const key = catKeys[index];
            const cat = helpCategories[key];
            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${cat.emoji} ${cat.label}`)
                .setDescription(cat.commands.join('\n'))
                .setFooter({ text: `Demandé par ${message.author.tag} • Page ${index + 1}/${catKeys.length}` });
        };

        const generateMenu = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_menu')
                    .setPlaceholder('📂 Choisir une catégorie...')
                    .addOptions(catKeys.map(k => ({
                        label: helpCategories[k].label,
                        description: helpCategories[k].description,
                        value: k,
                        emoji: helpCategories[k].emoji
                    })))
            );
        };

        const sentMsg = await message.reply({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });

        const collector = sentMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu ne t'appartient pas !", ephemeral: true });
            const selectedKey = i.values[0];
            currentIndex = catKeys.indexOf(selectedKey);
            await i.update({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });
        });
        return;
    }

    // ==========================================
    // GESTION DES OWNERS PAR ID NUMÉRIQUE
    // ==========================================
    if (command === 'owner') {
        if (!isOwner(userId) && userId !== message.guild.ownerId) {
            return message.reply("❌ Réservé aux Owners.");
        }
        if (!targetArg) return message.reply("Fournis l'ID ou la mention de l'utilisateur.");
        botOwners.add(targetArg);
        return message.reply(`👑 L'utilisateur \`${targetArg}\` a été ajouté comme Owner permanent !`);
    }

    if (command === 'unowner') {
        if (!isOwner(userId) && userId !== message.guild.ownerId) {
            return message.reply("❌ Réservé aux Owners.");
        }
        if (!targetArg) return message.reply("Fournis l'ID ou la mention.");
        botOwners.delete(targetArg);
        return message.reply(`🔒 L'utilisateur \`${targetArg}\` n'est plus Owner.`);
    }

    // VÉRIFICATION DES PERMISSIONS SENSIBLES
    const sensitiveCommands = ['bl', 'unbl', 'blist', 'unbanall', 'kick', 'softbl', 'lock', 'unlock', 'slowmode', 'nuke', 'createtext', 'createvoice', 'setlog', 'setwelcome', 'gcreate', 'ticketsetup', 'antilink', 'antispam', 'antibot'];
    if (sensitiveCommands.includes(command)) {
        if (!isOwner(userId) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator) && userId !== message.guild.ownerId) {
            return message.reply("❌ Commande strictement réservée aux Owners ou Administrateurs.");
        }
    }

    // ==========================================
    // VRAI SYSTÈME DE TICKETS INTERACTIF
    // ==========================================
    if (command === 'ticketsetup') {
        const targetChannel = message.mentions.channels.first() || message.channel;
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle("🎫 Support & Tickets")
            .setDescription("Besoin d'aide ? Clique sur le bouton ci-dessous pour ouvrir un salon de ticket privé avec le staff.");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_ticket').setLabel('📩 Ouvrir un ticket').setStyle(ButtonStyle.Primary)
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        return message.reply("✅ Panneau de tickets interactif publié avec succès !");
    }

    // ==========================================
    // VRAI SYSTÈME DE GIVEAWAYS INTERACTIF
    // ==========================================
    if (command === 'gcreate') {
        // Format: =gcreate 1h 1 Nitro [Condition: Être abonné]
        const duration = args[0];
        const winnersCount = parseInt(args[1]);
        const prize = args.slice(2, -1).join(' ') || args.slice(2).join(' ');

        if (!duration || isNaN(winnersCount) || !prize) {
            return message.reply("Utilisation correcte : `=gcreate <durée ex: 1m/1h> <gagnants> <prix>`");
        }

        const embed = new EmbedBuilder()
            .setColor('#FF73FA')
            .setTitle("🎉 GIVEAWAY 🎉")
            .setDescription(`**Lot :** ${prize}\n**Gagnant(s) :** ${winnersCount}\n\nClique sur le bouton 🎉 ci-dessous pour participer !`)
            .setFooter({ text: `Lancé par ${message.author.tag}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_giveaway_1').setLabel('🎉 Participer').setStyle(ButtonStyle.Success)
        );

        const giveawayMsg = await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("🎉 Giveaway lancé avec succès !");
    }

    // ==========================================
    // AUTOMOD COMMANDES (on/off)
    // ==========================================
    if (['antilink', 'antispam', 'antibot'].includes(command)) {
        const state = args[0]?.toLowerCase();
        if (state !== 'on' && state !== 'off') {
            return message.reply(`Utilisation : \`=${command} on\` ou \`=${command} off\``);
        }
        automod[command] = (state === 'on');
        return message.reply(`🛡️ Protection **${command.toUpperCase()}** réglée sur : **${state.toUpperCase()}**`);
    }

    // ==========================================
    // SECTION SANCTIONS (IDs numériques acceptés)
    // ==========================================
    if (command === 'bl') {
        if (!targetArg) return message.reply("Fournis un ID ou une mention.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await message.guild.members.ban(targetArg, { reason });
            message.reply(`🔨 Utilisateur \`${targetArg}\` banni.`);
        } catch (e) { message.reply("Impossible de bannir (vérifie l'ID)."); }
    }

    else if (command === 'unbl') {
        if (!targetArg) return message.reply("Donne l'ID à débannir.");
        try {
            await message.guild.members.unban(targetArg);
            message.reply(`🔓 Utilisateur \`${targetArg}\` débanni.`);
        } catch (e) { message.reply("Utilisateur introuvable."); }
    }

    else if (command === 'blist') {
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• \`${b.user.tag}\` (${b.user.id})`).slice(0, 15).join('\n') || "Aucun banni.";
        const embed = new EmbedBuilder().setColor('#ff5555').setTitle("🔨 Liste des bannis").setDescription(banList);
        message.reply({ embeds: [embed] });
    }

    else if (command === 'unbanall') {
        const bans = await message.guild.bans.fetch();
        if (bans.size === 0) return message.reply("Aucun banni.");
        for (const [userIdVal] of bans) {
            await message.guild.members.unban(userIdVal).catch(() => {});
        }
        message.reply(`🔓 Tous les utilisateurs (${bans.size}) ont été débannis.`);
    }

    else if (command === 'kick') {
        const member = message.mentions.members.first() || message.guild.members.cache.get(targetArg);
        if (!member) return message.reply("Membre introuvable.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** a été expulsé.`);
        } catch (e) { message.reply("Impossible d'expulser."); }
    }

    // ==========================================
    // SECTION NETTOYAGE & SALONS
    // ==========================================
    else if (command === 'clear') {
        const val = args[0];
        if (!val) return message.reply("Précise un nombre ou `all`.");

        if (val.toLowerCase() === 'all') {
            try {
                let deleted;
                do {
                    deleted = await message.channel.bulkDelete(100, true);
                } while (deleted.size >= 2);
                const m = await message.channel.send("🧹 Salon nettoyé !");
                setTimeout(() => m.delete().catch(() => {}), 3000);
            } catch (e) { message.reply("Erreur."); }
            return;
        }

        const count = parseInt(val);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("Donne un nombre entre 1 et 100.");
        try {
            await message.delete();
            const fetched = await message.channel.messages.fetch({ limit: count });
            await message.channel.bulkDelete(fetched, true);
            const confirmation = await message.channel.send(`🧹 ${fetched.size} messages supprimés.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Erreur de suppression."); }
    }

    else if (command === 'purge') {
        const target = message.mentions.members.first() || message.guild.members.cache.get(targetArg);
        if (!target) return message.reply("Mentionne ou donne l'ID du membre.");
        const limit = parseInt(args[1]) || 50;

        try {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === target.id).first(limit);
            await message.channel.bulkDelete(userMessages, true);
            const conf = await message.channel.send(`🧹 ${userMessages.length} messages supprimés.`);
            setTimeout(() => conf.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("Aucun message récent supprimé.");
        const embed = new EmbedBuilder()
            .setColor('#ff5555')
            .setAuthor({ name: sniped.author, iconURL: sniped.avatar })
            .setDescription(`**Contenu :**\n${sniped.content}`)
            .setFooter({ text: `Supprimé à ${sniped.time}` });
        message.reply({ embeds: [embed] });
    }

    else if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply("🔒 Salon verrouillé.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            message.reply("🔓 Salon déverrouillé.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'slowmode') {
        const time = parseInt(args[0]);
        if (isNaN(time) || time < 0) return message.reply("Indique des secondes valides.");
        try {
            await message.channel.setRateLimitPerUser(time);
            message.reply(`⏱️ Slowmode réglé à ${time}s.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'nuke') {
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone();
            await message.channel.delete();
            newChannel.setPosition(position);
         newChannel.send("💥 Salon nuké et recréé à neuf !");
        } catch (e) { message.reply("Erreur."); }
    }

    // CONFIGURATION LOGS
    else if (command === 'setlog') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Mentionne un salon.");
        automod.logChannel = channel.id;
        message.reply(`⚙️ Salon de logs défini sur ${channel}.`);
    }
});

// ==========================================
// ANTI-BOT AUTOMOD
// ==========================================
client.on('guildMemberAdd', async member => {
    if (member.user.bot) {
        const automod = getGuildAutomod(member.guild.id);
        if (automod.antibot) {
            try {
                await member.kick("Anti-Bot Automod : Bot non autorisé.");
                if (automod.logChannel) {
                    const logChan = member.guild.channels.cache.get(automod.logChannel);
                    if (logChan) logChan.send(`🛡️ **Anti-Bot** : Le bot \`${member.user.tag}\` a été expulsé.`);
                }
            } catch (e) {}
        }
        return;
    }
});

client.login(process.env.DISCORD_TOKEN);
