const dotenv = require("dotenv")
dotenv.config()

const { EOSIO_PRIVATE_KEY, TELEGRAM_BOT_API_KEY, WAX_ACCOUNT_NAME, WAX_PERMISSION } = process.env
if(!EOSIO_PRIVATE_KEY || !TELEGRAM_BOT_API_KEY) throw new Error(`Missing secret env variables`)
const config = {
    "keys": {
        "bot": TELEGRAM_BOT_API_KEY,
        "wax": EOSIO_PRIVATE_KEY,
    },
    "authorizedChatGroupIds": [-1001442837218],
    "waxAccountName": WAX_ACCOUNT_NAME || "waxmeetupbot",
    "waxPermission": WAX_PERMISSION || "active",
    "waxSmartContractName": "signupwaxwax",
    "waxAmount": "1.50000000 WAX",
    "apiEndpoint": "https://chain.wax.io",
    "shouldPostLinkToAccountAfterCreation": true
}

module.exports = config