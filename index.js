
require('dotenv').config();

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '{}');
}

let users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function saveUsers() {
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(users, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function verifyTelegram(initData) {
  if (!process.env.BOT_TOKEN || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDate = Number(params.get('auth_date'));

    if (!hash || !authDate) return null;
    if (Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(calculatedHash, 'hex');

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const user = JSON.parse(params.get('user') || '{}');

    if (!user.id) return null;

    return user;
  } catch {
    return null;
  }
}

function requireTelegram(req, res, next) {
  const user = verifyTelegram(req.headers['x-telegram-init-data']);

  if (!user) {
    return res.status(401).json({
      error: 'Please open Miner TON inside Telegram.'
    });
  }

  req.telegramUser = user;
  next();
}

function getPlayer(id) {
  if (!users[id]) {
    users[id] = {
      balance: 0,
      energy: 1000,
      maxEnergy: 1000,
      power: 1,
      lastDaily: '',
      lastEnergyUpdate: Date.now()
    };
    saveUsers();
  }

  return users[id];
}

function regenerateEnergy(player) {
  const now = Date.now();
  const rate = 60 * 1000;

  if (!player.lastEnergyUpdate) {
    player.lastEnergyUpdate = now;
    return;
  }

  const elapsed = Math.max(0, now - player.lastEnergyUpdate);
  const recovered = Math.floor(elapsed / rate);

  if (recovered > 0) {
    player.energy = Math.min(
      player.maxEnergy,
      player.energy + recovered
    );

    player.lastEnergyUpdate += recovered * rate;
  }

  if (player.energy >= player.maxEnergy) {
    player.energy = player.maxEnergy;
    player.lastEnergyUpdate = now;
  }
}

function collectOfflineReward(player) {
  const now = Date.now();
  const maxOfflineTime = 8 * 60 * 60 * 1000;

  if (!player.lastSeen) {
    player.lastSeen = now;
    return 0;
  }

  const elapsed = Math.max(
    0,
    Math.min(now - player.lastSeen, maxOfflineTime)
  );

  const minutes = Math.floor(elapsed / 60000);
  const reward = minutes * player.power;

  player.lastSeen = now;
  player.balance += reward;

  return reward;
}

function playerResponse(player, offlineReward = 0) {
  regenerateEnergy(player);

  return {
    balance: player.balance,
    energy: player.energy,
    maxEnergy: player.maxEnergy,
    power: player.power,
    vipTier: player.vipTier || null,
    vipPowerBonus: player.vipPowerBonus || 0,
    level: Math.floor(player.balance / 1000) + 1,
    offlineReward
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'online', project: 'Miner TON' });
});

app.get('/api/me', requireTelegram, (req, res) => {
  const userId = String(req.telegramUser.id);
  const isNewUser = !users[userId];
  const player = getPlayer(userId);
  let referralReward = 0;

  const referrerId = String(req.query.ref || '');

  if (
    isNewUser &&
    /^\d+$/.test(referrerId) &&
    referrerId !== userId &&
    users[referrerId]
  ) {
    const referrer = getPlayer(referrerId);
    referrer.referrals = Array.isArray(referrer.referrals)
      ? referrer.referrals : [];

    if (!referrer.referrals.includes(userId)) {
      player.referredBy = referrerId;
      player.balance += 100;
      referrer.balance += 500;
      referrer.referrals.push(userId);
      referralReward = 100;
    }
  }

  const offlineReward = collectOfflineReward(player);
  saveUsers();

  const response = playerResponse(player, offlineReward);
  response.referralReward = referralReward;
  res.json(response);
});

app.post('/api/mine', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  regenerateEnergy(player);

  if (player.energy < player.power) {
    return res.status(400).json({ error: 'Not enough energy!' });
  }

  player.balance += player.power;
  player.energy -= player.power;

  const today = new Date().toISOString().slice(0, 10);

  if (player.dailyMineDate !== today) {
    player.dailyMineDate = today;
    player.dailyMines = 0;
    player.dailyMissionClaimed = false;
  }

  player.dailyMines = (player.dailyMines || 0) + 1;

  saveUsers();
  res.json(playerResponse(player));
});

app.post('/api/daily', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  const today = new Date().toISOString().slice(0, 10);

  if (player.lastDaily === today) {
    return res.status(400).json({ error: 'Daily reward already claimed!' });
  }

  player.balance += 100;
  player.lastDaily = today;

  saveUsers();
  res.json(playerResponse(player));
});

app.post('/api/upgrade', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  const cost = 100 + (player.power - 1) * 100;

  if (player.balance < cost) {
    return res.status(400).json({ error: 'Not enough points!' });
  }

  player.balance -= cost;
  player.power += 1;

  saveUsers();
  res.json(playerResponse(player));
});



