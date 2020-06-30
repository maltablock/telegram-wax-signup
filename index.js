const fs = require("fs");
const Telebot = require("telebot");
const ecc = require("eosjs-ecc");
const config = require("./config");

const bot = new Telebot(config.keys.bot);

const { Api, JsonRpc, RpcError } = require("eosjs");
const { JsSignatureProvider } = require("eosjs/dist/eosjs-jssig");
const fetch = require("node-fetch");
const { TextEncoder, TextDecoder } = require("util");
const { incrementNameCounter, getNextPremiumName, createPremiumName } = require("./premiumNames");

const signatureProvider = new JsSignatureProvider(config.keys.wax);
// @ts-ignore
const eosRpc = new JsonRpc(config.eosRpcEndpoint, { fetch });
const waxRpc = new JsonRpc(config.waxRpcEndpoint, { fetch });
const api = new Api({
  rpc: waxRpc,
  signatureProvider,
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder(),
});

// ##############################################################################################################
// #################################################  WAX  ######################################################
// ##############################################################################################################

const getBlackListedFilePath = () => {
  const fileName = `blackListedUserIds.json`;
  // need to store it on a persistent volume in production
  return process.env.NODE_ENV === `production`
    ? `/storage/waxmeetup/${fileName}`
    : fileName;
};
const readBlackList = () => {
  try {
    const contents = fs.readFileSync(getBlackListedFilePath());
    return JSON.parse(contents);
  } catch (error) {
    console.error(`Error reading blacklist file: ${error.message}`);
    return [];
  }
};

