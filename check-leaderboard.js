
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

let balance = 0;
let energy = 0;
let maxEnergy = 1000;
let power = 1;
let loaded = false;

async function api(endpoint, method = 'GET') {
  if (!tg?.initData) {
    throw new Error('Please open Miner TON inside Telegram.');
  }

  const response = await fetch('/api/' + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg.initData
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }

  return data;
}

function render(data) {
  balance = data.balance;
  energy = data.energy;
  maxEnergy = data.maxEnergy;
  power = data.power;
  loaded = true;

  document.getElementById('balance').textContent =
    Math.floor(balance).toLocaleString();

  document.getElementById('energy').textContent =
    energy + ' / ' + maxEnergy;

  document.getElementById('energyfill').style.width =
    (energy / maxEnergy * 100) + '%';

  document.getElementById('profileBalance').textContent =
    'Balance: ' + Math.floor(balance);

  document.getElementById('power').textContent =
    'Mining power: ' + power;

  document.getElementById('level').textContent =
    'Level: ' + (Math.floor(balance / 1000) + 1);

  document.getElementById('cost').textContent =
    100 + (power - 1) * 100;
}

async function loadPlayer() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    const endpoint = 'me' + (ref ? '?ref=' + encodeURIComponent(ref) : '');
    const data = await api(endpoint);
    render(data);

    if (data.offlineReward > 0) {
      const toast = document.getElementById('offlineToast');
      document.getElementById('offlineAmount').textContent =
        '+' + data.offlineReward.toLocaleString() + ' POINTS';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4500);
    }

    if (data.referralReward > 0) {
      alert('WELCOME BONUS: +' + data.referralReward + ' POINTS!');
    }

    loadReferrals();
  } catch (error) {
    alert(error.message);
  }
}

async function loadReferrals() {
  const field = document.getElementById('referralLink');
  try {
    const data = await api('referrals');
    document.getElementById('referralCount').textContent = data.count ?? 0;
    field.value = data.link || '';
    if (!data.link) {
      field.placeholder = 'Link missing: check BOT_USERNAME';
    }
  } catch (error) {
    field.value = '';
    field.placeholder = 'ERROR: ' + error.message;
    alert('Referral API error: ' + error.message);
    console.error('Referral API error:', error);
  }
}

async function copyReferral() {
  const field = document.getElementById('referralLink');

  if (!field.value) {
    alert('Referral link is not ready.');
    return;
  }

  field.select();
  field.setSelectionRange(0, 99999);

  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    document.execCommand('copy');
  }

  alert('Invitation link copied! Share it with your friends.');
}

async function mine() {
  if (!loaded) return;

  try {
    const data = await api('mine', 'POST');
    render(data);
    tg?.HapticFeedback?.impactOccurred('light');
  } catch (error) {
    alert(error.message);
  }
}

async function daily() {
  if (!loaded) return;

  try {
    const data = await api('daily', 'POST');
    render(data);
    alert('100 points received!');
  } catch (error) {
    alert(error.message);
  }
}

async function buyUpgrade() {
  if (!loaded) return;

  try {
    const data = await api('upgrade', 'POST');
    render(data);
    alert('Mining power upgraded!');
  } catch (error) {
    alert(error.message);
  }
}

async function buyEnergy() {
  if (!loaded) return;

  try {
    const data = await api('energy', 'POST');
    render(data);
    alert('Energy upgraded!');
  } catch (error) {
    alert(error.message);
  }
}


async function loadLeaderboard() {
  const list = document.getElementById('leaderboardList');
  const rank = document.getElementById('myRank');

  list.innerHTML = '<p class="notice">Loading players...</p>';

  try {
    const data = await api('leaderboard');

    rank.textContent = data.myRank
      ? 'YOUR RANK: #' + data.myRank + ' | ' + Number(data.myBalance).toLocaleString() + ' POINTS'
      : 'YOUR RANK: Not ranked yet';

    if (!data.players || data.players.length === 0) {
      list.innerHTML = '<p class="notice">No players yet. Be the first miner!</p>';
      return;
    }

    list.innerHTML = data.players.map(player => `
      <div class="item" style="${player.isMe ? 'border:1px solid var(--gold);color:var(--gold);' : ''}">
        <span>${player.rank <= 3 ? ['🥇','🥈','🥉'][player.rank - 1] : '#' + player.rank}
          ${player.isMe ? ' YOU' : ' MINER'}</span>
        <b>${Number(player.balance).toLocaleString()} POINTS</b>
      </div>
    `).join('');
  } catch (error) {
    list.innerHTML = '<p class="notice">Could not load ranking: ' + error.message + '</p>';
  }
}

function show(id, btn) {
  document.querySelectorAll('.section').forEach(x =>
    x.classList.remove('active')
  );

  document.getElementById(id).classList.add('active');

  document.querySelectorAll('nav button').forEach(x =>
    x.classList.remove('active')
  );

  btn.classList.add('active');

  if (id === 'referrals') {
    loadReferrals();
  }

  if (id === 'leaderboard') {
    loadLeaderboard();
  }
}

loadPlayer();