const VIP_TIERS = {
  bronze: { name: 'VIP Bronze', price: 5000, bonus: 1 },
  gold: { name: 'VIP Gold', price: 15000, bonus: 3 },
  diamond: { name: 'VIP Diamond', price: 40000, bonus: 7 }
};

app.get('/api/vip', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));

  res.json({
    owned: player.vipTier || null,
    powerBonus: player.vipPowerBonus || 0,
    tiers: VIP_TIERS
  });
});

app.post('/api/vip/buy', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  const tier = VIP_TIERS[req.body?.tier];

  if (!tier) {
    return res.status(400).json({ error: 'Invalid VIP package.' });
  }

  if (player.vipTier) {
    return res.status(400).json({ error: 'You already own a VIP membership.' });
  }

  if (player.balance < tier.price) {
    return res.status(400).json({ error: 'Not enough points for this VIP package.' });
  }

  player.balance -= tier.price;
  player.power += tier.bonus;
  player.vipTier = req.body.tier;
  player.vipPowerBonus = tier.bonus;

  saveUsers();

  res.json({
    success: true,
    tier: player.vipTier,
    powerBonus: player.vipPowerBonus,
    player: playerResponse(player)
  });
});

app.get('/api/leaderboard', requireTelegram, (req, res) => {
  const userId = String(req.telegramUser.id);

  const players = Object.entries(users)
    .map(([id, player]) => ({
      id,
      balance: Number(player.balance) || 0
    }))
    .sort((a, b) => b.balance - a.balance);

  const myIndex = players.findIndex(player => player.id === userId);

  const topPlayers = players.slice(0, 100).map((player, index) => ({
    rank: index + 1,
    balance: player.balance,
    isMe: player.id === userId
  }));

  res.json({
    players: topPlayers,
    myRank: myIndex === -1 ? null : myIndex + 1,
    myBalance: myIndex === -1 ? 0 : players[myIndex].balance
  });
});


app.get('/api/task', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  const today = new Date().toISOString().slice(0, 10);

  if (player.dailyMineDate !== today) {
    player.dailyMineDate = today;
    player.dailyMines = 0;
    player.dailyMissionClaimed = false;
    saveUsers();
  }

  res.json({
    progress: player.dailyMines || 0,
    goal: 100,
    reward: 250,
    claimed: !!player.dailyMissionClaimed,
    canClaim: (player.dailyMines || 0) >= 100 && !player.dailyMissionClaimed
  });
});

app.post('/api/task/claim', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));
  const today = new Date().toISOString().slice(0, 10);

  if (player.dailyMineDate !== today) {
    player.dailyMineDate = today;
    player.dailyMines = 0;
    player.dailyMissionClaimed = false;
  }

  if ((player.dailyMines || 0) < 100) {
    return res.status(400).json({ error: 'Complete 100 mines first!' });
  }

  if (player.dailyMissionClaimed) {
    return res.status(400).json({ error: 'Daily mission reward already claimed!' });
  }

  player.balance += 250;
  player.dailyMissionClaimed = true;

  saveUsers();
  res.json({
    success: true,
    reward: 250,
    progress: player.dailyMines,
    claimed: true,
    balance: player.balance
  });
});

app.get('/api/referrals', requireTelegram, (req, res) => {
  const userId = String(req.telegramUser.id);
  const player = getPlayer(userId);
  const referrals = Array.isArray(player.referrals)
    ? player.referrals : [];

  const username = (process.env.BOT_USERNAME || '').replace(/^@/, '');

  res.json({
    count: referrals.length,
    rewardPerFriend: 500,
    friendBonus: 100,
    link: username
      ? `https://t.me/${username}?start=ref_${userId}`
      : ''
  });
});

app.post('/api/energy', requireTelegram, (req, res) => {
  const player = getPlayer(String(req.telegramUser.id));

  if (player.balance < 200) {
    return res.status(400).json({ error: 'Not enough points!' });
  }

  player.balance -= 200;
  player.maxEnergy += 500;
  player.energy = player.maxEnergy;

  saveUsers();
  res.json(playerResponse(player));
});

if (process.env.BOT_TOKEN) {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.start((ctx) => {
    const url = process.env.APP_URL;

    if (url && url.startsWith('https://')) {
      const match = /^ref_(\d+)$/.exec(ctx.startPayload || '');
      const webUrl = new URL(url);

      if (match) {
        webUrl.searchParams.set('ref', match[1]);
      }

      return ctx.reply(
        'Welcome to Miner TON! 🚀',
        Markup.inlineKeyboard([
          Markup.button.webApp('🚀 PLAY NOW', webUrl.toString())
        ])
      );
    }

    return ctx.reply('Welcome to Miner TON! 🚀');
  });

  bot.launch()
    .then(() => console.log('Telegram bot is online!'))
    .catch(err => console.error('Bot error:', err.message));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Miner TON running on port ${PORT}`);
});