async function transfer(memo) {
  try {
    await api.transact(
      {
        actions: [
          {
            account: "eosio.token",
            name: "transfer",
            authorization: [
              {
                actor: config.waxAccountName,
                permission: config.waxPermission,
              },
            ],
            data: {
              from: config.waxAccountName,
              to: config.waxSmartContractName,
              quantity: config.waxAmount,
              memo: memo,
            },
          },
        ],
      },
      {
        blocksBehind: 3,
        expireSeconds: 30,
      }
    );
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function getEosAccount(accountName) {
  try {
    return await eosRpc.get_account(accountName);
  } catch (e) {
    return null;
  }
}

async function checkIfNameIsAvailable(accountName) {
  try {
    await waxRpc.get_account(accountName);
    return false;
  } catch (e) {
    if (e.json && e.json.code === 500) return true;
    else {
      console.log(e);
      return false;
    }
  }
}

async function checkIfBannedByShieldy(msg) {
  const chatGroupId = config.authorizedChatGroupIds[0];
  if (!chatGroupId) {
    console.error(
      `checkIfBannedByShieldy: No chat group ID defined in config.json`
    );
    return true;
  }
  const chatMember = await bot.getChatMember(chatGroupId, msg.from.id);
  console.log(`chatMember`, chatMember.status);
  const isBanned =
    chatMember.status === `left` ||
    chatMember.status === `kicked` ||
    chatMember.status === `restricted`;
  return isBanned;
}

function shouldIgnoreMessageInDevelopment(msg) {
  // ignore if dev mode and not from developer
  return process.env.NODE_ENV === `development` && msg.from.id !== config.telegramDeveloperId
}

function checkIfJoinedTooRecently(msg) {
  if (Object.keys(newUsers).includes(msg.from.id.toString())) {
    if (Date.now() - newUsers[msg.from.id.toString()] < config.newUserDelayMs) {
      return true;
    }
  }
  return false;
}

// ##############################################################################################################
// #################################################  BOT  ######################################################
// ##############################################################################################################

// Authorized account name characters
const newUsers = {};
let accountCreationPending = false;

const canCreateAccount = async (msg) => {
  let isBot = await checkIfBannedByShieldy(msg);
  if (isBot) {
    console.log(`Marked @${msg.from.username} ${msg.from.id} as a bot`);
    return false;
  }

  const hasJoinedTooRecently = checkIfJoinedTooRecently(msg);
  if (hasJoinedTooRecently) {
    console.log(
      `User @${msg.from.username} ${msg.from.id} has joined too recently, denying account creation`
    );
    return false;
  }

  if (accountCreationPending) {
    bot.sendMessage(
      msg.chat.id,
      `😔 Sorry, another account creation is currently in progress.`
    );
    return false;
  }

  return true;
};

bot.on("newChatMembers", (msg) => {
  if (!msg.new_chat_participant.is_bot) {
    newUsers[msg.new_chat_participant.id.toString()] = Date.now();
  }
});

bot.on("/groupId", async (msg) => {
  bot.sendMessage(msg.chat.id, `The ID of this chat group is: ${msg.chat.id}`);
});

bot.on("/new_account", async (msg) => {
  try {
    if(shouldIgnoreMessageInDevelopment(msg)) {
      return;
    }

    // Don't accept requests from Telegram bots
    if (msg.from.is_bot) {
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, bots are not allowed to create accounts`
      );
      return;
    }

    // Extracting accountName and publicKey from user msg
    let [accountName, publicKey] = msg.text.split(" ").slice(1, 3);
    accountName = accountName ? accountName.toLowerCase() : undefined;

    // Checking for name and key validity
    let isPubKeyValid = ecc.isValidPublic(publicKey);
    let isAccountNameAvailable = await checkIfNameIsAvailable(accountName);

    // Error message
    if (
      !config.authorizedChatGroupIds.includes(msg.chat.id) &&
      config.authorizedChatGroupIds.length !== 0
    )
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, you need to be in the @wax_blockchain_meetup group to use this bot.`
      );
    else if (!accountName || !publicKey)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, you need to provide accountName & publicKey`
      );
    else if (accountName.length !== 12)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, your account name must be 12 characters long, no more, no less.`
      );
    else if (!/^[a-z1-5]{12}$/.test(accountName))
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, your account name contains invalid characters. Allowed characters: a-z, 1-5.`
      );
    else if (!isAccountNameAvailable)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, this account name is already taken.`
      );
    else if (!isPubKeyValid)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, this public key is not valid.`
      );
    // Create account process
    else {
      const canCreate = await canCreateAccount(msg);
      if (!canCreate) return;

      try {
        accountCreationPending = true;
        let blackListedUserIds = readBlackList();
        if (blackListedUserIds.includes(msg.from.id)) {
          await bot.sendMessage(
            msg.chat.id,
            `😔 Sorry, you already have created an account.`
          );
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          "Account creation in progress... ⏳"
        );
        let isCreated = await transfer(accountName + "-" + publicKey);
        if (isCreated) {
          blackListedUserIds.push(msg.from.id);
          fs.writeFileSync(
            getBlackListedFilePath(),
            JSON.stringify(blackListedUserIds)
          );
          let message = config.shouldPostLinkToAccountAfterCreation
            ? `✅ Account created \n\nSee: https://wax.bloks.io/account/${accountName}`
            : `✅ Account created`;
          message = `${message}\n⚠️ Make sure to safely store your private key or you won't be able to access the account!`;
          await bot.sendMessage(msg.chat.id, message, { webPreview: true });
          console.log(
            `User @${msg.from.username} ${msg.from.id} created WAX account: ${accountName}`
          );
          return;
        } else {
          await bot.sendMessage(
            msg.chat.id,
            `😔 Account creation failed.\nPlease contact an admin in the @wax_blockchain_meetup group`
          );
          return;
        }
      } catch (error) {
        console.error(error);
      } finally {
        accountCreationPending = false;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

bot.on("/easy_account", async (msg) => {
  try {
    if(shouldIgnoreMessageInDevelopment(msg)) {
      return;
    }
    // Don't accept requests from Telegram bots
    if (msg.from.is_bot) {
      bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, bots are not allowed to create accounts`
      );
      return;
    }

    // Extracting accountName from user msg
    let [eosAccountName] = msg.text.split(" ").slice(1, 3);
    eosAccountName = eosAccountName ? eosAccountName.toLowerCase() : undefined;

    // Checking for name and key validity
    let eosAccount = await getEosAccount(eosAccountName);
    const ownerPerm = eosAccount.permissions.find(
      (p) => p.perm_name === `owner`
    );
    const activePerm = eosAccount.permissions.find(
      (p) => p.perm_name === `active`
    );
    let ownerKey = ownerPerm.required_auth.keys[0]
      ? ownerPerm.required_auth.keys[0].key
      : ``;
    let activeKey = activePerm.required_auth.keys[0]
      ? activePerm.required_auth.keys[0].key
      : ``;
    ownerKey = ownerKey || activeKey;
    activeKey = activeKey || ownerKey;

    const waxAccountName = getNextPremiumName()
    let isWaxAccountStillFree = await checkIfNameIsAvailable(waxAccountName);
    console.log(`premium name: "${waxAccountName}". Free? ${isWaxAccountStillFree}`)

    // Error message
    if (
      !config.authorizedChatGroupIds.includes(msg.chat.id) &&
      config.authorizedChatGroupIds.length !== 0
    )
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, you need to be in the @wax_blockchain_meetup group to use this bot.`
      );
    else if (!eosAccountName)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, you need to provide an EOS accountName`
      );
    else if (!/^[a-z1-5\.]{1,13}$/.test(eosAccountName))
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, your account name contains invalid characters. It must be 12 characters long and not be a special account name. Allowed characters: a-z, 1-5 or ".".`
      );
    else if (!eosAccount)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, the account "${accountName}" does not exist on EOS.`
      );
    else if (!ownerKey)
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, the account "${accountName}" does not have any keys in their owner/active permissions.`
      );
    else if (!isWaxAccountStillFree) {
      // this means the counter is wrong
      console.log(`incrementing counter because WAX premium account already existed`)
      incrementNameCounter()
      await bot.sendMessage(
        msg.chat.id,
        `😔 Sorry, something went wrong when creating the account.`
      );
    }
    // Create account process
    else {
      const canCreate = await canCreateAccount(msg);
      if (!canCreate) return;

      try {
        accountCreationPending = true;
        let blackListedUserIds = readBlackList();
        if (blackListedUserIds.includes(msg.from.id)) {
          await bot.sendMessage(
            msg.chat.id,
            `😔 Sorry, you already have created an account.`
          );
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          "Account creation in progress... ⏳"
        );
        console.log(`${waxAccountName}-${ownerKey}-${activeKey}`);
        let isCreated = await createPremiumName(
          api, waxAccountName, ownerKey, activeKey
        );
        if (isCreated) {
          incrementNameCounter()
          blackListedUserIds.push(msg.from.id);
          fs.writeFileSync(
            getBlackListedFilePath(),
            JSON.stringify(blackListedUserIds)
            );
          const message = config.shouldPostLinkToAccountAfterCreation
            ? `✅ Account created \n\nSee: https://wax.bloks.io/account/${waxAccountName}`
            : `✅ Account created`;
          await bot.sendMessage(msg.chat.id, message, { webPreview: true });
          console.log(
            `User @${msg.from.username} ${msg.from.id} created WAX account: ${waxAccountName}`
          );
          return;
        } else {
          await bot.sendMessage(
            msg.chat.id,
            `😔 Account creation failed.\nPlease contact an admin in the @wax_blockchain_meetup group`
          );
          return;
        }
      } catch (error) {
        console.error(error);
      } finally {
        accountCreationPending = false;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Display help message for users
bot.on(["/help", "/start"], (msg) => {
  if (msg.from.is_bot) return;
  bot.sendMessage(
    msg.chat.id,
    `Use "/new_account accountName publicKey" to create a new account on WAX.
Or use "/easy_account eosAccountName" to simply copy an account from EOS mainnet to WAX using the same permissions.
        
Account names should be 12 characters long, no more, no less.
Account names should only contain letters [A-Z], numbers [1-5] 
Account names can contain optionnal dots . except for the first and last characters.
`
  );
});

bot.on("text", (msg) => {
  console.log(
    `${msg.chat.id} - @${msg.from.username} (${msg.from.id} ${msg.from.first_name}): ${msg.text}`
  );
});

bot.start();

process.on("unhandledRejection", function (reason, p) {
  let message = reason ? reason.stack : reason;
  console.error(`Possibly Unhandled Rejection at: ${message}`);
  process.exit(1);
});
