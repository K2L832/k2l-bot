const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const http = require('http');

// 1. Serveur HTTP pour Render (garde le web service actif sans erreur de port)
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

// Bases de données en mémoire vive (pour que tout réagisse instantanément)
const snipeCache = new Map();
const spamTracker = new Map();
const serverConfig = new Map(); // Stocke les salons de logs, welcome, jtc, etc.
const activeGiveaways = new Map();

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

// Système Automod : Anti-Link, Anti-Leak & Anti-Spam (5 messages max en 5 secondes)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Protection Anti-Link / Anti-Leak
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
    if (linkRegex.test(message.content)) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}, les liens et invitations sont strictement interdits ici.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);
                return;
            } catch (e) {}
        }
    }

    // Protection Anti-Spam
    const userId = message.author.id;
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || [];
        userSpam = userSpam.filter(timestamp => now - timestamp < 5000);
        userSpam.push(now);
        spamTracker.set(userId, userSpam);

        if (userSpam.length > 5) {
            try {
                await message.delete();
                const warning = await message.channel.send(`🚨 ${message.author}, calme ton spam !`);
                setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            } catch (e) {}
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ==========================================
    // 1. MENU =HELP INTERACTIF COMPLET
    // ==========================================
    if (command === 'help') {
        const helpCategories = {
            sanctions: {
                label: 'Sanctions', emoji: '🔨', description: 'Gérer la modération et les bannissements',
                commands: [
                    '`=bl <@membre|id> [raison]` - Bannir (blacklist)',
                    '`=unbl <user_id> [raison]` - Débannir par ID',
                    '`=blist` - Lister les membres bannis',
                    '`=unbanall` - Débannir tout le monde',
                    '`=kick <@membre> [raison]` - Expulser un membre',
                    '`=softbl <@membre> [raison]` - Ban + déban immédiat (efface les msgs)'
                ]
            },
            nettoyage: {
                label: 'Nettoyage', emoji: '🧹', description: 'Nettoyer et purger les salons textuels',
                commands: [
                    '`=clear <nombre|all>` - Supprimer N messages ou tout',
                    '`=purge <@membre> [nombre]` - Supprimer les messages d\'un membre',
                    '`=snipe` - Voir le dernier message supprimé'
                ]
            },
            salons: {
                label: 'Salons', emoji: '🔒', description: 'Gestion et paramétrage des salons du serveur',
                commands: [
                    '`=lock [salon]` - Verrouiller un salon',
                    '`=unlock [salon]` - Déverrouiller un salon',
                    '`=slowmode <sec>` - Définir le slowmode',
                    '`=nuke [salon]` - Recréer un salon à neuf',
                    '`=createtext <nom>` - Créer un salon textuel',
                    '`=createvoice <nom>` - Créer un salon vocal'
                ]
            },
            giveaways: {
                label: 'Giveaways', emoji: '🎉', description: 'Lancer et gérer des concours',
                commands: [
                    '`=gcreate <durée> <gagnants> <prix>` - Lancer un giveaway',
                    '`=gend <id>` - Terminer un giveaway',
                    '`=greroll <id>` - Tirer un nouveau gagnant',
                    '`=glist` - Lister les giveaways'
                ]
            },
            tickets: {
                label: 'Tickets', emoji: '🎫', description: 'Système de support et de gestion des tickets',
                commands: [
                    '`=ticketsetup` - Publier le panneau de tickets',
                    '`=ticketadd <nom>` - Ajouter un bouton de ticket',
                    '`=ticketremove <type>` - Supprimer un type de ticket'
                ]
            },
            membres: {
                label: 'Membres & Rôles', emoji: '👤', description: 'Suivi des membres, stats et rôles',
                commands: [
                    '`=invites [@membre]` - Voir les invitations',
                    '`=autorole <@rôle>` - Gérer l\'auto-rôle à l\'arrivée',
                    '`=massrole <add|remove> <@rôle>` - Gérer un rôle en masse',
                    '`=setwelcome <#salon> <message>` - Message de bienvenue'
                ]
            },
            config: {
                label: 'Configuration', emoji: '⚙️', description: 'Paramètres généraux et salons vocaux',
                commands: [
                    '`=setlog <#salon>` - Définir le salon de logs',
                    '`=setjtc <#salon>` - Salon \'Rejoindre pour créer\' vocal',
                    '`=removejtc` - Désactiver les vocaux temporaires',
                    '`=setinvitecheck <#salon>` - Suivi des invitations'
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
    // 2. SECTION SANCTIONS
    // ==========================================
    if (command === 'bl') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("Permissions insuffisantes.");
        const targetId = args[0]?.replace(/<@!?|>/g, '');
        if (!targetId) return message.reply("Fournis un ID ou une mention valide.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await message.guild.members.ban(targetId, { reason });
            message.reply(`🔨 Utilisateur \`${targetId}\` banni avec succès. Raison : ${reason}`);
        } catch (e) { message.reply("Impossible de bannir cet utilisateur."); }
    }

    else if (command === 'unbl') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("Permissions insuffisantes.");
        const userId = args[0];
        if (!userId) return message.reply("Donne l'ID à débannir.");
        try {
            await message.guild.members.unban(userId);
            message.reply(`🔓 Utilisateur \`${userId}\` débanni.`);
        } catch (e) { message.reply("Utilisateur introuvable dans la liste des bannis."); }
    }

    else if (command === 'blist') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("Permissions insuffisantes.");
        const bans = await message.guild.bans.fetch();
        const banList = bans.map(b => `• \`${b.user.tag}\` (${b.user.id})`).slice(0, 15).join('\n') || "Aucun banni.";
        const embed = new EmbedBuilder().setColor('#ff5555').setTitle("🔨 Liste des membres bannis").setDescription(banList);
        message.reply({ embeds: [embed] });
    }

    else if (command === 'unbanall') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("Réservé aux administrateurs.");
        const bans = await message.guild.bans.fetch();
        if (bans.size === 0) return message.reply("Aucun utilisateur banni.");
        for (const [userId] of bans) {
            await message.guild.members.unban(userId).catch(() => {});
        }
        message.reply(`🔓 Tous les utilisateurs (${bans.size}) ont été débannis.`);
    }

    else if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply("Permissions insuffisantes.");
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) return message.reply("Membre introuvable.");
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** a été expulsé. Raison : ${reason}`);
        } catch (e) { message.reply("Impossible d'expulser ce membre."); }
    }

    else if (command === 'softbl') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("Permissions insuffisantes.");
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) return message.reply("Membre introuvable.");
        try {
            await member.ban({ reason: "Softbl / Softban" });
            await message.guild.members.unban(member.id);
            message.reply(`🌪️ **${member.user.tag}** a subi un softban (messages effacés).`);
        } catch (e) { message.reply("Erreur lors du softbl."); }
    }

    // ==========================================
    // 3. SECTION NETTOYAGE
    // ==========================================
    else if (command === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply("Permissions insuffisantes.");
        const val = args[0];
        if (!val) return message.reply("Précise un nombre entre 1 et 100 ou `all`.");

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
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply("Permissions insuffisantes.");
        const target = message.mentions.members.first();
        if (!target) return message.reply("Mentionne le membre dont tu veux purger les messages.");
        const limit = parseInt(args[1]) || 50;

        try {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === target.id).first(limit);
            await message.channel.bulkDelete(userMessages, true);
            const conf = await message.channel.send(`🧹 ${userMessages.length} messages de ${target.user.tag} supprimés.`);
            setTimeout(() => conf.delete().catch(() => {}), 3000);
        } catch (e) { message.reply("Erreur lors de la purge."); }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("Aucun message récent supprimé ici.");
        const embed = new EmbedBuilder()
            .setColor('#ff5555')
            .setAuthor({ name: sniped.author, iconURL: sniped.avatar })
            .setDescription(`**Contenu :**\n${sniped.content}`)
            .setFooter({ text: `Supprimé à ${sniped.time}` });
        message.reply({ embeds: [embed] });
    }

    // ==========================================
    // 4. SECTION SALONS
    // ==========================================
    else if (command === 'lock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply("🔒 Salon verrouillé avec succès.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            message.reply("🔓 Salon déverrouillé.");
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'slowmode') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        const time = parseInt(args[0]);
        if (isNaN(time) || time < 0) return message.reply("Indique un nombre de secondes valide.");
        try {
            await message.channel.setRateLimitPerUser(time);
            message.reply(`⏱️ Slowmode réglé à ${time} secondes.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'nuke') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        try {
            const position = message.channel.position;
            const newChannel = await message.channel.clone();
            await message.channel.delete();
            newChannel.setPosition(position);
            newChannel.send("💥 Salon nuké et recréé à neuf !");
        } catch (e) { message.reply("Erreur lors du nuke."); }
    }

    else if (command === 'createtext') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        const name = args.join('-');
        if (!name) return message.reply("Donne un nom au salon.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildText });
            message.reply(`✅ Salon textuel \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    else if (command === 'createvoice') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("Permissions insuffisantes.");
        const name = args.join(' ');
        if (!name) return message.reply("Donne un nom au salon.");
        try {
            await message.guild.channels.create({ name, type: ChannelType.GuildVoice });
            message.reply(`✅ Salon vocal \`${name}\` créé.`);
        } catch (e) { message.reply("Erreur."); }
    }

    // ==========================================
    // 5. CONFIGURATION & LOGS
    // ==========================================
    else if (command === 'setlog') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("Réservé aux admins.");
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Mentionne un salon textuel valide.");
        serverConfig.set(message.guild.id, { ...serverConfig.get(message.guild.id), logChannel: channel.id });
        message.reply(`⚙️ Salon de logs défini sur ${channel}.`);
    }

    else if (command === 'setwelcome') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("Réservé aux admins.");
        const channel = message.mentions.channels.first();
        const customMsg = args.slice(1).join(' ');
        if (!channel || !customMsg) return message.reply("Utilisation : `=setwelcome <#salon> <message>`");
        serverConfig.set(message.guild.id, { ...serverConfig.get(message.guild.id), welcomeChannel: channel.id, welcomeText: customMsg });
        message.reply(`✅ Message de bienvenue configuré dans ${channel}.`);
    }
});

// Événement d'arrivée de membre (Welcome)
client.on('guildMemberAdd', member => {
    const config = serverConfig.get(member.guild.id);
    if (!config || !config.welcomeChannel) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;

    let text = config.welcomeText
        .replace('{mention}', `<@${member.id}>`)
        .replace('{name}', member.user.username)
        .replace('{server}', member.guild.name)
        .replace('{number}', member.guild.memberCount);

    channel.send(text).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);
