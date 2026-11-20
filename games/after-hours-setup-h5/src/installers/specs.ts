import type { InstallerId } from '../types.ts';

export type CheckOption = {
  id: string;
  label: string;
  defaultChecked: boolean;
  /** True means keeping it checked is clean; false means it must be unchecked. */
  cleanWhenChecked: boolean;
  /** Faint low-contrast trap styling (used on L16 real). */
  faint?: boolean;
};

export type WizardPageKind =
  | 'preAd1'
  | 'preAd2'
  | 'welcome'
  | 'mode'
  | 'checklist'
  | 'agreement'
  | 'path'
  | 'installing'
  | 'finish'
  | 'extraFinish';

export type InstallerPuzzleState = {
  checks: Record<string, boolean>;
  liteMode: boolean;
  installMode: 'full' | 'lite' | 'custom';
  lettershopForbidden: boolean;
  mhnCleanAgreement: boolean;
  mantisDetached: [boolean, boolean, boolean];
  mantisRealMode: boolean;
  voodooFooterStruck: boolean;
  subscribeMail: boolean;
};

export type InstallerSpec = {
  id: InstallerId;
  /** Splash loading screen before entering main wizard (e.g. L5 cancel-for-lite). */
  splashInit?: {
    message: string;
    durationMs: number;
    cancelOffersLite?: boolean;
  };
  /** Pages in navigation order. Defaults to welcome -> agreement -> path -> installing -> finish. */
  pages: WizardPageKind[];
  initialPageIndex?: number;
  /** Pre-welcome pages allow pressing Previous from welcome. */
  backFromWelcome?: boolean;
  welcomeText: string;
  /** In-welcome loading bar before Next unlocks (e.g. L8, L12). */
  welcomeInit?: {
    durationMs: number;
    revealsMoreButton?: boolean;
    /** Checkbox visible only while welcomeInit < 100%, auto-hides when done. */
    disappearingCheck?: CheckOption;
  };
  preAd1Checks?: CheckOption[];
  preAd2Checks?: CheckOption[];
  welcomeChecks?: CheckOption[];
  moreChecks?: CheckOption[];
  gearChecks?: CheckOption[];
  checklistTitle?: string;
  checklistChecks?: CheckOption[];
  agreementCheckInsideScroll?: CheckOption;
  agreementHiddenButton?: boolean;
  agreementMoreChecks?: CheckOption[];
  mhnAgreementTrap?: boolean;
  mantisEulaClauses?: [string, string, string];
  pathChecks?: CheckOption[];
  exitDialogChecks?: CheckOption[];
  artworkHiddenChecks?: CheckOption[];
  rightClickLiteMenu?: boolean;
  finishChecks?: CheckOption[];
  extraFinishChecks?: CheckOption[];
  fakeDisabledNextOnFinish?: boolean;
  dualProgressBar?: boolean;
  progressMaxPercent?: number;
  blackoutAt40?: boolean;
  voodooSubscribeCheck?: boolean;
  voodooStrikeLabel?: string;
  mantisDecoyLink?: boolean;
};

