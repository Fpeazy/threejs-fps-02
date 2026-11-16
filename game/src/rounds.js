// Rounds and economy: BUY (15 s) -> LIVE (100 s) -> END (5 s), first to 8,
// max 15 rounds (+ overtime on a tie). Win by elimination, bomb explosion,
// defuse, or the timer. Money: kill +$300, round win +$3250, loss +$1900,
// plant/defuse +$300. The bomb rides with the player; on death it drops and
// the nearest alive EMBER bot picks it up.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 40;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 8;
export const MAX_ROUNDS = 15;

export function createRounds() {
  const state = {
    phase: 'BUY', phaseT: BUY_SECONDS, round: 1,
    score: { ember: 0, lantern: 0 },
    bomb: { planted: false, site: null, pos: null, timer: 0 },
    plant: { by: null, at: null, progress: 0 },
    defuse: { by: null, progress: 0 },
    matchOver: false, winner: null, lastReason: '',
  };

  function startRound() {
    state.phase = 'BUY';
    state.phaseT = BUY_SECONDS;
    state.bomb = { planted: false, site: null, pos: null, timer: 0 };
    state.plant = { by: null, at: null, progress: 0 };
    state.defuse = { by: null, progress: 0 };
  }

  function endRound(winner, reason) {
    state.score[winner] += 1;
    state.lastReason = reason;
    state.phase = 'END';
    state.phaseT = 5;
    const s = state.score;
    if (s[winner] >= WIN_ROUNDS || (state.round >= MAX_ROUNDS && s.ember !== s.lantern)) {
      state.matchOver = true;
      state.winner = s.ember > s.lantern ? 'ember' : 'lantern';
    }
  }

  return {
    state,
    startMatch() {
      state.score = { ember: 0, lantern: 0 };
      state.round = 1;
      state.matchOver = false;
      state.winner = null;
      startRound();
    },
    startRound,
    // Tick the phase machine. alive = { ember, lantern } counts. Returns an
    // event object when the round or match ends, else null.
    tick(dt) {
      state.phaseT -= dt;
      if (state.bomb.planted) {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) {
          endRound('ember', 'The charge detonated at ' + state.bomb.site);
          return { roundEnd: true, winner: 'ember', reason: state.lastReason };
        }
      }
      if (state.phase === 'BUY' && state.phaseT <= 0) {
        state.phase = 'LIVE';
        state.phaseT = ROUND_SECONDS;
      } else if (state.phase === 'END' && state.phaseT <= 0) {
        if (state.matchOver) return { matchEnd: true, winner: state.winner };
        state.round += 1;
        startRound();
        return { nextRound: true, round: state.round };
      }
      return null;
    },
    // Win checks called from the sim after deaths: returns the event or null.
    checkElimination(alive) {
      if (state.phase !== 'LIVE' && state.phase !== 'BUY') return null;
      if (state.bomb.planted) {
        if (alive.ember === 0) {
          endRound('lantern', 'All attackers eliminated after the plant');
          return { roundEnd: true, winner: 'lantern', reason: state.lastReason };
        }
        return null;
      }
      if (alive.ember === 0 && alive.lantern > 0) {
        endRound('lantern', 'All attackers eliminated');
        return { roundEnd: true, winner: 'lantern', reason: state.lastReason };
      }
      if (alive.lantern === 0 && alive.ember > 0) {
        endRound('ember', 'All defenders eliminated');
        return { roundEnd: true, winner: 'ember', reason: state.lastReason };
      }
      return null;
    },
    checkTimer() {
      if (state.phase !== 'LIVE' || state.phaseT > 0) return null;
      if (state.bomb.planted) return null; // plays out until boom or defuse
      endRound('lantern', 'Time expired — the defence holds');
      return { roundEnd: true, winner: 'lantern', reason: state.lastReason };
    },
    plant(site, pos) {
      state.bomb = { planted: true, site, pos: { x: pos.x, z: pos.z }, timer: BOMB_SECONDS };
      state.plant = { by: null, at: null, progress: 0 };
    },
    defused() {
      state.bomb = { planted: false, site: null, pos: null, timer: 0 };
      state.defuse = { by: null, progress: 0 };
      endRound('lantern', 'The charge was defused');
      return { roundEnd: true, winner: 'lantern', reason: state.lastReason };
    },
    // Channel progress for a planter/defuser; returns true when complete.
    plantProgress(by, site, dt) {
      if (state.plant.by !== by) { state.plant = { by, at: site, progress: 0 }; }
      state.plant.progress += dt;
      return state.plant.progress >= PLANT_SECONDS;
    },
    defuseProgress(by, dt) {
      if (state.defuse.by !== by) { state.defuse = { by, progress: 0 }; }
      state.defuse.progress += dt;
      return state.defuse.progress >= DEFUSE_SECONDS;
    },
    cancelChannels() {
      state.plant = { by: null, at: null, progress: 0 };
      state.defuse = { by: null, progress: 0 };
    },
    awardKill(player) { player.cash += 300; },
    awardRound(player, winner) { player.cash += winner === 'ember' ? 3250 : 1900; },
    awardPlant(player) { player.cash += 300; },
    awardDefuse(player) { player.cash += 300; },
  };
}
