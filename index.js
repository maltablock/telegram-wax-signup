const fs = require('fs')
const Telebot = require('telebot')
const ecc = require('eosjs-ecc')
const config = require('./config')


const bot = new Telebot(config.keys.bot)

const { Api, JsonRpc, RpcError } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');      
const fetch = require('node-fetch');                                    
const { TextEncoder, TextDecoder } = require('util');                   
const privateKeys = [config.keys.wax];
const signatureProvider = new JsSignatureProvider(privateKeys);
// @ts-ignore
const rpc = new JsonRpc(config.apiEndpoint, { fetch });
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

// ##############################################################################################################
// #################################################  WAX  ######################################################
// ##############################################################################################################

const getBlackListedFilePath = () => {
    const fileName = `blackListedUserIds.json`
    // need to store it on a persistent volume in production
    return process.env.NODE_ENV === `production` ? `/storage/waxmeetup/${fileName}` : fileName
}
const readBlackList = () => {
    try {
        const contents = fs.readFileSync(getBlackListedFilePath())
        return JSON.parse(contents)
    } catch (error) {
        console.error(`Error reading blacklist file: ${error.message}`)
    }
}

async function transfer (memo) {
    try {
        await api.transact(
            {
                actions: [{
                    account: 'eosio.token',
                    name: 'transfer',
                    authorization: [{
                        actor: config.waxAccountName,
                        permission: config.waxPermission,
                    }],
                    data: {
                        from: config.waxAccountName,
                        to: config.waxSmartContractName,
                        quantity: config.waxAmount,
                        memo: memo,
                    },
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30
            }
        )
        return true
    } catch (e) {
        console.error(e)
        return false
    }
}

async function checkIfNameIsAvailable (accountName) {
    try { 
        await rpc.get_account(accountName) 
        return false
    }
    catch (e) {
        if (e.json && e.json.code === 500) return true
        else {
            console.log(e)
            return false
        }
    }
}

// ##############################################################################################################
// #################################################  BOT  ######################################################
// ##############################################################################################################

// Authorized account name characters
const validAccountNameCharacters = ['.', '1', '2', '3', '4', '5', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 
            'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']

bot.on('/groupId', async (msg) => {
    bot.sendMessage(msg.chat.id, `The ID of this chat group is: ${msg.chat.id}`)
})
            
bot.on('/new_account', async (msg) => {

    // Don't accept requests from Telegram bots
    if (msg.from.is_bot) {
        bot.sendMessage(msg.chat.id, `😔 Sorry, bots are not allowed to create accounts`)
        return
    }

    // Extracting accountName and publicKey from user msg
    let [accountName, publicKey] = msg.text.split(' ').slice(1, 3)
    accountName = accountName ? accountName.toLowerCase() : undefined

    // Checking for name and key validity
    const invalidCharaters = []
    let hasDotAtInvalidPos = false
    let isAccountNameAvailable = false
    let isPubKeyValid = ecc.isValidPublic(publicKey)
    
    if (accountName && accountName.length === 12) {
        accountName.split('').forEach((char, i) => {
            if (!validAccountNameCharacters.includes(char)) invalidCharaters.push(char)
            if ((i === 0 || i === 11) && char === '.') hasDotAtInvalidPos = true
        })
        if (invalidCharaters.length === 0 && !hasDotAtInvalidPos) {
            isAccountNameAvailable = await checkIfNameIsAvailable(accountName)
        }
    }

    // Error message
    if (!config.authorizedChatGroupIds.includes(msg.chat.id) && config.authorizedChatGroupIds.length !== 0) bot.sendMessage(msg.chat.id, `😔 Sorry, you need to be in the @wax_blockchain_meetup group to use this bot.`)
    else if (!accountName || !publicKey) bot.sendMessage(msg.chat.id, `😔 Sorry, you need to provide accountName & publicKey`)
    else if (accountName && accountName.length !== 12) bot.sendMessage(msg.chat.id, `😔 Sorry, your account name must be 12 characters long, no more, no less.`)
    else if (invalidCharaters.length !== 0) bot.sendMessage(msg.chat.id, `😔 Sorry, the following character(s) are not allowed: \n${invalidCharaters.join('  ')}`)
    else if (hasDotAtInvalidPos) bot.sendMessage(msg.chat.id, `😔 Sorry, you cannot use dots ( . ) for the first nor the last character of your account name.`)
    else if (!isAccountNameAvailable) bot.sendMessage(msg.chat.id, `😔 Sorry, this account name is already taken.`)
    else if (!isPubKeyValid) bot.sendMessage(msg.chat.id, `😔 Sorry, this public key is not valid.`)
    
    // Create account process
    else {
        // @ts-ignore
        let blackListedUserIds = readBlackList()
        if (!blackListedUserIds.includes(msg.from.id)) {
            bot.sendMessage(msg.chat.id, "Account creation in progress... ⏳")
            let isCreated = await transfer(accountName + '-' + publicKey)
            if (isCreated) {
                blackListedUserIds.push(msg.from.id)
                fs.writeFileSync(getBlackListedFilePath(), JSON.stringify(blackListedUserIds))
                const message = config.shouldPostLinkToAccountAfterCreation 
                    ? `✅ Account created \n\nSee: https://wax.bloks.io/account/${accountName}`
                    : `✅ Account created`
                bot.sendMessage(msg.chat.id, message, {webPreview: true})
            } else {
                bot.sendMessage(msg.chat.id, `😔 Account created failed.\nPlease contact an admin in the @wax_blockchain_meetup group`)
            }
        } else {
            bot.sendMessage(msg.chat.id, `😔 Sorry, you already have created an account.`)
        }
    }
})

// Display help message for users
bot.on(['/help', '/start'], (msg) => {
    if (msg.from.is_bot) return
    bot.sendMessage(msg.chat.id, 
`Use /new_account accountName publicKey 
        
Account names should be 12 characters long, no more, no less.
Account names should only contain letters [A-Z], numbers [1-5] 
Account names can contain optionnal dots . except for the first and last characters.
`
)})

bot.on('text', (msg) => {console.log(`${msg.chat.id} - @${msg.from.username} (${msg.from.id} ${msg.from.first_name}): ${msg.text}`)})

bot.connect()