const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const http = require('http');

// 1. Création d'un mini serveur HTTP pour satisfaire le port exigé par Render
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('K2L Bot is running smoothly!\n');
});

server.listen(PORT, () => {
    console.log(`Serveur HTTP en écoute sur le port ${PORT}`);
});

// 2. Initialisation du Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const PREFIX = '=';

// Stockage temporaire pour le système de snipe (messages supprimés)
const snipeCache = new Map();

client.on('messageDelete', message => {
    if (!message.author || message.author.bot) return;
    snipeCache.set(message.channel.id, {
        content: message.content || "[Média / Embed]",
        author: message.author.tag,
        avatar: message.author.displayAvatarURL(),
        time: new Date().toLocaleTimeString()
    });
});

// Configuration du menu d'aide avec toutes les commandes et descriptions exactes
const helpCategories = {
    sanctions: {
        label: 'Sanctions',
        emoji: '🔨',
        description: 'Gérer la modération et les bannissements',
        commands: [
            '`=bl <@membre|pseudo|id> [raison]`\n└ Bannir (blacklist), par mention/pseudo ou ID (même hors serveur)',
            '`=unbl <user_id> [raison]`\n└ Débannir un utilisateur par son ID',
            '`=blist`\n└ Lister tous les membres bannis',
            '`=unbanall`\n└ Débannir tout le monde (admin, confirmation)',
            '`=kick <membre> [raison]`\n└ Expulser un membre',
            '`=softbl <membre> [raison]`\n└ Ban + déban immédiat (efface les msgs)'
        ]
    },
    nettoyage: {
        label: 'Nettoyage',
        emoji: '🧹',
        description: 'Nettoyer et purger les salons textuels',
        commands: [
            '`=clear <nombre|all>`\n└ Supprimer N messages ou tous dans le salon',
            '`=purge <membre> [nombre]`\n└ Supprimer les messages d\'un membre',
            '`=snipe [@membre]`\n└ Voir les messages supprimés récents'
        ]
    },
    salons: {
        label: 'Salons',
        emoji: '🔒',
        description: 'Gestion et paramétrage des salons du serveur',
        commands: [
            '`=lock [salon]`\n└ Verrouiller un salon',
            '`=unlock [salon]`\n└ Déverrouiller un salon',
            '`=slowmode <sec> [salon]`\n└ Définir le slowmode',
            '`=nuke [salon]`\n└ Recréer un salon (efface tout)',
            '`=createtext <nom> [catégorie]`\n└ Créer un salon textuel',
            '`=createvoice <nom> [catégorie]`\n└ Créer un salon vocal'
        ]
    },
    giveaways: {
        label: 'Giveaways',
        emoji: '🎉',
        description: 'Lancer et gérer des concours',
        commands: [
            '`=gcreate <durée> <gagnants> <prix>`\n└ Lancer un giveaway',
            '`=gend <message_id>`\n└ Terminer un giveaway immédiatement',
            '`=greroll <message_id>`\n└ Retirer un nouveau gagnant',
            '`=glist`\n└ Lister les giveaways actifs'
        ]
    },
    tickets: {
        label: 'Tickets',
        emoji: '🎫',
        description: 'Système de support et de gestion des tickets',
        commands: [
            '`=ticketsetup`\n└ ⭐️ Configuration visuelle (salons, texte, image/gif, catégories) + publier le panneau',
            '`=ticketadd <nom>`\n└ Créer un type de ticket (= un bouton)',
            '`=ticketremove <type>`\n└ Supprimer un type de ticket',
            '`=ticketedit <type> <champ> <valeur>`\n└ Modifier label/emoji/style/catégorie/message',
            '`=ticketrole <type> add/remove <@rôle>`\n└ Gérer les rôles staff d\'un type',
            '`=ticketquestion <type> add/remove/list`\n└ Gérer le formulaire d\'ouverture'
        ]
    },
    membres: {
        label: 'Membres & Rôles',
        emoji: '👤',
        description: 'Suivi des membres, statistiques et rôles automatiques',
        commands: [
            '`=invites [@membre]`\n└ Voir les invitations d\'un membre',
            '`=statistic [@membre]`\n└ Stats messages & temps vocal d\'un membre',
            '`=leaderboard`\n└ Top 3 messages & Top 3 temps vocal + ton classement',
            '`=autorole <@r1 @r2...|add|remove|list|clear>`\n└ Auto-rôles (plusieurs) à l\'arrivée',
            '`=massrole <add|remove> <@rôle> [humans|bots|all|@filtre]`\n└ Ajouter/retirer un rôle à plein de membres (+massrole stop)',
            '`=setwelcome <salon> <message>`\n└ Message de bienvenue (variables : {mention} {name} {server} {number})'
        ]
    },
    config: {
        label: 'Configuration',
        emoji: '⚙️',
        description: 'Paramètres généraux, logs et salons vocaux',
        commands: [
            '`=setlog <salon>`\n└ Définir le salon de logs',
            '`=setmuterole <rôle>`\n└ Définir le rôle muet (legacy)',
            '`=setjtc create | <#salon>`\n└ Salon \'Rejoindre pour créer\' (salons vocaux persos)',
            '`=removejtc`\n└ Désactiver les salons vocaux temporaires',
            '`=setinvitecheck <#salon>`\n└ Salon de suivi des invitations (qui a invité qui)',
            '`=removeinvitecheck`\n└ Désactiver le suivi des invitations'
        ]
    }
};

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} avec succès !`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. COMMANDE =HELP INTERACTIVE
    if (command === 'help') {
        const defaultCategoryKey = 'sanctions';
        const cat = helpCategories[defaultCategoryKey];

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`${cat.emoji} ${cat.label}`)
            .setDescription(cat.commands.join('\n\n'))
            .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${cat.label}` });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('📂 Choisir une catégorie...')
            .addOptions(
                Object.keys(helpCategories).map(key => ({
                    label: helpCategories[key].label,
                    description: helpCategories[key].description,
                    value: key,
                    emoji: helpCategories[key].emoji
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const sentMessage = await message.reply({ embeds: [embed], components: [row] });

        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "Tu n'as pas le droit d'utiliser ce menu !", ephemeral: true });
            }

            if (interaction.customId === 'help_menu') {
                const selectedKey = interaction.values[0];
                const selectedCat = helpCategories[selectedKey];

                const updatedEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`${selectedCat.emoji} ${selectedCat.label}`)
                    .setDescription(selectedCat.commands.join('\n\n'))
                    .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${selectedCat.label}` });

                await interaction.update({ embeds: [updatedEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            sentMessage.edit({ components: [] }).catch(() => {});
        });
    }

    // 2. LOGIQUE DES COMMANDES DE NETTOYAGE
    else if (command === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("Tu n'as pas la permission de gérer les messages.");
        }
        const amount = args[0];
        if (!amount) return message.reply("Précise un nombre de messages à supprimer ou `all`.");
        
        if (amount.toLowerCase() === 'all') {
            try {
                let deleted;
                do {
                    deleted = await message.channel.bulkDelete(100, true);
                } while (deleted.size >= 2);
                return message.channel.send("Salon entièrement nettoyé !").then(msg => setTimeout(() => msg.delete(), 3000));
            } catch (err) {
                return message.reply("Erreur lors de la suppression massive des messages.");
            }
        }

        const count = parseInt(amount);
        if (isNaN(count) || count <= 0 || count > 100) {
            return message.reply("Donne un nombre entre 1 et 100.");
        }

        try {
            await message.delete();
            const fetched = await message.channel.messages.fetch({ limit: count });
            await message.channel.bulkDelete(fetched, true);
            const confirmation = await message.channel.send(`🧹 ${fetched.size} messages supprimés.`);
            setTimeout(() => confirmation.delete().catch(() => {}), 3000);
        } catch (err) {
            message.reply("Impossible de supprimer des messages de plus de 14 jours.");
        }
    }

    else if (command === 'snipe') {
        const sniped = snipeCache.get(message.channel.id);
        if (!sniped) return message.reply("Aucun message récent n'a été supprimé dans ce salon.");

        const embed = new EmbedBuilder()
            .setColor('#ff5555')
            .setAuthor({ name: sniped.author, iconURL: sniped.avatar })
            .setDescription(`**Message supprimé :**\n${sniped.content}`)
            .setFooter({ text: `Supprimé à ${sniped.time}` });

        message.reply({ embeds: [embed] });
    }

    // 3. LOGIQUE DES COMMANDES DE SANCTIONS
    else if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply("Tu n'as pas la permission d'expulser des membres.");
        }
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) return message.reply("Mentionne un membre valide à expulser.");
        
        const reason = args.slice(1).join(' ') || "Aucune raison spécifiée";
        try {
            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** a été expulsé. Raison : ${reason}`);
        } catch (err) {
            message.reply("Je n'ai pas les permissions suffisantes pour expulser ce membre.");
        }
    }

    else if (command === 'bl') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply("Tu n'as pas la permission de bannir.");
        }
        const targetId = args[0]?.replace(/<@!?|>/g, '');
        if (!targetId) return message.reply("Fournis un ID ou une mention valide.");
        
        const reason = args.slice(1).join(' ') || "Aucune raison";
        try {
            await message.guild.members.ban(targetId, { reason });
            message.reply(`🔨 Utilisateur \`${targetId}\` banni avec succès.`);
        } catch (err) {
            message.reply("Impossible de bannir cet utilisateur (vérifie mon rôle ou l'ID).");
        }
    }

    else if (command === 'unbl') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply("Permissions insuffisantes.");
        }
        const userId = args[0];
        if (!userId) return message.reply("Donne l'ID de l'utilisateur à débannir.");

        try {
            await message.guild.members.unban(userId);
            message.reply(`🔓 Utilisateur \`${userId}\` débanni.`);
        } catch (err) {
            message.reply("Utilisateur introuvable dans la liste des bannis.");
        }
    }

    // 4. LOGIQUE DES SALONS (LOCK / UNLOCK)
    else if (command === 'lock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("Tu n'as pas la permission de gérer les salons.");
        }
        const channel = message.mentions.channels.first() || message.channel;
        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
            message.reply(`🔒 Le salon ${channel} a été verrouillé.`);
        } catch (err) {
            message.reply("Erreur lors du verrouillage du salon.");
        }
    }

    else if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("Permissions insuffisantes.");
        }
        const channel = message.mentions.channels.first() || message.channel;
        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
            message.reply(`🔓 Le salon ${channel} a été déverrouillé.`);
        } catch (err) {
            message.reply("Erreur lors du déverrouillage du salon.");
        }
    }
});

// Connexion du bot en utilisant bien DISCORD_TOKEN
client.login(process.env.DISCORD_TOKEN);