export const INSTALLER_SPECS: Record<InstallerId, InstallerSpec> = {
  doghouse: {
    id: 'doghouse',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用「汪汪百货 v1.3」安装向导。本向导将把购物客户端安装到您的电脑上，请点击「下一步」继续。',
    finishChecks: [
      { id: 'dh-info', label: '同时启用「实时资讯桌面助手」并开机自启', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  gnome: {
    id: 'gnome',
    pages: ['welcome', 'agreement', 'checklist', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用「小人美容院 v3.7」！准备就绪，开始您的桌面修图焕新之旅。',
    welcomeChecks: [
      { id: 'gn-news', label: '接收最新时尚资讯与每日桌面弹窗', defaultChecked: true, cleanWhenChecked: false },
    ],
    checklistTitle: '为您准备的贴心方案',
    checklistChecks: [
      { id: 'gn-dl', label: '使用「极速下载器」以防止软件捆绑安装', defaultChecked: true, cleanWhenChecked: false },
      { id: 'gn-cancel-6283', label: '取消安装「6283 电脑安全卫士」', defaultChecked: true, cleanWhenChecked: true },
      { id: 'gn-no-avina', label: '稍后不使用「Avina」扫描我的电脑', defaultChecked: true, cleanWhenChecked: true },
      { id: 'gn-fix', label: '一键修复系统高危漏洞（含导航主页）', defaultChecked: true, cleanWhenChecked: false },
      { id: 'gn-utobe', label: '立即安装并使用「优兔」浏览热点新闻', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  bread: {
    id: 'bread',
    splashInit: { message: '正在解压土伦面包王 v2.1 安装文件…', durationMs: 900 },
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '本向导将帮助您安装「土伦面包王 v2.1」教学程序。请支持免费软件开发生态！',
    welcomeChecks: [
      { id: 'br-moon', label: '嬉皮紫月桌面美化组件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'br-weather', label: '桌面实时天气预报插件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'br-clean', label: '系统垃圾强力清理专家', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  pet: {
    id: 'pet',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish', 'extraFinish'],
    welcomeText: '请点击「下一步」开始安装「萌宠部落 V.1.0」。',
    pathChecks: [
      { id: 'pet-news', label: '安装「更多萌宠资讯」桌面挂件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'pet-health', label: '启用「宠物健康百科」悬浮窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'pet-wall', label: '替换为「精美萌宠壁纸」全套主题', defaultChecked: true, cleanWhenChecked: false },
    ],
    fakeDisabledNextOnFinish: true,
    extraFinishChecks: [
      { id: 'pet-sale', label: '工厂特卖 · 每日超值秒杀提醒', defaultChecked: true, cleanWhenChecked: false },
      { id: 'pet-trivia', label: '你不知道的一千个生活冷知识弹窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'pet-video', label: '全网最热搞笑短视频桌面版', defaultChecked: true, cleanWhenChecked: false },
      { id: 'pet-travel', label: '一键旅游攻略导航插件', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  accel: {
    id: 'accel',
    splashInit: {
      message: '正在初始化狂暴加速器 v3.1 标准推广版…',
      durationMs: 5500,
      cancelOffersLite: true,
    },
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '本向导将引导您完成「狂暴加速器 v3.1」的安装。（标准推广版将默认附带加速推广内核）',
    pathChecks: [
      { id: 'ac-news', label: '订阅 Gamesker 最新游戏资讯桌面弹出窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'ac-opt', label: '安装「免费系统深度优化大师」', defaultChecked: true, cleanWhenChecked: false },
    ],
    finishChecks: [
      { id: 'ac-mov', label: '立刻启动「免费高清影视盒」', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  eyecare: {
    id: 'eyecare',
    pages: ['welcome', 'agreement', 'mode', 'checklist', 'path', 'installing', 'finish'],
    welcomeText: '欢迎安装「陆奥护眼宝 v2.4」，守护用眼健康，开启明亮视界。',
    checklistTitle: '请勾选您的自定义安装选项',
    checklistChecks: [
      { id: 'ec-lite-core', label: '安装「陆奥护眼宝」纯净精简核心', defaultChecked: true, cleanWhenChecked: true },
      { id: 'ec-consult', label: '私人眼科在线咨询与广告弹窗服务', defaultChecked: true, cleanWhenChecked: false },
      { id: 'ec-noadblock', label: '不使用任何第三方广告屏蔽器', defaultChecked: true, cleanWhenChecked: true },
      { id: 'ec-no-361', label: '取消自动安装「361 邮件大师」', defaultChecked: true, cleanWhenChecked: true },
      { id: 'ec-ua', label: '将「UA 极速浏览器」设为我的默认浏览器', defaultChecked: true, cleanWhenChecked: false },
    ],
    pathChecks: [
      { id: 'ec-msg', label: '开机接收最新产品动态与推广消息', defaultChecked: true, cleanWhenChecked: false },
    ],
    finishChecks: [
      { id: 'ec-weekly', label: '立即打开首页并订阅护眼周报工具条', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  lettershop: {
    id: 'lettershop',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '本向导将引导您完成专业字体排版套件「LetterShop CS5」的安装。',
    welcomeChecks: [
      { id: 'ls-helper', label: '同时使用「字体云端软件助手」', defaultChecked: true, cleanWhenChecked: false },
    ],
    agreementHiddenButton: true,
    pathChecks: [
      { id: 'ls-font', label: '安装「海量字库大百科」推广版', defaultChecked: true, cleanWhenChecked: false },
      { id: 'ls-office', label: '安装「桌面办公小助手」悬浮球', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  ccsst: {
    id: 'ccsst',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用「CCSST 天体模拟台」——本软件可离线模拟柯伊伯带与太阳系天体运行轨迹。',
    welcomeInit: {
      durationMs: 1200,
      revealsMoreButton: true,
    },
    moreChecks: [
      { id: 'cc-astro', label: '订阅「前沿天体物理」每日弹窗简报', defaultChecked: true, cleanWhenChecked: false },
      { id: 'cc-pad', label: '安装「PadLab 数学计算免费体验版」', defaultChecked: true, cleanWhenChecked: false },
      { id: 'cc-grid', label: '加入闲置算力分布式计算推广平台', defaultChecked: true, cleanWhenChecked: false },
      { id: 'cc-hr', label: '开启桌面高校师资招聘横幅', defaultChecked: true, cleanWhenChecked: false },
    ],
    gearChecks: [
      { id: 'cc-video', label: '热门视频推荐桌面播放器', defaultChecked: true, cleanWhenChecked: false },
      { id: 'cc-net', label: '全网带宽网络加速插件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'cc-udl', label: '万能高速资源下载器', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  seedking: {
    id: 'seedking',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '奥德赛种子王 v9.0 —— 最懂农场主的播期规划与良种目录客户端。',
    agreementCheckInsideScroll: {
      id: 'sk-agri',
      label: '同意并安装「奥德赛系列农业推广助手」（含桌面广告）',
      defaultChecked: true,
      cleanWhenChecked: false,
    },
    pathChecks: [
      { id: 'sk-helper', label: '农民好帮手快捷搜索条', defaultChecked: true, cleanWhenChecked: false },
      { id: 'sk-qa', label: '农业问答实时悬浮窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'sk-troia', label: '特洛伊谷农资折扣资讯端', defaultChecked: true, cleanWhenChecked: false },
    ],
    dualProgressBar: true,
    finishChecks: [
      { id: 'sk-rich', label: '开启「致富新选择」每日桌面弹窗', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  mhn: {
    id: 'mhn',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '本向导将协助您安装「MHN v10.2」轻量即时通讯客户端。',
    welcomeChecks: [
      { id: 'mhn-theme', label: '启用「炫彩桌面主题管家」并改写桌面图标', defaultChecked: true, cleanWhenChecked: false },
    ],
    mhnAgreementTrap: true,
    finishChecks: [
      { id: 'mhn-up', label: '立即用「万能驱动精灵」扫描升级全机系统', defaultChecked: true, cleanWhenChecked: false },
      { id: 'mhn-361', label: '免费安装试用「Office 361 豪华推广包」', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  banquet: {
    id: 'banquet',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用「古籍编目与馆藏系统 v3.0」，高效清点藏书并生成离线索引。',
    welcomeChecks: [
      { id: 'bq-anti', label: '安装「Souton 反恶意软件监控中心」', defaultChecked: true, cleanWhenChecked: false },
      { id: 'bq-vuln', label: '开机自动检测系统漏洞并推荐修复工具', defaultChecked: true, cleanWhenChecked: false },
    ],
    pathChecks: [
      { id: 'bq-flower', label: '同时安装「花艺摆盘大师」桌面客户端', defaultChecked: true, cleanWhenChecked: false },
    ],
    exitDialogChecks: [
      { id: 'bq-lite', label: '切换安装「纯净轻量化无插件版本」', defaultChecked: false, cleanWhenChecked: true },
      { id: 'bq-horn', label: '附带安装「号角笛插画拓展包」', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  mediation: {
    id: 'mediation',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '「邻里互助指南 v2.0」安装程序已准备就绪，请耐心等待组件初始化或核对本页面。',
    welcomeInit: {
      durationMs: 5500,
      disappearingCheck: {
        id: 'md-qicu',
        label: '同时安装「QICU 聊天宝」推广客户端',
        defaultChecked: true,
        cleanWhenChecked: false,
      },
    },
    artworkHiddenChecks: [
      { id: 'md-h1', label: '一刀 999 复古页游盒子', defaultChecked: true, cleanWhenChecked: false },
      { id: 'md-h2', label: '全能电脑安全卫士', defaultChecked: true, cleanWhenChecked: false },
      { id: 'md-h3', label: '全国热门情感交流论坛快捷方式', defaultChecked: true, cleanWhenChecked: false },
      { id: 'md-h4', label: '今日头条热点速递浮窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'md-h5', label: '自动安装桌面壁纸轮换器', defaultChecked: true, cleanWhenChecked: false },
    ],
    finishChecks: [
      { id: 'md-forum', label: '完成并自动打开情感调解门户主页', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  zdesign: {
    id: 'zdesign',
    pages: ['preAd1', 'preAd2', 'welcome', 'agreement', 'path', 'installing', 'finish'],
    initialPageIndex: 2,
    backFromWelcome: true,
    welcomeText: '欢迎使用「Z-设计坊 v4.0」服装打版工具。点击「下一步」即可直接继续。',
    preAd1Checks: [
      { id: 'zd-a1', label: '雷霆健身塑形私人教练端', defaultChecked: true, cleanWhenChecked: false },
      { id: 'zd-a2', label: '单车之家一站式维修服务插件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'zd-a3', label: '最变态私服一刀满级桌面入口', defaultChecked: true, cleanWhenChecked: false },
    ],
    preAd2Checks: [
      { id: 'zd-b1', label: '9981 极速浏览器上网体验包', defaultChecked: true, cleanWhenChecked: false },
      { id: 'zd-b2', label: '小鸟扭蛋炫彩桌面壁纸组件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'zd-b3', label: '玫瑰网婚恋交友桌面推送', defaultChecked: true, cleanWhenChecked: false },
    ],
    pathChecks: [
      { id: 'zd-goodle', label: '锁定使用「Goodle 搜索引擎」默认主页', defaultChecked: true, cleanWhenChecked: false },
      { id: 'zd-mag', label: '每周向我发送最新时尚杂志弹窗', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  kindoor: {
    id: 'kindoor',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎安装「Kindoor 阅读器」，畅享舒适电子书本地阅读体验。（标准完整版默认包含额外推广套件）',
    rightClickLiteMenu: true,
    agreementMoreChecks: [
      { id: 'kd-eye', label: 'MEC 护眼屏保广告组件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'kd-dnd', label: 'DND 桌面悬浮记事插件', defaultChecked: true, cleanWhenChecked: false },
      { id: 'kd-info', label: '每日获取海量电子书推荐弹窗', defaultChecked: true, cleanWhenChecked: false },
    ],
    pathChecks: [
      { id: 'kd-sonic', label: '精彩新闻资讯尽在「音速世界导航」', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  mantis: {
    id: 'mantis',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '本向导将为您安装「螳螂虾车友会」—— 您的权威车辆评测助手。',
    mantisDecoyLink: true,
    mantisEulaClauses: [
      '附加服务条款 A：安装「虾壳极速浏览器导航条」并设为默认检索。',
      '附加服务条款 B：订阅「每日二手车行情弹窗速报」。',
      '附加服务条款 C：开启「卡帕斯基安全防护中心」常驻进程。',
    ],
    welcomeChecks: [
      { id: 'mt-safe', label: '附带「卡帕斯基安全防护中心」让电脑坚如磐石', defaultChecked: true, cleanWhenChecked: false },
      { id: 'mt-nav', label: '启用「坏道德导航」全程伴您出行', defaultChecked: true, cleanWhenChecked: false },
    ],
    progressMaxPercent: 170,
  },
  voodoo: {
    id: 'voodoo',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用「Envida Voodoo 快速安装工具」。当前打包为在线推广引导程序。',
    voodooSubscribeCheck: true,
    welcomeChecks: [
      { id: 'vd-update', label: '始终保持驱动后台自动更新检测', defaultChecked: true, cleanWhenChecked: false },
      { id: 'vd-anti', label: '试用最新「GoForce 极速杀毒卫士」', defaultChecked: true, cleanWhenChecked: false },
    ],
    pathChecks: [
      { id: 'vd-ball', label: '开启桌面一键加速球悬浮窗', defaultChecked: true, cleanWhenChecked: false },
      { id: 'vd-health', label: '24 小时实时监控电脑健康状态', defaultChecked: true, cleanWhenChecked: false },
    ],
  },
  voodoo_real: {
    id: 'voodoo_real',
    pages: ['welcome', 'agreement', 'path', 'installing', 'finish'],
    welcomeText: '欢迎使用官方离线版「Envida Voodoo Graphics Driver v19.2.11」安装向导。',
    voodooStrikeLabel: '默认开启「游戏帮手竞技辅助与浏览器导航锁定」',
    pathChecks: [
      { id: 'vdr-tool', label: '装机必备软件百宝箱合集', defaultChecked: true, cleanWhenChecked: false },
      { id: 'vdr-3dmax', label: '安装「3D Max 跑分测试版」检测显卡性能', defaultChecked: true, cleanWhenChecked: false },
      { id: 'vdr-harden', label: '加固电脑安全卫士（含主页保护锁）', defaultChecked: true, cleanWhenChecked: false, faint: true },
    ],
    blackoutAt40: true,
  },
};

export function createInitialPuzzleState(spec: InstallerSpec): InstallerPuzzleState {
  const checks: Record<string, boolean> = {};
  const register = (list?: CheckOption[]) => {
    if (!list) return;
    for (const opt of list) {
      checks[opt.id] = opt.defaultChecked;
    }
  };
  register(spec.preAd1Checks);
  register(spec.preAd2Checks);
  register(spec.welcomeChecks);
  register(spec.moreChecks);
  register(spec.gearChecks);
  register(spec.checklistChecks);
  register(spec.agreementCheckInsideScroll ? [spec.agreementCheckInsideScroll] : undefined);
  register(spec.agreementMoreChecks);
  register(spec.pathChecks);
  register(spec.exitDialogChecks);
  register(spec.artworkHiddenChecks);
  register(spec.finishChecks);
  register(spec.extraFinishChecks);
  if (spec.welcomeInit?.disappearingCheck) {
    checks[spec.welcomeInit.disappearingCheck.id] = spec.welcomeInit.disappearingCheck.defaultChecked;
  }

  return {
    checks,
    liteMode: false,
    installMode: 'full',
    lettershopForbidden: false,
    mhnCleanAgreement: false,
    mantisDetached: [false, false, false],
    mantisRealMode: false,
    voodooFooterStruck: false,
    subscribeMail: false,
  };
}

function countGroupViolations(list: CheckOption[] | undefined, checks: Record<string, boolean>): number {
  if (!list) return 0;
  let violations = 0;
  for (const opt of list) {
    const val = Boolean(checks[opt.id]);
    if (val !== opt.cleanWhenChecked) violations += 1;
  }
  return violations;
}

/** Deterministic evaluation of all traps and bundled components at installer completion. */
export function evaluateInstaller(spec: InstallerSpec, state: InstallerPuzzleState): number {
  let bundles = 0;

  // Decoy installers always carry +1 inescapable payload unless switched to real version.
  if (spec.id === 'voodoo') {
    bundles += 1;
    bundles += countGroupViolations(spec.welcomeChecks, state.checks);
    bundles += countGroupViolations(spec.pathChecks, state.checks);
    return bundles;
  }

  if (spec.id === 'mantis') {
    if (!state.mantisRealMode) {
      return 1 + countGroupViolations(spec.welcomeChecks, state.checks);
    }
    bundles += countGroupViolations(spec.welcomeChecks, state.checks);
    for (const detached of state.mantisDetached) {
      if (!detached) bundles += 1;
    }
    return bundles;
  }

  bundles += countGroupViolations(spec.preAd1Checks, state.checks);
  bundles += countGroupViolations(spec.preAd2Checks, state.checks);
  bundles += countGroupViolations(spec.welcomeChecks, state.checks);
  bundles += countGroupViolations(spec.moreChecks, state.checks);
  bundles += countGroupViolations(spec.gearChecks, state.checks);
  bundles += countGroupViolations(spec.agreementMoreChecks, state.checks);
  bundles += countGroupViolations(spec.pathChecks, state.checks);
  bundles += countGroupViolations(spec.exitDialogChecks, state.checks);
  bundles += countGroupViolations(spec.artworkHiddenChecks, state.checks);
  bundles += countGroupViolations(spec.finishChecks, state.checks);
  bundles += countGroupViolations(spec.extraFinishChecks, state.checks);

  if (spec.welcomeInit?.disappearingCheck) {
    bundles += countGroupViolations([spec.welcomeInit.disappearingCheck], state.checks);
  }
  if (spec.agreementCheckInsideScroll) {
    bundles += countGroupViolations([spec.agreementCheckInsideScroll], state.checks);
  }

  // Mode selection (L6 eyecare)
  if (spec.pages.includes('mode')) {
    if (state.installMode === 'full') bundles += 2;
    else if (state.installMode === 'lite') bundles += 1;
    else bundles += countGroupViolations(spec.checklistChecks, state.checks);
  } else {
    bundles += countGroupViolations(spec.checklistChecks, state.checks);
  }

  // Splash or right-click Lite version requirement (L5 accel, L14 kindoor)
  if (spec.splashInit?.cancelOffersLite || spec.rightClickLiteMenu) {
    if (!state.liteMode) bundles += 1;
  }

  // Hidden EULA text toggle (L7 lettershop)
  if (spec.agreementHiddenButton && !state.lettershopForbidden) {
    bundles += 1;
  }

  // Repeated EULA refusal secret agreement B (L10 mhn)
  if (spec.mhnAgreementTrap && !state.mhnCleanAgreement) {
    bundles += 1;
  }

  // Strikethrough banner text (L16 real)
  if (spec.voodooStrikeLabel && !state.voodooFooterStruck) {
    bundles += 1;
  }

  return bundles;
}
