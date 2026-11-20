import { INITIAL_MAIL_IDS, MAILS } from './mails.ts';
import type { ClearedId, InstallerId, MailItem, SaveState } from './types.ts';

export const STORAGE_KEY = 'after-hours-setup-h5/v2';

const VALID_INSTALLERS = new Set<string>([
  'doghouse', 'gnome', 'bread', 'pet', 'accel', 'eyecare',
  'lettershop', 'ccsst', 'seedking', 'mhn', 'banquet', 'mediation',
  'zdesign', 'kindoor', 'mantis', 'voodoo_real',
]);

export function newSave(): SaveState {
  return {
    version: 2,
    balance: 0.21,
    unlockedMails: [...INITIAL_MAIL_IDS],
    readMails: [],
    deletedMails: [],
    claimedMails: [],
    clearedInstallers: [],
    attempts: {},
    voodooSubscribed: false,
    endingReached: false,
    muted: false,
    fastInstall: false,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function decodeSave(raw: string | null): SaveState {
  if (!raw) return newSave();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid save root');
  }
  const value = parsed as Partial<SaveState>;
  if (value.version !== 2) {
    throw new Error('Invalid save version');
  }
  if (
    typeof value.balance !== 'number' ||
    !Number.isFinite(value.balance) ||
    !Array.isArray(value.unlockedMails) ||
    !Array.isArray(value.readMails) ||
    !Array.isArray(value.deletedMails) ||
    !Array.isArray(value.claimedMails) ||
    !Array.isArray(value.clearedInstallers) ||
    typeof value.voodooSubscribed !== 'boolean' ||
    typeof value.endingReached !== 'boolean' ||
    typeof value.muted !== 'boolean' ||
    typeof value.fastInstall !== 'boolean'
  ) {
    throw new Error('Corrupted save fields');
  }
  const hasMail = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(MAILS, id);
  const attempts: Partial<Record<InstallerId, number>> = {};
  if (value.attempts && typeof value.attempts === 'object') {
    for (const [key, count] of Object.entries(value.attempts)) {
      if ((VALID_INSTALLERS.has(key) || key === 'voodoo') && typeof count === 'number' && Number.isInteger(count) && count >= 0) {
        attempts[key as InstallerId] = count;
      }
    }
  }
  const unlocked = [...new Set([...INITIAL_MAIL_IDS, ...value.unlockedMails.filter(hasMail)])];
  return {
    version: 2,
    balance: roundMoney(value.balance),
    unlockedMails: unlocked,
    readMails: [...new Set(value.readMails.filter(hasMail))],
    deletedMails: [...new Set(value.deletedMails.filter(hasMail))],
    claimedMails: [...new Set(value.claimedMails.filter(hasMail))],
    clearedInstallers: [...new Set(value.clearedInstallers.filter((id): id is ClearedId => VALID_INSTALLERS.has(id)))],
    attempts,
    voodooSubscribed: value.voodooSubscribed,
    endingReached: value.endingReached,
    muted: value.muted,
    fastInstall: value.fastInstall,
  };
}

export function canDeleteMail(save: SaveState, mailId: string): boolean {
  const mail = MAILS[mailId];
  if (!mail) return false;
  if (save.deletedMails.includes(mailId)) return false;
  // Never allow deleting a mail with an unclaimed reward or unpaid mandatory settlement bill.
  if (mail.money && !save.claimedMails.includes(mailId)) return false;
  return true;
}

export function isMailHighlightRed(save: SaveState, mailId: string): boolean {
  const mail = MAILS[mailId];
  if (!mail) return false;
  if (mail.money && !save.claimedMails.includes(mailId)) return true;
  return !save.readMails.includes(mailId);
}

export function markMailRead(save: SaveState, mailId: string): SaveState {
  if (!Object.hasOwn(MAILS, mailId) || save.readMails.includes(mailId)) return save;
  return { ...save, readMails: [...save.readMails, mailId] };
}

export function deleteMail(save: SaveState, mailId: string): SaveState {
  if (!canDeleteMail(save, mailId)) return save;
  return { ...save, deletedMails: [...save.deletedMails, mailId] };
}

export function recoverMail(save: SaveState, mailId: string): SaveState {
  if (!save.deletedMails.includes(mailId)) return save;
  return { ...save, deletedMails: save.deletedMails.filter(id => id !== mailId) };
}

export function deleteReadMails(save: SaveState): SaveState {
  const nextDeleted = new Set(save.deletedMails);
  let changed = false;
  for (const id of save.unlockedMails) {
    if (save.readMails.includes(id) && canDeleteMail(save, id)) {
      nextDeleted.add(id);
      changed = true;
    }
  }
  return changed ? { ...save, deletedMails: [...nextDeleted] } : save;
}

export function claimMailMoney(save: SaveState, mailId: string): { save: SaveState; paidEnding: boolean } {
  const mail = MAILS[mailId];
  if (!mail?.money || save.claimedMails.includes(mailId)) {
    return { save, paidEnding: false };
  }
  if (mail.money.kind === 'bill') {
    if (save.balance < mail.money.amount) return { save, paidEnding: false };
    const nextUnlocked = addUniqueMails(save.unlockedMails, ['m-ending']);
    return {
      save: {
        ...save,
        balance: roundMoney(save.balance - mail.money.amount),
        claimedMails: [...save.claimedMails, mailId],
        unlockedMails: nextUnlocked,
        endingReached: true,
      },
      paidEnding: true,
    };
  }
  return {
    save: {
      ...save,
      balance: roundMoney(save.balance + mail.money.amount),
      claimedMails: [...save.claimedMails, mailId],
    },
    paidEnding: false,
  };
}

function addUniqueMails(current: string[], additions: string[]): string[] {
  const seen = new Set(current);
  const result = [...current];
  for (const id of additions) {
    if (Object.hasOwn(MAILS, id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

const UNLOCKS_ON_CLEAR: Record<ClearedId, string[]> = {
  doghouse: ['m-r1', 'm-l2'],
  gnome: ['m-r2', 'm-l3'],
  bread: ['m-r3', 'm-l4', 'm-lore-1'],
  pet: ['m-r4', 'm-dog-bonus', 'm-l5'],
  accel: ['m-r5', 'm-l6'],
  eyecare: ['m-r6', 'm-l7'],
  lettershop: ['m-r7', 'm-l8', 'm-l9'],
  ccsst: ['m-r8', 'm-l10'],
  seedking: ['m-r9', 'm-l11'],
  mhn: ['m-r10', 'm-l12'],
  banquet: ['m-r11', 'm-l13'],
  mediation: ['m-r12', 'm-l14'],
  zdesign: ['m-r13', 'm-l15'],
  kindoor: ['m-r14', 'm-l16'],
  mantis: ['m-r15'],
  voodoo_real: ['m-r16', 'm-lore-2'],
};

export function recordFailedAttempt(save: SaveState, installerId: InstallerId): SaveState {
  const prev = save.attempts[installerId] ?? 0;
  return {
    ...save,
    attempts: { ...save.attempts, [installerId]: prev + 1 },
  };
}

export function triggerVoodooSubscription(save: SaveState): SaveState {
  const unlockedMails = addUniqueMails(save.unlockedMails, ['m-voodoo-official']);
  // If user previously deleted the official mail, bring it back to inbox so they never get soft-locked.
  const deletedMails = save.deletedMails.filter(id => id !== 'm-voodoo-official');
  return {
    ...save,
    voodooSubscribed: true,
    unlockedMails,
    deletedMails,
  };
}

export function recordCleanInstall(save: SaveState, installerId: ClearedId): SaveState {
  const clearedInstallers = save.clearedInstallers.includes(installerId)
    ? save.clearedInstallers
    : [...save.clearedInstallers, installerId];
  const unlockedMails = addUniqueMails(save.unlockedMails, UNLOCKS_ON_CLEAR[installerId]);
  return {
    ...save,
    clearedInstallers,
    unlockedMails,
  };
}

export function getFolderMails(save: SaveState, folder: 'inbox' | 'trash'): MailItem[] {
  const deletedSet = new Set(save.deletedMails);
  return save.unlockedMails
    .filter(id => (folder === 'trash' ? deletedSet.has(id) : !deletedSet.has(id)))
    .map(id => MAILS[id])
    .filter((item): item is MailItem => Boolean(item))
    .sort((a, b) => b.sortOrder - a.sortOrder);
}
