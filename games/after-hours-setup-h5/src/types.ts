export type InstallerId =
  | 'doghouse'
  | 'gnome'
  | 'bread'
  | 'pet'
  | 'accel'
  | 'eyecare'
  | 'lettershop'
  | 'ccsst'
  | 'seedking'
  | 'mhn'
  | 'banquet'
  | 'mediation'
  | 'zdesign'
  | 'kindoor'
  | 'mantis'
  | 'voodoo'
  | 'voodoo_real';

/** Logical task identifiers representing the 16 customer orders. */
export type ClearedId = Exclude<InstallerId, 'voodoo'>;

export interface MailAttachment {
  fileName: string;
  installerId: InstallerId;
}

export interface MailMoney {
  amount: number;
  kind: 'reward' | 'bill';
}

export interface MailItem {
  id: string;
  senderName: string;
  senderEmail: string;
  toEmail: string;
  subject: string;
  body: string[];
  attachment?: MailAttachment;
  money?: MailMoney;
  sortOrder: number;
}

export interface LevelSpec {
  id: InstallerId;
  orderNumber: number;
  appName: string;
  wizardTitle: string;
  fileName: string;
  defaultPath: string;
  eulaText: string[];
  hint: string;
}

export interface SaveState {
  version: 2;
  balance: number;
  unlockedMails: string[];
  readMails: string[];
  deletedMails: string[];
  claimedMails: string[];
  clearedInstallers: ClearedId[];
  attempts: Partial<Record<InstallerId, number>>;
  voodooSubscribed: boolean;
  endingReached: boolean;
  muted: boolean;
  fastInstall: boolean;
}
