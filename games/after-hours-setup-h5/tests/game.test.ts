import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { test } from 'node:test';
import {
  canDeleteMail,
  claimMailMoney,
  decodeSave,
  deleteMail,
  deleteReadMails,
  markMailRead,
  newSave,
  recordCleanInstall,
  recoverMail,
  triggerVoodooSubscription,
} from '../src/game.ts';
import {
  INSTALLER_SPECS,
  createInitialPuzzleState,
  evaluateInstaller,
  type CheckOption,
  type InstallerPuzzleState,
} from '../src/installers/specs.ts';
import { NIGHT_TRACKS, RetroAudio } from '../src/audio.ts';
import type { ClearedId, InstallerId } from '../src/types.ts';

function solveChecks(specId: InstallerId): InstallerPuzzleState {
  const spec = INSTALLER_SPECS[specId];
  const state = createInitialPuzzleState(spec);
  const applyClean = (list?: CheckOption[]) => {
    if (!list) return;
    for (const opt of list) {
      state.checks[opt.id] = opt.cleanWhenChecked;
    }
  };
  applyClean(spec.preAd1Checks);
  applyClean(spec.preAd2Checks);
  applyClean(spec.welcomeChecks);
  applyClean(spec.moreChecks);
  applyClean(spec.gearChecks);
  applyClean(spec.checklistChecks);
  applyClean(spec.agreementMoreChecks);
  applyClean(spec.pathChecks);
  applyClean(spec.exitDialogChecks);
  applyClean(spec.artworkHiddenChecks);
  applyClean(spec.finishChecks);
  applyClean(spec.extraFinishChecks);
  if (spec.agreementCheckInsideScroll) {
    state.checks[spec.agreementCheckInsideScroll.id] = spec.agreementCheckInsideScroll.cleanWhenChecked;
  }
  if (spec.welcomeInit?.disappearingCheck) {
    state.checks[spec.welcomeInit.disappearingCheck.id] = spec.welcomeInit.disappearingCheck.cleanWhenChecked;
  }
  if (spec.splashInit?.cancelOffersLite || spec.rightClickLiteMenu) state.liteMode = true;
  if (spec.pages.includes('mode')) state.installMode = 'custom';
  if (spec.agreementHiddenButton) state.lettershopForbidden = true;
  if (spec.mhnAgreementTrap) state.mhnCleanAgreement = true;
  if (spec.id === 'mantis') state.mantisRealMode = true;
  if (spec.mantisEulaClauses) state.mantisDetached = [true, true, true];
  if (spec.voodooStrikeLabel) state.voodooFooterStruck = true;
  return state;
}

test('all 16 real installers fail with defaults and pass with zero bundles when solved', () => {
  const realIds: ClearedId[] = [
    'doghouse', 'gnome', 'bread', 'pet', 'accel', 'eyecare',
    'lettershop', 'ccsst', 'seedking', 'mhn', 'banquet', 'mediation',
    'zdesign', 'kindoor', 'mantis', 'voodoo_real',
  ];

  for (const id of realIds) {
    const spec = INSTALLER_SPECS[id];
    const defaultState = createInitialPuzzleState(spec);
    assert(evaluateInstaller(spec, defaultState) > 0, `${id} should have >=1 bundle by default`);

    const solvedState = solveChecks(id);
    assert.equal(evaluateInstaller(spec, solvedState), 0, `${id} should evaluate to 0 bundles when solved`);
  }

  // Decoy voodoo wrapper can never pass cleanly on its own.
  const decoy = INSTALLER_SPECS.voodoo;
  assert(evaluateInstaller(decoy, solveChecks('voodoo')) >= 1);
});

test('wordplay checklist polarity requires keeping negative opt-outs checked', () => {
  const gnome = INSTALLER_SPECS.gnome;
  const solved = solveChecks('gnome');
  // Unchecking "取消安装 6283" or "不使用 Avina" creates a bundle violation.
  solved.checks['gn-cancel-6283'] = false;
  assert.equal(evaluateInstaller(gnome, solved), 1);

  const eyecare = INSTALLER_SPECS.eyecare;
  const ecSolved = solveChecks('eyecare');
  ecSolved.installMode = 'lite';
  assert.equal(evaluateInstaller(eyecare, ecSolved), 1);
});

