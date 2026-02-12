(() => {
  const MAIN_W = 960;
  const MAIN_H = 600;
  const GRID_W = 96;
  const GRID_H = 60;
  const TILE = 10;

  const BIOMES = {
    water: { color: '#355f7d', move: 99, stealth: 0.2 },
    plains: { color: '#8cad67', move: 1, stealth: 1 },
    forest: { color: '#3b6f4d', move: 1.2, stealth: 1.4 },
    hills: { color: '#7f8c63', move: 1.5, stealth: 1.2 },
    ruins: { color: '#6f6f76', move: 1.1, stealth: 1.1 },
    volcanic: { color: '#6c4c3d', move: 1.8, stealth: 0.8 },
    lava: { color: '#ce5b2b', move: 99, stealth: 0.1 }
  };

  const ITEMS = [
    { name: 'Traveler Sword', type: 'weapon', power: 11 },
    { name: 'Knight Spear', type: 'weapon', power: 14 },
    { name: 'Woodcutter Axe', type: 'weapon', power: 9 },
    { name: 'Healing Herb', type: 'med', heal: 14 },
    { name: 'Baked Apple', type: 'food', hunger: 18 },
    { name: 'Mushroom Skewer', type: 'food', hunger: 24 },
    { name: 'Waterskin', type: 'water', thirst: 22 },
    { name: 'Smoke Bomb', type: 'utility', evade: 0.2 },
    { name: 'Ancient Arrow', type: 'weapon', power: 18 }
  ];

  const names = [
    'Linka', 'Zera', 'Mido', 'Revali', 'Riju', 'Sidon', 'Urbosa', 'Darun',
    'Impa', 'Paya', 'Kass', 'Yiga', 'Teba', 'Mipha', 'Hestu', 'Purah'
  ];

  class RNG {
    constructor(seed = Date.now() % 2147483647) { this.s = seed || 1; }
    next() { this.s = (this.s * 48271) % 2147483647; return this.s / 2147483647; }
    int(a, b) { return Math.floor(this.next() * (b - a + 1)) + a; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
  }

  class Tribute {
    constructor(id, name, teamId, x, y, rng) {
      this.id = id;
      this.name = name;
      this.teamId = teamId;
      this.x = x;
      this.y = y;
      this.hp = rng.int(80, 110);
      this.maxHp = this.hp;
      this.combat = rng.int(6, 16);
      this.stealth = rng.int(6, 16);
      this.morale = rng.int(40, 90);
      this.hunger = 100;
      this.thirst = 100;
      this.alive = true;
      this.inventory = [structuredClone(rng.pick(ITEMS)), structuredClone(rng.pick(ITEMS))];
      this.alliance = null;
      this.revengeTargets = new Set();
      this.kills = 0;
    }
    get weaponPower() {
      return this.inventory.filter(i => i.type === 'weapon').reduce((a, i) => a + (i.power || 0), 0);
    }
  }

  const state = {
    rng: new RNG(20260212),
    map: [],
    tributes: [],
    teams: new Map(),
    alliances: new Map(),
    time: 0,
    day: 1,
    running: false,
    speed: 3,
    selectedId: null,
    volcano: { x: 78, y: 12, heat: 0, erupting: false, turns: 0 }
  };

  const els = {
    main: document.getElementById('mainMap'),
    mini: document.getElementById('miniMap'),
    eventLog: document.getElementById('eventLog'),
    deathLog: document.getElementById('deathLog'),
    status: document.getElementById('status'),
    tributesList: document.getElementById('tributesList'),
    alliancesView: document.getElementById('alliancesView'),
    inv: document.getElementById('inventoryView'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    stepBtn: document.getElementById('stepBtn'),
    resetBtn: document.getElementById('resetBtn'),
    speedInput: document.getElementById('speedInput')
  };

  const ctx = els.main.getContext('2d');
  const miniCtx = els.mini.getContext('2d');

  function log(msg, type = 'event') {
    const li = document.createElement('li');
    li.textContent = `[D${state.day} T${state.time}] ${msg}`;
    if (type === 'death') els.deathLog.prepend(li);
    else els.eventLog.prepend(li);
  }

  function biomeAt(x, y) {
    x = Math.max(0, Math.min(GRID_W - 1, x));
    y = Math.max(0, Math.min(GRID_H - 1, y));
    return state.map[y][x];
  }

  function generateMap() {
    state.map = Array.from({ length: GRID_H }, (_, y) =>
      Array.from({ length: GRID_W }, (_, x) => {
        const dx = x - state.volcano.x;
        const dy = y - state.volcano.y;
        const d = Math.hypot(dx, dy);
        const n = Math.sin(x * 0.23) + Math.cos(y * 0.17) + Math.sin((x + y) * 0.07);
        if (x < 8 && y > 40) return 'water';
        if (d < 5) return 'volcanic';
        if (d < 3) return 'lava';
        if (n > 1.1) return 'forest';
        if (n > 0.3) return 'plains';
        if (n > -0.5) return 'hills';
        return 'ruins';
      })
    );
  }

  function createCast() {
    state.tributes = [];
    state.teams.clear();
    state.alliances.clear();

    const teamNames = ['Gerudo', 'Rito', 'Zora', 'Goron'];
    teamNames.forEach((n, i) => state.teams.set(i, { id: i, name: n, members: [] }));

    names.forEach((n, i) => {
      let x, y;
      do {
        x = state.rng.int(2, GRID_W - 3);
        y = state.rng.int(2, GRID_H - 3);
      } while (biomeAt(x, y) === 'water' || biomeAt(x, y) === 'lava');

      const teamId = i % teamNames.length;
      const t = new Tribute(i, n, teamId, x, y, state.rng);
      state.tributes.push(t);
      state.teams.get(teamId).members.push(t.id);
    });

    state.alliances.set('A1', { id: 'A1', members: [0, 5, 8], trust: 70, objective: 'hunt' });
    state.alliances.set('A2', { id: 'A2', members: [2, 7, 11], trust: 65, objective: 'gather' });
    for (const a of state.alliances.values()) for (const id of a.members) {
      const tr = state.tributes[id];
      if (tr) tr.alliance = a.id;
    }
    log('Arena initialized. The hunt begins soon.');
  }

  function aliveTributes() { return state.tributes.filter(t => t.alive); }

  function moveTribute(t) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]];
    const revenge = [...t.revengeTargets].map(id => state.tributes[id]).filter(x => x?.alive)[0];
    let target = null;
    if (revenge) target = { x: revenge.x, y: revenge.y };
    else if (t.alliance && state.rng.chance(0.35)) {
      const allies = state.alliances.get(t.alliance).members.map(id => state.tributes[id]).filter(x => x?.alive && x.id !== t.id);
      if (allies.length) target = state.rng.pick(allies);
    }

    let best = { x: t.x, y: t.y, score: -1e9 };
    for (const [dx, dy] of dirs) {
      const nx = Math.max(0, Math.min(GRID_W - 1, t.x + dx));
      const ny = Math.max(0, Math.min(GRID_H - 1, t.y + dy));
      const b = biomeAt(nx, ny);
      if (b === 'water' || b === 'lava') continue;
      let score = state.rng.next() * 2 - BIOMES[b].move;
      if (target) score += (20 - Math.hypot(target.x - nx, target.y - ny)) * 0.2;
      if (b === 'forest') score += t.stealth * 0.03;
      if (b === 'volcanic') score -= 0.6;
      if (score > best.score) best = { x: nx, y: ny, score };
    }
    t.x = best.x;
    t.y = best.y;
  }

  function consumeResources(t) {
    t.hunger -= state.rng.int(2, 4);
    t.thirst -= state.rng.int(3, 6);
    if (t.hunger < 40 || t.thirst < 40) t.morale -= 2;
    if (t.hunger < 10 || t.thirst < 10) t.hp -= state.rng.int(2, 5);

    if (state.rng.chance(0.16)) {
      const food = t.inventory.find(i => i.type === 'food');
      const water = t.inventory.find(i => i.type === 'water');
      if (food && t.hunger < 70) {
        t.hunger = Math.min(100, t.hunger + food.hunger);
        t.inventory.splice(t.inventory.indexOf(food), 1);
        log(`${t.name} eats ${food.name}.`);
      }
      if (water && t.thirst < 70) {
        t.thirst = Math.min(100, t.thirst + water.thirst);
        t.inventory.splice(t.inventory.indexOf(water), 1);
        log(`${t.name} drinks from a ${water.name}.`);
      }
    }
  }

  function randomEvent(t) {
    if (!state.rng.chance(0.1)) return;
    const roll = state.rng.next();
    if (roll < 0.2) {
      const item = structuredClone(state.rng.pick(ITEMS));
      t.inventory.push(item);
      log(`${t.name} scavenged ${item.name} in the wilds.`);
    } else if (roll < 0.38) {
      t.hp -= state.rng.int(3, 9);
      log(`${t.name} is hurt by a hidden trap in the ruins.`);
    } else if (roll < 0.55) {
      t.morale += 8;
      log(`${t.name} found an ancient shrine and regained spirit.`);
    } else if (roll < 0.73) {
      t.morale -= 12;
      log(`${t.name} is haunted by distant screams.`);
    } else {
      const med = t.inventory.find(i => i.type === 'med');
      if (med && t.hp < t.maxHp) {
        t.hp = Math.min(t.maxHp, t.hp + med.heal);
        t.inventory.splice(t.inventory.indexOf(med), 1);
        log(`${t.name} used ${med.name} to recover.`);
      }
    }
  }

  function relationshipEvent(a, b) {
    if (a.teamId === b.teamId && state.rng.chance(0.4)) {
      const shareItem = a.inventory.pop();
      if (shareItem) {
        b.inventory.push(shareItem);
        log(`${a.name} shares ${shareItem.name} with teammate ${b.name}.`);
      }
      return true;
    }

    if (a.alliance && b.alliance && a.alliance === b.alliance && state.rng.chance(0.5)) {
      const al = state.alliances.get(a.alliance);
      if (al) al.trust = Math.min(100, al.trust + 1);
      log(`${a.name} and ${b.name} coordinate a patrol for alliance ${a.alliance}.`);
      return true;
    }

    if (!a.alliance && !b.alliance && state.rng.chance(0.12)) {
      const id = `A${state.alliances.size + 1}`;
      state.alliances.set(id, { id, members: [a.id, b.id], trust: 58, objective: 'survive' });
      a.alliance = id;
      b.alliance = id;
      log(`${a.name} and ${b.name} forge a fragile alliance ${id}.`);
      return true;
    }

    if (a.alliance && b.alliance && a.alliance === b.alliance) {
      const al = state.alliances.get(a.alliance);
      if (al && state.rng.chance((100 - al.trust) / 330)) {
        al.trust -= 14;
        a.alliance = null;
        al.members = al.members.filter(id => id !== a.id);
        log(`${a.name} betrays alliance ${al.id} and vanishes into the hills!`);
        return true;
      }
    }

    return false;
  }

  function killTribute(victim, killer, reason) {
    victim.alive = false;
    victim.hp = 0;
    log(`${victim.name} dies (${reason}).`, 'death');
    if (killer) {
      killer.kills += 1;
      log(`${killer.name} eliminated ${victim.name}.`);
      for (const ally of state.tributes.filter(t => t.alive && (t.teamId === victim.teamId || t.alliance === victim.alliance))) {
        if (ally.id !== killer.id) ally.revengeTargets.add(killer.id);
      }
      killer.inventory.push(...victim.inventory.splice(0));
    }
    if (victim.alliance) {
      const a = state.alliances.get(victim.alliance);
      if (a) a.members = a.members.filter(id => id !== victim.id);
    }
  }

  function fight(a, b) {
    const ba = biomeAt(a.x, a.y);
    const bb = biomeAt(b.x, b.y);
    const scoreA = a.combat + a.weaponPower * 0.45 + a.morale * 0.1 + BIOMES[ba].stealth + (a.revengeTargets.has(b.id) ? 8 : 0) + state.rng.int(-6, 6);
    const scoreB = b.combat + b.weaponPower * 0.45 + b.morale * 0.1 + BIOMES[bb].stealth + (b.revengeTargets.has(a.id) ? 8 : 0) + state.rng.int(-6, 6);

    const dmgToB = Math.max(4, Math.floor(scoreA * 0.28));
    const dmgToA = Math.max(4, Math.floor(scoreB * 0.28));

    b.hp -= dmgToB;
    a.hp -= dmgToA;
    log(`${a.name} clashes with ${b.name} (${dmgToB}/${dmgToA} dmg).`);

    if (b.hp <= 0 && a.alive) killTribute(b, a, `defeated by ${a.name}`);
    if (a.hp <= 0 && b.alive) killTribute(a, b, `defeated by ${b.name}`);
  }

  function resolveEncounters() {
    const alive = aliveTributes();
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (!a.alive || !b.alive) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 2.3) continue;

        const cooperative = relationshipEvent(a, b);
        if (cooperative) continue;

        const aggression = 0.38 + (a.revengeTargets.has(b.id) || b.revengeTargets.has(a.id) ? 0.28 : 0) + ((100 - a.morale) / 500) + ((100 - b.morale) / 500);
        if (state.rng.chance(aggression)) fight(a, b);
        else if (state.rng.chance(0.24)) {
          log(`${a.name} and ${b.name} exchange tense words, then separate.`);
        }
      }
    }
  }

  function volcanoTick() {
    state.volcano.heat += state.rng.next() * 0.8;
    if (!state.volcano.erupting && state.rng.chance(0.03 + state.volcano.heat * 0.003)) {
      state.volcano.erupting = true;
      state.volcano.turns = state.rng.int(3, 7);
      log('🌋 Death Mountain erupts! Lava bombs rain across volcanic zones.');
    }

    if (state.volcano.erupting) {
      state.volcano.turns--;
      for (const t of aliveTributes()) {
        const d = Math.hypot(t.x - state.volcano.x, t.y - state.volcano.y);
        if (d < 12 && state.rng.chance(0.35)) {
          const hit = state.rng.int(8, 26);
          t.hp -= hit;
          t.morale -= 10;
          log(`${t.name} is scorched by volcanic ash (${hit} dmg).`);
          if (t.hp <= 0) killTribute(t, null, 'consumed by eruption');
        }
      }
      if (state.volcano.turns <= 0) {
        state.volcano.erupting = false;
        state.volcano.heat *= 0.5;
        log('The eruption fades, leaving smoke over the arena.');
      }
    }
  }

  function cleanupDeaths() {
    for (const t of state.tributes) {
      if (t.alive && t.hp <= 0) killTribute(t, null, 'succumbed to injuries');
    }
  }

  function runTick() {
    state.time++;
    if (state.time % 20 === 0) state.day++;

    for (const t of aliveTributes()) {
      moveTribute(t);
      consumeResources(t);
      randomEvent(t);
    }
    resolveEncounters();
    volcanoTick();
    cleanupDeaths();
    draw();

    const alive = aliveTributes();
    if (alive.length <= 1) {
      state.running = false;
      if (alive[0]) log(`🏆 ${alive[0].name} wins the Wilds Hunger Games!`);
      else log('No one survived the wilds.');
    }
  }

  function drawMap(context, scale) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        context.fillStyle = BIOMES[state.map[y][x]].color;
        context.fillRect(x * TILE * scale, y * TILE * scale, TILE * scale, TILE * scale);
      }
    }

    context.fillStyle = '#f2b35d';
    context.beginPath();
    context.arc(state.volcano.x * TILE * scale + 5 * scale, state.volcano.y * TILE * scale + 5 * scale, 8 * scale, 0, Math.PI * 2);
    context.fill();
  }

  function drawTributes(context, scale) {
    for (const t of state.tributes) {
      if (!t.alive) continue;
      context.fillStyle = ['#58d4ff', '#ffb26b', '#78ff7f', '#d5a3ff'][t.teamId % 4];
      context.beginPath();
      context.arc(t.x * TILE * scale + 5 * scale, t.y * TILE * scale + 5 * scale, 4 * scale, 0, Math.PI * 2);
      context.fill();
      if (t.id === state.selectedId) {
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(t.x * TILE * scale + 5 * scale, t.y * TILE * scale + 5 * scale, 7 * scale, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawUI() {
    const alive = aliveTributes();
    els.status.innerHTML = `
      Day <b>${state.day}</b> | Tick <b>${state.time}</b><br>
      Alive: <b>${alive.length}/${state.tributes.length}</b><br>
      Volcano: <span class="tag ${state.volcano.erupting ? 'bad' : 'good'}">${state.volcano.erupting ? 'ERUPTING' : 'Stable'}</span>
    `;

    els.tributesList.innerHTML = '';
    for (const t of state.tributes) {
      const li = document.createElement('li');
      li.className = t.alive ? '' : 'dead';
      li.textContent = `${t.name} (T${t.teamId}) HP:${Math.max(0, Math.round(t.hp))} H:${Math.round(t.hunger)} W:${Math.round(t.thirst)} K:${t.kills}`;
      li.onclick = () => { state.selectedId = t.id; draw(); };
      els.tributesList.appendChild(li);
    }

    els.alliancesView.innerHTML = '';
    for (const team of state.teams.values()) {
      const aliveMembers = team.members.map(id => state.tributes[id]).filter(t => t?.alive).map(t => t.name);
      const div = document.createElement('div');
      div.textContent = `Team ${team.name}: ${aliveMembers.join(', ') || 'eliminated'}`;
      els.alliancesView.appendChild(div);
    }
    for (const al of state.alliances.values()) {
      const members = al.members.map(id => state.tributes[id]).filter(t => t?.alive).map(t => t.name);
      const div = document.createElement('div');
      div.innerHTML = `<b>${al.id}</b> [trust ${Math.max(0, Math.round(al.trust))}] (${al.objective}): ${members.join(', ') || 'broken'}`;
      els.alliancesView.appendChild(div);
    }

    const selected = state.tributes.find(t => t.id === state.selectedId);
    if (selected) {
      els.inv.innerHTML = `
        <b>${selected.name}</b><br>
        Team: ${state.teams.get(selected.teamId)?.name ?? selected.teamId}<br>
        Alliance: ${selected.alliance ?? 'none'}<br>
        Revenge: ${[...selected.revengeTargets].map(id => state.tributes[id]?.name).filter(Boolean).join(', ') || 'none'}<br>
        Inventory: ${selected.inventory.map(i => i.name).join(', ') || 'empty'}
      `;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, MAIN_W, MAIN_H);
    miniCtx.clearRect(0, 0, els.mini.width, els.mini.height);

    drawMap(ctx, 1);
    drawTributes(ctx, 1);
    drawMap(miniCtx, 0.25);
    drawTributes(miniCtx, 0.25);

    drawUI();
  }

  let interval = null;
  function runLoop() {
    clearInterval(interval);
    interval = setInterval(() => {
      if (!state.running) return;
      for (let i = 0; i < state.speed; i++) {
        if (!state.running) break;
        runTick();
      }
    }, 500);
  }

  function reset() {
    state.time = 0;
    state.day = 1;
    state.running = false;
    state.selectedId = null;
    state.volcano.heat = 0;
    state.volcano.erupting = false;
    state.volcano.turns = 0;
    els.eventLog.innerHTML = '';
    els.deathLog.innerHTML = '';
    generateMap();
    createCast();
    draw();
  }

  els.startBtn.onclick = () => { state.running = true; };
  els.pauseBtn.onclick = () => { state.running = false; };
  els.stepBtn.onclick = () => { state.running = false; runTick(); };
  els.resetBtn.onclick = () => reset();
  els.speedInput.oninput = e => { state.speed = Number(e.target.value); };

  runLoop();
  reset();
})();
