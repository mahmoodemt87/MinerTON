
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
    const data = await api('me');
    render(data);
  } catch (error) {
    alert(error.message);
  }
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

function show(id, btn) {
  document.querySelectorAll('.section').forEach(x =>
    x.classList.remove('active')
  );

  document.getElementById(id).classList.add('active');

  document.querySelectorAll('nav button').forEach(x =>
    x.classList.remove('active')
  );

  btn.classList.add('active');
}

loadPlayer();

