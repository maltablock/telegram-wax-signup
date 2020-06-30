const fs = require("fs");

const getDatabasePath = () => {
  const fileName = `db.json`;
  // need to store it on a persistent volume in production
  return process.env.NODE_ENV === `production`
    ? `/storage/waxmeetup/${fileName}`
    : fileName;
};

const readDatabase = () => {
  try {
    const contents = fs.readFileSync(getDatabasePath());
    return JSON.parse(contents);
  } catch (error) {
    console.error(`Error reading database file: ${error.message}`);
    return {
      counter: 0,
    };
  }
};

const incrementNameCounter = () => {
  try {
    const db = readDatabase();
    db.counter++;
    fs.writeFileSync(getDatabasePath(), JSON.stringify(db));
  } catch (error) {
    console.error(`Error writing database file: ${error.message}`);
  }
};

function getNextPremiumName() {
  const { counter } = readDatabase();
  const letters = `abcdefghijklmnopqrstuvwxyz`.split(``);
  const digits = `12345`.split(``);
  // we start from a11, a12, a13, a14, a15, a21, a22, ..., a55
  // then go to b11

  // 25 = 5 * 5 = permutations on the two digits
  const index1 = Math.trunc(counter / 25);
  const index2 = Math.trunc((counter % 25) / 5);
  const index3 = Math.trunc(counter % 5);
  const char1 = letters[index1 % letters.length];
  const char2 = digits[index2 % digits.length];
  const char3 = digits[index3 % digits.length];
  return `${char1}${char2}${char3}.phoenix`;
}

async function createPremiumName(waxApi, name, ownerKey, activeKey) {
  const creator = `phoenix`;
  const actions = [];
  try {
    actions.push({
      account: "eosio",
      name: "newaccount",
      authorization: [
        {
          actor: creator,
          permission: `admin`,
        },
      ],
      data: {
        active: {
          accounts: [],
          keys: [
            {
              key: activeKey,
              weight: 1,
            },
          ],
          threshold: 1,
          waits: [],
        },
        creator: creator,
        name: name,
        owner: {
          accounts: [],
          keys: [
            {
              key: ownerKey,
              weight: 1,
            },
          ],
          threshold: 1,
          waits: [],
        },
      },
    });
    actions.push({
      account: "eosio",
      name: "buyrambytes",
      authorization: [
        {
          actor: creator,
          permission: `admin`,
        },
      ],
      data: {
        bytes: 6144,
        payer: creator,
        receiver: name,
      },
    });
    actions.push({
      account: "eosio",
      name: "delegatebw",
      authorization: [
        {
          actor: creator,
          permission: `admin`,
        },
      ],
      data: {
        from: creator,
        receiver: name,
        stake_cpu_quantity: "0.90000000 WAX",
        stake_net_quantity: "0.10000000 WAX",
        transfer: true,
      },
    });

    await waxApi.transact(
      {
        actions,
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

module.exports = {
  incrementNameCounter,
  getNextPremiumName,
  createPremiumName,
};