test('mail protection prevents deleting unclaimed rewards and allows trash recovery', () => {
  let save = newSave();
  assert.equal(canDeleteMail(save, 'm-friend'), false);
  assert.equal(canDeleteMail(save, 'm-bill'), false);

  save = markMailRead(save, 'm-notice');
  save = markMailRead(save, 'm-friend');
  save = deleteReadMails(save);
  assert(save.deletedMails.includes('m-notice'));
  assert(!save.deletedMails.includes('m-friend'));

  save = recoverMail(save, 'm-notice');
  assert(!save.deletedMails.includes('m-notice'));

  const claimed = claimMailMoney(save, 'm-friend');
  assert.equal(claimed.save.balance, 12.21);
  assert.equal(canDeleteMail(claimed.save, 'm-friend'), true);
  const deletedFriend = deleteMail(claimed.save, 'm-friend');
  assert(deletedFriend.deletedMails.includes('m-friend'));
});

test('full 16-order campaign yields enough funds to pay the $7,000 settlement and unlock ending', () => {
  let save = newSave();
  save = claimMailMoney(save, 'm-friend').save;

  const orderSeq: ClearedId[] = [
    'doghouse', 'gnome', 'bread', 'pet', 'accel', 'eyecare',
    'lettershop', 'ccsst', 'seedking', 'mhn', 'banquet', 'mediation',
    'zdesign', 'kindoor', 'mantis', 'voodoo_real',
  ];

  // Trigger voodoo subscription mail and clear all 16 orders.
  save = triggerVoodooSubscription(save);
  assert(save.unlockedMails.includes('m-voodoo-official'));

  for (const id of orderSeq) {
    save = recordCleanInstall(save, id);
  }
  assert.equal(save.clearedInstallers.length, 16);

  // Insufficient before claiming all rewards.
  const earlyPay = claimMailMoney(save, 'm-bill');
  assert.equal(earlyPay.paidEnding, false);

  // Claim every unlocked reward email.
  for (const mailId of save.unlockedMails) {
    if (mailId !== 'm-bill') {
      save = claimMailMoney(save, mailId).save;
    }
  }
  assert.equal(save.balance, 7663.09);

  const finalPay = claimMailMoney(save, 'm-bill');
  assert.equal(finalPay.paidEnding, true);
  assert.equal(finalPay.save.endingReached, true);
  assert.equal(finalPay.save.balance, 663.09);
  assert(finalPay.save.unlockedMails.includes('m-ending'));

  const roundTrip = decodeSave(JSON.stringify(finalPay.save));
  assert.deepEqual(roundTrip, finalPay.save);
});

test('piano BGM assets exist on disk and RetroAudio handles play, pause, mute, and track switching', () => {
  assert.equal(NIGHT_TRACKS.length, 3);
  const sources: Record<string, string> = {};
  const assetDir = new URL('../src/assets/music/', import.meta.url);
  for (const track of NIGHT_TRACKS) {
    assert(statSync(new URL(track.file, assetDir)).size > 100_000);
    sources[track.file] = `blob://${track.file}`;
  }

  const created: FakeAudio[] = [];
  class FakeAudio {
    src: string;
    loop = false;
    preload = '';
    volume = 1;
    muted = false;
    paused = true;
    constructor(src: string) {
      this.src = src;
      created.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const origAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  const audio = new RetroAudio();
  try {
    audio.setTrackSources(sources);
    audio.unlock();
    assert.equal(created.length, 1);
    assert.equal(created[0].paused, false);
    assert.equal(created[0].muted, false);

    audio.setState({ tempMuted: true });
    assert.equal(created[0].muted, true);
    assert.equal(created[0].paused, true);

    audio.setState({ tempMuted: false, trackIndex: 1 });
    assert.equal(created.length, 2);
    assert.equal(created[1].src, `blob://${NIGHT_TRACKS[1].file}`);
    assert.equal(created[1].paused, false);

    audio.setState({ paused: true });
    assert.equal(created[1].paused, true);
    audio.destroy();
    assert.equal(created[1].src, '');
  } finally {
    audio.destroy();
    globalThis.Audio = origAudio;
  }
});
